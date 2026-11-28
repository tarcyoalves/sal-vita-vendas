// Central "Precisa de você" e saída para o CRM (tarefa do atendente). Usado pelo ciclo, pelas rotas
// do Hermes e pelo vendedor virtual. Idempotente: a mesma chave nunca cria duas exceções nem duas tarefas.
import { sql } from 'drizzle-orm';
import { ordersDb } from '../../db/ordersDb';
import { salesExceptions, salesSyncOps } from '../../db/schema';
import type { ExceptionKind, ExceptionSeverity } from '../../../shared/sales';

export interface NovaExcecao {
  /** Chave estável (ex.: `resposta:<idEvento>`). Repetir a chave não cria outra. */
  idempotencyKey: string;
  kind: ExceptionKind;
  severity?: ExceptionSeverity;
  title: string;
  detail?: string;
  evidence?: unknown;
  companyId?: number | null;
  contactId?: number | null;
  conversationId?: string | null;
  proposedAction?: unknown;
  createdBy: string;
  /** Também abrir tarefa para o atendente no CRM (via saída idempotente). */
  criarTarefaCrm?: { titulo: string; descricao: string; prioridade?: 'low' | 'medium' | 'high' } | null;
}

/** Registra a exceção (e, se pedido, enfileira a tarefa no CRM). Devolve o id, novo ou existente. */
export async function registrarExcecao(e: NovaExcecao): Promise<{ id: number; nova: boolean }> {
  const inserida = await ordersDb.insert(salesExceptions).values({
    idempotencyKey: e.idempotencyKey,
    kind: e.kind,
    severity: e.severity ?? 'normal',
    title: e.title.slice(0, 300),
    detail: e.detail?.slice(0, 4000) ?? null,
    evidence: e.evidence ?? null,
    companyId: e.companyId ?? null,
    contactId: e.contactId ?? null,
    conversationId: e.conversationId ?? null,
    proposedAction: e.proposedAction ?? null,
    createdBy: e.createdBy,
  }).onConflictDoNothing({ target: salesExceptions.idempotencyKey }).returning({ id: salesExceptions.id });

  if (inserida.length === 0) {
    const [existente] = await ordersDb.select({ id: salesExceptions.id }).from(salesExceptions)
      .where(sql`${salesExceptions.idempotencyKey} = ${e.idempotencyKey}`).limit(1);
    return { id: existente?.id ?? 0, nova: false };
  }
  const id = inserida[0].id;
  if (e.criarTarefaCrm) {
    const opId = await enfileirarTarefaCrm(`tarefa:${e.idempotencyKey}`, { ...e.criarTarefaCrm, excecaoId: id });
    await ordersDb.update(salesExceptions).set({ crmTaskOpId: opId }).where(sql`${salesExceptions.id} = ${id}`);
  }
  return { id, nova: true };
}

export interface TarefaCrmPayload {
  titulo: string;
  descricao: string;
  prioridade?: 'low' | 'medium' | 'high';
  excecaoId?: number;
}

/**
 * Grava a operação de saída no banco do Premium (origem). O processamento (ciclo) cria a tarefa no
 * CRM e marca a operação; repetir a chave devolve a mesma operação.
 */
export async function enfileirarTarefaCrm(idempotencyKey: string, payload: TarefaCrmPayload): Promise<number> {
  const inserida = await ordersDb.insert(salesSyncOps).values({ idempotencyKey, kind: 'criar_tarefa_crm', payload })
    .onConflictDoNothing({ target: salesSyncOps.idempotencyKey }).returning({ id: salesSyncOps.id });
  if (inserida.length) return inserida[0].id;
  const [existente] = await ordersDb.select({ id: salesSyncOps.id }).from(salesSyncOps)
    .where(sql`${salesSyncOps.idempotencyKey} = ${idempotencyKey}`).limit(1);
  return existente?.id ?? 0;
}
