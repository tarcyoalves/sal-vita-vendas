// IA do follow-up (v0.7.54) sobre o cliente do CRM: classificar as respostas dos clientes e escrever a cobrança.
// A IA roda no SERVIDOR do CRM (zapIa.*, cadeia de provedores do próprio CRM): a extensão nunca tem chave de IA.
// Quem chama é o ServicoCrm (service worker), dentro de `exclusivo`. Cada chamada é UMA ação do motor de follow-up,
// disparada por uso (o atendente clicou em verificar, ou o painel está aberto com o follow-up ligado): nada periódico.
//
// LGPD: o que vai ao servidor é só o primeiro nome, o texto do disparo e as últimas mensagens da conversa. O
// servidor ainda remove telefones/CPF do texto. Nenhum telefone, nenhum nome completo, nenhum id interno sai daqui.

import type { ErroCrm } from './crm-rede';
import { LOTE_IA, MAX_MENSAGENS_IA, type ClasseIa, type ClassificacaoIa } from './followup';

export type ResultadoIa<T> = { ok: true; valor: T } | { ok: false; erro: ErroCrm };

export interface ConversaParaIa {
  /** Id opaco do lote ("c1", "c2"...): NÃO é nome, telefone nem id do contato. */
  ref: string;
  primeiroNome: string;
  mensagemCampanha: string;
  mensagens: Array<{ de: 'eu' | 'cliente'; texto: string; quando?: string }>;
}

export interface ApoioIa {
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
  const r = await ap.chamar(() => ap.alterar<unknown>('zapIa.classificarConversas', entrada));
  if (!r.ok) return r;
  const o = obj(r.valor);
  if (o.ok !== true) return falha('servidor', typeof o.mensagem === 'string' ? o.mensagem : 'A IA não respondeu.');
  const itens = Array.isArray(o.itens) ? o.itens.map(itemDaIa).filter((x): x is ClassificacaoIa => x !== null) : [];
  return { ok: true, valor: itens };
}

/** Texto de cobrança (com o primeiro nome dentro). Erro = a IA está fora ou o texto não passou nas regras: use o modelo local. */
export async function escreverCobranca(ap: ApoioIa, primeiroNome: string, mensagemCampanha: string, tentativa: 1 | 2): Promise<ResultadoIa<string>> {
  const r = await ap.chamar(() => ap.alterar<unknown>('zapIa.gerarCobranca', { primeiroNome: primeiroNome.slice(0, 60), mensagemCampanha: mensagemCampanha.slice(0, 1000), tentativa }));
  if (!r.ok) return r;
  const o = obj(r.valor);
  if (o.ok !== true || typeof o.texto !== 'string' || o.texto.trim() === '') return falha('servidor', typeof o.mensagem === 'string' ? o.mensagem : 'A IA não devolveu um texto utilizável.');
  return { ok: true, valor: o.texto.trim() };
}
