// Reativação por inatividade (v0.7.56): regras PURAS de quem entra, quando, em que etapa, o que a IA decide e o que fazer
// com a decisão. Sem rede, sem chrome, sem DOM: o motor do painel (sidepanel/reativacao-motor.ts) pluga a leitura da conversa,
// a IA do CRM, o CRM e o Executor das campanhas nestas funções.
//
// Decisão do dono (17/11/2026): "a versão web não puxa mais que 25/30/40 dias: o histórico antigo some e fica só no celular".
// Então, para quem está há 25 dias sem conversa, a IA lê a ÚLTIMA conversa, o resumo vai para o CRM (o contexto não se perde)
// e ela decide: retomar agora (mensagem do dono, pelo mesmo Executor das campanhas), esperar mais tempo (agendamento no CRM),
// ou chamar o dono. Etapas 2 e 3 (30 e 40 dias) só para quem recebeu a etapa anterior e NÃO respondeu.
// TRAVA: agendamento futuro no CRM prevalece (shared/trava-agendamento.ts).

import { normalizarModo, type ModoAutomatico } from './automaticos';
import { type Campanha, textoDoItem } from './campanha';
import { MOTIVO_CLIENTE_RESPONDEU } from './constantes';
import type { ContatoVarrido } from './contatos';
import { instanteNoFuso } from './crm-lembretes';
import { diferencaDias, hojeNoFuso, somarDias, type DataIso } from './datas';
import type { Envio } from './exportar';
import { avaliarContato, DIAS_SEM_REPETIR_PADRAO_REATIVACAO, FILTROS_PADRAO, type ContextoFiltro, type Filtros } from './filtros';
import type { ClassificacaoIa, Followup } from './followup';
import { normalizarEstilo, normalizarTextos, type ModoCobranca, type OrigemTexto } from './followup-estilo';
import type { MensagemLida } from './mensagens';
import { separarTermos } from './nomes';

// ── Constantes ──────────────────────────────────────────────────────────────

export const ETAPAS_PADRAO: readonly [number, number, number] = [25, 30, 40];
export const ETAPA_MINIMA_DIAS = 7;
export const ETAPA_MAXIMA_DIAS = 365;
/** Entre duas mensagens automáticas do mesmo contato: no mínimo isto (dias). */
export const INTERVALO_MIN_ENTRE_ETAPAS = 3;
/** Depois da última etapa enviada, espera isto (dias) por uma resposta antes de dar por encerrado. */
export const ESPERA_FINAL_DIAS = 7;
/** Primeira conferência de resposta de quem recebeu uma etapa: depois de N dias (as leituras seguintes só nas etapas). */
export const CONFERIR_RESPOSTA_APOS_DIAS = 2;
export const AGENDA_LONGA_PADRAO = 60;
export const AGENDA_LONGA_MIN = 14;
export const AGENDA_LONGA_MAX = 365;
/** Conversas por chamada à IA (o servidor aceita até 20). */
export const LOTE_IA_REATIVACAO = 10;
/** Contatos lidos por rodada (cada leitura abre uma conversa no WhatsApp). */
export const MAX_LEITURAS_REATIVACAO = 30;
/** Leitura "sem resposta" vale isto para o envio: mais velha, lê de novo antes. */
export const VALIDADE_LEITURA_REATIVACAO_MS = 12 * 3_600_000;
/** O que não pode ir para o CRM: a nota é curta (o servidor aceita 700, a extensão manda menos). */
export const MAX_RESUMO_CRM = 450;
/** Quanto tempo um contato resolvido/agendado/que respondeu fica fora de uma nova reativação. */
export const REELEGIVEL_APOS_DIAS = 60;
export const REELEGIVEL_RESOLVIDO_DIAS = 30;

// ── Configuração ────────────────────────────────────────────────────────────

