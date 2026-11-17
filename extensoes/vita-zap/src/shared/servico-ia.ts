// IA do follow-up (v0.7.54) sobre o cliente do CRM: classificar as respostas dos clientes e escrever a cobrança.
// A IA roda no SERVIDOR do CRM (zapIa.*, cadeia de provedores do próprio CRM): a extensão nunca tem chave de IA.
// Quem chama é o ServicoCrm (service worker), dentro de `exclusivo`. Cada chamada é UMA ação do motor de follow-up,
// disparada por uso (o atendente clicou em verificar, ou o painel está aberto com o follow-up ligado): nada periódico.
//
// LGPD: o que vai ao servidor é só o primeiro nome, o texto do disparo e as últimas mensagens da conversa. O
// servidor ainda remove telefones/CPF do texto. Nenhum telefone, nenhum nome completo, nenhum id interno sai daqui.

import type { ErroCrm } from './crm-rede';
import { LOTE_IA, MAX_MENSAGENS_IA, type ClasseIa, type ClassificacaoIa } from './followup';
import { LOTE_IA_REATIVACAO, type AvaliacaoReativacao, type ConversaReativacaoParaIa, type DecisaoReativacao } from './reativacao';
import { orientacoesParaEnvio } from './orientacoes';
import { LOTE_CONFERENCIA, conferenciaDoServidor, planoDoServidor, type ConferenciaIa, type ConversaParaPedido, type PedidoInterpretado, type PlanoPedido } from './pedido-ia';

export type ResultadoIa<T> = { ok: true; valor: T } | { ok: false; erro: ErroCrm };

export interface ConversaParaIa {
  /** Id opaco do lote ("c1", "c2"...): NÃO é nome, telefone nem id do contato. */
  ref: string;
  primeiroNome: string;
  mensagemCampanha: string;
  mensagens: Array<{ de: 'eu' | 'cliente'; texto: string; quando?: string }>;
}

export interface ApoioIa {
  /**
   * Orientações do dono (v0.7.57), lidas pelo ServicoCrm a cada chamada. Vão como `orientacoes` em TODA chamada de IA:
   * o servidor as injeta abaixo das regras de segurança. Vazio/ausente = o campo nem é enviado.
   */
  orientacoes?: string;
  alterar<T>(caminho: string, entrada?: unknown): Promise<T>;
  chamar<T>(fn: () => Promise<T>): Promise<{ ok: true; valor: T } | { ok: false; erro: ErroCrm }>;
}

const CLASSES: ReadonlySet<string> = new Set<ClasseIa>([
  'interessado', 'pediu_preco', 'tem_estoque', 'compra_depois', 'reclamacao', 'pediu_para_sair', 'pergunta', 'sem_resposta', 'sem_relacao',
]);

function obj(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}

const falha = (tipo: ErroCrm['tipo'], mensagem: string): { ok: false; erro: ErroCrm } => ({ ok: false, erro: { tipo, mensagem } });

/** Lê um item da resposta do servidor. Qualquer coisa fora do contrato vira null (o motor trata como "revisar"). */
export function itemDaIa(bruto: unknown): ClassificacaoIa | null {
  const o = obj(bruto);
  if (typeof o.ref !== 'string' || typeof o.classe !== 'string' || !CLASSES.has(o.classe)) return null;
  const dias = typeof o.lembreteDias === 'number' && Number.isInteger(o.lembreteDias) ? o.lembreteDias : undefined;
  return {
    ref: o.ref,
    classe: o.classe as ClasseIa,
    precisaAtencao: o.precisaAtencao === true,
    resumo: typeof o.resumo === 'string' ? o.resumo : '',
    sugestao: typeof o.sugestao === 'string' ? o.sugestao : '',
    ...(dias != null ? { lembreteDias: dias } : {}),
  };
}

