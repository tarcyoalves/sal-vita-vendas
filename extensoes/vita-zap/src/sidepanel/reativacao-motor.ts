// Motor da reativação por inatividade (v0.7.56), sem React.
//
// Divisão de trabalho (igual ao follow-up de cobrança):
//  - regras puras (quem entra, etapas, decisão da IA → o que fazer): shared/reativacao.ts;
//  - trava de agendamento: shared/trava-agendamento.ts, consultada no CRM pelo service worker;
//  - ler a conversa: content script (`lerConversa`, só leitura, identidade estrita);
//  - decidir: IA no servidor do CRM (zapIa.avaliarReativacao; respostas a uma etapa: zapIa.classificarConversas);
//  - guardar o contexto: resumo da última conversa nas notas do lead do CRM (zapCrm.registrarReativacao);
//  - ENVIAR a mensagem da etapa: o MESMO Executor das campanhas (teto diário compartilhado, horário, intervalo 60–120 s,
//    freio, "Não enviar mais", conversa conferida antes do clique, trava de agendamento antes de abrir cada contato).
//    Este arquivo NÃO tem caminho próprio de clique: só monta a campanha (tipo 'reativacao') e devolve para o Executor.
//  - o que é delicado/duvidoso NUNCA sai sozinho: vai para "Precisa de você" (a lista do Follow-up).

import {
  type Banco,
  lerConfig,
  lerConfigReativacao,
  listarCampanhas,
  listarEnvios,
  listarFollowups,
  listarNaoEnviar,
  listarReativacoes,
  marcarNaoEnviar,
  salvarCampanha,
  salvarConfigReativacao,
  salvarFollowups,
  salvarReativacoes,
} from '../shared/banco';
import { type Campanha, novoId } from '../shared/campanha';
import type { ContatoVarrido } from '../shared/contatos';
import { type ContextoFiltro, FILTROS_PADRAO, ultimoEnvioPorChave } from '../shared/filtros';
import { aplicarClassificacao, analisarLeitura, paraModelo, type ClassificacaoIa, type Followup } from '../shared/followup';
import {
  MARCADOR_NOME,
  montarTextoCobranca,
  sortearTexto,
  textoCobrancaValido,
  textoParaModelo,
  textosParaContato,
  type OrigemTexto,
} from '../shared/followup-estilo';
import { modeloDeCobrancaValido } from '../shared/followup';
import { MARCADOR_PRIMEIRO_NOME } from '../shared/constantes';
import type { LeadsCRM } from '../shared/leads';
import type { CodigoErro, MensagemLida, PedidoConteudo, RespostaConteudo } from '../shared/mensagens';
import { primeiroNome as extrairPrimeiroNome } from '../shared/nomes';
import { contarEnviosHoje } from '../shared/politica';
import {
  type AvaliacaoReativacao,
  type ConfigReativacao,
  type ListasReativacao,
  type Reativacao,
  ID_FOLLOWUP_REATIVACAO,
  INTERVALO_MIN_ENTRE_ETAPAS,
  LOTE_IA_REATIVACAO,
  MAX_LEITURAS_REATIVACAO,
  REELEGIVEL_APOS_DIAS,
  REELEGIVEL_RESOLVIDO_DIAS,
  VALIDADE_LEITURA_REATIVACAO_MS,
  aplicarDecisao,
  aplicarResultadoCampanhaReativacao,
  assinaturaReativacao,
  candidatosEtapa1,
  concluirSemResposta,
  conversaTemTexto,
  dataDaUltimaMensagem,
  devidoParaLer,
  diasDesdeData,
  followupDaReativacao,
  novoRegistro,
  reelegivelDepoisDe,
  semAgendamentoNoCrm,
  separarListasReativacao,
  textosDaEtapa,
  ultimoEnvio,
} from '../shared/reativacao';
import { MOTIVO_TRAVA_PREFIXO } from '../shared/reativacao';
import type { PedidoRegistroReativacao, ResultadoRegistroReativacao } from '../shared/servico-agendamentos';
import type { ConversaParaIa } from '../shared/servico-ia';
import { diaMes, type ResultadoTrava } from '../shared/trava-agendamento';
import { hojeNoFuso } from '../shared/datas';

const ERROS_GERAIS: ReadonlySet<CodigoErro> = new Set<CodigoErro>(['seletor', 'nao_pronto', 'ocupado', 'interno']);

export interface DependenciasReativacao {
  db: Banco;
  pedir: (pedido: PedidoConteudo, trazerParaFrente?: boolean) => Promise<RespostaConteudo>;
  ia: Pick<LeadsCRM, 'avaliarReativacao' | 'classificarRespostas' | 'escreverCobranca' | 'registrarReativacao'>;
  /** Trava de agendamento: um resultado por contato. `forcar` consulta o CRM de novo (começo da rodada). `telefone` = o que a conversa acabou de revelar. */
  travar: (contatos: ReadonlyArray<{ nome: string; chave: string; telefone?: string | null }>, forcar: boolean) => Promise<ResultadoTrava[]>;
  /** Cria o lembrete local (compra depois / tem estoque), como o follow-up de respostas. Devolve o erro ou null. */
  criarLembrete: (nome: string, venceEm: number, agora: Date) => Promise<string | null>;
  /** Telefone que a extensão já conhece do contato (índice local do CRM da extensão). */
  telefoneLocal?: (nome: string, chave: string) => Promise<string | null> | string | null;
  agora: () => Date;
  aleatorio: () => number;
  esperar: (ms: number) => Promise<void>;
}