export interface ConfigReativacao {
  /** A reativação roda (Observação ou Ligado). DERIVADO de `automatico` (v0.7.59). Só roda com pelo menos 1 texto da etapa 1. */
  ligado: boolean;
  /** Desligado | Observação (decide e prepara, mas NADA é enviado, agendado no CRM nem marcado) | Ligado (envia; exige confirmação do risco e o placar aprovado). */
  automatico: ModoAutomatico;
  migradoParaObservacao: boolean;
  placarAprovado: boolean;
  pausado: boolean;
  confirmouRisco: boolean;
  /** Dias desde a ÚLTIMA conversa de cada etapa (crescente, com pelo menos INTERVALO_MIN_ENTRE_ETAPAS entre elas). */
  etapas: [number, number, number];
  /** Mesmo sistema de estilo da 0.7.55: 'meus_textos' sorteia entre os textos do dono; 'ia_estilo' pede à IA no estilo dele. */
  modo: ModoCobranca;
  estilo: string;
  /** Variações por etapa, com {nome}. Etapa sem texto próprio usa a anterior (sem repetir o que o contato já recebeu). */
  textos1: string[];
  textos2: string[];
  textos3: string[];
  /** Só entra quem tem este termo no nome ("CLIENTE"): contato pessoal/fornecedor nunca recebe. Vazio = qualquer contato salvo. */
  termo: string;
  /** O termo casa por PALAVRA inteira do nome (v0.7.63). Config salva antes disso (sem o campo) mantém o comportamento antigo (pedaço). */
  palavraInteira: boolean;
  /** Só contatos com sinal de que EU já falei com eles (mesma regra da Varredura). */
  soMinha: boolean;
  /** Depois da etapa final sem resposta: agenda uma nova tentativa no CRM. */
  agendaLonga: boolean;
  agendaLongaDias: number;
  /** Config estava ligada sem texto: foi desligada (a tela avisa). */
  desligadaSemTexto: boolean;
}

export const CONFIG_REATIVACAO_PADRAO: ConfigReativacao = {
  ligado: false,
  automatico: 'desligado',
  migradoParaObservacao: false,
  placarAprovado: false,
  pausado: false,
  confirmouRisco: false,
  etapas: [...ETAPAS_PADRAO],
  modo: 'meus_textos',
  estilo: '',
  textos1: [],
  textos2: [],
  textos3: [],
  termo: 'CLIENTE',
  palavraInteira: true,
  soMinha: true,
  agendaLonga: true,
  agendaLongaDias: AGENDA_LONGA_PADRAO,
  desligadaSemTexto: false,
};

const inteiro = (v: unknown, padrao: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : padrao);

/** Etapas crescentes, dentro de 7..365 e com no mínimo 3 dias entre uma e outra. Lixo → padrão. */
export function normalizarEtapas(bruto: unknown): [number, number, number] {
  const lista = Array.isArray(bruto) ? bruto : [];
  const base = ETAPAS_PADRAO.map((p, i) => inteiro(lista[i], p));
  const saida: number[] = [];
  for (const [i, v] of base.entries()) {
    const piso = i === 0 ? ETAPA_MINIMA_DIAS : saida[i - 1] + INTERVALO_MIN_ENTRE_ETAPAS;
    saida.push(Math.min(ETAPA_MAXIMA_DIAS, Math.max(piso, Math.max(ETAPA_MINIMA_DIAS, v))));
  }
  // Se o teto cortou a última, mantém a ordem sem violar o intervalo: recua as anteriores.
  for (let i = saida.length - 2; i >= 0; i -= 1) saida[i] = Math.min(saida[i], saida[i + 1] - INTERVALO_MIN_ENTRE_ETAPAS);
  return [saida[0], saida[1], saida[2]];
}

export function normalizarConfigReativacao(c: Partial<ConfigReativacao> | null | undefined): ConfigReativacao {
  const confirmouRisco = c?.confirmouRisco === true;
  const textos1 = normalizarTextos(c?.textos1);
  const querLigar = (c?.ligado === true && confirmouRisco) || (c?.automatico != null && c.automatico !== 'desligado');
  // Sem texto da etapa 1 nada roda; "Ligado" (envio) exige a confirmação do risco E o placar aprovado; config antiga ligada vira Observação.
  const modo = normalizarModo({ ligado: c?.ligado, automatico: c?.automatico, confirmouRisco, placarAprovado: c?.placarAprovado, migradoParaObservacao: c?.migradoParaObservacao }, textos1.length > 0);
  return {
    ...modo,
    pausado: c?.pausado === true,
    confirmouRisco,
    etapas: normalizarEtapas(c?.etapas),
    modo: c?.modo === 'ia_estilo' ? 'ia_estilo' : 'meus_textos',
    estilo: normalizarEstilo(c?.estilo),
    textos1,
    textos2: normalizarTextos(c?.textos2),
    textos3: normalizarTextos(c?.textos3),
    termo: typeof c?.termo === 'string' ? c.termo.replace(/\s+/g, ' ').trim().slice(0, 80) : CONFIG_REATIVACAO_PADRAO.termo,
    // Sem config salva = padrão novo (ligado); config já salva sem o campo = comportamento antigo (as campanhas não mudam sozinhas).
    palavraInteira: c == null ? true : c.palavraInteira === true,
    soMinha: c?.soMinha !== false,
    agendaLonga: c?.agendaLonga !== false,
    agendaLongaDias: Math.min(AGENDA_LONGA_MAX, Math.max(AGENDA_LONGA_MIN, inteiro(c?.agendaLongaDias, AGENDA_LONGA_PADRAO))),
    desligadaSemTexto: textos1.length === 0 && (querLigar || c?.desligadaSemTexto === true),
  };
}

