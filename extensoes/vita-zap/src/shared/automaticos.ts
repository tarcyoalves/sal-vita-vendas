// Modo Observação e placar da IA (v0.7.59). Regras PURAS: sem rede, sem chrome, sem DOM.
//
// Decisão do dono (análise crítica, lote 1): os automáticos (cobrança do follow-up e reativação) têm três estados:
//   Desligado | Observação | Ligado.
// Em Observação TUDO roda igual (lê, classifica, decide, prepara o texto), mas NADA é enviado, nem agendado no CRM, nem marcado
// "Não enviar mais": cada decisão vira um item "o que a IA faria" e o dono diz "Acertou" ou "Errou". Só depois de
// MIN_JULGAMENTOS julgamentos com MIN_ACERTO_PERCENTUAL% de acerto NAS DECISÕES QUE GERAM ENVIO é que o envio automático pode
// ser ligado pela primeira vez. Quem já estava ligado numa versão anterior cai para Observação (com aviso).

export type ModoAutomatico = 'desligado' | 'observacao' | 'ligado';
export const MODOS_AUTOMATICOS: readonly ModoAutomatico[] = ['desligado', 'observacao', 'ligado'];
export const ROTULO_MODO: Record<ModoAutomatico, string> = { desligado: 'Desligado', observacao: 'Observação', ligado: 'Ligado' };

export const ehModoAutomatico = (v: unknown): v is ModoAutomatico => v === 'desligado' || v === 'observacao' || v === 'ligado';

// ── Constantes do placar (mudar é decisão do dono) ───────────────────────────

/** Julgamentos mínimos, entre as decisões que geram envio, para liberar o envio automático pela primeira vez. */
export const MIN_JULGAMENTOS = 30;
/** Acerto mínimo (%) nessas decisões. */
export const MIN_ACERTO_PERCENTUAL = 90;
/** Quantos julgamentos já feitos ficam guardados (os mais recentes). */
export const MAX_JULGAMENTOS = 200;
/** Decisões ainda sem julgamento que ficam guardadas (as mais recentes). */
export const MAX_PENDENTES_JULGAMENTO = 100;
/** Ações da IA guardadas na tela "O que a IA fez". */
export const MAX_ACOES_IA = 300;
/** Motivo livre do "Errou" (curto). */
export const MAX_MOTIVO_JULGAMENTO = 160;

// ── Tipos de decisão ─────────────────────────────────────────────────────────

/**
 * cobrar: cobrar quem não respondeu (follow-up);  retomar: mandar a mensagem de reativação (qualquer etapa);
 * agendar: agendar o retorno no CRM (reativação);  precisa: chamar o dono (precisa de atenção);
 * resolver: dar a conversa por resolvida;  sair: marcar "Não enviar mais" (pediu para sair).
 */
export type TipoDecisao = 'cobrar' | 'retomar' | 'agendar' | 'precisa' | 'resolver' | 'sair';
export type DecisaoCerta = TipoDecisao | 'nada';
export type OrigemAutomatico = 'followup' | 'reativacao';

export const TIPOS_DE_DECISAO: readonly TipoDecisao[] = ['cobrar', 'retomar', 'agendar', 'precisa', 'resolver', 'sair'];
export const ROTULO_TIPO_DECISAO: Record<TipoDecisao, string> = {
  cobrar: 'Cobrar quem não respondeu',
  retomar: 'Retomar a conversa (reativação)',
  agendar: 'Agendar o retorno no CRM',
  precisa: 'Chamar você (precisa de atenção)',
  resolver: 'Dar por resolvido',
  sair: 'Marcar "não enviar mais"',
};
export const ROTULO_DECISAO_CERTA: Record<DecisaoCerta, string> = { ...ROTULO_TIPO_DECISAO, nada: 'Não fazer nada' };
/** As decisões que GERAM ENVIO: só elas contam para liberar o envio automático. */
export const DECISOES_QUE_ENVIAM: ReadonlySet<TipoDecisao> = new Set<TipoDecisao>(['cobrar', 'retomar']);

export interface Julgamento {
  /** Determinístico por decisão (ver idDaDecisao): a mesma decisão nunca vira dois itens. */
  id: string;
  origem: OrigemAutomatico;
  tipo: TipoDecisao;
  /** Só local (IndexedDB): nome e chave do contato nunca vão para o servidor. */
  chave: string;
  nome: string;
  /** "O que a IA faria", em uma frase. */
  resumo: string;
  /** O texto que a IA preparou (cobrar/retomar). */
  texto: string | null;
  criadoEm: string;
  veredito: 'acertou' | 'errou' | null;
  motivo: string | null;
  decisaoCerta: DecisaoCerta | null;
  julgadoEm: string | null;
}