export interface ResumoReativacao {
  /** Conversas abertas e lidas (só leitura). */
  lidas: number;
  /** Decisões da IA, por tipo. */
  prontos: number;
  agendados: number;
  precisam: number;
  saidas: number;
  travados: number;
  respostas: number;
  concluidos: number;
  /** Conversas mais recentes do que a lista mostrava: nada a fazer agora. */
  recentes: number;
  /** Não deu para conferir os agendamentos do CRM: esses contatos não foram avaliados. */
  semConferencia: number;
  aviso: string | null;
  parou: boolean;
}

export interface OpcoesRodada {
  /** Ignora o limite de "backlog de prontos" e as leituras recentes: clique do atendente em "Avaliar agora". */
  manual?: boolean;
  parar?: () => boolean;
  aoProgredir?: (texto: string) => void;
}

export interface VisaoReativacao {
  config: ConfigReativacao;
  registros: Reativacao[];
  listas: ListasReativacao;
  enviadasHoje: number;
}

const vazio = (): ResumoReativacao => ({ lidas: 0, prontos: 0, agendados: 0, precisam: 0, saidas: 0, travados: 0, respostas: 0, concluidos: 0, recentes: 0, semConferencia: 0, aviso: null, parou: false });

type Trabalho =
  | { tipo: 'nova'; chave: string; nome: string; contato: ContatoVarrido }
  | { tipo: 'sequencia'; chave: string; nome: string; registro: Reativacao; devido: NonNullable<ReturnType<typeof devidoParaLer>> };

export class MotorReativacao {
  /** Último texto sorteado por etapa: o próximo contato não repete a mesma variação em sequência. */
  private readonly ultimoSorteado: Record<1 | 2 | 3, string | null> = { 1: null, 2: null, 3: null };

  constructor(private readonly d: DependenciasReativacao) {}

  // ── Estado ────────────────────────────────────────────────────────────────

  async carregar(): Promise<VisaoReativacao> {
    await this.sincronizarComFollowups();
    const [config, registros, campanhas, envios] = await Promise.all([lerConfigReativacao(this.d.db), listarReativacoes(this.d.db), listarCampanhas(this.d.db), listarEnvios(this.d.db)]);
    const ids = new Set(campanhas.filter((c) => c.tipo === 'reativacao').map((c) => c.id));
    return { config, registros, listas: separarListasReativacao(registros), enviadasHoje: contarEnviosHoje(envios.filter((e) => ids.has(e.campanhaId)), this.d.agora()) };
  }

  /** Grava a configuração; texto preparado com outra configuração é refeito AGORA (nunca sai texto da configuração antiga). */
  async salvarConfig(c: ConfigReativacao): Promise<ConfigReativacao> {
    const nova = await salvarConfigReativacao(this.d.db, c);
    await this.refazerProntos(nova);
    return nova;
  }

  /** O dono resolveu / mandou sair pela lista do Follow-up: o registro da reativação acompanha. */
  async sincronizarComFollowups(): Promise<void> {
    const [registros, followups] = await Promise.all([listarReativacoes(this.d.db), listarFollowups(this.d.db)]);
    const porId = new Map(followups.filter((f) => f.origem === 'reativacao').map((f) => [f.id, f]));
    const agora = this.d.agora();
    const mudados: Reativacao[] = [];
    for (const r of registros) {
      if (r.estado !== 'precisa' && r.estado !== 'respondeu') continue;
      const f = porId.get(ID_FOLLOWUP_REATIVACAO(r.chave));
      if (!f) continue;
      if (f.estado === 'saiu') mudados.push({ ...r, estado: 'saiu', motivo: f.motivo ?? 'não enviar mais', atualizadoEm: agora.toISOString() });
      else if (f.estado === 'resolvido' && r.estado === 'precisa') {
        mudados.push({ ...r, estado: 'resolvido', motivo: f.motivo ?? 'resolvido por você', reelegivelEm: reelegivelDepoisDe(REELEGIVEL_RESOLVIDO_DIAS, agora), atualizadoEm: agora.toISOString() });
      }
    }
    await salvarReativacoes(this.d.db, mudados);
  }

  private async gravar(r: Reativacao): Promise<void> {
    await salvarReativacoes(this.d.db, [r]);
  }

  /** Item de "Precisa de você" do Follow-up. 'delicado' mostra o resumo; dúvida de leitura vira "revisar". */
  private async paraALista(r: Reativacao): Promise<void> {
    const agora = this.d.agora();
    const delicado = r.decisao === 'delicado' && r.estado === 'precisa' && r.motivo == null;
    await salvarFollowups(this.d.db, [
      followupDaReativacao(r, agora, delicado ? { estado: 'precisa', resumo: r.resumo, motivo: null } : { estado: 'revisar', motivo: r.motivo ?? r.resumo ?? 'leia a conversa' }),
    ]);
  }

  // ── Rodada: ler, decidir, guardar no CRM ──────────────────────────────────