export const MSG_ESCREVA_ANTES_REATIVACAO = 'Escreva a mensagem da etapa 1 antes de ligar a reativação';

export function podeLigarReativacao(c: Pick<ConfigReativacao, 'textos1'>): { ok: true } | { ok: false; motivo: string } {
  return c.textos1.length > 0 ? { ok: true } : { ok: false, motivo: MSG_ESCREVA_ANTES_REATIVACAO };
}

/** Os textos do dono que servem à etapa (1 a 3): a etapa sem texto próprio usa os da anterior mais próxima que tenha. */
export function textosDaEtapa(c: Pick<ConfigReativacao, 'textos1' | 'textos2' | 'textos3'>, etapa: number): string[] {
  if (etapa >= 3 && c.textos3.length > 0) return c.textos3;
  if (etapa >= 2 && c.textos2.length > 0) return c.textos2;
  return c.textos1;
}

/** Muda quando o modo, os textos ou o estilo mudam: o texto já preparado com outra assinatura é refeito antes do envio. */
export function assinaturaReativacao(c: Pick<ConfigReativacao, 'modo' | 'estilo' | 'textos1' | 'textos2' | 'textos3'>): string {
  const bruto = JSON.stringify([c.modo, c.textos1, c.textos2, c.textos3, c.modo === 'ia_estilo' ? c.estilo : '']);
  let h = 5381;
  for (let i = 0; i < bruto.length; i += 1) h = ((h * 33) ^ (bruto.codePointAt(i) ?? 0)) >>> 0;
  return `${c.modo}:${c.textos1.length}.${c.textos2.length}.${c.textos3.length}:${h.toString(36)}`;
}

// ── Decisão da IA ───────────────────────────────────────────────────────────

export type DecisaoReativacao = 'precisa_agora' | 'precisa_mais_tempo' | 'aguardando_cliente' | 'delicado' | 'pediu_para_sair' | 'sem_contexto';

export const ROTULO_DECISAO: Record<DecisaoReativacao, string> = {
  precisa_agora: 'retomar agora',
  precisa_mais_tempo: 'precisa de mais tempo',
  aguardando_cliente: 'ficou de dar retorno',
  delicado: 'assunto delicado: precisa de você',
  pediu_para_sair: 'pediu para sair',
  sem_contexto: 'sem contexto',
};

/** Um item da resposta da IA do CRM (zapIa.avaliarReativacao). */
export interface AvaliacaoReativacao {
  ref: string;
  decisao: DecisaoReativacao;
  diasSugeridos?: number;
  resumo: string;
}

export interface ConversaReativacaoParaIa {
  /** Id opaco do lote ("c1", "c2"...): NÃO é nome, telefone nem id do contato. */
  ref: string;
  primeiroNome: string;
  diasSemConversa: number;
  mensagens: Array<{ de: 'eu' | 'cliente'; texto: string; quando?: string }>;
}

// ── Registro de cada contato ────────────────────────────────────────────────

/**
 * pronto: precisa_agora, texto do dono preparado, esperando o Executor ("vai receber hoje");
 * aguardando: recebeu a etapa `etapa`, esperando resposta/próxima etapa;
 * agendado: a IA agendou no CRM (precisa de mais tempo / ficou de dar retorno): sem mensagem;
 * travado: tem agendamento futuro no CRM, não entra (o agendamento prevalece);
 * precisa: "Precisa de você" (assunto delicado, sem contexto, dúvida na leitura): sem mensagem;
 * saiu: pediu para sair (opt-out);
 * resolvido: fim da linha (sem resposta depois da última etapa, ou você resolveu);
 * respondeu: respondeu a uma etapa: saiu da sequência e foi para a classificação do follow-up de respostas.
 */
