// Motor do follow-up (v0.7.54), sem React: lê as conversas dos disparos, decide quem cobrar e quem precisa de você.
//
// Divisão de trabalho:
//  - regras puras (quem cobrar, quando, máximo de 2 cobranças, opt-out, falha fechada): shared/followup.ts;
//  - ler a conversa: content script (`lerConversa`, só leitura, identidade estrita);
//  - entender a resposta e escrever a cobrança: IA no servidor do CRM (zapIa.*), pelo service worker;
//  - ENVIAR a cobrança: o MESMO Executor das campanhas (envio automático opcional da política, com teto diário
//    compartilhado, horário, intervalo 60–120 s, freio, opt-out e a reconferência antes do clique). Este arquivo
//    NÃO tem caminho próprio de clique: só monta a campanha de cobrança (tipo 'followup') e devolve para o Executor.
//  - o que exige atenção NUNCA sai sozinho: vai para "Precisa de você" (o atendente envia, com abrirEColar sem
//    envio automático).

import {
  type Banco,
  listarCampanhas,
  listarEnvios,
  listarFollowups,
  listarNaoEnviar,
  lerConfigFollowup,
  marcarNaoEnviar,
  salvarCampanha,
  salvarConfigFollowup,
  salvarFollowups,
} from '../shared/banco';
import { type Campanha, novoId } from '../shared/campanha';
import { FILTROS_PADRAO, ultimoEnvioPorChave } from '../shared/filtros';
import {
  type ConfigFollowup,
  type Followup,
  LOTE_IA,
  MAX_LEITURAS_POR_RODADA,
  aplicarClassificacao,
  aplicarResultadoCampanha,
  analisarLeitura,
  decidirCobranca,
  devidoParaVerificar,
  modeloDeCobrancaValido,
  modeloLocal,
  novosFollowups,
  paraModelo,
  referenciaDe,
  separarListas,
  textoEsperadoDe,
  type ListasFollowup,
} from '../shared/followup';
import type { LeadsCRM } from '../shared/leads';
import type { CodigoErro, MensagemLida, PedidoConteudo, RespostaConteudo } from '../shared/mensagens';
import { contarEnviosHoje } from '../shared/politica';
import type { ConversaParaIa } from '../shared/servico-ia';

/** Erros que indicam problema GERAL (não do contato): a rodada para sem marcar ninguém. */
const ERROS_GERAIS: ReadonlySet<CodigoErro> = new Set<CodigoErro>(['seletor', 'nao_pronto', 'ocupado', 'interno']);

/** Quanto tempo vale uma leitura "sem resposta" para o envio da cobrança: mais velha que isto, lê de novo antes. */
export const VALIDADE_LEITURA_MS = 12 * 3_600_000;

export interface DependenciasMotor {
  db: Banco;
  pedir: (pedido: PedidoConteudo, trazerParaFrente?: boolean) => Promise<RespostaConteudo>;
  ia: Pick<LeadsCRM, 'classificarRespostas' | 'escreverCobranca'>;
  /** Cria o lembrete (compra depois / tem estoque). Devolve o erro em texto ou null. */
  criarLembrete: (nome: string, venceEm: number, agora: Date) => Promise<string | null>;
  agora: () => Date;
  aleatorio: () => number;
  esperar: (ms: number) => Promise<void>;
}

export interface ResumoRodada {
  lidas: number;
  cobrancas: number;
  precisam: number;
  saidas: number;
  resolvidos: number;
  revisar: number;
  /** Aviso para mostrar ao atendente (IA fora do ar, WhatsApp não respondeu...). */
  aviso: string | null;
  /** A rodada parou antes do fim (erro geral ou pedido do atendente). */
  parou: boolean;
}

export interface OpcoesVerificacao {
  /** Lê também os disparos recentes (a partir de 2 h), não só os que já passaram de X dias. */
  recentes?: boolean;
  /** Ignora o intervalo de 12 h entre leituras da mesma conversa (clique do atendente). */
  forcar?: boolean;
  /** O atendente pediu para parar. */
  parar?: () => boolean;
  aoProgredir?: (texto: string) => void;
}

export interface VisaoFollowup {
  config: ConfigFollowup;
  followups: Followup[];
  listas: ListasFollowup;
  /** Cobranças deste follow-up enviadas hoje (contam no mesmo teto diário das campanhas). */
  enviadasHoje: number;
}