/** Um lote de até LOTE_IA conversas. Falha da IA/limite diário vira erro amigável do servidor (nada é enviado em lugar nenhum). */
export async function classificarRespostas(ap: ApoioIa, conversas: ConversaParaIa[]): Promise<ResultadoIa<ClassificacaoIa[]>> {
  if (conversas.length === 0) return { ok: true, valor: [] };
  if (conversas.length > LOTE_IA) return falha('validacao', `No máximo ${LOTE_IA} conversas por lote.`);
  const entrada = {
    conversas: conversas.map((c) => ({
      ref: c.ref,
      primeiroNome: c.primeiroNome.slice(0, 60),
      mensagemCampanha: c.mensagemCampanha.slice(0, 1000),
      mensagens: c.mensagens.slice(-MAX_MENSAGENS_IA).map((m) => ({ de: m.de, texto: m.texto.slice(0, 1000), ...(m.quando ? { quando: m.quando } : {}) })),
    })),
  };
  const r = await ap.chamar(() => ap.alterar<unknown>('zapIa.classificarConversas', { ...entrada, ...orientacoesParaEnvio(ap.orientacoes) }));
  if (!r.ok) return r;
  const o = obj(r.valor);
  if (o.ok !== true) return falha('servidor', typeof o.mensagem === 'string' ? o.mensagem : 'A IA não respondeu.');
  const itens = Array.isArray(o.itens) ? o.itens.map(itemDaIa).filter((x): x is ClassificacaoIa => x !== null) : [];
  return { ok: true, valor: itens };
}

/** O jeito de escrever do dono (v0.7.55): instruções livres + os textos dele (com {nome}) como exemplos. */
export interface EstiloDoDono {
  estilo: string;
  exemplos: string[];
}

/**
 * Texto de cobrança (com o primeiro nome dentro). Com `estilo`, a IA imita o jeito de escrever do dono (o servidor limita
 * 500 caracteres de estilo e 10 exemplos de 300). Erro = a IA está fora ou o texto não passou nas regras: o motor usa um
 * dos textos do dono. `validacao` = o servidor recusou o texto da IA (não derruba as outras cobranças do lote).
 */
export async function escreverCobranca(
  ap: ApoioIa,
  primeiroNome: string,
  mensagemCampanha: string,
  tentativa: 1 | 2 | 3,
  estilo?: EstiloDoDono,
  /** 'reativacao' (v0.7.56): retomar contato com quem está há semanas sem conversar (a etapa vem em `tentativa`, 1 a 3). */
  contexto?: 'reativacao',
): Promise<ResultadoIa<string>> {
  const entrada: Record<string, unknown> = { primeiroNome: primeiroNome.slice(0, 60), mensagemCampanha: mensagemCampanha.slice(0, 1000), tentativa, ...(contexto ? { contexto } : {}), ...orientacoesParaEnvio(ap.orientacoes) };
  const instrucoes = estilo?.estilo.trim().slice(0, 500) ?? '';
  const exemplos = (estilo?.exemplos ?? []).map((e) => e.trim().slice(0, 300)).filter(Boolean).slice(0, 10);
  if (instrucoes !== '') entrada.estilo = instrucoes;
  if (exemplos.length > 0) entrada.exemplos = exemplos;
  const r = await ap.chamar(() => ap.alterar<unknown>('zapIa.gerarCobranca', entrada));
  if (!r.ok) return r;
  const o = obj(r.valor);
  if (o.ok !== true || typeof o.texto !== 'string' || o.texto.trim() === '') {
    return falha(o.codigo === 'texto_invalido' ? 'validacao' : 'servidor', typeof o.mensagem === 'string' ? o.mensagem : 'A IA não devolveu um texto utilizável.');
  }
  return { ok: true, valor: o.texto.trim() };
}

// ── Reativação por inatividade (v0.7.56) ────────────────────────────────────

const DECISOES: ReadonlySet<string> = new Set<DecisaoReativacao>(['precisa_agora', 'precisa_mais_tempo', 'aguardando_cliente', 'delicado', 'pediu_para_sair', 'sem_contexto']);

/** Lê um item da resposta do servidor. Fora do contrato → null (o motor trata como "Precisa de você"). */
export function avaliacaoDaIa(bruto: unknown): AvaliacaoReativacao | null {
  const o = obj(bruto);
  if (typeof o.ref !== 'string' || typeof o.decisao !== 'string' || !DECISOES.has(o.decisao)) return null;
  const dias = typeof o.diasSugeridos === 'number' && Number.isInteger(o.diasSugeridos) ? o.diasSugeridos : undefined;
  return { ref: o.ref, decisao: o.decisao as DecisaoReativacao, resumo: typeof o.resumo === 'string' ? o.resumo : '', ...(dias != null ? { diasSugeridos: dias } : {}) };
}

/**
 * Um lote de até LOTE_IA_REATIVACAO conversas (a última conversa de cada contato parado). Só texto: o servidor ainda remove
 * telefone/CPF/e-mail e usa só o primeiro nome. Falha da IA/limite diário vira erro amigável (nada é enviado em lugar nenhum).
 */
