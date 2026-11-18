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
  registrarRespostaDoTexto,
  registrarAcaoIa,
  registrarDecisao,
  salvarCampanha,
  salvarConfigFollowup,
  salvarFollowups,
} from '../shared/banco';
import { emObservacao, novaAcao, novaDecisao } from '../shared/automaticos';
import { type Campanha, novoId } from '../shared/campanha';
import { FILTROS_PADRAO, ultimoEnvioPorChave } from '../shared/filtros';
import {
  type ConfigFollowup,
  type Followup,
  LOTE_IA,
  MAX_COBRANCAS,
  MAX_LEITURAS_POR_RODADA,
  aplicarClassificacao,
  aplicarResultadoCampanha,
  analisarLeitura,
  decidirCobranca,
  devidoParaVerificar,
  modeloDeCobrancaValido,
  novosFollowups,
  paraModelo,
  referenciaDe,
  ROTULO_CLASSE,
  separarListas,
  textoDaFilaDesatualizado,
  textoEsperadoDe,
  type ListasFollowup,
} from '../shared/followup';
import {
  MARCADOR_NOME,
  assinaturaTextos,
  montarTextoCobranca,
  sortearTexto,
  textoCobrancaValido,
  textoParaModelo,
  textosParaContato,
  textosDaTentativa,
  type OrigemTexto,
} from '../shared/followup-estilo';
import { MARCADOR_PRIMEIRO_NOME } from '../shared/constantes';
import type { LeadsCRM } from '../shared/leads';
import type { CodigoErro, MensagemLida, PedidoConteudo, RespostaConteudo } from '../shared/mensagens';
import { contarEnviosHoje } from '../shared/politica';
import { montarMensagem } from '../shared/texto';
import type { ConversaParaIa } from '../shared/servico-ia';
import type { ResultadoTrava } from '../shared/trava-agendamento';
import { anotarDecisaoDaResposta } from './registro-ia';
import { contatadoPelaEquipe } from './sincronia-equipe';
import { falhaDaIa, iaFuncionou } from './saude-painel';

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
  /**
   * Trava de agendamento (v0.7.56): um resultado por contato, na ordem. Quem tem agendamento futuro no CRM NÃO é cobrado
   * (o agendamento prevalece); CRM indisponível = não cobra agora (falha fechada) e tenta de novo na próxima rodada.
   * Ausente (testes antigos) = nada é conferido.
   */
  travar?: (contatos: ReadonlyArray<{ nome: string; chave: string }>) => Promise<ResultadoTrava[]>;
  /** Equipe (v0.7.60): opt-out fresco e contato da equipe para estes contatos, ANTES de decidir quem cobrar. Nunca lança. Ausente = nada. */
  preparar?: (contatos: ReadonlyArray<{ nome: string; chave: string }>) => Promise<unknown>;
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
  /** Último texto do dono sorteado por tentativa: o próximo contato não repete a mesma variação em sequência. */
  private readonly ultimoSorteado: Record<1 | 2, string | null> = { 1: null, 2: null };

  constructor(private readonly d: DependenciasMotor) {}

  // ── Estado ────────────────────────────────────────────────────────────────

  async carregar(): Promise<VisaoFollowup> {
    const [config, followups, campanhas, envios] = await Promise.all([lerConfigFollowup(this.d.db), listarFollowups(this.d.db), listarCampanhas(this.d.db), listarEnvios(this.d.db)]);
    const idsFollowup = new Set(campanhas.filter((c) => c.tipo === 'followup').map((c) => c.id));
    const enviadasHoje = contarEnviosHoje(envios.filter((e) => idsFollowup.has(e.campanhaId)), this.d.agora());
    return { config, followups, listas: separarListas(followups), enviadasHoje };
  }

  /**
   * Grava a configuração. Se mudou o modo, os textos ou o estilo, os itens que já estão na fila de cobrança (e ainda
   * não saíram) têm o texto refeito AGORA com a configuração nova: um texto preparado com a configuração antiga nunca sai.
   */
  async salvarConfig(c: ConfigFollowup): Promise<ConfigFollowup> {
    const antes = await lerConfigFollowup(this.d.db);
    const nova = await salvarConfigFollowup(this.d.db, c);
    if (assinaturaTextos(antes) !== assinaturaTextos(nova)) await this.refazerFila(nova);
    return nova;
  }

  /**
   * Refaz o texto de quem está na fila ('cobranca') com um texto preparado por OUTRA configuração (ou da 0.7.54).
   * Fica de fora o contato cuja mensagem está em voo (já foi colada: o Executor confere a conversa). Sem nenhum texto
   * do dono, a fila volta a "monitorando": sem texto próprio não se cobra. Devolve quantos itens foram refeitos.
   */
  async refazerFila(config: ConfigFollowup): Promise<number> {
    const [todos, campanhas] = await Promise.all([listarFollowups(this.d.db), listarCampanhas(this.d.db)]);
    const emVoo = new Set(campanhas.filter((c) => c.tipo === 'followup' && c.status !== 'concluida' && c.emVoo).map((c) => c.emVoo?.chave));
    const velhos = todos.filter((f) => textoDaFilaDesatualizado(f, config) && !emVoo.has(f.chave));
    if (velhos.length === 0) return 0;
    if (config.textos1.length === 0) {
      for (const f of velhos) await this.gravar({ ...f, estado: 'monitorando', cobrancaModelo: null, cobrancaOrigem: null, cobrancaAssinatura: null, verificadoEm: null, atualizadoEm: this.d.agora().toISOString() });
      return velhos.length;
    }
    await this.prepararCobrancas(velhos, config, vazio());
    return velhos.length;
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

    await this.d.preparar?.(devidos.map((f) => ({ nome: f.nome, chave: f.chave })));
    const [naoEnviarLista, envios] = await Promise.all([listarNaoEnviar(this.d.db), listarEnvios(this.d.db)]);
    const naoEnviar = new Set(naoEnviarLista.map((n) => n.chave));
    const ultimo = ultimoEnvioPorChave(envios);
    const daEquipe = contatadoPelaEquipe();

    const paraIa: Array<{ f: Followup; mensagens: MensagemLida[] }> = [];
    const paraCobrar: Followup[] = [];
    // Uma consulta ao CRM para a rodada toda (cache de 5 min no serviço); só vale para quem for cobrado.
    const travas = this.d.travar ? await this.d.travar(devidos.map((f) => ({ nome: f.nome, chave: f.chave }))) : null;

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
          // Resultado por texto (só local): a leitura achou resposta do cliente à nossa última mensagem (vale se foi em até 7 dias).
          await registrarRespostaDoTexto(this.d.db, { ...(f.cobrancas.length === 0 ? { id: f.id } : {}), chave: f.chave, referencia: referenciaDe(f) }, agora).catch(() => false);
          // Ainda sem desfecho: só vira "Precisa de você"/"Resolvido" depois da IA. Se a IA falhar, repete depois.
          paraIa.push({ f: base, mensagens: leitura.mensagens });
        } else {
          const decisao = decidirCobranca(f, { agora, dias: config.dias, naoEnviar, ultimoEnvioPorChave: ultimo, contatadoPelaEquipePorChave: daEquipe });
          const trava = travas?.[i] ?? { tipo: 'livre' as const };
          if (decisao.pode && trava.tipo === 'agendado') {
            // O agendamento prevalece: nada de cobrança. Quando a data passar, o disparo já terá saído da janela de acompanhamento.
            await this.gravar({ ...base, estado: 'resolvido', motivo: trava.motivo });
            resumo.resolvidos += 1;
          } else if (decisao.pode && trava.tipo === 'indisponivel') {
            // Não deu para conferir os agendamentos: não cobra agora (falha fechada) e lê de novo na próxima rodada.
            await this.gravar({ ...base, verificadoEm: null, motivo: `não cobrei: ${trava.motivo}` });
            resumo.aviso ??= `Não consegui conferir os agendamentos do CRM (${trava.motivo}): nada foi cobrado.`;
          } else if (decisao.pode) {
            if (config.ligado) paraCobrar.push(base);
            else await this.gravar({ ...base, motivo: `sem resposta há ${config.dias}+ dia(s); cobrança automática desligada` });
          } else if (decisao.destino === 'espera') {
            await this.gravar({ ...base, motivo: decisao.motivo });
          } else {
            await this.gravar({ ...base, estado: decisao.destino, motivo: decisao.motivo });
            if (decisao.destino === 'saiu') resumo.saidas += 1;
            else {
              resumo.resolvidos += 1;
              // Encerrou a sequência sozinho (sem resposta depois das cobranças): fica no "O que a IA fez" (só informa; não há o que desfazer).
              if (decisao.destino === 'resolvido' && !emObservacao(config)) {
                await registrarAcaoIa(this.d.db, novaAcao({ tipo: 'encerrou', origem: 'followup', chave: f.chave, nome: f.nome, resumo: decisao.motivo, id: `encerrou:followup:${f.id}:${f.cobrancas.length}` }, agora));
              }
            }
          }
        }
      }
      if (i < devidos.length - 1) await this.d.esperar(1500 + Math.floor(this.d.aleatorio() * 2500));
    }

    if (paraIa.length > 0) await this.classificar(paraIa, resumo, config);
    if (paraCobrar.length > 0) await this.prepararCobrancas(paraCobrar, config, resumo);
    return resumo;
  }

  private async gravar(f: Followup): Promise<void> {
    await salvarFollowups(this.d.db, [f]);
  }

  // ── IA: entender as respostas ─────────────────────────────────────────────

  private async classificar(itens: Array<{ f: Followup; mensagens: MensagemLida[] }>, resumo: ResumoRodada, config: ConfigFollowup): Promise<void> {
    const observando = emObservacao(config);
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
        falhaDaIa(r.erro.mensagem, this.d.agora().getTime());
        for (const x of lote) await this.gravar({ ...x.f, verificadoEm: null });
        continue;
      }
      iaFuncionou();
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
          if (observando) {
            // Observação: NÃO marca "Não enviar mais". O contato fica em "revisar" (nunca é cobrado) e a decisão vai para o julgamento.
            f = { ...f, estado: 'revisar', motivo: 'Observação: a IA marcaria "Não enviar mais" (pediu para sair). Nada foi marcado.', sugestao: '', observado: true };
            resumo.revisar += 1;
          } else {
            // Pedido explícito para sair: opt-out automático. Nunca mais cobrança, nem campanha.
            await marcarNaoEnviar(this.d.db, { chave: f.chave, nome: f.nome, desde: agora.toISOString(), motivo: 'pediu para sair (lido pela IA)', origem: 'ia' });
            await registrarAcaoIa(this.d.db, novaAcao({ tipo: 'nao_enviar', origem: 'followup', chave: f.chave, nome: f.nome, resumo: `Pediu para sair. ${c.resumo}`, desfazer: { tipo: 'nao_enviar' } }, agora));
            resumo.saidas += 1;
          }
        } else if (f.estado === 'precisa') resumo.precisam += 1;
        else if (f.estado === 'revisar') resumo.revisar += 1;
        else resumo.resolvidos += 1;
        if (efeito.lembrete) {
          if (observando) f = { ...f, observado: true };
          else {
            const erro = await this.d.criarLembrete(f.nome, efeito.lembrete.venceEm, agora);
            if (erro === null) {
              f = { ...f, lembreteCriadoEm: agora.toISOString() };
              await registrarAcaoIa(this.d.db, novaAcao({ tipo: 'agendou', origem: 'followup', chave: f.chave, nome: f.nome, resumo: `Lembrete para daqui a ${efeito.lembrete.dias} dia(s), às 9h (${ROTULO_CLASSE[c.classe]})` }, agora));
            } else f = { ...f, resumo: `${f.resumo ?? ''} (não consegui criar o lembrete: ${erro})`.trim() };
          }
        }
        if (observando) await anotarDecisaoDaResposta(this.d.db, { origem: 'followup', chave: x.f.chave, nome: x.f.nome, contexto: `${x.f.id}:${x.f.cobrancas.length}`, estadoDepois: f.estado, motivoDepois: f.motivo, optOut: efeito.optOut, c }, agora);
        await this.gravar(f);
      }
    }
  }

  // ── Texto da cobrança: SEMPRE o jeito do dono ─────────────────────────────

  /**
   * Escolhe o texto de UM contato. Modo "meus textos": sorteia entre os textos do dono (sem repetir a mesma variação em
   * sequência, nem o que este contato já recebeu). Modo "IA no meu estilo": pede à IA com o estilo e os textos do dono
   * como exemplos; se ela falhar ou o texto for recusado, sorteia um texto do dono. Nunca existe modelo genérico.
   * Devolve null se não há texto do dono que sirva a este contato (o chamador manda para "revisar").
   */
  private async escolherTexto(f: Followup, config: ConfigFollowup, usados: Set<string>, ia: { fora: boolean }): Promise<{ modelo: string; origem: OrigemTexto } | null> {
    const tentativa = Math.min(2, f.cobrancas.length + 1) as 1 | 2;
    const nome = f.primeiroNome.trim();
    const lista = textosDaTentativa(config, tentativa);
    const jaRecebeu = f.cobrancas.map((c) => c.texto);

    if (config.modo === 'ia_estilo' && !ia.fora && nome !== '') { // sem primeiro nome a IA não é chamada: só valem os textos do dono sem {nome}
      try {
        const r = await this.d.ia.escreverCobranca(nome, f.mensagemCampanha, tentativa, { estilo: config.estilo, exemplos: lista });
        if (r.ok) {
          const modelo = paraModelo(r.valor, nome);
          const comMarcador = modelo.split(MARCADOR_PRIMEIRO_NOME).join(MARCADOR_NOME);
          const final = montarTextoCobranca(comMarcador, nome);
          const copiaDoDono = lista.some((t) => montarTextoCobranca(t, nome) === final);
          if (textoCobrancaValido(comMarcador, nome) && modeloDeCobrancaValido(modelo) && !usados.has(modelo) && !jaRecebeu.includes(final)) {
            // Se a IA devolveu um texto do dono palavra por palavra, o rótulo honesto é "seu texto".
            return { modelo, origem: copiaDoDono ? 'meus_textos' : 'ia_estilo' };
          }
        } else if (r.erro.tipo !== 'validacao') ia.fora = true;
      } catch {
        ia.fora = true;
      }
    }

    const servem = textosParaContato(lista, nome).filter((t) => textoCobrancaValido(t, nome) && !jaRecebeu.includes(montarTextoCobranca(t, nome)));
    const escolhido = sortearTexto(servem, this.d.aleatorio, this.ultimoSorteado[tentativa]);
    if (escolhido === null) return null;
    this.ultimoSorteado[tentativa] = escolhido;
    const modelo = textoParaModelo(escolhido);
    return modeloDeCobrancaValido(modelo) ? { modelo, origem: 'meus_textos' } : null;
  }

  private async prepararCobrancas(itens: Followup[], config: ConfigFollowup, resumo: ResumoRodada): Promise<void> {
    const usados = new Set<string>();
    const ia = { fora: false };
    const assinatura = assinaturaTextos(config);
    for (const f of itens) {
      const escolha = await this.escolherTexto(f, config, usados, ia);
      if (escolha === null) {
        await this.gravar({
          ...f,
          estado: 'revisar',
          motivo: f.primeiroNome.trim() === '' ? 'o contato não tem primeiro nome e nenhum texto seu serve sem {nome}: escreva você' : 'não achei um texto seu que sirva para esta cobrança (escreva mais variações na mensagem de cobrança)',
          cobrancaModelo: null,
          cobrancaOrigem: null,
          cobrancaAssinatura: null,
        });
        resumo.revisar += 1;
        continue;
      }
      usados.add(escolha.modelo);
      if (emObservacao(config)) {
        // Observação: a cobrança fica preparada na fila, mas NÃO sai. O dono julga se a IA acertou em cobrar.
        await registrarDecisao(
          this.d.db,
          novaDecisao({ origem: 'followup', tipo: 'cobrar', chave: f.chave, nome: f.nome, contexto: `${f.id}:${f.cobrancas.length}`, resumo: `Cobraria agora (cobrança ${f.cobrancas.length + 1} de ${MAX_COBRANCAS}): sem resposta há ${config.dias}+ dia(s)`, texto: montarMensagem(escolha.modelo, f.primeiroNome) }, this.d.agora()),
        );
      }
      await this.gravar({
        ...f,
        estado: 'cobranca',
        motivo: null,
        cobrancaModelo: escolha.modelo,
        cobrancaOrigem: escolha.origem,
        cobrancaAssinatura: assinatura,
        atualizadoEm: this.d.agora().toISOString(),
      });
      resumo.cobrancas += 1;
    }
    if (ia.fora && resumo.aviso === null) resumo.aviso = 'A IA estava fora do ar: usei os seus textos de cobrança.';
  }

  // ── Mandar a cobrança (pelo Executor das campanhas) ───────────────────────

  /**
   * Monta a campanha de cobrança com quem está em 'cobranca' e foi lido há menos de 12 h (leitura velha volta a
   * ser lida antes de cobrar: o cliente pode ter respondido). Campanhas de cobrança antigas e não concluídas são
   * encerradas: os itens delas que não saíram continuam em 'cobranca' e entram nesta. Devolve null se não há ninguém.
   */
  async montarCampanhaDeCobranca(config: ConfigFollowup): Promise<Campanha | null> {
    const agora = this.d.agora();
    // Sem pelo menos 1 texto do dono para a 1ª cobrança nada é preparado nem enviado (a tela também bloqueia o "ligar").
    if (config.textos1.length === 0) return null;
    // Texto preparado com outra configuração (o dono mudou os textos, o modo ou o estilo) é refeito ANTES do envio.
    await this.refazerFila(config);
    const abertas = (await listarCampanhas(this.d.db)).filter((c) => c.tipo === 'followup' && c.status !== 'concluida');
    // Uma cobrança em voo (o painel fechou no meio) pode ter saído: essa campanha PRECISA ser retomada (o Executor
    // confere a conversa antes de qualquer colagem), nunca encerrada nem substituída. Os outros itens pendentes dela
    // ficam com o texto atual da fila (ou são pulados se saíram da fila).
    const emVoo = abertas.find((c) => c.emVoo);
    if (emVoo) return this.alinharComAFila(emVoo, await listarFollowups(this.d.db));
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
    if (igual) return this.alinharComAFila(igual, await listarFollowups(this.d.db));
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

  /**
   * Os itens PENDENTES de uma campanha de cobrança aberta passam a ter exatamente o texto atual da fila. Quem saiu da
   * fila (ou ficou sem texto) é pulado. O item em voo não é tocado (a mensagem dele já foi colada).
   */
  private async alinharComAFila(c: Campanha, followups: ReadonlyArray<Followup>): Promise<Campanha> {
    const porChave = new Map(followups.map((f) => [f.chave, f]));
    let mudou = false;
    const agora = this.d.agora().toISOString();
    const itens = c.itens.map((i) => {
      if (i.status !== 'pendente' || c.emVoo?.chave === i.chave) return i;
      const f = porChave.get(i.chave);
      if (f && f.estado === 'cobranca' && f.cobrancaModelo) {
        if (f.cobrancaModelo === i.modelo) return i;
        mudou = true;
        return { ...i, modelo: f.cobrancaModelo };
      }
      mudou = true;
      return { ...i, status: 'pulado' as const, motivo: 'saiu da fila de cobrança (o texto foi refeito ou o contato mudou de situação)', atualizadoEm: agora };
    });
    if (!mudou) return c;
    const nova = { ...c, itens };
    await salvarCampanha(this.d.db, nova);
    return nova;
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
    // "O que a IA fez": cada cobrança que saiu (idempotente: a mesma cobrança notificada várias vezes é um registro só). Envio não tem desfazer.
    for (const [i, f] of novos.entries()) {
      if (f === todos[i] || f.cobrancas.length <= todos[i].cobrancas.length) continue;
      const c = f.cobrancas[f.cobrancas.length - 1];
      await registrarAcaoIa(this.d.db, novaAcao({ tipo: 'enviou', origem: 'followup', chave: f.chave, nome: f.nome, resumo: `Cobrança ${f.cobrancas.length} enviada: "${c.texto.slice(0, 120)}"`, id: `enviou:followup:${f.id}:${c.em}` }, new Date(c.em)));
    }
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
    await marcarNaoEnviar(this.d.db, { chave: f.chave, nome: f.nome, desde: agora.toISOString(), motivo: 'não enviar mais (follow-up)', origem: 'cobranca' });
    await this.gravar({ ...f, estado: 'saiu', motivo: 'você marcou "não enviar mais"', cobrancaModelo: null, cobrancaOrigem: null, atualizadoEm: agora.toISOString() });
  }

  /** "Conferi: pode voltar a acompanhar" (um 'revisar' que o atendente verificou). Volta a ser lido depois de X dias. */
  async voltarAMonitorar(id: string): Promise<void> {
    const f = (await listarFollowups(this.d.db)).find((x) => x.id === id);
    // Item da reativação nunca vira "monitorando" (não é disparo: seria cobrado).
    if (!f || f.estado !== 'revisar' || f.origem === 'reativacao') return;
    await this.gravar({ ...f, estado: 'monitorando', motivo: null, verificadoEm: this.d.agora().toISOString(), atualizadoEm: this.d.agora().toISOString() });
  }
}