const vazio = (): ResumoRodada => ({ lidas: 0, cobrancas: 0, precisam: 0, saidas: 0, resolvidos: 0, revisar: 0, aviso: null, parou: false });

export class MotorFollowup {
  constructor(private readonly d: DependenciasMotor) {}

  // ── Estado ────────────────────────────────────────────────────────────────

  async carregar(): Promise<VisaoFollowup> {
    const [config, followups, campanhas, envios] = await Promise.all([lerConfigFollowup(this.d.db), listarFollowups(this.d.db), listarCampanhas(this.d.db), listarEnvios(this.d.db)]);
    const idsFollowup = new Set(campanhas.filter((c) => c.tipo === 'followup').map((c) => c.id));
    const enviadasHoje = contarEnviosHoje(envios.filter((e) => idsFollowup.has(e.campanhaId)), this.d.agora());
    return { config, followups, listas: separarListas(followups), enviadasHoje };
  }

  async salvarConfig(c: ConfigFollowup): Promise<ConfigFollowup> {
    return salvarConfigFollowup(this.d.db, c);
  }

  /** Cria o acompanhamento de cada item 'enviado' das campanhas que ainda não tem um. */
  async sincronizar(): Promise<Followup[]> {
    const [campanhas, envios, existentes] = await Promise.all([listarCampanhas(this.d.db), listarEnvios(this.d.db), listarFollowups(this.d.db)]);
    const novos = novosFollowups(campanhas, envios, existentes, this.d.agora());
    await salvarFollowups(this.d.db, novos);
    return [...existentes, ...novos];
  }

  // ── Ler as conversas e decidir ────────────────────────────────────────────

  /**
   * Uma rodada: lê (só leitura) as conversas dos disparos que passaram de X dias, manda as respostas para a IA e
   * decide cada contato. Com `cobrancaAutomatica` ligada, quem não respondeu ganha o texto da cobrança e fica
   * pronto para o Executor; desligada, a leitura só classifica as respostas.
   */
  async verificar(config: ConfigFollowup, opcoes: OpcoesVerificacao = {}): Promise<ResumoRodada> {
    const resumo = vazio();
    const todos = await this.sincronizar();
    const agora0 = this.d.agora();
    const devidos = todos
      .filter((f) => devidoParaVerificar(f, config.dias, agora0, opcoes.recentes === true))
      .filter((f) => opcoes.forcar === true || f.verificadoEm == null || agora0.getTime() - new Date(f.verificadoEm).getTime() >= VALIDADE_LEITURA_MS)
      .sort((a, b) => referenciaDe(a).localeCompare(referenciaDe(b)))
      .slice(0, MAX_LEITURAS_POR_RODADA);
    if (devidos.length === 0) return resumo;

    const [naoEnviarLista, envios] = await Promise.all([listarNaoEnviar(this.d.db), listarEnvios(this.d.db)]);
    const naoEnviar = new Set(naoEnviarLista.map((n) => n.chave));
    const ultimo = ultimoEnvioPorChave(envios);

    const paraIa: Array<{ f: Followup; mensagens: MensagemLida[] }> = [];
    const paraCobrar: Followup[] = [];

    for (const [i, f] of devidos.entries()) {
      if (opcoes.parar?.()) {
        resumo.parou = true;
        break;
      }
      opcoes.aoProgredir?.(`Lendo ${i + 1} de ${devidos.length}: ${f.primeiroNome || f.nome}`);
      let r: RespostaConteudo;
      try {
        r = await this.d.pedir({ tipo: 'lerConversa', nome: f.nome }, true);
      } catch (e) {
        r = { ok: false, codigo: 'interno', erro: e instanceof Error ? e.message : String(e) };
      }
      const agora = this.d.agora();
      resumo.lidas += 1;

      if (!r.ok) {
        if (ERROS_GERAIS.has(r.codigo)) {
          resumo.aviso = r.erro;
          resumo.parou = true;
          break;
        }
        // Identidade da conversa não confere, grupo, nome repetido, não achei: falha fechada, nunca cobra.
        await this.gravar({ ...f, estado: 'revisar', motivo: r.erro, verificadoEm: agora.toISOString(), atualizadoEm: agora.toISOString() });
        resumo.revisar += 1;
      } else {
        const leitura = analisarLeitura(r.mensagens ?? [], textoEsperadoDe(f), referenciaDe(f));
        const base = { ...f, verificadoEm: agora.toISOString(), atualizadoEm: agora.toISOString() };
        if (leitura.tipo === 'duvida') {
          await this.gravar({ ...base, estado: 'revisar', motivo: leitura.motivo });
          resumo.revisar += 1;
        } else if (leitura.tipo === 'atendido') {
          await this.gravar({ ...base, estado: 'resolvido', motivo: leitura.motivo });
          resumo.resolvidos += 1;
        } else if (leitura.tipo === 'respondeu') {
          // Ainda sem desfecho: só vira "Precisa de você"/"Resolvido" depois da IA. Se a IA falhar, repete depois.
          paraIa.push({ f: base, mensagens: leitura.mensagens });
        } else {
          const decisao = decidirCobranca(f, { agora, dias: config.dias, naoEnviar, ultimoEnvioPorChave: ultimo });
          if (decisao.pode) {
            if (config.ligado) paraCobrar.push(base);
            else await this.gravar({ ...base, motivo: `sem resposta há ${config.dias}+ dia(s); cobrança automática desligada` });
          } else if (decisao.destino === 'espera') {
            await this.gravar({ ...base, motivo: decisao.motivo });
          } else {
            await this.gravar({ ...base, estado: decisao.destino, motivo: decisao.motivo });
            if (decisao.destino === 'saiu') resumo.saidas += 1;
            else resumo.resolvidos += 1;
          }
        }
      }
      if (i < devidos.length - 1) await this.d.esperar(1500 + Math.floor(this.d.aleatorio() * 2500));
    }

    if (paraIa.length > 0) await this.classificar(paraIa, resumo);
    if (paraCobrar.length > 0) await this.prepararCobrancas(paraCobrar, resumo);
    return resumo;
  }

