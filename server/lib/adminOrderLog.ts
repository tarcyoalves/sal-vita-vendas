import { ordersDb as db } from '../db/ordersDb';
import { adminOrderActions } from '../db/schema';
import { safeErr } from './logSafe';

/** Registra uma ação do admin num pedido. Best effort: falha de log nunca derruba a ação. Sem PII em `detail`. */
export async function logAdminAction(
  ctx: { actor?: { email?: string | null } | null },
  orderId: number,
  action: string,
  detail?: string | null,
): Promise<void> {
  try {
    await db.insert(adminOrderActions).values({
      orderId,
      actor: ctx.actor?.email ?? null,
      action: action.slice(0, 60),
      detail: detail ? detail.slice(0, 300) : null,
    });
  } catch (e) {
    console.error(`[adminOrderLog] falha ao registrar "${action}" do pedido ${orderId}:`, safeErr(e));
  }
}