export type EstadoReativacao = 'pronto' | 'aguardando' | 'agendado' | 'travado' | 'precisa' | 'saiu' | 'resolvido' | 'respondeu';

export interface EnvioReativacao {
  etapa: number;
  /** ISO do envio. */
  em: string;
  texto: string;
}

export interface Reativacao {
  /** Chave do contato (nome normalizado): uma por contato. */
  chave: string;
  nome: string;
  primeiroNome: string;
  /** Telefone aprendido ao ler a conversa (dígitos com DDI) ou null. */
  telefone: string | null;
  estado: EstadoReativacao;
  motivo: string | null;
  /** Última etapa ENVIADA (0 = nenhuma). */
  etapa: number;
  /** Data (AAAA-MM-DD) da última conversa real: âncora das etapas ("dias desde a última conversa"). */
  baseConversa: DataIso;
  decisao?: DecisaoReativacao;
  resumo?: string;
  diasSugeridos?: number;
  /** Texto pronto para a próxima etapa (estado 'pronto'). */
  textoPronto: { etapa: number; modelo: string; origem: OrigemTexto; assinatura: string } | null;
  enviados: EnvioReativacao[];
  /** A nota/agendamento ainda não chegou ao CRM: tenta de novo na próxima rodada. */
  crmPendente: { linha: string; agendarEm: number | null; criar: boolean } | null;
  crmSalvoEm: string | null;
  crmAviso: string | null;
  /** Agendamento que travou/foi criado (ISO). */
  agendadoPara: string | null;
  verificadoEm: string | null;
  /** Última leitura para conferir resposta (ISO). */
  leituraRespostaEm: string | null;
  /** Só volta a ser avaliado depois desta data (ISO). */
  reelegivelEm: string | null;
  /** Decidido em modo Observação: o agendamento/opt-out da IA NÃO foi aplicado. Ao ligar, o registro é apagado e o contato reavaliado (v0.7.59). */
  observado?: boolean;
  atualizadoEm: string;
}

export function novoRegistro(c: Pick<ContatoVarrido, 'chave' | 'nome'> & { primeiroNome: string; telefone?: string | null }, baseConversa: DataIso, agora: Date): Reativacao {
  return {
    chave: c.chave,
    nome: c.nome,
    primeiroNome: c.primeiroNome,
    telefone: c.telefone ?? null,
    estado: 'precisa',
    motivo: null,
    etapa: 0,
    baseConversa,
    textoPronto: null,
    enviados: [],
    crmPendente: null,
    crmSalvoEm: null,
    crmAviso: null,
    agendadoPara: null,
    verificadoEm: null,
    leituraRespostaEm: null,
    reelegivelEm: null,
    atualizadoEm: agora.toISOString(),
  };
}

export const diasDesdeData = (data: DataIso, agora: Date): number => diferencaDias(hojeNoFuso(agora), data);
export const diasDesdeInstante = (iso: string, agora: Date): number => diferencaDias(hojeNoFuso(agora), hojeNoFuso(new Date(iso)));

/** ISO daqui a `dias` dias de calendário (Fortaleza), `quando` = o instante de hoje. */
export function reelegivelDepoisDe(dias: number, agora: Date): string {
  return new Date(instanteNoFuso(somarDias(hojeNoFuso(agora), dias), 0, 0)).toISOString();
}

/** Agendamento no CRM: hoje + dias, às 9h de Fortaleza. */
export function instanteDoAgendamento(dias: number, agora: Date): number {
  return instanteNoFuso(somarDias(hojeNoFuso(agora), dias), 9, 0);
}

// ── Quem entra (etapa 1) ────────────────────────────────────────────────────

