import { safeErr } from './logSafe';
import { ordersDb } from '../db/ordersDb';
import { abandonedCarts, automationRuns, coupons, msgTemplates, siteOrders } from '../db/schema';
import { eq, ne, and, sql, gte, inArray, desc } from 'drizzle-orm';
import { abandonedCartHtml, sendEmail } from '../email/resend';
import { renderTemplate, sendWhatsApp } from './orderConfirmation';
import { STORE_URL } from './storeUrl';
import { inicioJanelaCompra, telefoneParaBusca, selecionarUmPorTelefone, regraDeAbandono } from './recoveryCadence';

// Rotinas de recuperação de carrinho compartilhadas entre o cron (/api/cron/abandoned-cart, api/index.ts)
// e o botão do admin (recovery.runAutomationJob). Uma única implementação = as mesmas regras nos dois
// caminhos: claim atômico (FOR UPDATE SKIP LOCKED, SQL raw de propósito — não reescreva no query
// builder), portão de WhatsApp, um toque por telefone por rodada, checagem de compra e requeue.

export function isBusinessHours(): boolean {
  const brHour = (new Date().getUTCHours() - 3 + 24) % 24;
  return brHour >= 8 && brHour < 21;
}

/**
 * Retry a Neon query through transient connection-pool contention.
 *
 * neon-http opens a fresh HTTP hop per query, and under a burst the branch
 * answers "Failed to acquire permit to connect to the database". On 2026-08-07
 * that error hit the very first SELECT of the abandoned-cart cron and, because
 * the cron runs once a day with no retry, the whole day's recovery and payment
 * reconciliation silently didn't happen.
 */