export function idDaDecisao(origem: OrigemAutomatico, tipo: TipoDecisao, chave: string, contexto: string): string {
  return `${origem}:${tipo}:${chave}:${contexto}`;
}

export function novaDecisao(d: Pick<Julgamento, 'origem' | 'tipo' | 'chave' | 'nome' | 'resumo'> & { contexto: string; texto?: string | null }, agora: Date): Julgamento {
  return {
    id: idDaDecisao(d.origem, d.tipo, d.chave, d.contexto),
    origem: d.origem,
    tipo: d.tipo,
    chave: d.chave,
    nome: d.nome,
    resumo: d.resumo.replace(/\s+/g, ' ').trim().slice(0, 300),
    texto: d.texto ? d.texto.slice(0, 500) : null,
    criadoEm: agora.toISOString(),
    veredito: null,
    motivo: null,
    decisaoCerta: null,
    julgadoEm: null,
  };
}

/** Aplica o julgamento do dono. "Errou" aceita motivo curto e a decisão certa; "Acertou" os descarta. */
export function julgar(j: Julgamento, veredito: 'acertou' | 'errou', agora: Date, extra: { motivo?: string; decisaoCerta?: DecisaoCerta | null } = {}): Julgamento {
  const motivo = veredito === 'errou' ? (extra.motivo ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_MOTIVO_JULGAMENTO) : '';
  return {
    ...j,
    veredito,
    motivo: motivo === '' ? null : motivo,
    decisaoCerta: veredito === 'errou' ? (extra.decisaoCerta ?? null) : null,
    julgadoEm: agora.toISOString(),
  };
}

/** Desfaz um julgamento (o dono clicou errado): volta a ficar pendente. */
export function reabrir(j: Julgamento): Julgamento {
  return { ...j, veredito: null, motivo: null, decisaoCerta: null, julgadoEm: null };
}

/** Mantém os MAX_JULGAMENTOS já julgados mais recentes e os MAX_PENDENTES_JULGAMENTO pendentes mais recentes. Devolve os ids a apagar. */
export function idsParaPodar(todos: ReadonlyArray<Julgamento>): string[] {
  const julgados = todos.filter((j) => j.veredito != null).sort((a, b) => (b.julgadoEm ?? '').localeCompare(a.julgadoEm ?? ''));
  const pendentes = todos.filter((j) => j.veredito == null).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return [...julgados.slice(MAX_JULGAMENTOS), ...pendentes.slice(MAX_PENDENTES_JULGAMENTO)].map((j) => j.id);
}

// ── Placar ───────────────────────────────────────────────────────────────────

export interface LinhaPlacar {
  tipo: TipoDecisao;
  total: number;
  acertos: number;
  /** Arredondado; null se ainda não há julgamento deste tipo. */
  percentual: number | null;
}

const pct = (a: number, t: number): number | null => (t === 0 ? null : Math.round((a / t) * 100));

/** Acertos/total por tipo de decisão (só o que já foi julgado). */
export function calcularPlacar(julgamentos: ReadonlyArray<Julgamento>): LinhaPlacar[] {
  return TIPOS_DE_DECISAO.map((tipo) => {
    const feitos = julgamentos.filter((j) => j.tipo === tipo && j.veredito != null);
    const acertos = feitos.filter((j) => j.veredito === 'acertou').length;
    return { tipo, total: feitos.length, acertos, percentual: pct(acertos, feitos.length) };
  });
}

export interface Liberacao {
  liberado: boolean;
  /** Julgamentos já feitos das decisões que geram envio. */
  julgados: number;
  acertos: number;
  percentual: number | null;
  /** Quantos julgamentos ainda faltam para o mínimo. */
  faltam: number;
  /** Por que ainda não libera (mostrado ao dono). null = liberado. */
  motivo: string | null;
}

/** O envio automático já pode ser ligado? Só olha as decisões que geram envio (cobrar e retomar). */
export function avaliarLiberacao(julgamentos: ReadonlyArray<Julgamento>): Liberacao {
  const feitos = julgamentos.filter((j) => DECISOES_QUE_ENVIAM.has(j.tipo) && j.veredito != null);
  const acertos = feitos.filter((j) => j.veredito === 'acertou').length;
  const julgados = feitos.length;
  const percentual = pct(acertos, julgados);
  const faltam = Math.max(0, MIN_JULGAMENTOS - julgados);
  if (faltam > 0) {
    return {
      liberado: false,
      julgados,
      acertos,
      percentual,
      faltam,
      motivo: `Faltam ${faltam} julgamento(s) das decisões que geram envio (${julgados} de ${MIN_JULGAMENTOS}) para ligar o envio automático. Fique em Observação e julgue o que a IA faria.`,
    };
  }
  if ((percentual ?? 0) < MIN_ACERTO_PERCENTUAL) {
    return {
      liberado: false,
      julgados,
      acertos,
      percentual,
      faltam: 0,
      motivo: `A IA acertou ${percentual}% das decisões que geram envio (${acertos} de ${julgados}); o mínimo é ${MIN_ACERTO_PERCENTUAL}%. Continue em Observação (ajuste as Orientações para a IA) e julgue mais decisões.`,
    };
  }
  return { liberado: true, julgados, acertos, percentual, faltam: 0, motivo: null };
}

