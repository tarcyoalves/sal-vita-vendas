import { safeErr } from './logSafe';
import crypto from 'crypto';
import { eq, and, or, ne, sql } from 'drizzle-orm';
import { ordersDb } from '../db/ordersDb';
import { siteOrders, abandonedCarts, automationRuns, msgTemplates, coupons } from '../db/schema';
import { sendEmail, orderConfirmedHtml } from '../email/resend';
import { linhaRevisar } from './paymentTransition';
import { STORE_URL } from './storeUrl';

type SiteOrder = typeof siteOrders.$inferSelect;

export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// Formats a stored price string ("149.90") as Brazilian currency text ("149,90")
export function brl(price: string | null | undefined): string {
  return parseFloat(price ?? '0').toFixed(2).replace('.', ',');
}

// Adjusts a coupon's used_count. Called +1 only when a payment is CONFIRMED (so
// abandoned/unpaid orders never burn a coupon's max uses) and -1 on refund.
/**
 * Customer-facing link to an order.
 *
 * Uses the opaque per-order token. Orders created before `track_token` existed
 * have none — those links still open /meu-pedido, and the page asks for the full
 * phone number. The old `&tel=<last 4 digits>` form is gone: it put the very
 * credential that unlocks the order into a URL shared with Mercado Pago, browser
 * history and `Referer` headers.
 */
export function orderTrackLink(
  order: { id: number; trackToken?: string | null },
  extraQuery?: string,
): string {
  const base = `${STORE_URL}/meu-pedido?pedido=${order.id}`;
  const withToken = order.trackToken ? `${base}&t=${order.trackToken}` : base;
  return extraQuery ? `${withToken}&${extraQuery}` : withToken;
}

/**
 * Anexa "[REVISAR] <data ISO> <motivo>" a site_orders.notes (UPDATE atômico, nunca sobrescreve).
 * Idempotente: não repete o mesmo motivo. Não lança — falha de nota não pode derrubar o webhook.
 */
export async function appendReviewNote(orderId: number, motivo: string): Promise<void> {
  try {
    const linha = linhaRevisar(motivo);
    await ordersDb.update(siteOrders)
      .set({
        notes: sql`CASE WHEN coalesce(${siteOrders.notes}, '') = '' THEN ${linha}::text ELSE ${siteOrders.notes} || chr(10) || ${linha}::text END`,
        updatedAt: new Date(),
      })
      .where(and(eq(siteOrders.id, orderId), sql`strpos(coalesce(${siteOrders.notes}, ''), ${motivo}::text) = 0`));
  } catch (e) { console.error(`[review-note] pedido ${orderId}: falhou:`, safeErr(e)); }
}

/** Telefone para log: só os 4 últimos dígitos. */
export const maskPhone = (p: string | null | undefined) => `***${(p ?? '').replace(/\D/g, '').slice(-4)}`;

export async function bumpCouponUsage(code: string | null | undefined, delta: 1 | -1, orderId?: number): Promise<void> {
  if (!code) return;
  try {
    if (delta > 0) {
      // Conditional increment: `used_count` can never pass `max_uses`, even when
      // several confirmations for the same coupon land at once. Without the
      // WHERE clause, concurrent webhook/reconcile confirmations each read the
      // old count and the counter drifts past the limit.
      const bumped = await ordersDb.update(coupons)
        .set({ usedCount: sql`used_count + 1` })
        .where(and(
          eq(coupons.code, code),
          sql`(${coupons.maxUses} IS NULL OR ${coupons.usedCount} < ${coupons.maxUses})`,
        ))
        .returning({ id: coupons.id });
      if (bumped.length === 0) {
        console.warn(`[coupon] ${code} already at max_uses — discount was granted but the counter was not bumped`);
        if (orderId) await appendReviewNote(orderId, `cupom ${code} acima do limite de usos`);
      }
    } else {
      await ordersDb.update(coupons)
        .set({ usedCount: sql`GREATEST(used_count - 1, 0)` })
        .where(eq(coupons.code, code));
    }
  } catch (e) { console.error('[coupon] usage bump failed:', safeErr(e)); }
}