/** O registro deixa o contato voltar a ser avaliado? */
export function podeEntrar(r: Reativacao | undefined, agora: Date): boolean {
  if (!r) return true;
  if (r.estado === 'saiu') return false;
  if (r.reelegivelEm != null && agora.getTime() < new Date(r.reelegivelEm).getTime()) return false;
  // Em andamento ou esperando o dono: não reinicia sozinho.
  if (r.estado === 'pronto' || r.estado === 'aguardando' || r.estado === 'precisa') return false;
  if (r.estado === 'respondeu' || r.estado === 'resolvido' || r.estado === 'agendado') return r.reelegivelEm != null;
  return true; // travado: reavalia (a trava confere de novo)
}

/** Filtros da Varredura aplicados à reativação: o MESMO público das campanhas (contato salvo, individual, nunca grupo). */
export function filtrosDaReativacao(config: ConfigReativacao, agora: Date): Filtros {
  return {
    ...FILTROS_PADRAO,
    contem: separarTermos(config.termo),
    palavraInteira: config.palavraInteira,
    // "última conversa nesta data ou antes": há pelo menos `etapas[0]` dias.
    ultimaConversaAntesDe: somarDias(hojeNoFuso(agora), -config.etapas[0]),
    excluirContatadosHaDias: DIAS_SEM_REPETIR_PADRAO_REATIVACAO,
    soComMensagemMinha: config.soMinha || undefined,
  };
}

export interface ResultadoCandidatos {
  elegiveis: ContatoVarrido[];
  /** Dúvida na varredura (nome repetido, possível grupo, data incerta): não entram sozinhos. */
  aRevisarNaVarredura: number;
  /** Já têm registro que os mantém fora (em andamento, resolvido recentemente, opt-out...). */
  emAndamento: number;
}

/**
 * Etapa 1: os contatos da varredura com a última conversa há `etapas[0]` dias ou mais, que passam nas regras de público
 * (salvo com nome, individual, não "Não enviar mais", sem outra campanha recente) e cujo registro permite uma nova avaliação.
 */
export function candidatosEtapa1(contatos: ReadonlyArray<ContatoVarrido>, config: ConfigReativacao, registros: ReadonlyMap<string, Reativacao>, ctx: ContextoFiltro): ResultadoCandidatos {
  const filtros = filtrosDaReativacao(config, ctx.agora);
  const r: ResultadoCandidatos = { elegiveis: [], aRevisarNaVarredura: 0, emAndamento: 0 };
  for (const c of contatos) {
    const d = avaliarContato(c, filtros, ctx);
    if (d.situacao === 'revisar') {
      r.aRevisarNaVarredura += 1;
      continue;
    }
    if (d.situacao !== 'incluido') continue;
    if (!podeEntrar(registros.get(c.chave), ctx.agora)) {
      r.emAndamento += 1;
      continue;
    }
    r.elegiveis.push(c);
  }
  // Os mais antigos primeiro: é o histórico que está para sumir.
  r.elegiveis.sort((a, b) => (a.ultimaConversa ?? '').localeCompare(b.ultimaConversa ?? ''));
  return r;
}

// ── Etapas 2 e 3 (e conferência de resposta) ────────────────────────────────

export type DevidoReativacao = { tipo: 'proxima'; etapa: number } | { tipo: 'conclusao' } | { tipo: 'conferir' } | null;

/** Instante do último envio de etapa. */
export function ultimoEnvio(r: Pick<Reativacao, 'enviados'>): string | null {
  return r.enviados.length > 0 ? r.enviados[r.enviados.length - 1].em : null;
}

/**
 * Quem recebeu uma etapa e está esperando ('aguardando'): é hora de ler a conversa?
 *  - próxima etapa devida: já passaram `etapas[n]` dias desde a última conversa E o intervalo mínimo desde o último envio;
 *  - depois da última etapa: espera ESPERA_FINAL_DIAS por uma resposta e conclui;
 *  - antes disso, uma conferência de resposta depois de CONFERIR_RESPOSTA_APOS_DIAS (uma só por envio).
 */
export function devidoParaLer(r: Reativacao, config: ConfigReativacao, agora: Date): DevidoReativacao {
  if (r.estado !== 'aguardando') return null;
  const ult = ultimoEnvio(r);
  if (ult == null) return null;
  const desdeEnvio = diasDesdeInstante(ult, agora);
  const desdeConversa = diasDesdeData(r.baseConversa, agora);
  if (r.etapa < 3) {
    const proxima = r.etapa + 1;
    if (desdeConversa >= config.etapas[r.etapa] && desdeEnvio >= INTERVALO_MIN_ENTRE_ETAPAS) return { tipo: 'proxima', etapa: proxima };
  } else if (desdeEnvio >= ESPERA_FINAL_DIAS) return { tipo: 'conclusao' };
  const jaLeuDepois = r.leituraRespostaEm != null && r.leituraRespostaEm >= ult;
  if (!jaLeuDepois && desdeEnvio >= CONFERIR_RESPOSTA_APOS_DIAS) return { tipo: 'conferir' };
  return null;
}

