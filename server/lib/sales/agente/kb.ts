// Base homologada do vendedor virtual (tabela sales_agent_kb) e leitura das conversas para o painel.
// Regra: só itens 'approved' chegam ao modelo. Editar um item aprovado volta ele a 'draft' (versão +1).
// A lógica de estado é pura (kbPuro.ts); aqui fica só o acesso ao banco do Premium.
import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { ordersDb } from '../../../db/ordersDb';
import { salesAgentConversations, salesAgentKb, salesAgentMessages } from '../../../db/schema';
import { aplicarEdicao, soAprovados, validarAprovacao, type KbEstado } from './kbPuro';

export const KB_KINDS = ['produto', 'politica', 'objecao', 'resposta_padrao', 'proibido'] as const;
export type KbKind = (typeof KB_KINDS)[number];

export interface KbItem {
  id: number;
  kind: KbKind;
  key: string;
  title: string;
  content: string;
  status: 'draft' | 'approved' | 'archived';
  version: number;
  approvedBy: string | null;
  approvedAt: Date | null;
  updatedAt: Date;
}

type Linha = typeof salesAgentKb.$inferSelect;

function paraItem(r: Linha): KbItem {
  return {
    id: r.id,
    kind: (KB_KINDS as readonly string[]).includes(r.kind) ? (r.kind as KbKind) : 'resposta_padrao',
    key: r.key, title: r.title, content: r.content,
    status: r.status === 'approved' || r.status === 'archived' ? r.status : 'draft',
    version: r.version, approvedBy: r.approvedBy, approvedAt: r.approvedAt, updatedAt: r.updatedAt,
  };
}

function estadoDe(i: KbItem): KbEstado {
  return { kind: i.kind, key: i.key, title: i.title, content: i.content, status: i.status, version: i.version, approvedBy: i.approvedBy, approvedAt: i.approvedAt };
}

async function porId(id: number): Promise<KbItem | null> {
  const [r] = await ordersDb.select().from(salesAgentKb).where(eq(salesAgentKb.id, id)).limit(1);
  return r ? paraItem(r) : null;
}

async function porChave(key: string): Promise<KbItem | null> {
  const [r] = await ordersDb.select().from(salesAgentKb).where(eq(salesAgentKb.key, key)).limit(1);
  return r ? paraItem(r) : null;
}

export async function listarKb(): Promise<KbItem[]> {
  const rows = await ordersDb.select().from(salesAgentKb).orderBy(asc(salesAgentKb.kind), asc(salesAgentKb.key));
  return rows.map(paraItem);
}

/** Só o que o modelo pode ler. */
export async function listarKbAprovada(): Promise<KbItem[]> {
  return soAprovados(await listarKb());
}

export async function salvarKbItem(i: { id?: number; kind: KbKind; key: string; title: string; content: string }, _por: string): Promise<KbItem> {
  const entrada = { kind: i.kind, key: i.key.trim(), title: i.title.trim(), content: i.content.trim() };
  if (!entrada.key || !entrada.title || !entrada.content) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Chave, título e conteúdo são obrigatórios.' });
  }
  const atual = i.id !== undefined ? await porId(i.id) : await porChave(entrada.key);
  if (i.id !== undefined && !atual) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item não encontrado.' });
  if (atual && atual.key !== entrada.key) {
    const outro = await porChave(entrada.key);
    if (outro && outro.id !== atual.id) throw new TRPCError({ code: 'CONFLICT', message: 'Já existe outro item com essa chave.' });
  }
  const { estado, mudou } = aplicarEdicao(atual ? estadoDe(atual) : null, entrada);
  if (!atual) {
    const [novo] = await ordersDb.insert(salesAgentKb).values({ ...entrada, status: 'draft', version: 1 }).returning();
    return paraItem(novo);
  }
  if (!mudou) return atual;
  const [r] = await ordersDb.update(salesAgentKb).set({
    ...entrada, status: estado.status, version: estado.version, approvedBy: null, approvedAt: null, updatedAt: new Date(),
  }).where(eq(salesAgentKb.id, atual.id)).returning();
  return paraItem(r);
}