export async function avaliarReativacao(ap: ApoioIa, conversas: ConversaReativacaoParaIa[]): Promise<ResultadoIa<AvaliacaoReativacao[]>> {
  if (conversas.length === 0) return { ok: true, valor: [] };
  if (conversas.length > LOTE_IA_REATIVACAO) return falha('validacao', `No máximo ${LOTE_IA_REATIVACAO} conversas por lote.`);
  const entrada = {
    conversas: conversas.map((c) => ({
      ref: c.ref,
      primeiroNome: c.primeiroNome.slice(0, 60),
      diasSemConversa: Math.max(0, Math.min(3650, Math.floor(c.diasSemConversa))),
      mensagens: c.mensagens.slice(-MAX_MENSAGENS_IA).map((m) => ({ de: m.de, texto: m.texto.slice(0, 1000), ...(m.quando ? { quando: m.quando } : {}) })),
    })),
  };
  const r = await ap.chamar(() => ap.alterar<unknown>('zapIa.avaliarReativacao', { ...entrada, ...orientacoesParaEnvio(ap.orientacoes) }));
  if (!r.ok) return r;
  const o = obj(r.valor);
  if (o.ok !== true) return falha('servidor', typeof o.mensagem === 'string' ? o.mensagem : 'A IA não respondeu.');
  const itens = Array.isArray(o.itens) ? o.itens.map(avaliacaoDaIa).filter((x): x is AvaliacaoReativacao => x !== null) : [];
  return { ok: true, valor: itens };
}

// ── Pedir à IA (v0.7.57) ────────────────────────────────────────────────────

/**
 * Passo 1: o pedido do dono em português vira um plano (período, quem falou por último, respondeu, assunto, termos do nome).
 * Não lê conversa nenhuma. Se o pedido é ambíguo, o servidor devolve `perguntas` em vez de adivinhar.
 */
export async function interpretarPedido(ap: ApoioIa, texto: string): Promise<ResultadoIa<PedidoInterpretado>> {
  const limpo = texto.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (limpo.length < 3) return falha('validacao', 'Escreva o que você quer encontrar nas conversas.');
  const r = await ap.chamar(() => ap.alterar<unknown>('zapIa.interpretarPedido', { texto: limpo, ...orientacoesParaEnvio(ap.orientacoes) }));
  if (!r.ok) return r;
  const o = obj(r.valor);
  if (o.ok !== true) return falha(o.codigo === 'texto_invalido' ? 'validacao' : 'servidor', typeof o.mensagem === 'string' ? o.mensagem : 'A IA não respondeu.');
  const plano = planoDoServidor(o.plano);
  return plano ? { ok: true, valor: plano } : falha('servidor', 'A IA devolveu um plano fora do formato. Tente escrever o pedido de outro jeito.');
}

/**
 * Passo 2: para cada conversa lida (até LOTE_CONFERENCIA), a IA diz se corresponde ao plano. Só o primeiro nome e as últimas
 * mensagens vão ao servidor (que ainda remove telefone/CPF/e-mail). Item que o servidor não devolveu NÃO aparece aqui:
 * quem chama trata a falta como "revisar" (falha fechada).
 */
export async function conferirPedido(ap: ApoioIa, plano: PlanoPedido, conversas: ConversaParaPedido[]): Promise<ResultadoIa<ConferenciaIa[]>> {
  if (conversas.length === 0) return { ok: true, valor: [] };
  if (conversas.length > LOTE_CONFERENCIA) return falha('validacao', `No máximo ${LOTE_CONFERENCIA} conversas por lote.`);
  const entrada = {
    assunto: plano.assunto.slice(0, 200),
    quemFalouPorUltimo: plano.quemFalouPorUltimo,
    respondeu: plano.respondeu,
    conversas: conversas.map((c) => ({
      ref: c.ref,
      primeiroNome: c.primeiroNome.slice(0, 60),
      mensagens: c.mensagens.slice(-MAX_MENSAGENS_IA).map((m) => ({ de: m.de, texto: m.texto.slice(0, 1000), ...(m.quando ? { quando: m.quando } : {}) })),
    })),
    ...orientacoesParaEnvio(ap.orientacoes),
  };
  const r = await ap.chamar(() => ap.alterar<unknown>('zapIa.conferirPedido', entrada));
  if (!r.ok) return r;
  const o = obj(r.valor);
  if (o.ok !== true) return falha('servidor', typeof o.mensagem === 'string' ? o.mensagem : 'A IA não respondeu.');
  const itens = Array.isArray(o.itens) ? o.itens.map(conferenciaDoServidor).filter((x): x is ConferenciaIa => x !== null) : [];
  return { ok: true, valor: itens };
}