// ── Ler a conversa ──────────────────────────────────────────────────────────

/** Data (AAAA-MM-DD, Fortaleza) da última mensagem com carimbo; null se nenhuma tem. */
export function dataDaUltimaMensagem(mensagens: ReadonlyArray<MensagemLida>): DataIso | null {
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const q = mensagens[i].quando;
    if (q) {
      const t = new Date(q).getTime();
      if (Number.isFinite(t)) return hojeNoFuso(new Date(t));
    }
  }
  return null;
}

/** A conversa lida tem algum texto (de qualquer lado)? Só mídia/figurinha ou vazia = sem contexto. */
export function conversaTemTexto(mensagens: ReadonlyArray<MensagemLida>): boolean {
  return mensagens.some((m) => m.texto.replace(/\s+/g, '') !== '');
}

// ── Aplicar a decisão da IA ─────────────────────────────────────────────────

export interface PlanoDaDecisao {
  registro: Reativacao;
  /** pediu_para_sair: entra em "Não enviar mais". */
  optOut: boolean;
  /** Nota a gravar no CRM (resumo + decisão) e agendamento, quando houver. */
  crm: { linha: string; agendarEm: number | null; criar: boolean } | null;
  /** O contato precisa de uma mensagem automática (texto a preparar). */
  precisaTexto: boolean;
  /** "Precisa de você": vira item da lista do Follow-up. */
  paraOLista: boolean;
}

/** "Reativação 25d (IA): resumo. Decisão: retomar agora." (sem dados pessoais: o servidor já limpou o resumo). */
export function linhaDoCrm(etapaDias: number, resumo: string, decisao: DecisaoReativacao, diasSugeridos?: number): string {
  const r = resumo.replace(/\s+/g, ' ').trim().slice(0, MAX_RESUMO_CRM);
  const quando = diasSugeridos != null ? ` Retomar em ${diasSugeridos} dias.` : '';
  return `Reativação ${etapaDias}d (IA): ${r || ROTULO_DECISAO[decisao]} Decisão: ${ROTULO_DECISAO[decisao]}.${quando}`;
}

/**
 * A decisão da IA → o que acontece com o contato. As regras são do código, não do modelo:
 *  - precisa_agora → mensagem do dono (estado 'pronto'), nunca sem texto próprio;
 *  - precisa_mais_tempo / aguardando_cliente → agendamento no CRM (hoje + dias, 9h), SEM mensagem;
 *  - delicado / sem_contexto → "Precisa de você", SEM mensagem;
 *  - pediu_para_sair → opt-out.
 * Decisão desconhecida ou sem dias válidos nunca vira envio.
 */