  /**
   * Uma rodada (SÓ LEITURA no WhatsApp): etapa 1 para quem está há `etapas[0]` dias sem conversa (varredura) e etapas 2/3
   * (ou conferência de resposta) para quem já recebeu uma mensagem. Nada é enviado aqui: quem decide mensagem deixa o
   * contato em 'pronto' e o Executor manda depois. O resumo e o agendamento vão para o CRM.
   */
  async rodada(config: ConfigReativacao, contatos: ReadonlyArray<ContatoVarrido>, opcoes: OpcoesRodada = {}): Promise<ResumoReativacao> {
    const resumo = vazio();
    await this.sincronizarComFollowups();
    const agora0 = this.d.agora();
    const [registrosLista, naoEnviarLista, envios, campanhas] = await Promise.all([listarReativacoes(this.d.db), listarNaoEnviar(this.d.db), listarEnvios(this.d.db), listarCampanhas(this.d.db)]);
    const registros = new Map(registrosLista.map((r) => [r.chave, r]));
    const naoEnviar = new Set(naoEnviarLista.map((n) => n.chave));

    await this.reenviarCrmPendentes(registrosLista, resumo);

    // Trabalho da rodada: quem já está na sequência primeiro, depois contatos novos (os de conversa mais antiga primeiro).
    const trabalho: Trabalho[] = [];
    for (const r of registrosLista) {
      if (opcoes.parar?.()) break;
      const devido = devidoParaLer(r, config, agora0);
      if (devido) trabalho.push({ tipo: 'sequencia', chave: r.chave, nome: r.nome, registro: r, devido });
    }
    const ctx: ContextoFiltro = { agora: agora0, naoEnviar, ultimoEnvioPorChave: ultimoEnvioPorChave(envios) };
    const novos = candidatosEtapa1(contatos, config, registros, ctx);
    // Sem acumular "prontos" que não cabem no teto de hoje (ficariam velhos antes de sair): só avalia gente nova se há vaga.
    const prontos = registrosLista.filter((r) => r.estado === 'pronto').length;
    const idsReativacao = new Set(campanhas.filter((c) => c.tipo === 'reativacao').map((c) => c.id));
    const enviadas = contarEnviosHoje(envios.filter((e) => idsReativacao.has(e.campanhaId)), agora0);
    const teto = (await lerConfig(this.d.db)).tetoDiario; // a regra fina é do Executor; aqui é só para não acumular prontos
    const vagas = Math.max(0, teto - enviadas - prontos);
    // Automática: só avalia gente nova enquanto há vaga hoje ("Avaliar agora" ignora: o atendente quer ver tudo).
    for (const c of opcoes.manual ? novos.elegiveis : novos.elegiveis.slice(0, vagas)) trabalho.push({ tipo: 'nova', chave: c.chave, nome: c.nome, contato: c });
    const lote = trabalho.slice(0, MAX_LEITURAS_REATIVACAO);
    if (lote.length === 0) return resumo;

    // Trava ANTES de abrir qualquer conversa: uma consulta ao CRM para a rodada (forçada: lista fresca).
    const travas = await this.d.travar(lote.map((t) => ({ nome: t.nome, chave: t.chave })), true);
    const primeiraFalha = travas.find((t): t is Extract<ResultadoTrava, { tipo: 'indisponivel' }> => t.tipo === 'indisponivel');
    if (travas.length !== lote.length || (primeiraFalha && travas.every((t) => t.tipo === 'indisponivel'))) {
      resumo.semConferencia = lote.length;
      resumo.aviso = `Não consegui conferir os agendamentos do CRM (${primeiraFalha?.motivo ?? 'resposta incompleta'}): nada foi avaliado nem enviado.`;
      return resumo;
    }

    const paraIa: Array<{ t: Extract<Trabalho, { tipo: 'nova' }>; mensagens: MensagemLida[]; telefone: string | null; base: string }> = [];
    const paraClassificar: Array<{ r: Reativacao; mensagens: MensagemLida[] }> = [];

    for (const [i, t] of lote.entries()) {
      if (opcoes.parar?.()) {
        resumo.parou = true;
        break;
      }
      const trava = travas[i];
      if (trava.tipo === 'indisponivel') {
        resumo.semConferencia += 1;
        continue;
      }
      if (trava.tipo === 'agendado') {
        await this.travarContato(t, trava);
        resumo.travados += 1;
        continue;
      }
      opcoes.aoProgredir?.(`Lendo ${i + 1} de ${lote.length}: ${t.nome}`);
      let r: RespostaConteudo;
      try {
        r = await this.d.pedir({ tipo: 'lerConversa', nome: t.nome }, true);
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
        // Identidade da conversa não confere, grupo, nome repetido, não achei: falha fechada, nunca manda mensagem.
        await this.falhaFechada(t, r.erro, agora);
        resumo.precisam += 1;
      } else {
        const mensagens = r.mensagens ?? [];
        if (t.tipo === 'nova') await this.lerNova(t, config, mensagens, r.telefone ?? null, paraIa, resumo);
        else await this.lerSequencia(t, config, mensagens, r.telefone ?? null, paraClassificar, resumo);
      }
      if (i < lote.length - 1) await this.d.esperar(1500 + Math.floor(this.d.aleatorio() * 2500));
    }

    if (paraIa.length > 0) await this.avaliarComIa(paraIa, config, resumo);
    if (paraClassificar.length > 0) await this.classificarRespostas(paraClassificar, resumo);
    return resumo;
  }

  private async telefoneDe(nome: string, chave: string, lido: string | null, atual: string | null): Promise<string | null> {
    return lido ?? atual ?? ((await this.d.telefoneLocal?.(nome, chave)) ?? null);
  }