export async function withDbRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (err) {
      lastErr = err;
      const msg = String((err as any)?.message ?? err);
      const transient = msg.includes('Failed to acquire permit') || msg.includes('ECONNRESET') || msg.includes('fetch failed');
      if (!transient || i === attempts - 1) break;
      const backoff = 400 * Math.pow(2, i);
      console.warn(`[db-retry] ${label}: transient failure, retrying in ${backoff}ms (${i + 1}/${attempts - 1})`);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

/**
 * Is the WhatsApp session actually able to send right now?
 *
 * This gate exists because every WA-dependent routine consumes its opportunity
 * up front: the unpaid follow-up stamps `unpaid_followup_sent_at` before
 * sending, the reorder nudge stamps `reorder_reminded_at`, and a failed
 * automation run used to be marked 'failed' and never looked at again. So while
 * the Baileys session was disconnected, the cron kept "spending" carts, unpaid
 * orders and reorder reminders against a socket that could not deliver anything
 * — silently, once per day, with no way to get them back.
 *
 * Unknown counts as disconnected on purpose: postponing a message costs a day,
 * whereas burning it costs the sale.
 */
export async function isWhatsAppConnected(): Promise<boolean> {
  // Escape hatch: this gate reads a health endpoint whose payload shape varies
  // between wa-server builds. If it ever reports "down" for a session that is
  // actually fine, recovery would stay paused indefinitely with no way out.
  // Setting WA_FORCE_SEND=1 in Vercel restores the old always-send behaviour.
  if (process.env.WA_FORCE_SEND === '1') {
    console.warn('[wa-gate] WA_FORCE_SEND=1 — bypassing the connectivity check');
    return true;
  }
  const url = process.env.WA_SERVER_URL || 'https://evolution.salvitarn.com.br';
  const key = process.env.WA_API_KEY;
  if (!key) {
    console.warn('[wa-gate] WA_API_KEY not configured — treating WhatsApp as disconnected');
    return false;
  }
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    const res = await fetch(`${url}/status`, { headers: { apikey: key }, signal: ac.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[wa-gate] status endpoint returned HTTP ${res.status} — treating as disconnected`);
      return false;
    }
    const body = await res.json() as { connected?: boolean; status?: string };
    const connected = body?.connected === true || body?.status === 'open' || body?.status === 'connected';
    if (!connected) console.warn(`[wa-gate] WhatsApp reports "${body?.status ?? 'unknown'}" — holding all WA sends`);
    return connected;
  } catch (err) {
    console.warn('[wa-gate] status check failed — treating as disconnected:', (err as Error).message);
    return false;
  }
}

// A send failure re-schedules the run instead of discarding it; only after this
// many attempts is it given up on.
const MAX_SEND_ATTEMPTS = 3;

/**
 * A failed WhatsApp send used to set the run to 'failed' permanently, and the
 * due-runs query only ever looks at 'scheduled' — so a single bad moment threw
 * the cart away. Now the run goes back in the queue with a delay, and is only
 * given up on after MAX_SEND_ATTEMPTS.
 */
export async function requeueOrFail(
  runsTable: typeof automationRuns,
  run: { id: number; attempts?: number | null },
): Promise<void> {
  const attempts = (run.attempts ?? 0) + 1;
  if (attempts >= MAX_SEND_ATTEMPTS) {
    await ordersDb.update(runsTable)
      .set({ status: 'failed', attempts, updatedAt: new Date() })
      .where(eq(runsTable.id, run.id));
    console.warn(`[cron] automation run ${run.id} failed ${attempts}x — giving up`);
    return;
  }
  const retryAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // +2h
  await ordersDb.update(runsTable)
    .set({ status: 'scheduled', attempts, scheduledFor: retryAt, updatedAt: new Date() })
    .where(eq(runsTable.id, run.id));
  console.log(`[cron] automation run ${run.id} re-queued (attempt ${attempts}/${MAX_SEND_ATTEMPTS})`);
}


// Best active coupon for automated recovery messages: prefers the admin-flagged
// recovery coupon, else the newest active/valid one. Returns '' when none.
export async function getActiveRecoveryCouponCode(): Promise<string> {
  try {
    const rows = await ordersDb.select().from(coupons).where(eq(coupons.active, true)).orderBy(desc(coupons.createdAt));
    const now = new Date();
    const usable = (c: typeof rows[number]) =>
      (!c.expiresAt || now < new Date(c.expiresAt)) && (!c.maxUses || c.usedCount < c.maxUses);
    return (rows.find(c => c.useForRecovery && usable(c)) ?? rows.find(usable))?.code ?? '';
  } catch { return ''; }
}

/**
 * Existe pedido do MESMO telefone (comparado pelos dígitos nacionais, sem DDI) criado depois de `desde`
 * e não cancelado — ou só confirmado, com `soConfirmado`? Usado para não cobrar/recuperar quem já comprou.
 */
export async function telefoneTemPedidoDesde(
  phone: string, desde: Date, opts: { soConfirmado?: boolean; excetoId?: number } = {},
): Promise<boolean> {
  const n = telefoneParaBusca(phone);
  if (!n) return false;
  const conds = [
    ne(siteOrders.status, 'cancelled'),
    gte(siteOrders.createdAt, desde),
    sql`right(regexp_replace(${siteOrders.customerPhone}, '\\D', '', 'g'), ${sql.raw(String(n.length))}) = ${n}`,
  ];
  if (opts.soConfirmado) conds.push(eq(siteOrders.paymentStatus, 'confirmed'));
  if (opts.excetoId !== undefined) conds.push(ne(siteOrders.id, opts.excetoId));
  const [row] = await ordersDb.select({ id: siteOrders.id }).from(siteOrders).where(and(...conds)).limit(1);
  return !!row;
}


export type AutomationRunsResult = {
  processed: number; sent: number; cancelled: number; failed: number; skipped?: string;
};

/**
 * Envia os toques 'scheduled' vencidos da cadência de carrinho abandonado.
 * `deadlineAt` (epoch ms) é o orçamento de tempo: ao estourar, o que foi reivindicado e não enviado
 * volta para 'scheduled'. `jaVerificouWhatsApp`: o cron já checou horário comercial e WhatsApp.
 */
export async function processAutomationRuns(
  opts: { deadlineAt: number; jaVerificouWhatsApp?: boolean; limit?: number },
): Promise<AutomationRunsResult> {
  const vazio = { processed: 0, sent: 0, cancelled: 0, failed: 0 };
  if (!opts.jaVerificouWhatsApp) {
    if (!isBusinessHours()) return { ...vazio, skipped: 'outside business hours (08:00–21:00 BRT)' };
    if (!(await isWhatsAppConnected())) return { ...vazio, skipped: 'whatsapp disconnected' };
  }
  const runs = automationRuns;
  const carts = abandonedCarts;
  const cronDeadline = opts.deadlineAt;
  const limit = Math.max(1, Math.min(opts.limit ?? 20, 50));

  // Templates uma vez (tabela pequena), indexados por slug.
  const abandonedTpls = await ordersDb.select().from(msgTemplates).where(eq(msgTemplates.type, 'abandoned'));
  const tplBySlug: Record<string, typeof abandonedTpls[number]> = {};
  for (const t of abandonedTpls) tplBySlug[t.slug] = t;
  // Cupom REAL e ativo só no último toque — nunca o antigo 'VOLTA10' fixo.
  const activeCoupon = await getActiveRecoveryCouponCode();
  const RULE_MAP: Record<string, { slug: string; coupon: string }> = {
    abandoned_t1: { slug: 'abandoned_simples',  coupon: '' },
    abandoned_t2: { slug: 'abandoned_urgencia', coupon: '' },
    abandoned_t3: { slug: 'abandoned_cupom',    coupon: activeCoupon },
  };
  const fallbackTpl = tplBySlug['abandoned_simples'] ?? abandonedTpls.find(t => t.isDefault);

  let sent = 0, cancelled = 0, failed = 0;
  // Claim atômico (mesmo padrão de campaigns.ts): GET+POST/retry simultâneos nunca
  // pegam as mesmas linhas, então ninguém recebe o mesmo WhatsApp duas vezes.
  // 'sending' órfã (função morreu no meio do envio) há >15 min volta para 'scheduled';
  // automation_runs não tem claimed_at, então updated_at (gravado no claim) serve de relógio.
  await withDbRetry('recycle-sending-runs', () => ordersDb.execute(sql`
    UPDATE automation_runs
    SET status = 'scheduled', updated_at = now()
    WHERE status = 'sending' AND updated_at < now() - interval '15 minutes'
  `));
  // Batch sizes are bounded by `maxDuration` (60s in vercel.json), not by the
  // 10s figure the previous comments assumed — that mismatch capped the whole
  // system at 3 recovery messages per day once the cron went to daily.
  const claimed = await withDbRetry('claim-due-runs', () => ordersDb.execute<{
    id: number; cartId: number; customerPhone: string; ruleName: string;
    attempts: number | null; aiBody: string | null;
  }>(sql`
    UPDATE automation_runs
    SET status = 'sending', updated_at = now()
    WHERE id IN (
      SELECT id FROM automation_runs
      WHERE status = 'scheduled' AND scheduled_for <= now()
      ORDER BY scheduled_for
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, cart_id AS "cartId", customer_phone AS "customerPhone",
              rule_name AS "ruleName", attempts, ai_body AS "aiBody"
  `));
  const due = claimed.rows;
  // Libera de volta para a fila o que foi reivindicado mas não será enviado agora.
  const releaseClaimed = async (ids: number[]) => {
    if (ids.length === 0) return;
    try {
      await ordersDb.update(runs).set({ status: 'scheduled', updatedAt: new Date() })
        .where(and(inArray(runs.id, ids), eq(runs.status, 'sending')));
    } catch (e) { console.error('[cron] release claimed runs failed:', safeErr(e)); }
  };
  const pendingIds = new Set(due.map(r => r.id));
  // No máximo um toque por telefone por rodada (T1+T2+T3 vencidos juntos não viram 3 mensagens
  // seguidas): os demais NÃO são cancelados, voltam para 'scheduled' e saem na próxima rodada.
  const { enviar: dueAgora, adiar } = selecionarUmPorTelefone(due);
  if (adiar.length > 0) {
    for (const r of adiar) pendingIds.delete(r.id);
    await releaseClaimed(adiar.map(r => r.id));
    console.log(`[cron] abandoned-cart: ${adiar.length} toque(s) adiados (um por telefone por rodada)`);
  }

  for (const run of dueAgora) {
    if (Date.now() > cronDeadline) {
      console.warn(`[cron] abandoned-cart: orçamento de tempo esgotado — ${pendingIds.size} run(s) voltam para a fila`);
      await releaseClaimed([...pendingIds]);
      break;
    }
    pendingIds.delete(run.id);
    const [cart] = await ordersDb.select().from(carts).where(eq(carts.id, run.cartId)).limit(1);
    if (!cart || cart.status === 'converted' || cart.recovered || cart.optedOut) {
      await ordersDb.update(runs).set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(runs.id, run.id));
      cancelled++;
      continue;
    }
    // Quem já fez um pedido (não cancelado) depois do carrinho — pago ou não — não recebe a cadência.
    let jaComprou = false;
    try { jaComprou = await telefoneTemPedidoDesde(run.customerPhone, inicioJanelaCompra(cart.createdAt)); }
    catch (e) {
      // Na dúvida não manda: devolve o toque à fila para a próxima rodada.
      console.error(`[cron] abandoned-cart: checagem de compra do carrinho ${cart.id} falhou:`, safeErr(e));
      await releaseClaimed([run.id]);
      continue;
    }
    if (jaComprou) {
      await ordersDb.update(runs).set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(runs.id, run.id));
      cancelled++;
      continue;
    }
    const name = cart.customerName;
    // 3º toque sem cupom ativo cai no template simples (nunca "Use o cupom **").
    const ruleCfg = regraDeAbandono(RULE_MAP[run.ruleName]);
    // Append ?cupom= so the storefront pre-fills and auto-applies the code.
    const link = ruleCfg.coupon ? `${STORE_URL}?cupom=${encodeURIComponent(ruleCfg.coupon)}` : STORE_URL;
    const tpl = tplBySlug[ruleCfg.slug] ?? fallbackTpl;
    let msg: string;
    if (run.aiBody) {
      msg = run.aiBody; // AI-generated personalized message takes priority
    } else if (tpl) {
      msg = renderTemplate(tpl.body, { nome: name, link, cupom: ruleCfg.coupon, produto: 'Sal Marinho Integral 1kg' });
    } else {
      msg = `Olá *${name}*! 🌊\n\nNotamos que você se interessou pelo *Sal Marinho Integral Sal Vita* mas não finalizou o pedido.\n\n👉 Finalize agora: ${link}\n\nQualquer dúvida é só chamar! 😊\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_`;
    }
    try {
      const ok = await sendWhatsApp(run.customerPhone, msg);
      if (ok) {
        // Já entregue: gravar 'sent' com retry, para não cair em requeue e duplicar.
        await withDbRetry('mark-run-sent', () => ordersDb.update(runs).set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
          .where(eq(runs.id, run.id)));
        await ordersDb.update(carts).set({ recoverySentAt: new Date(), updatedAt: new Date() })
          .where(eq(carts.id, run.cartId));
        sent++;
        // Email only on 3rd touch (cupom) to save Resend daily quota for confirmations
        if (cart.customerEmail && ruleCfg.coupon) {
          const emailHtml = abandonedCartHtml(cart.customerName, link, ruleCfg.coupon);
          try { await sendEmail(cart.customerEmail, `Seu cupom ${ruleCfg.coupon} — finalize seu pedido Sal Vita`, emailHtml); }
          catch (e) { console.error(`[cron] abandoned-cart: e-mail do carrinho ${cart.id} falhou:`, safeErr(e)); }
        }
      } else {
        await requeueOrFail(runs, run);
        failed++;
      }
    } catch {
      await requeueOrFail(runs, run);
      failed++;
    }
  }
  return { processed: due.length, sent, cancelled, failed };
}