  private async gravar(f: Followup): Promise<void> {
    await salvarFollowups(this.d.db, [f]);
  }

  // ── IA: entender as respostas ─────────────────────────────────────────────

  private async classificar(itens: Array<{ f: Followup; mensagens: MensagemLida[] }>, resumo: ResumoRodada): Promise<void> {
    for (let ini = 0; ini < itens.length; ini += LOTE_IA) {
      const lote = itens.slice(ini, ini + LOTE_IA);
      // `ref` é só "c1", "c2"...: nem o nome, nem a chave, nem o id interno do contato vão para o servidor.
      const conversas: ConversaParaIa[] = lote.map((x, k) => ({
        ref: `c${k + 1}`,
        primeiroNome: x.f.primeiroNome,
        mensagemCampanha: x.f.mensagemCampanha,
        mensagens: x.mensagens.map((m) => ({ de: m.de, texto: m.texto, ...(m.quando ? { quando: m.quando } : {}) })),
      }));
      let r;
      try {
        r = await this.d.ia.classificarRespostas(conversas);
      } catch (e) {
        r = { ok: false as const, erro: { tipo: 'rede' as const, mensagem: e instanceof Error ? e.message : String(e) } };
      }
      if (!r.ok) {
        // IA fora do ar / limite diário / sem login: NADA muda (continuam 'monitorando'); a próxima rodada tenta de novo.
        resumo.aviso = `A IA não respondeu (${r.erro.mensagem}). Tente de novo mais tarde.`;
        for (const x of lote) await this.gravar({ ...x.f, verificadoEm: null });
        continue;
      }
      const porRef = new Map(r.valor.map((c) => [c.ref, c]));
      for (const [k, x] of lote.entries()) {
        const agora = this.d.agora();
        const c = porRef.get(`c${k + 1}`);
        if (!c) {
          await this.gravar({ ...x.f, estado: 'revisar', motivo: 'a IA não devolveu a classificação desta conversa: leia a conversa', atualizadoEm: agora.toISOString() });
          resumo.revisar += 1;
          continue;
        }
        const efeito = aplicarClassificacao(x.f, c, agora);
        let f = efeito.followup;
        if (efeito.optOut) {
          // Pedido explícito para sair: opt-out automático. Nunca mais cobrança, nem campanha.
          await marcarNaoEnviar(this.d.db, { chave: f.chave, nome: f.nome, desde: agora.toISOString(), motivo: 'pediu para sair (lido pela IA)' });
          resumo.saidas += 1;
        } else if (f.estado === 'precisa') resumo.precisam += 1;
        else if (f.estado === 'revisar') resumo.revisar += 1;
        else resumo.resolvidos += 1;
        if (efeito.lembrete) {
          const erro = await this.d.criarLembrete(f.nome, efeito.lembrete.venceEm, agora);
          if (erro === null) f = { ...f, lembreteCriadoEm: agora.toISOString() };
          else f = { ...f, resumo: `${f.resumo ?? ''} (não consegui criar o lembrete: ${erro})`.trim() };
        }
        await this.gravar(f);
      }
    }
  }