export async function aprovarKbItem(id: number, por: string): Promise<KbItem> {
  const atual = await porId(id);
  if (!atual) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item não encontrado.' });
  if (atual.status === 'approved') return atual;
  const v = validarAprovacao(atual);
  if (!v.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: v.motivo });
  const agora = new Date();
  // Condicional à versão lida: se alguém editou no meio, a aprovação não pega o texto novo.
  const [r] = await ordersDb.update(salesAgentKb)
    .set({ status: 'approved', approvedBy: por, approvedAt: agora, updatedAt: agora })
    .where(and(eq(salesAgentKb.id, id), eq(salesAgentKb.version, atual.version), eq(salesAgentKb.content, atual.content))).returning();
  if (!r) throw new TRPCError({ code: 'CONFLICT', message: 'O item mudou enquanto era aprovado. Recarregue.' });
  return paraItem(r);
}

export async function arquivarKbItem(id: number, _por: string): Promise<void> {
  await ordersDb.update(salesAgentKb).set({ status: 'archived', updatedAt: new Date() }).where(eq(salesAgentKb.id, id));
}

/**
 * Importa uma lista (JSON colado no painel). Todos entram como 'draft'. Item já existente com texto
 * idêntico é mantido como está (reimportar o mesmo JSON não derruba o que já foi aprovado).
 */
export async function importarKb(itens: Array<{ kind: KbKind; key: string; title: string; content: string }>, por: string): Promise<{ criados: number; atualizados: number }> {
  let criados = 0;
  let atualizados = 0;
  for (const it of itens) {
    const existente = await porChave(it.key.trim());
    const r = await salvarKbItem({ ...it, id: existente?.id }, por);
    if (!existente) criados++;
    else if (r.version !== existente.version || r.status !== existente.status || r.content !== existente.content || r.title !== existente.title) atualizados++;
  }
  return { criados, atualizados };
}

export interface ConversaResumo {
  id: string;
  profile: string | null;
  companyName: string | null;
  status: string;
  flagged: boolean;
  flagReason: string | null;
  messageCount: number;
  startedAt: Date;
  lastAt: Date;
}

type LinhaConversa = typeof salesAgentConversations.$inferSelect;
function paraResumo(c: LinhaConversa): ConversaResumo {
  return {
    id: c.id, profile: c.profile, companyName: c.companyName, status: c.status, flagged: c.flagged,
    flagReason: c.flagReason, messageCount: c.messageCount, startedAt: c.startedAt, lastAt: c.lastAt,
  };
}

export async function listarConversas(f: { soMarcadas?: boolean; pagina: number; porPagina: number }): Promise<{ itens: ConversaResumo[]; total: number }> {
  const onde = f.soMarcadas ? eq(salesAgentConversations.flagged, true) : undefined;
  const pagina = Math.max(1, f.pagina);
  const porPagina = Math.min(100, Math.max(1, f.porPagina));
  const rows = await ordersDb.select().from(salesAgentConversations).where(onde)
    .orderBy(desc(salesAgentConversations.lastAt)).limit(porPagina).offset((pagina - 1) * porPagina);
  const [{ n }] = await ordersDb.select({ n: sql<number>`count(*)::int` }).from(salesAgentConversations).where(onde);
  return { itens: rows.map(paraResumo), total: n };
}

export async function obterConversa(id: string): Promise<{ conversa: ConversaResumo; mensagens: Array<{ role: string; content: string; toolName: string | null; blocked: boolean; blockReason: string | null; createdAt: Date }> } | null> {
  const [c] = await ordersDb.select().from(salesAgentConversations).where(eq(salesAgentConversations.id, id)).limit(1);
  if (!c) return null;
  const msgs = await ordersDb.select().from(salesAgentMessages).where(eq(salesAgentMessages.conversationId, id))
    .orderBy(asc(salesAgentMessages.createdAt), asc(salesAgentMessages.id));
  return {
    conversa: paraResumo(c),
    mensagens: msgs.map((m) => ({ role: m.role, content: m.content, toolName: m.toolName, blocked: m.blocked, blockReason: m.blockReason, createdAt: m.createdAt })),
  };
}