export function aplicarDecisao(r: Reativacao, a: AvaliacaoReativacao, etapaDias: number, agora: Date): PlanoDaDecisao {
  const base: Reativacao = { ...r, decisao: a.decisao, resumo: a.resumo, atualizadoEm: agora.toISOString(), verificadoEm: agora.toISOString(), motivo: null };
  const linha = (dias?: number) => linhaDoCrm(etapaDias, a.resumo, a.decisao, dias);
  switch (a.decisao) {
    case 'precisa_agora':
      return { registro: { ...base, estado: 'pronto' }, optOut: false, crm: { linha: linha(), agendarEm: null, criar: true }, precisaTexto: true, paraOLista: false };
    case 'precisa_mais_tempo':
    case 'aguardando_cliente': {
      const dias = a.diasSugeridos != null && Number.isInteger(a.diasSugeridos) && a.diasSugeridos >= 7 && a.diasSugeridos <= 120 ? a.diasSugeridos : null;
      if (dias == null) {
        return { registro: { ...base, estado: 'precisa', motivo: 'a IA não deu um prazo válido para retomar: escolha você' }, optOut: false, crm: { linha: linha(), agendarEm: null, criar: true }, precisaTexto: false, paraOLista: true };
      }
      const agendarEm = instanteDoAgendamento(dias, agora);
      return {
        registro: { ...base, estado: 'agendado', diasSugeridos: dias, agendadoPara: new Date(agendarEm).toISOString(), reelegivelEm: reelegivelDepoisDe(dias + REELEGIVEL_RESOLVIDO_DIAS, agora) },
        optOut: false,
        crm: { linha: linha(dias), agendarEm, criar: true },
        precisaTexto: false,
        paraOLista: false,
      };
    }
    case 'pediu_para_sair':
      return { registro: { ...base, estado: 'saiu', motivo: 'pediu para não receber mais mensagens' }, optOut: true, crm: { linha: linha(), agendarEm: null, criar: false }, precisaTexto: false, paraOLista: false };
    case 'delicado':
      return { registro: { ...base, estado: 'precisa', motivo: null }, optOut: false, crm: { linha: linha(), agendarEm: null, criar: true }, precisaTexto: false, paraOLista: true };
    case 'sem_contexto':
    default:
      return { registro: { ...base, estado: 'precisa', motivo: a.resumo || 'conversa vazia ou ilegível: leia você' }, optOut: false, crm: null, precisaTexto: false, paraOLista: true };
  }
}

/**
 * O CRM não aceitou o agendamento (sem telefone, vários leads, conflito...): quem seria agendado NÃO fica sem destino nem
 * vira mensagem. Vai para "Precisa de você" com o motivo.
 */
export function semAgendamentoNoCrm(r: Reativacao, motivo: string, agora: Date): Reativacao {
  return { ...r, estado: 'precisa', motivo: `não consegui criar o agendamento no CRM (${motivo}): escolha você`, diasSugeridos: undefined, agendadoPara: null, reelegivelEm: null, atualizadoEm: agora.toISOString() };
}

// ── Fim da linha ────────────────────────────────────────────────────────────

/** Sem resposta depois da última etapa: resolvido; opcionalmente agenda uma nova tentativa longa no CRM. */
export function concluirSemResposta(r: Reativacao, config: ConfigReativacao, agora: Date): { registro: Reativacao; crm: { linha: string; agendarEm: number | null; criar: boolean } | null } {
  const dias = config.agendaLongaDias;
  const agendarEm = config.agendaLonga ? instanteDoAgendamento(dias, agora) : null;
  const registro: Reativacao = {
    ...r,
    estado: 'resolvido',
    motivo: `sem resposta depois de ${r.enviados.length} mensagem(ns) de reativação`,
    reelegivelEm: reelegivelDepoisDe(config.agendaLonga ? dias : REELEGIVEL_APOS_DIAS, agora),
    agendadoPara: agendarEm != null ? new Date(agendarEm).toISOString() : null,
    textoPronto: null,
    verificadoEm: agora.toISOString(),
    atualizadoEm: agora.toISOString(),
  };
  const linha = `Reativação concluída: ${r.enviados.length} mensagem(ns) sem resposta.${agendarEm != null ? ` Nova tentativa em ${dias} dias.` : ''}`;
  return { registro, crm: { linha, agendarEm, criar: false } };
}

// ── Resultado da campanha de reativação → registros ─────────────────────────

export const MOTIVO_TRAVA_PREFIXO = 'agendado para ';