// Server-side Meta Conversions API (CAPI) Purchase — iOS/adblock-proof, fired on
// CONFIRMED payment with the same event_id as the browser pixel (dedup). No-ops
// (with one log line) unless FB_CAPI_TOKEN is configured. PII is SHA-256 hashed per
// Meta's spec; client_ip_address, client_user_agent, fbp and fbc go RAW (never hashed).
const sha = (v: string) => crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex');
const semAcento = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function buildCapiPurchasePayload(order: SiteOrder, eventTimeMs: number = Date.now()) {
  const user_data: Record<string, unknown> = {};
  const phoneDigits = order.customerPhone.replace(/\D/g, '');
  if (phoneDigits) {
    const withDdi = phoneDigits.startsWith('55') ? phoneDigits : `55${phoneDigits}`;
    user_data.ph = [sha(withDdi)];
    user_data.external_id = [sha(phoneDigits)];
  }
  if (order.customerEmail && order.customerEmail.includes('@')) user_data.em = [sha(order.customerEmail)];
  if (order.customerName) {
    const parts = order.customerName.trim().split(/\s+/);
    user_data.fn = [sha(parts[0])];
    if (parts.length > 1) user_data.ln = [sha(parts[parts.length - 1])];
  }
  const uf = (order.state ?? '').trim().toLowerCase();
  if (/^[a-z]{2}$/.test(uf)) user_data.st = [sha(uf)];
  const ct = semAcento(order.city ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ct) user_data.ct = [sha(ct)];
  const cep = (order.postalCode ?? '').replace(/\D/g, '');
  if (cep) user_data.zp = [sha(cep)];
  user_data.country = [sha('br')];
  if (order.clientIp) user_data.client_ip_address = order.clientIp;
  if (order.clientUa) user_data.client_user_agent = order.clientUa;
  if (order.fbp) user_data.fbp = order.fbp;
  if (order.fbc) user_data.fbc = order.fbc;
  else if (order.fbclid) {
    // Sintetizado a partir do fbclid: o instante é o do clique/pedido, não o de agora.
    user_data.fbc = `fb.1.${new Date(order.createdAt).getTime()}.${order.fbclid}`;
  }
  return {
    event_name: 'Purchase',
    event_time: Math.floor(eventTimeMs / 1000),
    event_id: `purchase-${order.id}`,
    action_source: 'website',
    event_source_url: STORE_URL,
    user_data,
    custom_data: {
      currency: 'BRL',
      value: parseFloat(order.totalPrice ?? '0'),
      content_ids: ['salvita-001'],
      content_type: 'product',
      order_id: String(order.id),
    },
  };
}

export async function sendCapiPurchase(order: SiteOrder): Promise<void> {
  const token = process.env.FB_CAPI_TOKEN;
  const pixelId = process.env.FB_PIXEL_ID || '2209017296169541';
  if (!token) { console.warn(`[capi] FB_CAPI_TOKEN not configured — Purchase for order ${order.id} not sent`); return; }
  try {
    const event = buildCapiPurchasePayload(order);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event] }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!r.ok) {
      // Só status + código do erro da Meta: o corpo pode ecoar dados do usuário.
      const j = await r.json().catch(() => null) as { error?: { code?: number; type?: string } } | null;
      console.error('[capi] Purchase failed', r.status, j?.error?.code ?? '', j?.error?.type ?? '');
    }
    else console.log(`[capi] Purchase sent for order ${order.id}`);
  } catch (e) { console.error('[capi] error:', safeErr(e)); }
}