  /** Tem agendamento futuro no CRM: não entra (a sequência, se havia, para). */
  private async travarContato(t: Trabalho, trava: Extract<ResultadoTrava, { tipo: 'agendado' }>): Promise<void> {
    const agora = this.d.agora();
    const base = t.tipo === 'sequencia' ? t.registro : novoRegistro({ chave: t.chave, nome: t.nome, primeiroNome: extrairPrimeiroNome(t.nome, ['cliente']) }, t.contato.ultimaConversa ?? hojeNoFuso(agora), agora);
    const ate = new Date(trava.ate).toISOString();
    const emSequencia = base.etapa > 0;
    await this.gravar({
      ...base,
      estado: emSequencia ? 'resolvido' : 'travado',
      motivo: trava.motivo,
      agendadoPara: ate,
      reelegivelEm: ate,
      textoPronto: null,
      atualizadoEm: agora.toISOString(),
    });
  }

  private async falhaFechada(t: Trabalho, motivo: string, agora: Date): Promise<void> {
    const base = t.tipo === 'sequencia' ? t.registro : novoRegistro({ chave: t.chave, nome: t.nome, primeiroNome: extrairPrimeiroNome(t.nome, ['cliente']) }, t.contato.ultimaConversa ?? hojeNoFuso(agora), agora);
    const r: Reativacao = { ...base, estado: 'precisa', motivo, textoPronto: null, verificadoEm: agora.toISOString(), atualizadoEm: agora.toISOString() };
    await this.gravar(r);
    await this.paraALista(r);
  }

  // ── Etapa 1: ler a última conversa ────────────────────────────────────────

  private async lerNova(
    t: Extract<Trabalho, { tipo: 'nova' }>,
    config: ConfigReativacao,
    mensagens: MensagemLida[],
    telefoneLido: string | null,
    paraIa: Array<{ t: Extract<Trabalho, { tipo: 'nova' }>; mensagens: MensagemLida[]; telefone: string | null; base: string }>,
    resumo: ResumoReativacao,
  ): Promise<void> {
    const agora = this.d.agora();
    const base = dataDaUltimaMensagem(mensagens) ?? t.contato.ultimaConversa ?? hojeNoFuso(agora);
    // A lista dizia "há 25+ dias", mas a conversa lida é mais recente (a varredura é antiga): nada a fazer agora.
    if (diasDesdeData(base, agora) < config.etapas[0]) {
      resumo.recentes += 1;
      return;
    }
    const telefone = await this.telefoneDe(t.nome, t.chave, telefoneLido, null);
    // Telefone novo: a trava confere de novo com ele (o casamento por telefone é o mais confiável).
    if (telefone) {
      const [trava] = await this.d.travar([{ nome: t.nome, chave: t.chave, telefone }], false);
      if (trava?.tipo === 'agendado') {
        await this.travarContato(t, trava);
        resumo.travados += 1;
        return;
      }
    }
    if (!conversaTemTexto(mensagens)) {
      const r = { ...novoRegistro({ chave: t.chave, nome: t.nome, primeiroNome: extrairPrimeiroNome(t.nome, ['cliente']), telefone }, base, agora), estado: 'precisa' as const, decisao: 'sem_contexto' as const, motivo: 'a conversa não mostrou nenhuma mensagem de texto (o histórico antigo pode estar só no celular): confira você', verificadoEm: agora.toISOString() };
      await this.gravar(r);
      await this.paraALista(r);
      resumo.precisam += 1;
      return;
    }
    paraIa.push({ t, mensagens, telefone, base });
  }

  private async avaliarComIa(
    itens: Array<{ t: Extract<Trabalho, { tipo: 'nova' }>; mensagens: MensagemLida[]; telefone: string | null; base: string }>,
    config: ConfigReativacao,
    resumo: ResumoReativacao,
  ): Promise<void> {
    for (let ini = 0; ini < itens.length; ini += LOTE_IA_REATIVACAO) {
      const lote = itens.slice(ini, ini + LOTE_IA_REATIVACAO);
      const agora0 = this.d.agora();
      // `ref` é só "c1", "c2"...: nem o nome, nem a chave, nem o telefone vão para o servidor.
      const conversas = lote.map((x, k) => ({
        ref: `c${k + 1}`,
        primeiroNome: extrairPrimeiroNome(x.t.nome, ['cliente']),
        diasSemConversa: diasDesdeData(x.base, agora0),
        mensagens: x.mensagens.slice(-12).map((m) => ({ de: m.de, texto: m.texto, ...(m.quando ? { quando: m.quando } : {}) })),
      }));
      let r;
      try {
        r = await this.d.ia.avaliarReativacao(conversas);
      } catch (e) {
        r = { ok: false as const, erro: { tipo: 'rede' as const, mensagem: e instanceof Error ? e.message : String(e) } };
      }
      if (!r.ok) {
        // IA fora do ar / limite diário: NADA é gravado; a próxima rodada tenta de novo.
        resumo.aviso = `A IA não respondeu (${r.erro.mensagem}). Tente de novo mais tarde.`;
        continue;
      }
      const porRef = new Map(r.valor.map((a) => [a.ref, a]));
      for (const [k, x] of lote.entries()) {
        const agora = this.d.agora();
        const av: AvaliacaoReativacao | undefined = porRef.get(`c${k + 1}`);
        const inicial = novoRegistro({ chave: x.t.chave, nome: x.t.nome, primeiroNome: extrairPrimeiroNome(x.t.nome, ['cliente']), telefone: x.telefone }, x.base, agora);
        if (!av) {
          const rev: Reativacao = { ...inicial, estado: 'precisa', motivo: 'a IA não devolveu uma avaliação desta conversa: leia a conversa', verificadoEm: agora.toISOString() };
          await this.gravar(rev);
          await this.paraALista(rev);
          resumo.precisam += 1;
          continue;
        }
        await this.aplicarAvaliacao(inicial, av, config, resumo);
      }
    }
  }

