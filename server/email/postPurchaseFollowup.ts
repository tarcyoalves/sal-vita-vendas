import { ordersDb as db } from '../db/ordersDb';
import { sql } from 'drizzle-orm';
import { safeErr, maskEmail } from '../lib/logSafe';
import { enrollInSequence, processSequenceEnrollments } from './sequenceEngine';
import {
  FOLLOWUP_ENROLL_SINCE,
  FOLLOWUP_EVENT,
  FOLLOWUP_FALLBACK_DAYS,
  POS_COMPRA_NAME,
  RELACIONAMENTO_NAME,
} from './followupSequences';

/**
 * Follow-up pós-compra por e-mail (plano: docs/PLANO-FOLLOWUP-POS-COMPRA.md).
 * Roda no cron diário `/api/cron/abandoned-cart`, nunca no fluxo de pagamento.
 * Todo SQL aqui é do banco do Premium (`ordersDb`); o motor de sequências é o mesmo das campanhas.
 */

type Rows = Array<Record<string, unknown>>;
const rowsOf = (r: unknown): Rows => ((r as { rows?: Rows }).rows ?? (r as Rows) ?? []) as Rows;

/** Primeiro nome com inicial maiúscula, para `{nome}`. */
export function firstName(full: string | null | undefined): string {
  const w = String(full ?? '').trim().split(/\s+/)[0] ?? '';
  return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '';
}

async function sequenceId(name: string, onlyActive: boolean): Promise<number | null> {
  const r = rowsOf(
    await db.execute(sql`
      SELECT id, active FROM email_sequences WHERE name = ${name} ORDER BY id ASC LIMIT 1
    `)
  )[0];
  if (!r) return null;
  if (onlyActive && !r.active) return null;
  return Number(r.id);
}

/**
 * Recompra reinicia o ciclo: quem fez pedido pago MAIS NOVO que a inscrição ativa sai de
 * "Pós-compra" e "Relacionamento mensal" (o pedido novo inscreve de novo pela entrega). Assim
 * ninguém recebe "hora de repor?" poucos dias depois de comprar.
 */
export async function cancelFollowupOnRepurchase(): Promise<number> {
  const res = await db.execute(sql`
    UPDATE email_sequence_enrollments e
    SET status = 'cancelled', updated_at = NOW()
    WHERE e.status = 'active'
      AND e.sequence_id IN (SELECT id FROM email_sequences WHERE name IN (${POS_COMPRA_NAME}, ${RELACIONAMENTO_NAME}))
      AND EXISTS (
        SELECT 1 FROM site_orders o
        WHERE LOWER(TRIM(o.customer_email)) = LOWER(e.email)
          AND o.payment_status = 'confirmed' AND o.status <> 'cancelled'
          AND o.created_at > e.enrolled_at
      )
    RETURNING e.id
  `);
  return rowsOf(res).length;
}

/** Cancela as inscrições ativas de um e-mail nas duas sequências (antes de reinscrever por pedido novo). */
async function cancelActiveFor(email: string): Promise<void> {
  await db.execute(sql`
    UPDATE email_sequence_enrollments
    SET status = 'cancelled', updated_at = NOW()
    WHERE status = 'active' AND LOWER(email) = ${email}
      AND sequence_id IN (SELECT id FROM email_sequences WHERE name IN (${POS_COMPRA_NAME}, ${RELACIONAMENTO_NAME}))
  `);
}

/**
 * Inscreve em "Pós-compra" quem comprou e recebeu: pedido pago (confirmed), não cancelado, com
 * e-mail, criado a partir do corte (FOLLOWUP_ENROLL_SINCE), e entregue OU pago há >= 10 dias.
 * Só o pedido pago mais recente de cada e-mail conta. Cada pedido inscreve UMA vez: a trava é a
 * linha (order_id, 'followup-enrolled') em shipping_events, gravada com INSERT ... ON CONFLICT
 * DO NOTHING RETURNING antes de inscrever. Com a sequência desligada não reivindica nada.
 */