// Sends to BOTH 9th-digit variants IN PARALLEL — wa-server blindly returns
// success:true so we can't detect which variant is the real JID. Sending both
// guarantees delivery as long as one format matches WhatsApp registration.
export async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  const waUrl = process.env.WA_SERVER_URL || 'https://evolution.salvitarn.com.br';
  const waKey = process.env.WA_API_KEY;
  if (!waKey) { console.warn('[wa] WA_API_KEY not configured — skipping WhatsApp send'); return false; }
  const digits = phone.replace(/\D/g, '');
  const primary = digits.startsWith('55') ? digits : `55${digits}`;
  const alt = primary.length === 13
    ? primary.slice(0, 4) + primary.slice(5)
    : primary.length === 12 ? primary.slice(0, 4) + '9' + primary.slice(4) : null;
  const variants = [primary, alt].filter(Boolean) as string[];
  const results = await Promise.all(variants.map(async phoneNum => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 9000);
    try {
      const r = await fetch(`${waUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': waKey },
        body: JSON.stringify({ phone: phoneNum, message }),
        signal: ac.signal,
      });
      clearTimeout(timer);
      if (!r.ok) { console.warn(`[wa] send to ${maskPhone(phoneNum)} failed: HTTP ${r.status}`); return false; }
      let body: Record<string, unknown> = {};
      try { body = await r.json() as Record<string, unknown>; } catch {}
      if (body.success === false) { console.warn(`[wa] send to ${maskPhone(phoneNum)} failed: success=false`); return false; }
      console.log(`[wa] dispatched to ${maskPhone(phoneNum)}`);
      return true;
    } catch { clearTimeout(timer); console.warn(`[wa] send to ${maskPhone(phoneNum)} failed: network/timeout`); return false; }
  }));
  return results.some(Boolean);
}

// Runs every side effect of a confirmed payment: bumps the coupon, fires the
// server-side Purchase CAPI event, cancels pending recovery automations, marks
// the abandoned cart as converted, and sends the WhatsApp + email confirmation.
// Shared by the MP webhook, the awaiting-orders reconciliation cron, and the
// admin's manual "Confirmar Pgto" action — all three mark a payment as
// confirmed and must produce the same customer-facing result.
export async function confirmOrderPaid(order: SiteOrder): Promise<void> {
  // Cada passo tem o seu try/catch: o pedido já está 'confirmed' quando chegamos
  // aqui, então ninguém refaz esta função — um passo que falha não pode impedir
  // os seguintes.
  try { await bumpCouponUsage(order.couponCode, 1, order.id); }
  catch (e) { console.error(`[order-confirmation] pedido ${order.id}: cupom falhou:`, safeErr(e)); }
  try { await sendCapiPurchase(order); }
  catch (e) { console.error(`[order-confirmation] pedido ${order.id}: CAPI falhou:`, safeErr(e)); }

  const phone = order.customerPhone.replace(/\D/g, '');
  try {
    await ordersDb.update(automationRuns)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(and(eq(automationRuns.customerPhone, phone), eq(automationRuns.status, 'scheduled')));
  } catch (e) { console.error(`[order-confirmation] pedido ${order.id}: cancelar automações falhou:`, safeErr(e)); }
  try {
    await ordersDb.update(abandonedCarts)
      .set({ status: 'converted', recovered: true, convertedAt: new Date(), updatedAt: new Date() })
      .where(eq(abandonedCarts.customerPhone, phone));
  } catch (e) { console.error(`[order-confirmation] pedido ${order.id}: converter carrinho falhou:`, safeErr(e)); }

  let msg: string | null = null;
  try {
    const [tpl] = await ordersDb.select().from(msgTemplates)
      .where(and(eq(msgTemplates.type, 'confirmed'), eq(msgTemplates.isDefault, true))).limit(1);
    const vars = { nome: order.customerName, pedido: String(order.id), valor: brl(order.totalPrice) };
    msg = tpl
      ? renderTemplate(tpl.body, vars)
      : `Olá *${order.customerName}*! 🎉\n\nSeu pagamento foi *confirmado*! ✅\n\n📦 Pedido *#${order.id}* — R$ ${brl(order.totalPrice)}\n\nJá estamos preparando seu envio. Você receberá o código de rastreio assim que postarmos. 🚚\n\nObrigado por escolher a Sal Vita! 🌊\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_`;
  } catch (e) { console.error(`[order-confirmation] pedido ${order.id}: template falhou:`, safeErr(e)); }

  // await: a função serverless pode ser congelada logo após o res.json()
  if (msg) {
    try { await sendWhatsApp(order.customerPhone, msg); }
    catch (e) { console.error(`[order-confirmation] pedido ${order.id}: WhatsApp falhou:`, safeErr(e)); }
  }
  if (order.customerEmail) {
    try {
      const emailHtml = orderConfirmedHtml(order.customerName, order.id, brl(order.totalPrice));
      await sendEmail(order.customerEmail, `Pedido #${order.id} confirmado — obrigado, ${order.customerName}!`, emailHtml);
    } catch (e) { console.error(`[order-confirmation] pedido ${order.id}: e-mail falhou:`, safeErr(e)); }
  }


  // Etiqueta automática (último passo: nada acima depende dela). Limite de 20 s para nunca
  // segurar a resposta ao Mercado Pago; o que não terminar a rodada diária do meio-dia refaz.
  try {
    const { autoGenerateLabels } = await import('../routers/shipping');
    await Promise.race([autoGenerateLabels({ orderId: order.id }), new Promise(r => setTimeout(r, 20_000))]);
  } catch (e) { console.error(`[order-confirmation] pedido ${order.id}: etiqueta automática falhou:`, e); }
}

// Estados de pagamento em que um pagamento aprovado confirma o pedido. 'failed'
// entra porque o cliente pode pagar um PIX depois de um cartão recusado.
export const CONFIRMABLE_PAYMENT_STATUSES = ['awaiting', 'failed'] as const;

/**
 * Condição SQL de "este pedido ainda pode ser confirmado por um pagamento aprovado":
 * 'awaiting' ou 'failed', e só se o pedido NÃO foi cancelado (o cancelamento manual deixa
 * 'awaiting'; cancelar por estorno grava 'failed' — um PIX pago depois do cancelamento não
 * pode ressuscitar o pedido).
 */
export const podeConfirmarPagamento = and(
  ne(siteOrders.status, 'cancelled'),
  or(eq(siteOrders.paymentStatus, 'awaiting'), eq(siteOrders.paymentStatus, 'failed')),
);