// ── Estado do modo dentro de cada configuração ───────────────────────────────

export interface CamposDoModo {
  /** O automático roda (Observação ou Ligado). Derivado de `automatico`: nunca é a fonte da verdade. */
  ligado: boolean;
  automatico: ModoAutomatico;
  /** Estava ligado numa versão anterior e caiu para Observação: a tela avisa até o dono escolher um modo. */
  migradoParaObservacao: boolean;
  /** O placar já liberou o envio automático uma vez ("pela primeira vez"). */
  placarAprovado: boolean;
}

/**
 * Normaliza (e MIGRA) o modo guardado. Regras:
 *  - config antiga (sem `automatico`) que estava ligada com a confirmação do risco → Observação, com aviso;
 *  - sem texto do dono nada roda (Desligado);
 *  - "Ligado" só existe com a confirmação do risco E com o placar já aprovado; senão cai para Observação.
 */
export function normalizarModo(
  c: { ligado?: unknown; automatico?: unknown; confirmouRisco?: unknown; placarAprovado?: unknown; migradoParaObservacao?: unknown },
  temTexto: boolean,
): CamposDoModo {
  const confirmou = c.confirmouRisco === true;
  let modo: ModoAutomatico;
  let migrado = c.migradoParaObservacao === true;
  if (ehModoAutomatico(c.automatico)) modo = c.automatico;
  else if (c.ligado === true && confirmou) {
    modo = 'observacao';
    migrado = true;
  } else modo = 'desligado';
  if (!temTexto) modo = 'desligado';
  const placarAprovado = c.placarAprovado === true;
  if (modo === 'ligado' && !(confirmou && placarAprovado)) modo = 'observacao';
  return { ligado: modo !== 'desligado', automatico: modo, migradoParaObservacao: migrado && modo === 'observacao', placarAprovado };
}

/** Em Observação nada é enviado, agendado nem marcado. */
export const emObservacao = (c: { automatico?: ModoAutomatico }): boolean => c.automatico === 'observacao';
/** Só o modo Ligado pode enviar. */
export const podeEnviar = (c: { automatico?: ModoAutomatico }): boolean => c.automatico === 'ligado';

// ── "O que a IA fez" ─────────────────────────────────────────────────────────

export type TipoAcaoIa = 'enviou' | 'agendou' | 'nao_enviar' | 'encerrou';
export const ROTULO_ACAO_IA: Record<TipoAcaoIa, string> = { enviou: 'Enviou mensagem', agendou: 'Agendou no CRM', nao_enviar: 'Marcou "não enviar mais"', encerrou: 'Encerrou a sequência' };

export type DesfazerAcao = { tipo: 'nao_enviar' } | { tipo: 'agendamento'; taskId: number; agendadoEm: number };

export interface AcaoIa {
  id: string;
  tipo: TipoAcaoIa;
  origem: OrigemAutomatico;
  chave: string;
  nome: string;
  /** Motivo/resumo do que a IA fez. */
  resumo: string;
  criadoEm: string;
  /** Como desfazer. null = não tem desfazer (envio, encerramento). */
  desfazer: DesfazerAcao | null;
  desfeitaEm: string | null;
  /** O que aconteceu na última tentativa de desfazer que não deu certo. */
  avisoDesfazer?: string | null;
}

export function novaAcao(a: Omit<AcaoIa, 'id' | 'criadoEm' | 'desfeitaEm' | 'desfazer'> & { desfazer?: DesfazerAcao | null; id?: string }, agora: Date): AcaoIa {
  return {
    id: a.id ?? `${a.tipo}:${a.origem}:${a.chave}:${agora.toISOString()}`,
    tipo: a.tipo,
    origem: a.origem,
    chave: a.chave,
    nome: a.nome,
    resumo: a.resumo.replace(/\s+/g, ' ').trim().slice(0, 300),
    criadoEm: agora.toISOString(),
    desfazer: a.desfazer ?? null,
    desfeitaEm: null,
  };
}

export const idsAcoesParaPodar = (todas: ReadonlyArray<AcaoIa>): string[] => [...todas].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(MAX_ACOES_IA).map((a) => a.id);