  /** A decisão da IA → registro, CRM (resumo/agendamento) e, se for o caso, o texto da mensagem. */
  private async aplicarAvaliacao(inicial: Reativacao, av: AvaliacaoReativacao, config: ConfigReativacao, resumo: ResumoReativacao): Promise<void> {
    const agora = this.d.agora();
    const plano = aplicarDecisao(inicial, av, config.etapas[0], agora);
    let r = plano.registro;

    if (plano.optOut) {
      await marcarNaoEnviar(this.d.db, { chave: r.chave, nome: r.nome, desde: agora.toISOString(), motivo: 'pediu para sair (lido pela IA na reativação)' });
      resumo.saidas += 1;
    }

    // CRM: o contexto não pode se perder. Agendamento é OBRIGATÓRIO para quem a IA mandou esperar; o resto é "melhor esforço" com nova tentativa.
    if (plano.crm) {
      const pedido: PedidoRegistroReativacao = { nome: r.nome, telefone: r.telefone, linha: plano.crm.linha, agendarEm: plano.crm.agendarEm, criar: plano.crm.criar };
      const res = await this.salvarNoCrm(pedido);
      if (res.ok) {
        r = { ...r, crmSalvoEm: agora.toISOString(), crmPendente: null, crmAviso: null };
        if (res.semAgenda === 'agendamento_existente' && plano.crm.agendarEm != null) {
          // Já havia um agendamento futuro (a trava não pegou por nome/telefone): ele prevalece.
          const ate = res.agendamentoExistente != null ? new Date(res.agendamentoExistente).toISOString() : null;
          r = { ...r, estado: 'travado', motivo: res.agendamentoExistente != null ? `${MOTIVO_TRAVA_PREFIXO}${diaMes(res.agendamentoExistente)} (o agendamento prevalece)` : 'já tem agendamento no CRM', agendadoPara: ate, reelegivelEm: ate, diasSugeridos: undefined };
          resumo.travados += 1;
        } else if (r.estado === 'agendado' && !res.agendou) {
          r = semAgendamentoNoCrm(r, res.semAgenda === 'tarefa_encerrada' ? 'a tarefa do cliente está encerrada no CRM' : 'o CRM recusou a data', agora);
        }
      } else if (plano.crm.agendarEm != null) {
        if (res.codigo === 'crm' || res.codigo === 'conflito') {
          // Falha passageira (CRM fora do ar): nada é gravado, a próxima rodada refaz esta avaliação.
          resumo.aviso = `Não consegui falar com o CRM (${res.mensagem}): deixei ${r.nome} para a próxima rodada.`;
          return;
        }
        r = semAgendamentoNoCrm(r, res.mensagem, agora);
      } else if (res.codigo === 'crm' || res.codigo === 'conflito') {
        r = { ...r, crmPendente: { linha: plano.crm.linha, agendarEm: null, criar: plano.crm.criar }, crmAviso: res.mensagem };
      } else {
        r = { ...r, crmAviso: res.mensagem };
      }
    }

    if (r.estado === 'pronto') {
      const escolha = await this.escolherTexto(r, config, new Set(), { fora: false });
      if (escolha === null) {
        r = { ...r, estado: 'precisa', motivo: r.primeiroNome.trim() === '' ? 'o contato não tem primeiro nome e nenhum texto seu serve sem {nome}: escreva você' : 'não achei um texto seu que sirva para esta etapa (escreva mais variações)' };
      } else {
        r = { ...r, textoPronto: { etapa: 1, modelo: escolha.modelo, origem: escolha.origem, assinatura: assinaturaReativacao(config) } };
      }
    }

    await this.gravar(r);
    if (r.estado === 'pronto') resumo.prontos += 1;
    else if (r.estado === 'agendado') resumo.agendados += 1;
    else if (r.estado === 'precisa') {
      resumo.precisam += 1;
      await this.paraALista(r);
    }
  }