  // ── IA: texto da cobrança ─────────────────────────────────────────────────

  private async prepararCobrancas(itens: Followup[], resumo: ResumoRodada): Promise<void> {
    const usados = new Set<string>();
    let iaForaDoAr = false;
    for (const f of itens) {
      const tentativa = (f.cobrancas.length + 1) as 1 | 2;
      let modelo: string | null = null;
      let origem: 'ia' | 'modelo' = 'modelo';
      if (!iaForaDoAr) {
        try {
          const r = await this.d.ia.escreverCobranca(f.primeiroNome, f.mensagemCampanha, tentativa);
          if (r.ok) {
            const candidato = paraModelo(r.valor, f.primeiroNome);
            if (modeloDeCobrancaValido(candidato) && !usados.has(candidato) && !f.cobrancas.some((c) => c.texto === candidato)) {
              modelo = candidato;
              origem = 'ia';
            }
          } else if (r.erro.tipo !== 'validacao') iaForaDoAr = true;
        } catch {
          iaForaDoAr = true;
        }
      }
      if (modelo === null) {
        modelo = modeloLocal(tentativa, f.primeiroNome.trim() !== '', this.d.aleatorio, usados);
        if (!modeloDeCobrancaValido(modelo)) {
          await this.gravar({ ...f, estado: 'revisar', motivo: 'não consegui montar um texto de cobrança válido' });
          resumo.revisar += 1;
          continue;
        }
      }
      usados.add(modelo);
      await this.gravar({ ...f, estado: 'cobranca', motivo: null, cobrancaModelo: modelo, cobrancaOrigem: origem, atualizadoEm: this.d.agora().toISOString() });
      resumo.cobrancas += 1;
    }
    if (iaForaDoAr && resumo.aviso === null) resumo.aviso = 'A IA estava fora do ar: usei os modelos locais de cobrança.';
  }

  // ── Mandar a cobrança (pelo Executor das campanhas) ───────────────────────