export async function enrollNewBuyers(limit = 10): Promise<{ considered: number; enrolled: number; skipped: number; inactive?: boolean }> {
  const seqId = await sequenceId(POS_COMPRA_NAME, true);
  if (!seqId) return { considered: 0, enrolled: 0, skipped: 0, inactive: true };

  const candidates = rowsOf(
    await db.execute(sql`
      SELECT DISTINCT ON (LOWER(TRIM(o.customer_email)))
        o.id, o.customer_name AS name, LOWER(TRIM(o.customer_email)) AS email
      FROM site_orders o
      WHERE o.payment_status = 'confirmed'
        AND o.status <> 'cancelled'
        AND o.customer_email IS NOT NULL AND TRIM(o.customer_email) LIKE '%@%'
        AND o.created_at >= ${FOLLOWUP_ENROLL_SINCE}
        AND (o.status = 'delivered' OR o.created_at <= NOW() - (${FOLLOWUP_FALLBACK_DAYS}::int * INTERVAL '1 day'))
        AND NOT EXISTS (
          SELECT 1 FROM shipping_events s WHERE s.order_id = o.id AND s.event = ${FOLLOWUP_EVENT}
        )
        AND NOT EXISTS (
          SELECT 1 FROM site_orders n
          WHERE LOWER(TRIM(n.customer_email)) = LOWER(TRIM(o.customer_email))
            AND n.id <> o.id AND n.payment_status = 'confirmed' AND n.status <> 'cancelled'
            AND n.created_at > o.created_at
        )
      ORDER BY LOWER(TRIM(o.customer_email)), o.created_at DESC
      LIMIT ${limit}
    `)
  );

  let enrolled = 0;
  let skipped = 0;
  for (const c of candidates) {
    const orderId = Number(c.id);
    const email = String(c.email);
    try {
      // Trava de inscrição única por pedido.
      const claim = rowsOf(
        await db.execute(sql`
          INSERT INTO shipping_events (order_id, event, notified)
          VALUES (${orderId}, ${FOLLOWUP_EVENT}, 'pending')
          ON CONFLICT DO NOTHING RETURNING order_id
        `)
      );
      if (claim.length === 0) { skipped++; continue; }

      await cancelActiveFor(email); // pedido novo reinicia o ciclo, sem duplicar o dia 0
      const r = await enrollInSequence(email, seqId, firstName(String(c.name ?? '')) || undefined);
      if (!r.ok && (r.reason === 'sequence_inactive' || r.reason === 'no_steps')) {
        // Nada foi inscrito por motivo transitório: devolve a trava para tentar de novo depois.
        await db.execute(sql`DELETE FROM shipping_events WHERE order_id = ${orderId} AND event = ${FOLLOWUP_EVENT}`);
        skipped++;
        continue;
      }
      await db.execute(sql`
        UPDATE shipping_events SET notified = ${r.ok ? 'ok' : (r.reason ?? 'skipped')}
        WHERE order_id = ${orderId} AND event = ${FOLLOWUP_EVENT}
      `);
      if (r.ok) enrolled++; else skipped++;
    } catch (err) {
      skipped++;
      console.error(`[followup] order ${orderId} (${maskEmail(email)}) failed:`, safeErr(err));
    }
  }
  return { considered: candidates.length, enrolled, skipped };
}

/**
 * Passo completo do cron: cancela quem recomprou, inscreve compradores novos e envia os passos
 * vencidos (respeitando o teto diário de sequências e o orçamento de tempo `budgetMs`).
 */
export async function runPostPurchaseFollowup(budgetMs = 15_000) {
  const deadline = Date.now() + budgetMs;
  const cancelled = await cancelFollowupOnRepurchase();
  const enrollment = await enrollNewBuyers(10);
  const due = await processSequenceEnrollments(100, deadline);
  return { cancelled, ...enrollment, due };
}