/** Depois que o Executor mexeu na campanha: cada item sai de 'pronto' conforme o desfecho dele. Idempotente. */
export function aplicarResultadoCampanhaReativacao(registros: ReadonlyArray<Reativacao>, campanha: Campanha, envios: ReadonlyArray<Envio>, agora: Date): Reativacao[] {
  const porChave = new Map(campanha.itens.map((i) => [i.chave, i]));
  const enviadoEm = new Map(envios.filter((e) => e.campanhaId === campanha.id).map((e) => [e.chave, e.enviadoEm]));
  const agoraIso = agora.toISOString();
  return registros.map((r) => {
    const item = porChave.get(r.chave);
    if (!item || item.status === 'pendente' || item.status === 'aguardando_crm') return r; // aguardando_crm: ainda nao foi decidido (envio manual esperando o CRM)
    if (item.status === 'enviado') {
      if (r.estado !== 'pronto') return r;
      const em = enviadoEm.get(r.chave) ?? item.atualizadoEm ?? agoraIso;
      if (r.enviados.some((e) => e.em === em)) return r;
      const etapa = r.textoPronto?.etapa ?? r.etapa + 1;
      return { ...r, estado: 'aguardando', motivo: null, etapa, enviados: [...r.enviados, { etapa, em, texto: textoDoItem(item) }], textoPronto: null, leituraRespostaEm: null, atualizadoEm: agoraIso };
    }
    if (r.estado !== 'pronto') return r;
    if (item.status === 'nao_enviar' || item.status === 'nao_cliente') return { ...r, estado: 'saiu', motivo: item.motivo ?? 'não enviar mais', textoPronto: null, atualizadoEm: agoraIso };
    if (item.status === 'pulado' && (item.motivo ?? '').startsWith(MOTIVO_TRAVA_PREFIXO)) return { ...r, estado: 'travado', motivo: item.motivo, textoPronto: null, atualizadoEm: agoraIso };
    // O Executor releu a conversa antes de enviar e o cliente já tinha respondido: etapa 1 será avaliada de novo; etapas 2 e 3 voltam
    // a ser lidas para classificar a resposta (a leitura de resposta é refeita).
    if (item.status === 'pulado' && (item.motivo ?? '').startsWith(MOTIVO_CLIENTE_RESPONDEU)) {
      return r.etapa === 0
        ? { ...r, estado: 'resolvido', motivo: item.motivo, textoPronto: null, reelegivelEm: agoraIso, atualizadoEm: agoraIso }
        : { ...r, estado: 'aguardando', motivo: null, textoPronto: null, leituraRespostaEm: null, atualizadoEm: agoraIso };
    }
    // pulado / problema / revisar: nunca se tenta de novo sozinho (pode ter saído); o atendente confere.
    return { ...r, estado: 'precisa', motivo: `a mensagem não foi enviada (${item.status}${item.motivo ? `: ${item.motivo}` : ''})`, textoPronto: null, atualizadoEm: agoraIso };
  });
}

// ── Respondeu: segue para a classificação do follow-up de respostas ──────────

export const ID_FOLLOWUP_REATIVACAO = (chave: string): string => `reat:${chave}`;

/** O item de "Precisa de você" do Follow-up para este contato (a lista é a mesma do follow-up de respostas). */
export function followupDaReativacao(r: Reativacao, agora: Date, extra: Partial<Followup> = {}): Followup {
  const ult = ultimoEnvio(r);
  return {
    id: ID_FOLLOWUP_REATIVACAO(r.chave),
    campanhaId: 'reativacao',
    chave: r.chave,
    nome: r.nome,
    primeiroNome: r.primeiroNome,
    mensagemCampanha: r.enviados.length > 0 ? r.enviados[r.enviados.length - 1].texto : '',
    enviadoEm: ult ?? agora.toISOString(),
    estado: 'precisa',
    motivo: null,
    verificadoEm: agora.toISOString(),
    cobrancas: [],
    cobrancaModelo: null,
    cobrancaOrigem: null,
    resumo: r.resumo,
    origem: 'reativacao',
    atualizadoEm: agora.toISOString(),
    ...extra,
  };
}

export type { ClassificacaoIa };

// ── Listas do painel ────────────────────────────────────────────────────────

export interface ListasReativacao {
  /** "Vai receber hoje". */
  pronto: Reativacao[];
  aguardando: Reativacao[];
  /** "Agendados pela IA". */
  agendado: Reativacao[];
  /** "Precisa de você". */
  precisa: Reativacao[];
  /** "Travados por agendamento". */
  travado: Reativacao[];
  saiu: Reativacao[];
  resolvido: Reativacao[];
  respondeu: Reativacao[];
}

export function separarListasReativacao(registros: ReadonlyArray<Reativacao>): ListasReativacao {
  const L: ListasReativacao = { pronto: [], aguardando: [], agendado: [], precisa: [], travado: [], saiu: [], resolvido: [], respondeu: [] };
  for (const r of registros) L[r.estado].push(r);
  for (const k of Object.keys(L) as Array<keyof ListasReativacao>) L[k].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  return L;
}

/** "Mensagem 2 de 3" etc. */
export const rotuloEtapa = (etapa: number): string => `etapa ${etapa} de 3`;
export type { DataIso };