  /**
   * Monta a campanha de cobrança com quem está em 'cobranca' e foi lido há menos de 12 h (leitura velha volta a
   * ser lida antes de cobrar: o cliente pode ter respondido). Campanhas de cobrança antigas e não concluídas são
   * encerradas: os itens delas que não saíram continuam em 'cobranca' e entram nesta. Devolve null se não há ninguém.
   */
  async montarCampanhaDeCobranca(config: ConfigFollowup): Promise<Campanha | null> {
    const agora = this.d.agora();
    const abertas = (await listarCampanhas(this.d.db)).filter((c) => c.tipo === 'followup' && c.status !== 'concluida');
    // Uma cobrança em voo (o painel fechou no meio) pode ter saído: essa campanha PRECISA ser retomada (o Executor
    // confere a conversa antes de qualquer colagem), nunca encerrada nem substituída.
    const emVoo = abertas.find((c) => c.emVoo);
    if (emVoo) return emVoo;
    const todos = await listarFollowups(this.d.db);
    // Leitura velha: volta a monitorar para ser lida de novo (a próxima rodada).
    for (const f of todos) {
      if (f.estado === 'cobranca' && (f.verificadoEm == null || agora.getTime() - new Date(f.verificadoEm).getTime() > VALIDADE_LEITURA_MS)) {
        await this.gravar({ ...f, estado: 'monitorando', cobrancaModelo: null, cobrancaOrigem: null, atualizadoEm: agora.toISOString() });
      }
    }
    const prontos = (await listarFollowups(this.d.db)).filter((f) => f.estado === 'cobranca' && f.cobrancaModelo).sort((a, b) => referenciaDe(a).localeCompare(referenciaDe(b)));
    if (prontos.length === 0) return null;
    // Já existe uma campanha aberta com exatamente estes pendentes (parou no horário/teto): retoma em vez de criar outra.
    const chavesProntas = new Set(prontos.map((f) => f.chave));
    const igual = abertas.find((c) => {
      const pendentes = c.itens.filter((i) => i.status === 'pendente');
      return pendentes.length === chavesProntas.size && pendentes.every((i) => chavesProntas.has(i.chave));
    });
    if (igual) return igual;
    for (const c of abertas) await salvarCampanha(this.d.db, { ...c, status: 'concluida', motivoPausa: 'substituída por uma cobrança mais nova' });
    const campanha: Campanha = {
      id: novoId(agora, this.d.aleatorio),
      tipo: 'followup',
      nome: `Follow-up ${agora.toISOString().slice(0, 10)}`,
      criadaEm: agora.toISOString(),
      aprovadaEm: agora.toISOString(),
      termoBusca: 'follow-up',
      // O Executor lê daqui o intervalo mínimo entre contatos (X dias) das campanhas de follow-up.
      filtros: { ...FILTROS_PADRAO, excluirContatadosHaDias: config.dias },
      modelos: [],
      status: 'pausada',
      motivoPausa: null,
      itens: prontos.map((f) => ({
        chave: f.chave,
        nome: f.nome,
        primeiroNome: f.primeiroNome,
        modelo: f.cobrancaModelo as string,
        status: 'pendente' as const,
        motivo: null,
        atualizadoEm: null,
      })),
      problemasSeguidos: 0,
      ultimoEnvioEm: null,
      intervaloAtualSeg: null,
    };
    await salvarCampanha(this.d.db, campanha);
    return campanha;
  }

  /** Campanha de cobrança com mensagem em voo (o painel fechou no meio): precisa ser conferida antes de qualquer nova colagem. */
  async campanhaEmVoo(): Promise<Campanha | null> {
    return (await listarCampanhas(this.d.db)).find((c) => c.tipo === 'followup' && c.status !== 'concluida' && c.emVoo) ?? null;
  }

  /** O Executor mexeu na campanha de cobrança: cada item sai de 'cobranca' conforme o desfecho dele. */
  async aplicarCampanha(campanha: Campanha): Promise<void> {
    if (campanha.tipo !== 'followup') return;
    const [todos, envios] = await Promise.all([listarFollowups(this.d.db), listarEnvios(this.d.db)]);
    const novos = aplicarResultadoCampanha(todos, campanha, envios, this.d.agora());
    const mudados = novos.filter((f, i) => f !== todos[i]);
    await salvarFollowups(this.d.db, mudados);
  }

  // ── Ações do atendente ────────────────────────────────────────────────────

  async marcarResolvido(id: string, motivo = 'resolvido por você'): Promise<void> {
    const f = (await listarFollowups(this.d.db)).find((x) => x.id === id);
    if (!f) return;
    await this.gravar({ ...f, estado: 'resolvido', motivo, cobrancaModelo: null, cobrancaOrigem: null, atualizadoEm: this.d.agora().toISOString() });
  }

  /** "Não enviar mais" feito à mão no painel: opt-out + sai das listas de cobrança. */
  async naoEnviarMais(id: string): Promise<void> {
    const f = (await listarFollowups(this.d.db)).find((x) => x.id === id);
    if (!f) return;
    const agora = this.d.agora();
    await marcarNaoEnviar(this.d.db, { chave: f.chave, nome: f.nome, desde: agora.toISOString(), motivo: 'não enviar mais (follow-up)' });
    await this.gravar({ ...f, estado: 'saiu', motivo: 'você marcou "não enviar mais"', cobrancaModelo: null, cobrancaOrigem: null, atualizadoEm: agora.toISOString() });
  }

  /** "Conferi: pode voltar a acompanhar" (um 'revisar' que o atendente verificou). Volta a ser lido depois de X dias. */
  async voltarAMonitorar(id: string): Promise<void> {
    const f = (await listarFollowups(this.d.db)).find((x) => x.id === id);
    if (!f || f.estado !== 'revisar') return;
    await this.gravar({ ...f, estado: 'monitorando', motivo: null, verificadoEm: this.d.agora().toISOString(), atualizadoEm: this.d.agora().toISOString() });
  }
}