  private async salvarNoCrm(p: PedidoRegistroReativacao): Promise<ResultadoRegistroReativacao> {
    try {
      return await this.d.ia.registrarReativacao(p);
    } catch (e) {
      return { ok: false, codigo: 'crm', mensagem: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Notas que ficaram sem chegar ao CRM (rede): tenta de novo no começo da rodada. */
  private async reenviarCrmPendentes(registros: ReadonlyArray<Reativacao>, resumo: ResumoReativacao): Promise<void> {
    for (const r of registros) {
      if (!r.crmPendente) continue;
      const res = await this.salvarNoCrm({ nome: r.nome, telefone: r.telefone, ...r.crmPendente });
      const agora = this.d.agora().toISOString();
      if (res.ok) await this.gravar({ ...r, crmPendente: null, crmSalvoEm: agora, crmAviso: null });
      else if (res.codigo === 'crm' || res.codigo === 'conflito') resumo.aviso ??= `Ainda não consegui salvar o resumo de ${r.nome} no CRM (${res.mensagem}). Tento de novo na próxima rodada.`;
      else await this.gravar({ ...r, crmPendente: null, crmAviso: res.mensagem });
    }
  }

  // ── Etapas 2 e 3: quem recebeu e não respondeu ────────────────────────────

  private async lerSequencia(
    t: Extract<Trabalho, { tipo: 'sequencia' }>,
    config: ConfigReativacao,
    mensagens: MensagemLida[],
    telefoneLido: string | null,
    paraClassificar: Array<{ r: Reativacao; mensagens: MensagemLida[] }>,
    resumo: ResumoReativacao,
  ): Promise<void> {
    const agora = this.d.agora();
    const r0 = t.registro;
    const ult = r0.enviados[r0.enviados.length - 1];
    const base: Reativacao = { ...r0, telefone: r0.telefone ?? telefoneLido, verificadoEm: agora.toISOString(), leituraRespostaEm: agora.toISOString(), atualizadoEm: agora.toISOString() };
    const leitura = analisarLeitura(mensagens, ult.texto, ult.em);
    if (leitura.tipo === 'duvida') {
      const rev: Reativacao = { ...base, estado: 'precisa', motivo: leitura.motivo };
      await this.gravar(rev);
      await this.paraALista(rev);
      resumo.precisam += 1;
    } else if (leitura.tipo === 'atendido') {
      await this.gravar({ ...base, estado: 'resolvido', motivo: leitura.motivo, textoPronto: null, reelegivelEm: reelegivelDepoisDe(REELEGIVEL_RESOLVIDO_DIAS, agora) });
      resumo.concluidos += 1;
    } else if (leitura.tipo === 'respondeu') {
      // Respondeu: sai da sequência e vai para a classificação do follow-up de respostas (mesma IA, mesma lista).
      paraClassificar.push({ r: base, mensagens: leitura.mensagens });
    } else if (t.devido.tipo === 'proxima') {
      const escolha = await this.escolherTexto(base, config, new Set(), { fora: false });
      if (escolha === null) {
        const rev: Reativacao = { ...base, estado: 'precisa', motivo: 'não achei um texto seu que sirva para a próxima etapa (escreva mais variações)' };
        await this.gravar(rev);
        await this.paraALista(rev);
        resumo.precisam += 1;
      } else {
        await this.gravar({ ...base, estado: 'pronto', motivo: null, textoPronto: { etapa: base.etapa + 1, modelo: escolha.modelo, origem: escolha.origem, assinatura: assinaturaReativacao(config) } });
        resumo.prontos += 1;
      }
    } else if (t.devido.tipo === 'conclusao') {
      const fim = concluirSemResposta(base, config, agora);
      const res = await this.salvarNoCrm({ nome: base.nome, telefone: base.telefone, ...fim.crm! });
      const registro = res.ok ? { ...fim.registro, crmSalvoEm: agora.toISOString() } : { ...fim.registro, crmAviso: res.mensagem, agendadoPara: null };
      await this.gravar(registro);
      resumo.concluidos += 1;
    } else {
      await this.gravar(base); // conferência: continua esperando
    }
  }

  private async classificarRespostas(itens: Array<{ r: Reativacao; mensagens: MensagemLida[] }>, resumo: ResumoReativacao): Promise<void> {
    for (let ini = 0; ini < itens.length; ini += 10) {
      const lote = itens.slice(ini, ini + 10);
      const conversas: ConversaParaIa[] = lote.map((x, k) => ({
        ref: `c${k + 1}`,
        primeiroNome: x.r.primeiroNome,
        mensagemCampanha: x.r.enviados[x.r.enviados.length - 1]?.texto ?? '',
        mensagens: x.mensagens.map((m) => ({ de: m.de, texto: m.texto, ...(m.quando ? { quando: m.quando } : {}) })),
      }));
      let r;
      try {
        r = await this.d.ia.classificarRespostas(conversas);
      } catch (e) {
        r = { ok: false as const, erro: { tipo: 'rede' as const, mensagem: e instanceof Error ? e.message : String(e) } };
      }
      if (!r.ok) {
        // IA fora do ar: o registro volta a esperar (será lido de novo).
        resumo.aviso = `A IA não respondeu (${r.erro.mensagem}). Tente de novo mais tarde.`;
        for (const x of lote) await this.gravar({ ...x.r, leituraRespostaEm: null });
        continue;
      }
      const porRef = new Map<string, ClassificacaoIa>(r.valor.map((c) => [c.ref, c]));
      for (const [k, x] of lote.entries()) {
        const agora = this.d.agora();
        const c = porRef.get(`c${k + 1}`);
        const f0 = followupDaReativacao(x.r, agora, { estado: 'monitorando' });
        let f: Followup;
        if (!c) {
          f = { ...f0, estado: 'revisar', motivo: 'a IA não devolveu a classificação desta resposta: leia a conversa' };
        } else {
          const efeito = aplicarClassificacao(f0, c, agora);
          f = efeito.followup;
          if (efeito.optOut) await marcarNaoEnviar(this.d.db, { chave: x.r.chave, nome: x.r.nome, desde: agora.toISOString(), motivo: 'pediu para sair (lido pela IA, resposta à reativação)' });
          if (efeito.lembrete) {
            const erro = await this.d.criarLembrete(f.nome, efeito.lembrete.venceEm, agora);
            f = erro === null ? { ...f, lembreteCriadoEm: agora.toISOString() } : { ...f, resumo: `${f.resumo ?? ''} (não consegui criar o lembrete: ${erro})`.trim() };
          }
        }
        await salvarFollowups(this.d.db, [{ ...f, origem: 'reativacao' }]);
        const saiu = f.estado === 'saiu';
        await this.gravar({
          ...x.r,
          estado: saiu ? 'saiu' : 'respondeu',
          motivo: f.estado === 'resolvido' ? (f.motivo ?? 'respondeu') : saiu ? 'pediu para sair' : null,
          textoPronto: null,
          reelegivelEm: saiu ? null : reelegivelDepoisDe(REELEGIVEL_APOS_DIAS, agora),
          atualizadoEm: agora.toISOString(),
        });
        resumo.respostas += 1;
        if (f.estado === 'precisa' || f.estado === 'revisar') resumo.precisam += 1;
      }
    }
  }

  // ── Texto da mensagem: SEMPRE o jeito do dono ─────────────────────────────

  /**
   * Escolhe o texto de UM contato para a próxima etapa. "Meus textos": sorteia (sem repetir a variação em sequência nem o
   * que o contato já recebeu). "IA no meu estilo": pede à IA com o estilo e os textos do dono; se falhar ou for recusado,
   * sai um texto do dono, nunca um genérico. null = não há texto do dono que sirva (vai para "Precisa de você").
   */
  private async escolherTexto(r: Reativacao, config: ConfigReativacao, usados: Set<string>, ia: { fora: boolean }): Promise<{ modelo: string; origem: OrigemTexto } | null> {
    const etapa = Math.min(3, r.etapa + 1) as 1 | 2 | 3;
    const nome = r.primeiroNome.trim();
    const lista = textosDaEtapa(config, etapa);
    const jaRecebeu = r.enviados.map((e) => e.texto);

    if (config.modo === 'ia_estilo' && !ia.fora && nome !== '') {
      try {
        const res = await this.d.ia.escreverCobranca(nome, '', etapa, { estilo: config.estilo, exemplos: lista }, 'reativacao');
        if (res.ok) {
          const modelo = paraModelo(res.valor, nome);
          const comMarcador = modelo.split(MARCADOR_PRIMEIRO_NOME).join(MARCADOR_NOME);
          const final = montarTextoCobranca(comMarcador, nome);
          const copiaDoDono = lista.some((t) => montarTextoCobranca(t, nome) === final);
          if (textoCobrancaValido(comMarcador, nome) && modeloDeCobrancaValido(modelo) && !usados.has(modelo) && !jaRecebeu.includes(final)) {
            return { modelo, origem: copiaDoDono ? 'meus_textos' : 'ia_estilo' };
          }
        } else if (res.erro.tipo !== 'validacao') ia.fora = true;
      } catch {
        ia.fora = true;
      }
    }
    const servem = textosParaContato(lista, nome).filter((t) => textoCobrancaValido(t, nome) && !jaRecebeu.includes(montarTextoCobranca(t, nome)));
    const escolhido = sortearTexto(servem, this.d.aleatorio, this.ultimoSorteado[etapa]);
    if (escolhido === null) return null;
    this.ultimoSorteado[etapa] = escolhido;
    const modelo = textoParaModelo(escolhido);
    return modeloDeCobrancaValido(modelo) ? { modelo, origem: 'meus_textos' } : null;
  }

  /** Refaz o texto de quem está 'pronto' com uma assinatura de configuração antiga (o dono mudou os textos/modo/estilo). */
  async refazerProntos(config: ConfigReativacao): Promise<number> {
    const [todos, campanhas] = await Promise.all([listarReativacoes(this.d.db), listarCampanhas(this.d.db)]);
    const emVoo = new Set(campanhas.filter((c) => c.tipo === 'reativacao' && c.status !== 'concluida' && c.emVoo).map((c) => c.emVoo?.chave));
    const assinatura = assinaturaReativacao(config);
    const velhos = todos.filter((r) => r.estado === 'pronto' && r.textoPronto?.assinatura !== assinatura && !emVoo.has(r.chave));
    const usados = new Set<string>();
    const ia = { fora: false };
    for (const r of velhos) {
      const escolha = config.textos1.length === 0 ? null : await this.escolherTexto(r, config, usados, ia);
      if (escolha === null) {
        await this.gravar({ ...r, estado: 'precisa', motivo: 'sem texto seu que sirva para esta mensagem: escreva você', textoPronto: null, atualizadoEm: this.d.agora().toISOString() });
        continue;
      }
      usados.add(escolha.modelo);
      await this.gravar({ ...r, textoPronto: { etapa: r.textoPronto?.etapa ?? r.etapa + 1, modelo: escolha.modelo, origem: escolha.origem, assinatura }, atualizadoEm: this.d.agora().toISOString() });
    }
    return velhos.length;
  }

  // ── Mandar as mensagens (pelo Executor das campanhas) ─────────────────────

  /**
   * Monta a campanha de reativação com quem está 'pronto' e foi lido há menos de 12 h (leitura velha volta a ser lida antes de
   * mandar). Uma campanha com mensagem em voo é RETOMADA (o Executor confere a conversa), nunca substituída.
   */
  async montarCampanha(config: ConfigReativacao): Promise<Campanha | null> {
    const agora = this.d.agora();
    if (config.textos1.length === 0) return null;
    await this.refazerProntos(config);
    const abertas = (await listarCampanhas(this.d.db)).filter((c) => c.tipo === 'reativacao' && c.status !== 'concluida');
    const emVoo = abertas.find((c) => c.emVoo);
    if (emVoo) return this.alinhar(emVoo, await listarReativacoes(this.d.db));
    const todos = await listarReativacoes(this.d.db);
    // Leitura velha: o contato precisa ser avaliado de novo (volta à fila de elegíveis).
    for (const r of todos) {
      if (r.estado === 'pronto' && (r.verificadoEm == null || agora.getTime() - new Date(r.verificadoEm).getTime() > VALIDADE_LEITURA_REATIVACAO_MS)) {
        await this.gravar(
          r.etapa === 0
            ? { ...r, estado: 'resolvido', motivo: 'leitura antiga: será avaliado de novo', textoPronto: null, reelegivelEm: agora.toISOString(), atualizadoEm: agora.toISOString() }
            : { ...r, estado: 'aguardando', motivo: null, textoPronto: null, atualizadoEm: agora.toISOString() },
        );
      }
    }
    const prontos = (await listarReativacoes(this.d.db)).filter((r) => r.estado === 'pronto' && r.textoPronto).sort((a, b) => a.baseConversa.localeCompare(b.baseConversa));
    if (prontos.length === 0) return null;
    const chaves = new Set(prontos.map((r) => r.chave));
    const igual = abertas.find((c) => {
      const pend = c.itens.filter((i) => i.status === 'pendente');
      return pend.length === chaves.size && pend.every((i) => chaves.has(i.chave));
    });
    if (igual) return this.alinhar(igual, await listarReativacoes(this.d.db));
    for (const c of abertas) await salvarCampanha(this.d.db, { ...c, status: 'concluida', motivoPausa: 'substituída por uma reativação mais nova' });
    const campanha: Campanha = {
      id: novoId(agora, this.d.aleatorio),
      tipo: 'reativacao',
      nome: `Reativação ${agora.toISOString().slice(0, 10)}`,
      criadaEm: agora.toISOString(),
      aprovadaEm: agora.toISOString(),
      termoBusca: 'reativação',
      // O Executor lê daqui o intervalo mínimo entre mensagens do mesmo contato (as etapas nunca ficam coladas).
      filtros: { ...FILTROS_PADRAO, excluirContatadosHaDias: INTERVALO_MIN_ENTRE_ETAPAS },
      modelos: [],
      status: 'pausada',
      motivoPausa: null,
      itens: prontos.map((r) => ({ chave: r.chave, nome: r.nome, primeiroNome: r.primeiroNome, modelo: (r.textoPronto as NonNullable<Reativacao['textoPronto']>).modelo, status: 'pendente' as const, motivo: null, atualizadoEm: null })),
      problemasSeguidos: 0,
      ultimoEnvioEm: null,
      intervaloAtualSeg: null,
    };
    await salvarCampanha(this.d.db, campanha);
    return campanha;
  }

  /** Itens PENDENTES de uma campanha aberta passam a ter o texto atual; quem saiu da fila é pulado. O item em voo não é tocado. */
  private async alinhar(c: Campanha, registros: ReadonlyArray<Reativacao>): Promise<Campanha> {
    const porChave = new Map(registros.map((r) => [r.chave, r]));
    let mudou = false;
    const agora = this.d.agora().toISOString();
    const itens = c.itens.map((i) => {
      if (i.status !== 'pendente' || c.emVoo?.chave === i.chave) return i;
      const r = porChave.get(i.chave);
      if (r && r.estado === 'pronto' && r.textoPronto) {
        if (r.textoPronto.modelo === i.modelo) return i;
        mudou = true;
        return { ...i, modelo: r.textoPronto.modelo };
      }
      mudou = true;
      return { ...i, status: 'pulado' as const, motivo: 'saiu da fila de reativação (o texto foi refeito ou o contato mudou de situação)', atualizadoEm: agora };
    });
    if (!mudou) return c;
    const nova = { ...c, itens };
    await salvarCampanha(this.d.db, nova);
    return nova;
  }

  async campanhaEmVoo(): Promise<Campanha | null> {
    return (await listarCampanhas(this.d.db)).find((c) => c.tipo === 'reativacao' && c.status !== 'concluida' && c.emVoo) ?? null;
  }

  /** O Executor mexeu na campanha: cada item sai de 'pronto' conforme o desfecho dele. */
  async aplicarCampanha(campanha: Campanha): Promise<void> {
    if (campanha.tipo !== 'reativacao') return;
    const [todos, envios] = await Promise.all([listarReativacoes(this.d.db), listarEnvios(this.d.db)]);
    const novos = aplicarResultadoCampanhaReativacao(todos, campanha, envios, this.d.agora());
    const mudados = novos.filter((r, i) => r !== todos[i]);
    await salvarReativacoes(this.d.db, mudados);
    for (const r of mudados) if (r.estado === 'precisa') await this.paraALista(r);
  }

  // ── Ações do atendente ────────────────────────────────────────────────────

  async naoEnviarMais(chave: string): Promise<void> {
    const r = (await listarReativacoes(this.d.db)).find((x) => x.chave === chave);
    if (!r) return;
    const agora = this.d.agora();
    await marcarNaoEnviar(this.d.db, { chave: r.chave, nome: r.nome, desde: agora.toISOString(), motivo: 'não enviar mais (reativação)' });
    await this.gravar({ ...r, estado: 'saiu', motivo: 'você marcou "não enviar mais"', textoPronto: null, atualizadoEm: agora.toISOString() });
  }

  /** Tira da fila de hoje: o contato será avaliado de novo depois de REELEGIVEL_RESOLVIDO_DIAS dias. */
  async tirarDaFila(chave: string): Promise<void> {
    const r = (await listarReativacoes(this.d.db)).find((x) => x.chave === chave);
    if (!r) return;
    const agora = this.d.agora();
    await this.gravar({ ...r, estado: 'resolvido', motivo: 'tirado da fila por você', textoPronto: null, reelegivelEm: reelegivelDepoisDe(REELEGIVEL_RESOLVIDO_DIAS, agora), atualizadoEm: agora.toISOString() });
  }

  get ultimoEnvioDe(): (r: Pick<Reativacao, 'enviados'>) => string | null {
    return ultimoEnvio;
  }
}
