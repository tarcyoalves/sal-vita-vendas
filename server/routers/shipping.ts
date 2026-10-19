import { safeErr } from '../lib/logSafe';
import { z } from 'zod';
import { decideLabelStep, RESUME_MIN_AGE_MS } from '../lib/labelResume';
import crypto from 'crypto';
import { router, publicProcedure, premiumAdminProcedure } from '../trpc';
import { ordersDb as db } from '../db/ordersDb';
import { siteOrders, coupons, msgTemplates } from '../db/schema';
import { desc, eq, and, or, ne, gte, isNull, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { STORE_URL } from '../lib/storeUrl';
import { filterAllowedCarriersSorted } from '../lib/shippingFilter';
import {
  trackingLink, fetchMeTracking, pickTrackingCode, decideTrackingUpdate, isRecentEvent, OCCURRENCE_EVENTS,
  fetchMeBalance, isBalanceError, eligibleForAutoLabel,
  type MeTrackingInfo, type ShippingEvent,
} from '../lib/meTracking';
import { sendEmail, shippingUpdateEmail } from '../email/resend';
import { confirmOrderPaid, appendReviewNote } from '../lib/orderConfirmation';
import { quantidadeValida, cupomAtendeMinimo, acharPedidoDuplicado, mesmosDadosDoPedido, IDEMPOTENCIA_PEDIDO_MS } from '../lib/paymentTransition';

/** Erro do MP para log: só status + código/mensagem curta do `error`/`message`, nunca o corpo inteiro (pode ter dados do pagador). */
async function mpErrorTag(res: Response): Promise<string> {
  const j = await res.json().catch(() => null) as { error?: unknown; message?: unknown } | null;
  const pick = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : '');
  return `${res.status} ${pick(j?.error)} ${pick(j?.message)}`.trim();
}

const ME_BASE = 'https://melhorenvio.com.br';
const ORIGIN_CEP = process.env.MELHOR_ENVIO_ORIGIN_CEP ?? '59615200';
// Remetente impresso nas etiquetas do Melhor Envio (pedido do dono em 14/10/2026).
// Sem `district` a etiqueta saía com "null" no bairro.
export const SENDER_ADDRESS = {
  address: 'Rua Francisco Moura Filho',
  number: '705',
  district: 'Santa Delmira',
  postalCode: '59615200',
} as const;
// Dimensions in cm — 1kg TBD by owner, 10kg box confirmed
const PKG_1KG  = { height: 7,  width: 15, length: 24 };
const PKG_3KG  = { height: 14, width: 18, length: 26 };
const PKG_10KG = { height: 21, width: 24, length: 27 };

/**
 * Single source of truth for the storefront catalog. Everything that used to be
 * derived from a bare `quantity` — price, gross shipping weight, box dimensions —
 * now comes from here, so the quote, the order and the shipping label can never
 * disagree.
 *
 * `grossWeightKg` is the REAL packed weight (product + packaging), matching the
 * landing page's `weightKg`. The old `qty * 1.05` formula understated the trio by
 * 0.45kg and the box by 1.5kg, which under-quoted the customer AND under-bought
 * the label — the difference surfaced at the Correios scale.
 */
export type ProductId = '1kg' | '3kg' | 'caixa';
export const CATALOG: Record<ProductId, {
  name: string;
  price: number;
  kgPerUnit: number;
  grossWeightKg: number;
  pkg: { height: number; width: number; length: number };
}> = {
  '1kg':   { name: 'Sal Marinho Integral 1kg',        price: 29.90,  kgPerUnit: 1,  grossWeightKg: 1.0,  pkg: PKG_1KG  },
  '3kg':   { name: 'Trio Sal Vita 3kg (3×1kg)',      price: 74.90,  kgPerUnit: 3,  grossWeightKg: 3.0,  pkg: PKG_3KG  },
  'caixa': { name: 'Caixa Sal Vita 10kg (10×1kg)',   price: 149.90, kgPerUnit: 10, grossWeightKg: 10.0, pkg: PKG_10KG },
};

function isProductId(v: unknown): v is ProductId {
  return v === '1kg' || v === '3kg' || v === 'caixa';
}

/**
 * Resolve the catalog entry for a request. Prefers the explicit productId; falls
 * back to inferring from the kg quantity for older clients (and for the admin's
 * manually-created orders) that don't send one.
 */
function resolveProduct(productId?: string | null, qty?: number | null): ProductId {
  if (isProductId(productId)) return productId;
  const q = qty ?? 1;
  if (q >= 10) return 'caixa';
  if (q >= 3)  return '3kg';
  return '1kg';
}

/** Gross weight in kg for a given product and number of packs of that product. */
function shipWeight(product: ProductId, packs: number): number {
  return +(Math.max(1.0, CATALOG[product].grossWeightKg * Math.max(1, packs))).toFixed(2);
}

function renderTpl(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// Best-effort WhatsApp send via the Baileys wa-server on the VPS (non-throwing).
async function sendWhatsAppMsg(phone: string | null | undefined, message: string): Promise<boolean> {
  const url = process.env.WA_SERVER_URL || 'https://evolution.salvitarn.com.br';
  const key = process.env.WA_API_KEY;
  if (!key || !phone) { console.warn('[wa] WA_API_KEY or phone not configured — skipping'); return false; }
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return false;
  const fmt = digits.startsWith('55') ? digits : `55${digits}`;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(`${url}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key },
      body: JSON.stringify({ phone: fmt, message }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    return r.ok;
  } catch { return false; }
}

const ORDER_PAGE_URL = () => `${STORE_URL}/meu-pedido`;

type NotifiableOrder = { id: number; customerName: string; customerPhone: string | null; customerEmail?: string | null; trackingCode?: string | null };

/**
 * Avisa o cliente de um evento de envio, SÓ por e-mail: o dono não quer avisos de envio
 * pelo WhatsApp (número não oficial, risco de banimento — decisão de 15/10/2026).
 * Cliente sem e-mail não recebe aviso automático; acompanha pelo /meu-pedido.
 * Devolve 'email', ou null se nada saiu.
 */
export async function notifyShippingEvent(order: NotifiableOrder, event: ShippingEvent): Promise<'email' | null> {
  if (!order.customerEmail) return null;
  const code = order.trackingCode ?? null;
  const link = code ? trackingLink(code) : null;
  const { subject, html } = shippingUpdateEmail(event, order.customerName, order.id, code, link, ORDER_PAGE_URL());
  const r = await sendEmail(order.customerEmail, subject, html);
  if (r.ok) return 'email';
  console.warn(`[shipping-event] e-mail "${event}" do pedido ${order.id} não saiu (${r.reason})`);
  return null;
}

/**
 * Trava de "um aviso por pedido e evento": só quem insere a linha avisa. Se a tabela
 * ainda não existir (migração não rodou), devolve false — melhor não avisar do que avisar
 * em dobro.
 */
async function claimShippingEvent(orderId: number, event: ShippingEvent, occurredAt: string | null): Promise<boolean> {
  try {
    const rows = await db.execute(sql`
      INSERT INTO shipping_events (order_id, event, occurred_at)
      VALUES (${orderId}, ${event}, ${occurredAt ? occurredAt : null}::timestamp)
      ON CONFLICT DO NOTHING
      RETURNING order_id
    `);
    const list = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
    return Array.isArray(list) && list.length > 0;
  } catch (e) {
    console.error(`[shipping-event] trava do pedido ${orderId}/${event} indisponível:`, (e as Error)?.message);
    return false;
  }
}

async function markShippingEvent(orderId: number, event: ShippingEvent, notified: string): Promise<void> {
  try { await db.execute(sql`UPDATE shipping_events SET notified = ${notified} WHERE order_id = ${orderId} AND event = ${event}`); }
  catch { /* só registro */ }
}

async function releaseShippingEvent(orderId: number, event: ShippingEvent): Promise<void> {
  try { await db.execute(sql`DELETE FROM shipping_events WHERE order_id = ${orderId} AND event = ${event}`); }
  catch { /* a próxima consulta não reenvia; fica registrado no log */ }
}

/** Último evento de ocorrência do pedido (para o /meu-pedido). Nunca lança. */
export async function latestShippingOccurrence(orderId: number): Promise<ShippingEvent | null> {
  try {
    const rows = await db.execute(sql`
      SELECT event FROM shipping_events
      WHERE order_id = ${orderId} AND event IN ('undelivered', 'paused', 'suspended')
      ORDER BY created_at DESC LIMIT 1
    `);
    const list = ((rows as unknown as { rows?: Array<{ event: string }> }).rows ?? (rows as unknown as Array<{ event: string }>));
    return (Array.isArray(list) && list[0]?.event as ShippingEvent) || null;
  } catch { return null; }
}

/** Aplica um rastreio do Melhor Envio a um pedido: código, status e o aviso do evento (uma vez). */
export async function applyMeTracking(
  order: typeof siteOrders.$inferSelect,
  info: MeTrackingInfo,
): Promise<{ status: string | null; event: ShippingEvent | null; notified: string | null }> {
  const d = decideTrackingUpdate(order, info);
  let current = order;
  if (d.status || d.trackingCode) {
    const set: Partial<typeof siteOrders.$inferInsert> = { updatedAt: new Date() };
    if (d.trackingCode) set.trackingCode = d.trackingCode;
    if (d.status) set.status = d.status;
    const [updated] = await db.update(siteOrders).set(set)
      .where(and(eq(siteOrders.id, order.id), eq(siteOrders.status, order.status!)))
      .returning();
    if (!updated) return { status: null, event: null, notified: null }; // outro processo mexeu no pedido
    current = updated;
  }
  if (!d.event) return { status: d.status, event: null, notified: null };

  const occurredAt = d.event === 'delivered' ? info.delivered_at ?? null : d.event === 'posted' ? info.posted_at ?? null : null;
  if (!(await claimShippingEvent(order.id, d.event, occurredAt))) return { status: d.status, event: d.event, notified: null };

  if (OCCURRENCE_EVENTS.includes(d.event)) {
    await appendReviewNote(order.id, `Entrega com ocorrência no Melhor Envio: ${d.event}`);
  }
  if (!isRecentEvent(info, d.event)) {
    await markShippingEvent(order.id, d.event, 'antigo');
    return { status: d.status, event: d.event, notified: 'antigo' };
  }
  if (!current.customerEmail) {
    // Sem e-mail não há aviso (WhatsApp desligado para envio): registra para não tentar todo dia.
    await markShippingEvent(order.id, d.event, 'sem-email');
    return { status: d.status, event: d.event, notified: 'sem-email' };
  }
  let channel: 'email' | null = null;
  try { channel = await notifyShippingEvent(current, d.event); }
  catch (e) { console.error(`[shipping-event] aviso ${d.event} do pedido ${order.id} falhou:`, safeErr(e)); }
  if (!channel) {
    // Nada saiu (sem e-mail, cota do dia, falha de rede): libera a trava para tentar de novo.
    await releaseShippingEvent(order.id, d.event);
    return { status: d.status, event: d.event, notified: null };
  }
  await markShippingEvent(order.id, d.event, channel);
  return { status: d.status, event: d.event, notified: channel };
}

/** Grava o código de rastreio logo após gerar a etiqueta, se o Melhor Envio já o tiver. Nunca lança. */
async function fillTrackingCodeAfterLabel(orderId: number, meOrderId: string, token: string): Promise<string | null> {
  try {
    const map = await fetchMeTracking([meOrderId], token);
    const code = map[meOrderId] ? pickTrackingCode(map[meOrderId]) : null;
    if (code) {
      await db.update(siteOrders).set({ trackingCode: code, updatedAt: new Date() })
        .where(and(eq(siteOrders.id, orderId), isNull(siteOrders.trackingCode)));
    }
    return code;
  } catch (e) {
    console.warn(`[me-tracking] código do pedido ${orderId} ainda indisponível:`, (e as Error)?.message);
    return null;
  }
}

/**
 * Cron diário (rede de segurança do webhook): consulta o rastreio de todos os pedidos
 * com etiqueta ainda não entregues e aplica cada um com applyMeTracking.
 */
export async function syncMeTracking(): Promise<{ checked: number; shipped: number; delivered: number; notified: number }> {
  const result = { checked: 0, shipped: 0, delivered: 0, notified: 0 };
  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) { console.warn('[me-tracking] MELHOR_ENVIO_TOKEN ausente — rastreio não sincronizado'); return result; }

  const orders = await db.select().from(siteOrders).where(and(
    or(eq(siteOrders.status, 'label_generated'), eq(siteOrders.status, 'shipped')),
    sql`${siteOrders.meOrderId} IS NOT NULL`,
  )).orderBy(desc(siteOrders.updatedAt)).limit(100);
  if (!orders.length) return result;

  const map = await fetchMeTracking(orders.map(o => o.meOrderId!), token);
  for (const order of orders) {
    const info = map[order.meOrderId!];
    if (!info) continue;
    result.checked++;
    const r = await applyMeTracking(order, info);
    if (r.status === 'shipped') result.shipped++;
    if (r.status === 'delivered') result.delivered++;
    if (r.notified === 'email') result.notified++;
  }
  return result;
}

/** Webhook do Melhor Envio: um evento de uma etiqueta. Devolve o que foi feito (para log). */
export async function handleMeWebhookEvent(payload: { event?: string; data?: MeTrackingInfo }): Promise<string> {
  const data = payload?.data;
  if (!data?.id) return 'sem id';
  const [order] = await db.select().from(siteOrders).where(eq(siteOrders.meOrderId, data.id)).limit(1);
  if (!order) return 'etiqueta sem pedido da loja';
  const status = data.status ?? payload.event ?? null;
  const r = await applyMeTracking(order, { ...data, status });
  return `pedido ${order.id}: status=${r.status ?? '-'} evento=${r.event ?? '-'} aviso=${r.notified ?? '-'}`;
}

/**
 * Compra e gera a etiqueta do Melhor Envio para um pedido pago. Usada pelo botão do painel
 * e pela geração automática após o pagamento. Lança TRPCError em qualquer recusa.
 */
async function generateLabelForOrder(orderId: number) {
      const token = process.env.MELHOR_ENVIO_TOKEN;
      if (!token) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Configure MELHOR_ENVIO_TOKEN no painel Vercel' });

      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, orderId));
      const order = orders[0];
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      // Never spend a paid shipping label on an order that hasn't been paid for
      // (or was refunded/cancelled). Avoids shipping cost on unpaid/charged-back orders.
      if (order.paymentStatus !== 'confirmed') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Pagamento não confirmado — não é possível gerar etiqueta para este pedido.' });
      }

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SalVita/1.0 (contato@salvitarn.com.br)',
        'Accept': 'application/json',
      };

      const serviceIdNum = order.shippingServiceId ? parseInt(order.shippingServiceId, 10) : NaN;
      if (isNaN(serviceIdNum)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `ID de serviço de frete inválido: "${order.shippingServiceId}". Edite o pedido e selecione um serviço válido.` });
      }
      const serviceId = serviceIdNum;
      // Derive weight/dimensions/declared value from the catalog entry actually
      // sold. The old `quantity * 1.05` shipped a 12kg box declared at 10.5kg and
      // a 3.6kg trio declared at 3.15kg, in a 1kg-sized carton.
      const labelProduct = resolveProduct(null, order.quantity);
      const labelPacks = Math.max(1, Math.round(order.quantity / CATALOG[labelProduct].kgPerUnit));
      const labelPkg = CATALOG[labelProduct].pkg;
      const weight = shipWeight(labelProduct, labelPacks);
      const declaredUnitPrice = parseFloat(order.unitPrice ?? String(CATALOG[labelProduct].price));
      const declaredValue = parseFloat(order.totalPrice ?? String(declaredUnitPrice * labelPacks));

      const cartBody = {
        service: serviceId,
        from: {
          name: 'Sal Vita',
          phone: '84214082120',
          email: 'contato@salvitarn.com.br',
          postal_code: SENDER_ADDRESS.postalCode,
          address: SENDER_ADDRESS.address,
          number: SENDER_ADDRESS.number,
          district: SENDER_ADDRESS.district,
          city: 'Mossoró',
          state_abbr: 'RN',
          country_id: 'BR',
        },
        to: {
          name: order.customerName,
          phone: order.customerPhone.replace(/\D/g,''),
          email: order.customerEmail ?? 'cliente@salvitarn.com.br',
          document: order.customerCpf ? order.customerCpf.replace(/\D/g,'') : undefined,
          postal_code: order.postalCode,
          address: order.address,
          number: order.number,
          complement: order.complement ?? '',
          district: order.neighborhood,
          city: order.city,
          state_abbr: order.state,
          country_id: 'BR',
        },
        volumes: [{ ...labelPkg, weight }],
        options: {
          insurance_value: declaredValue,
          receipt: false,
          own_hand: false,
          non_commercial: false,
        },
        products: [{
          name: order.product ?? CATALOG[labelProduct].name,
          quantity: labelPacks,
          unitary_value: declaredUnitPrice,
        }],
      };

      // Retomada: checkout do ME já pago (me_order_id real) mas sem URL da etiqueta —
      // não refaz cart/checkout (cobraria de novo), só generate + print.
      const step = decideLabelStep(order, new Date());
      if (step === 'done' || step === 'busy') throw new TRPCError({ code: 'CONFLICT', message: LABEL_BUSY_MSG });
      const resume = step === 'resume';
      if (!(resume ? await claimResume(orderId, order.meOrderId!) : await reserveLabel(orderId))) {
        throw new TRPCError({ code: 'CONFLICT', message: LABEL_BUSY_MSG });
      }
      let purchased = resume;
      try {
        let meOrderId: string;
        if (resume) {
          meOrderId = order.meOrderId!;
        } else {
          const cartRes = await fetch(`${ME_BASE}/api/v2/me/cart`, { method: 'POST', headers, body: JSON.stringify(cartBody), signal: AbortSignal.timeout(8000) });
          if (!cartRes.ok) {
            const txt = await cartRes.text();
            throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro cart ME: ${txt}` });
          }
          const cartData = await cartRes.json();
          meOrderId = cartData.id;

          let checkRes: Response;
          try {
            checkRes = await fetch(`${ME_BASE}/api/v2/me/shipment/checkout`, {
              method: 'POST', headers, body: JSON.stringify({ orders: [meOrderId] }),
            });
            if (!checkRes.ok) {
              const txt = await checkRes.text();
              throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro checkout ME: ${txt}` });
            }
          } catch (err) {
            // Attempt to cancel the dangling ME cart order (best-effort)
            try {
              await fetch(`${ME_BASE}/api/v2/me/cart/${meOrderId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'SalVita/1.0 (contato@salvitarn.com.br)' },
                signal: AbortSignal.timeout(8000),
              });
            } catch {} // best-effort cancel
            throw err; // re-throw original error
          }
          purchased = true; // etiqueta paga: a reserva NÃO pode mais ser liberada, nem se o UPDATE abaixo falhar
          // Persist meOrderId right after checkout succeeds (label is now paid) so it can be
          // cancelled/reprinted later even if generate/print below fails.
          await db.update(siteOrders).set({ meOrderId, updatedAt: new Date() }).where(eq(siteOrders.id, orderId));
        }

        const genRes = await fetch(`${ME_BASE}/api/v2/me/shipment/generate`, {
          method: 'POST', headers, body: JSON.stringify({ orders: [meOrderId] }), signal: AbortSignal.timeout(8000),
        });
        if (!genRes.ok) {
          const txt = await genRes.text();
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro gerar etiqueta ME: ${txt}` });
        }

        const printRes = await fetch(`${ME_BASE}/api/v2/me/shipment/print`, {
          method: 'POST', headers, body: JSON.stringify({ orders: [meOrderId], mode: 'private' }), signal: AbortSignal.timeout(8000),
        });
        if (!printRes.ok) {
          const txt = await printRes.text();
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro imprimir etiqueta ME: ${txt}` });
        }
        const printData = await printRes.json();
        const labelUrl: string = printData.url;

        // Label generated but NOT yet physically posted — use 'label_generated' so the
        // "Pendentes Envio" admin tab works and we don't tell the customer it shipped early.
        const [updated] = await db.update(siteOrders)
          .set({ meOrderId, meLabelUrl: labelUrl, status: 'label_generated', updatedAt: new Date() })
          .where(eq(siteOrders.id, orderId))
          .returning();
        const code = await fillTrackingCodeAfterLabel(orderId, meOrderId, token);
        if (code && updated && !updated.trackingCode) updated.trackingCode = code;

      return { labelUrl, meOrderId, order: updated };
      } catch (err) {
        // Falha antes do checkout (nada foi cobrado): libera a reserva para nova tentativa.
        if (!purchased) await releaseLabel(orderId);
        throw err;
      }
}

const ALERT_EMAIL = () => process.env.ALERT_EMAIL || 'contato@salvitarn.com.br';
const brlFmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Um aviso por dia por assunto (tabela shipping_events, order_id 0). */
async function claimDailyAlert(topic: string): Promise<boolean> {
  const key = `${topic}-${new Date().toISOString().slice(0, 10)}`;
  try {
    const rows = await db.execute(sql`INSERT INTO shipping_events (order_id, event) VALUES (0, ${key}) ON CONFLICT DO NOTHING RETURNING order_id`);
    const list = (rows as unknown as { rows?: unknown[] }).rows ?? (rows as unknown as unknown[]);
    return Array.isArray(list) && list.length > 0;
  } catch { return false; }
}

async function alertOwner(subject: string, lines: string[]): Promise<void> {
  const html = `<p style="font-family:system-ui,Arial,sans-serif;font-size:15px;line-height:1.6">${lines.map(l => l.replace(/</g, '&lt;')).join('<br/>')}</p>`;
  const r = await sendEmail(ALERT_EMAIL(), subject, html);
  if (!r.ok) console.warn(`[auto-label] alerta "${subject}" não saiu (${r.reason})`);
}

/**
 * Gera sozinha a etiqueta dos pedidos pagos (rodada diária e logo após cada pagamento).
 * Travas: só pago e não cancelado, sem etiqueta, com frete válido, de até 14 dias; confere o
 * saldo do Melhor Envio antes de comprar; no máximo 10 por rodada. Falha vira aviso por e-mail
 * (uma vez por dia por assunto) e linha [REVISAR] no pedido — nunca derruba o resto.
 */
export async function autoGenerateLabels(opts: { orderId?: number } = {}): Promise<{ considered: number; generated: number; failed: number; lowBalance: boolean }> {
  const out = { considered: 0, generated: 0, failed: 0, lowBalance: false };
  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) { console.warn('[auto-label] MELHOR_ENVIO_TOKEN ausente'); return out; }

  const base = and(
    eq(siteOrders.paymentStatus, 'confirmed'), eq(siteOrders.status, 'confirmed'),
    isNull(siteOrders.meOrderId), sql`${siteOrders.shippingServiceId} IS NOT NULL`,
  );
  const rows = await db.select().from(siteOrders)
    .where(opts.orderId ? and(base, eq(siteOrders.id, opts.orderId)) : base)
    .orderBy(siteOrders.id).limit(10);
  const orders = rows.filter(o => eligibleForAutoLabel(o));
  if (!orders.length) return out;

  let balance = await fetchMeBalance(token);
  for (const order of orders) {
    out.considered++;
    const price = parseFloat(order.shippingPrice ?? '0') || 0;
    if (balance !== null && balance < price) {
      out.lowBalance = true;
      out.failed++;
      if (await claimDailyAlert('saldo')) {
        await alertOwner('Saldo do Melhor Envio insuficiente para gerar etiquetas', [
          `Há pedidos pagos esperando etiqueta, mas o saldo do Melhor Envio é R$ ${brlFmt(balance)} e a próxima etiqueta custa cerca de R$ ${brlFmt(price)} (pedido #${order.id}).`,
          'Recarregue o saldo em melhorenvio.com.br. As etiquetas saem sozinhas na próxima rodada (meio-dia) ou ao tocar em "Imprimir Etiqueta" no painel.',
        ]);
      }
      break; // sem saldo para este, os próximos pedidos esperam a recarga
    }
    try {
      await generateLabelForOrder(order.id);
      out.generated++;
      if (balance !== null) balance -= price;
      await db.execute(sql`INSERT INTO shipping_events (order_id, event, notified) VALUES (${order.id}, 'label-auto', 'ok') ON CONFLICT DO NOTHING`).catch(() => {});
    } catch (e) {
      out.failed++;
      const msg = String((e as { message?: string })?.message ?? e).slice(0, 160);
      console.error(`[auto-label] pedido ${order.id} falhou:`, msg);
      if (isBalanceError(msg)) {
        out.lowBalance = true;
        if (await claimDailyAlert('saldo')) {
          await alertOwner('Saldo do Melhor Envio acabou: etiquetas pendentes', [
            `O Melhor Envio recusou a compra da etiqueta do pedido #${order.id} por falta de saldo.`,
            'Recarregue o saldo em melhorenvio.com.br; as etiquetas saem sozinhas na próxima rodada.',
          ]);
        }
        break;
      }
      await appendReviewNote(order.id, `Etiqueta automática falhou: ${msg}`);
      if (await claimDailyAlert(`falha-${order.id}`)) {
        await alertOwner(`Etiqueta automática do pedido #${order.id} falhou`, [
          `Motivo: ${msg}`,
          'Abra o pedido no painel e use "Imprimir Etiqueta" depois de corrigir o que for preciso (endereço, serviço de frete).',
        ]);
      }
    }
  }
  return out;
}

/** O que a geração automática fez nos últimos 7 dias, para o painel. Nunca lança. */
export async function autoLabelReport() {
  try {
    const done = await db.execute(sql`
      SELECT e.order_id AS id, e.created_at AS at, o.customer_name AS name, o.tracking_code AS code, o.me_label_url AS url
      FROM shipping_events e JOIN site_orders o ON o.id = e.order_id
      WHERE e.event = 'label-auto' AND e.created_at > NOW() - INTERVAL '7 days'
      ORDER BY e.created_at DESC LIMIT 20`);
    const pending = await db.execute(sql`
      SELECT id, customer_name AS name, notes FROM site_orders
      WHERE payment_status = 'confirmed' AND status = 'confirmed' AND me_order_id IS NULL
        AND created_at > NOW() - INTERVAL '14 days'
      ORDER BY id LIMIT 20`);
    const rows = (r: unknown) => ((r as { rows?: unknown[] }).rows ?? r) as Array<Record<string, unknown>>;
    return {
      generated: rows(done).map(r => ({ id: Number(r.id), at: String(r.at), name: String(r.name), code: r.code ? String(r.code) : null, url: r.url ? String(r.url) : null })),
      waiting: rows(pending).map(r => {
        const notes = String(r.notes ?? '');
        const m = notes.split(/\r?\n/).reverse().find(l => l.includes('Etiqueta automática falhou'));
        return { id: Number(r.id), name: String(r.name), problem: m ? m.replace(/^.*Etiqueta automática falhou:\s*/, '') : null };
      }),
    };
  } catch (e) {
    console.error('[auto-label] relatório falhou:', (e as Error)?.message);
    return { generated: [], waiting: [] };
  }
}

const STATIC_REGIONS: Record<string, { pac:[number,string]; sedex:[number,string] }> = {
  RN:{pac:[14,'3–5'],sedex:[27,'1–2']}, CE:{pac:[15,'3–5'],sedex:[28,'1–2']},
  PB:{pac:[15,'4–6'],sedex:[29,'1–3']}, PE:{pac:[16,'4–6'],sedex:[30,'2–3']},
  AL:{pac:[16,'4–7'],sedex:[31,'2–3']}, SE:{pac:[17,'5–7'],sedex:[32,'2–3']},
  BA:{pac:[18,'5–8'],sedex:[33,'2–3']}, MA:{pac:[18,'5–8'],sedex:[34,'2–3']},
  PI:{pac:[17,'4–7'],sedex:[32,'2–3']}, SP:{pac:[22,'6–9'],sedex:[40,'2–4']},
  RJ:{pac:[22,'6–9'],sedex:[40,'2–4']}, MG:{pac:[20,'5–8'],sedex:[38,'2–4']},
  ES:{pac:[21,'6–9'],sedex:[39,'2–4']}, PR:{pac:[24,'7–10'],sedex:[44,'3–5']},
  SC:{pac:[25,'8–11'],sedex:[46,'3–5']}, RS:{pac:[26,'8–12'],sedex:[48,'3–5']},
  DF:{pac:[22,'6–9'],sedex:[42,'2–4']}, GO:{pac:[21,'6–10'],sedex:[41,'2–4']},
  MT:{pac:[26,'8–12'],sedex:[48,'3–5']}, MS:{pac:[24,'7–11'],sedex:[45,'3–5']},
  AM:{pac:[36,'12–18'],sedex:[62,'5–8']}, PA:{pac:[32,'10–16'],sedex:[57,'4–7']},
  AC:{pac:[40,'14–20'],sedex:[68,'6–10']}, RO:{pac:[34,'11–17'],sedex:[60,'5–8']},
  RR:{pac:[40,'14–20'],sedex:[68,'6–10']}, AP:{pac:[37,'12–18'],sedex:[64,'5–9']},
  TO:{pac:[24,'9–13'],sedex:[46,'3–6']},
};

function staticCalc(uf: string, qty: number) {
  const r = STATIC_REGIONS[uf] ?? { pac:[28,'10–15'], sedex:[52,'4–7'] };
  // The 3kg trio previously fell into the `1` bucket, so the fallback table quoted
  // it at the same price as a single 1kg pack — a loss on every trio sold whenever
  // the Melhor Envio API was unreachable.
  const f = qty >= 10 ? 2.2 : qty >= 5 ? 1.4 : qty >= 3 ? 1.25 : 1;
  return [
    { serviceId: '1', name: 'PAC', company: 'Correios', price: +(r.pac[0]*f).toFixed(2), days: `${r.pac[1]} dias úteis` },
    { serviceId: '2', name: 'SEDEX', company: 'Correios', price: +(r.sedex[0]*f).toFixed(2), days: `${r.sedex[1]} dias úteis` },
  ];
}

async function meCalculate(destCep: string, qty: number, productId?: string | null) {
  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) return null;
  try {
    const product = resolveProduct(productId, qty);
    const packs = Math.max(1, Math.round(qty / CATALOG[product].kgPerUnit));
    const pkg = CATALOG[product].pkg;
    const weight = shipWeight(product, packs);
    const body = {
      from: { postal_code: ORIGIN_CEP },
      to:   { postal_code: destCep.replace(/\D/g, '') },
      package: { height: pkg.height, width: pkg.width, length: pkg.length, weight },
      options: { receipt: false, own_hand: false },
    };
    const res = await fetch(`${ME_BASE}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'User-Agent':    'SalVita/1.0 (contato@salvitarn.com.br)',
        'Accept':        'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const rawText = await res.text();
    if (!res.ok) return null;
    let data: any;
    try { data = JSON.parse(rawText); } catch { return null; }
    if (!Array.isArray(data)) return null;
    const valid = data.filter((s: any) => s && !s.error && s.price);
    if (valid.length === 0) return null;
    // Só transportadoras permitidas (ALLOWED_CARRIERS), da mais barata à mais cara. Nenhuma → null
    // → quoteShipping cai na tabela estática PAC/SEDEX.
    const correios = filterAllowedCarriersSorted(valid.map((s: any) => ({
      serviceId: String(s.id),
      name:      String(s.name ?? ''),
      company:   String(s.company?.name ?? ''),
      price:     parseFloat(s.custom_price ?? s.price),
      days:      s.delivery_range ? `${s.delivery_range.min}–${s.delivery_range.max} dias úteis` : '?',
    })));
    return correios.length > 0 ? correios : null;
  } catch {
    return null;
  }
}

/**
 * Ownership check for the public order endpoints (tracking, payment retry, PIX).
 *
 * The old rule was "last 4 digits of the phone", against sequential order ids —
 * ~10k guesses per order to read a stranger's name, city, total and tracking
 * code. Worse, those same 4 digits were placed in the Mercado Pago return URL,
 * so the credential travelled through a third-party redirect, browser history
 * and `Referer` headers on every paid order.
 *
 * Now: an opaque per-order token, or the FULL phone number. The full-phone branch
 * keeps orders created before `track_token` existed reachable by their real owner.
 */
function assertOrderAccess(
  order: { customerPhone: string; trackToken?: string | null },
  creds: { token?: string | null; phone?: string | null },
): void {
  const token = (creds.token ?? '').trim();
  if (token && order.trackToken) {
    const a = Buffer.from(token);
    const b = Buffer.from(order.trackToken);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return;
  }
  const given = (creds.phone ?? '').replace(/\D/g, '');
  const real = order.customerPhone.replace(/\D/g, '');
  // Require the whole number (10+ digits), not a 4-digit suffix.
  if (given.length >= 10 && (given === real || given === `55${real}` || `55${given}` === real)) return;
  throw orderNotFound();
}

/** Mesmo erro para pedido inexistente e acesso negado: não permite enumerar pedidos. */
function orderNotFound(): TRPCError {
  return new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado' });
}

const hdr = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** IP/UA do comprador e cookies Meta, para a Conversions API. Nada disso vai para log. */
function clientSignals(headers: Record<string, string | string[] | undefined>, fbp?: string, fbc?: string) {
  const ip = hdr(headers['x-forwarded-for']).split(',')[0].trim() || hdr(headers['x-real-ip']).trim();
  const ua = hdr(headers['user-agent']).trim();
  return {
    clientIp: ip ? ip.slice(0, 500) : null,
    clientUa: ua ? ua.slice(0, 500) : null,
    fbp: fbp?.trim() || null,
    fbc: fbc?.trim() || null,
  };
}

type ShipOption = { serviceId: string; name: string; company: string; price: number; days: string };

/**
 * Server-side shipping quote — the single path used both to show options to the
 * customer AND to price the order at creation time. `createOrder` must never
 * trust a price sent by the browser: before this existed, a crafted request with
 * `shippingPrice: 0` produced a perfectly valid free-shipping order that the
 * webhook's amount check then happily confirmed (it compares against the same
 * tampered total).
 */
async function quoteShipping(
  cep: string,
  qty: number,
  productId?: string | null,
  ufHint?: string | null,
): Promise<{ source: 'api' | 'static'; options: ShipOption[] }> {
  const apiResult = await meCalculate(cep, qty, productId);
  if (apiResult && apiResult.length > 0) return { source: 'api', options: apiResult };
  let uf = ufHint?.toUpperCase() || '';
  if (!uf) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep.replace(/\D/g,'')}/json/`, { signal: AbortSignal.timeout(8000) });
      const d = await r.json();
      if (d.uf) uf = d.uf;
    } catch {}
  }
  return { source: 'static', options: staticCalc(uf || 'RN', qty) };
}

// Reserva da etiqueta: o Melhor Envio cobra no checkout, então dois cliques (ou dois
// admins) não podem comprar a mesma etiqueta. Sem transação interativa no neon-http,
// a reserva é um UPDATE condicional — só um chamador recebe a linha de volta.
// 'pending' preso (função morta no meio) pode ser retomado depois de 5 minutos.
const LABEL_BUSY_MSG = 'Etiqueta já gerada ou em geração para este pedido.';
async function reserveLabel(orderId: number): Promise<boolean> {
  const rows = await db.update(siteOrders)
    .set({ meOrderId: 'pending', updatedAt: new Date() })
    .where(and(
      eq(siteOrders.id, orderId),
      isNull(siteOrders.meLabelUrl),
      or(
        isNull(siteOrders.meOrderId),
        and(eq(siteOrders.meOrderId, 'pending'), sql`${siteOrders.updatedAt} < now() - interval '5 minutes'`),
      ),
    ))
    .returning({ id: siteOrders.id });
  return rows.length > 0;
}
// Retomada (checkout já pago): toca updatedAt de forma condicional para que dois cliques
// simultâneos não retomem juntos. Só um recebe a linha de volta.
async function claimResume(orderId: number, meOrderId: string): Promise<boolean> {
  const rows = await db.update(siteOrders)
    .set({ updatedAt: new Date() })
    .where(and(
      eq(siteOrders.id, orderId),
      eq(siteOrders.meOrderId, meOrderId),
      isNull(siteOrders.meLabelUrl),
      sql`${siteOrders.updatedAt} < now() - make_interval(secs => ${RESUME_MIN_AGE_MS / 1000})`,
    ))
    .returning({ id: siteOrders.id });
  return rows.length > 0;
}
async function releaseLabel(orderId: number): Promise<void> {
  try {
    await db.update(siteOrders).set({ meOrderId: null, updatedAt: new Date() })
      .where(and(eq(siteOrders.id, orderId), eq(siteOrders.meOrderId, 'pending')));
  } catch (e) { console.error(`[label] liberar reserva do pedido ${orderId} falhou:`, safeErr(e)); }
}

export const shippingRouter = router({
  calculate: publicProcedure
    .input(z.object({
      cep: z.string().min(8),
      quantity: z.number().min(1).max(100).default(1),
      productId: z.enum(['1kg', '3kg', 'caixa']).optional(),
    }))
    .mutation(async ({ input }) => {
      return quoteShipping(input.cep, input.quantity, input.productId);
    }),

  createOrder: publicProcedure
    .input(z.object({
      customerName: z.string().min(2).max(100),
      customerPhone: z.string().min(10).max(20),
      customerEmail: z.string().email().optional().or(z.literal('')),
      customerCpf: z.string().min(11).max(14).optional(),
      postalCode: z.string().min(8).max(9),
      address: z.string().min(3).max(200),
      number: z.string().min(1).max(20),
      complement: z.string().max(100).optional().or(z.literal('')),
      neighborhood: z.string().min(2).max(100),
      city: z.string().min(2).max(100),
      state: z.string().length(2),
      quantity: z.number().int().min(1).max(100),
      productId: z.enum(['1kg', '3kg', 'caixa']).optional().default('1kg'),
      shippingServiceId: z.string().optional(),
      shippingServiceName: z.string().optional(),
      shippingPrice: z.number().min(0).optional(),
      couponCode: z.string().max(20).optional(),
      // Marketing attribution from the landing URL (best-effort, optional).
      utmSource: z.string().max(120).optional(),
      utmMedium: z.string().max(120).optional(),
      utmCampaign: z.string().max(180).optional(),
      utmContent: z.string().max(180).optional(),
      utmTerm: z.string().max(180).optional(),
      fbclid: z.string().max(400).optional(),
      // Cookies _fbp/_fbc do browser (Meta CAPI match quality).
      fbp: z.string().max(255).optional(),
      fbc: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Server-authoritative price catalog. `quantity` is the number of 1kg units
      // (kg units): 1kg product = 1 unit each, box = 10 units each.
      const productId = resolveProduct(input.productId, input.quantity);
      const prod = CATALOG[productId];
      const productCount = Math.max(1, Math.round(input.quantity / prod.kgPerUnit));

      if (!quantidadeValida(input.quantity, prod.kgPerUnit)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Quantidade inválida para este produto.' });
      }

      // Duplo clique / reenvio: devolve o pedido igual ainda aguardando pagamento (últimos 15 min).
      const cepDigits = input.postalCode.replace(/\D/g, '');
      const recentes = await db.select().from(siteOrders).where(and(
        eq(siteOrders.paymentStatus, 'awaiting'),
        ne(siteOrders.status, 'cancelled'),
        eq(siteOrders.product, prod.name),
        eq(siteOrders.quantity, input.quantity),
        eq(siteOrders.postalCode, cepDigits),
        gte(siteOrders.createdAt, new Date(Date.now() - IDEMPOTENCIA_PEDIDO_MS)),
      )).orderBy(desc(siteOrders.createdAt)).limit(20);
      const dup = acharPedidoDuplicado(recentes, { customerPhone: input.customerPhone, product: prod.name, quantity: input.quantity, postalCode: cepDigits });
      if (dup && mesmosDadosDoPedido(dup, {
        customerName: input.customerName,
        customerEmail: input.customerEmail || null,
        customerCpf: input.customerCpf ?? null,
        address: input.address,
        number: input.number,
        complement: input.complement || null,
        neighborhood: input.neighborhood,
        city: input.city,
        state: input.state,
        shippingServiceName: input.shippingServiceName ?? null,
        couponCode: input.couponCode ? input.couponCode.trim().toUpperCase() : null,
      })) {
        return {
          id: dup.id,
          total: parseFloat(dup.totalPrice ?? '0'),
          shipping: parseFloat(dup.shippingPrice ?? '0'),
          couponDiscount: parseFloat(dup.couponDiscount ?? '0'),
          couponApplied: dup.couponCode,
          trackToken: dup.trackToken,
        };
      }

      if (input.shippingPrice !== undefined && (input.shippingPrice < 0 || input.shippingPrice > 200)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Valor de frete inválido.' });
      }

      // Re-quote server-side and price the order from OUR number, never the
      // browser's. The client value is kept only as a cross-check: matching the
      // chosen service wins; if the service can't be matched (e.g. the quote fell
      // back to the static table while the client held Melhor Envio ids), we
      // accept the client price only when it is at least the cheapest legitimate
      // option — so an order can never be created with an under-quoted freight.
      const quote = await quoteShipping(input.postalCode, input.quantity, productId, input.state);
      const claimed = input.shippingPrice ?? 0;
      const match = quote.options.find(o => String(o.serviceId) === String(input.shippingServiceId));
      const cheapest = quote.options.length
        ? Math.min(...quote.options.map(o => o.price))
        : claimed;
      let shipping: number;
      if (match) {
        shipping = match.price;
      } else if (claimed >= cheapest) {
        shipping = claimed;
      } else {
        shipping = cheapest;
      }
      // Serviço gravado = o que o servidor cotou. Id fora da lista permitida (ou que não
      // bate com nenhuma opção) nunca é gravado: cai na opção mais barata permitida.
      const cheapestOpt = quote.options.length ? quote.options.reduce((a, b) => (b.price < a.price ? b : a)) : null;
      const chosen = match ?? (shipping === cheapest ? cheapestOpt : null);
      if (Math.abs(shipping - claimed) > 0.01) {
        console.warn(`[createOrder] shipping corrected: client sent ${claimed}, server charged ${shipping} (service ${input.shippingServiceId ?? '—'}, source ${quote.source})`);
      }

      let subtotal = +(prod.price * productCount).toFixed(2);
      let couponDiscount = 0;
      let appliedCoupon: string | null = null;

      // Apply coupon if provided (lookup + discount only). The coupon's used_count
      // is incremented ONLY when the payment is confirmed (in the mp-webhook /
      // reconcile path), so abandoned/unpaid orders never burn a coupon's uses.
      if (input.couponCode) {
        const code = input.couponCode.toUpperCase().trim();
        const found = await db.select().from(coupons)
          .where(and(eq(coupons.code, code), eq(coupons.active, true)))
          .limit(1);
        if (found.length > 0) {
          const c = found[0];
          const notExpired = !c.expiresAt || new Date() < new Date(c.expiresAt);
          const notMaxed = !c.maxUses || c.usedCount < c.maxUses;
          if (notExpired && notMaxed && cupomAtendeMinimo(subtotal, c.minOrderValue)) {
            if (c.discountType === 'percent') {
              couponDiscount = +(subtotal * parseFloat(c.discountValue) / 100).toFixed(2);
            } else {
              couponDiscount = Math.min(subtotal, parseFloat(c.discountValue));
            }
            subtotal = +(subtotal - couponDiscount).toFixed(2);
            appliedCoupon = code;
          }
        }
      }

      const total = +(subtotal + shipping).toFixed(2);
      const [order] = await db.insert(siteOrders).values({
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail || null,
        customerCpf: input.customerCpf ? input.customerCpf.replace(/\D/g,'') : null,
        postalCode: input.postalCode.replace(/\D/g,''),
        address: input.address,
        number: input.number,
        complement: input.complement || null,
        neighborhood: input.neighborhood,
        city: input.city,
        state: input.state.toUpperCase(),
        quantity: input.quantity,
        // Persisted so the payment title, the shipping label and the customer's
        // order page all describe what was actually bought. Previously these fell
        // back to the schema defaults, so a R$ 149,90 box was labelled and
        // declared as 10 × "Sal Marinho Integral 1kg" at R$ 29,90.
        product: prod.name,
        unitPrice: String(prod.price),
        trackToken: crypto.randomBytes(16).toString('hex'),
        shippingServiceId: chosen ? chosen.serviceId : (cheapestOpt?.serviceId ?? null),
        shippingServiceName: chosen ? chosen.name : (cheapestOpt?.name ?? null),
        shippingPrice: shipping > 0 ? String(shipping) : null,
        totalPrice: String(total),
        couponCode: appliedCoupon,
        couponDiscount: couponDiscount > 0 ? String(couponDiscount) : null,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        utmContent: input.utmContent ?? null,
        utmTerm: input.utmTerm ?? null,
        fbclid: input.fbclid ?? null,
        ...clientSignals(ctx.req.headers, input.fbp, input.fbc),
      }).returning();
      if (!order?.id) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao criar pedido. Tente novamente.' });
      // `shipping` is returned so the storefront can show the corrected freight if
      // its own quote went stale; `trackToken` authorizes the follow-up calls
      // (payment, PIX, status) and the /meu-pedido link without leaking the phone.
      return {
        id: order.id,
        total,
        shipping,
        couponDiscount,
        couponApplied: appliedCoupon,
        trackToken: order.trackToken,
      };
    }),

  listOrders: premiumAdminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx }) => {
      // Hide only orders with no payment attempt at all (no preference AND no payment id).
      // On-page PIX orders have mpPaymentId but never an mpPreferenceId, so they must show.
      // Never-attempted ones go to the recovery panel instead
      return db.select().from(siteOrders)
        .where(
          sql`NOT (${siteOrders.paymentStatus} = 'awaiting' AND ${siteOrders.mpPreferenceId} IS NULL AND ${siteOrders.mpPaymentId} IS NULL)`
        )
        .orderBy(desc(siteOrders.createdAt));
    }),

  analyzeOrders: premiumAdminProcedure
    .mutation(async ({ ctx }) => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'GROQ_API_KEY não configurado' });

      const orders = await db.select().from(siteOrders).orderBy(desc(siteOrders.createdAt));

      // Cancelled orders shouldn't count as revenue even if they were paid
      // before being cancelled/refunded.
      const paid = orders.filter(o => o.paymentStatus === 'confirmed' && o.status !== 'cancelled');
      const revenue = paid.reduce((s, o) => s + parseFloat(o.totalPrice ?? '0'), 0);
      const cityCount: Record<string, number> = {};
      orders.forEach(o => {
        if (!o.city || !o.state) return;
        cityCount[`${o.city}/${o.state}`] = (cityCount[`${o.city}/${o.state}`] ?? 0) + 1;
      });
      const topCities = Object.entries(cityCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
      const now = new Date();
      const last7 = orders.filter(o => (now.getTime()-new Date(o.createdAt).getTime()) < 7*86400000);
      const statusCounts = orders.reduce((acc, o) => { acc[o.status] = (acc[o.status]??0)+1; return acc; }, {} as Record<string,number>);
      const paymentCounts = orders.reduce((acc, o) => { acc[o.paymentStatus] = (acc[o.paymentStatus]??0)+1; return acc; }, {} as Record<string,number>);

      const prompt = `Você é analista de e-commerce. Analise estes dados de pedidos da Sal Vita (sal marinho premium de Mossoró/RN) e responda em português brasileiro com insights concisos e acionáveis.

Dados:
- Total de pedidos: ${orders.length}
- Pedidos últimos 7 dias: ${last7.length}
- Receita confirmada: R$ ${revenue.toFixed(2)}
- Status dos pedidos: ${JSON.stringify(statusCounts)}
- Pagamentos: ${JSON.stringify(paymentCounts)}
- Top cidades: ${topCities.map(([c,n])=>`${c}(${n})`).join(', ')}
- Ticket médio: R$ ${orders.length ? (revenue/Math.max(paid.length,1)).toFixed(2) : '0'}

Forneça:
1. 📊 Resumo executivo (2 frases)
2. 🔍 3 insights importantes
3. ⚠️ Alertas e riscos (se houver)
4. 💡 2 recomendações concretas para aumentar vendas

Seja direto e use emojis para facilitar leitura.`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 600, temperature: 0.7 }),
      });
      if (!res.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao chamar Groq' });
      const data = await res.json() as { choices: { message: { content: string } }[] };
      const insights = data.choices?.[0]?.message?.content ?? 'Sem resposta';

      return {
        insights,
        summary: { total: orders.length, revenue, paid: paid.length, pending: paymentCounts['awaiting']??0, last7: last7.length, topCities, ticketMedio: paid.length ? revenue/paid.length : 0 },
      };
    }),

  updateOrder: premiumAdminProcedure
    .input(z.object({
      id: z.number(),
      customerName: z.string().min(2).optional(),
      customerPhone: z.string().min(10).optional(),
      customerEmail: z.string().email().optional().or(z.literal('')),
      customerCpf: z.string().optional(),
      address: z.string().optional(),
      number: z.string().optional(),
      complement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      state: z.string().length(2).optional(),
      postalCode: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...fields } = input;
      const updates: Record<string,unknown> = { updatedAt: new Date() };
      if (fields.customerName) updates.customerName = fields.customerName;
      if (fields.customerPhone) updates.customerPhone = fields.customerPhone;
      if (fields.customerEmail !== undefined) updates.customerEmail = fields.customerEmail || null;
      if (fields.customerCpf !== undefined) updates.customerCpf = fields.customerCpf.replace(/\D/g,'') || null;
      if (fields.address) updates.address = fields.address;
      if (fields.number) updates.number = fields.number;
      if (fields.complement !== undefined) updates.complement = fields.complement || null;
      if (fields.neighborhood) updates.neighborhood = fields.neighborhood;
      if (fields.city) updates.city = fields.city;
      if (fields.state) updates.state = fields.state.toUpperCase();
      if (fields.postalCode) updates.postalCode = fields.postalCode.replace(/\D/g,'');
      if (fields.notes !== undefined) updates.notes = fields.notes || null;
      const [updated] = await db.update(siteOrders).set(updates).where(eq(siteOrders.id, id)).returning();
      return updated;
    }),

  updateStatus: premiumAdminProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['pending','confirmed','shipped','delivered','cancelled']).optional(),
      paymentStatus: z.enum(['awaiting','confirmed','failed']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [before] = await db.select().from(siteOrders).where(eq(siteOrders.id, input.id)).limit(1);
      const updates: Record<string,unknown> = { updatedAt: new Date() };
      if (input.status) updates.status = input.status;
      if (input.paymentStatus) updates.paymentStatus = input.paymentStatus;
      const [updated] = await db.update(siteOrders)
        .set(updates)
        .where(eq(siteOrders.id, input.id))
        .returning();
      // Manually confirming a payment must produce the same customer-facing
      // result as an automatic confirmation (WhatsApp + email + CAPI + coupon
      // + cancel pending follow-ups) — only run once per order.
      if (updated && input.paymentStatus === 'confirmed' && before?.paymentStatus !== 'confirmed') {
        await confirmOrderPaid(updated);
      }
      return updated;
    }),

  trackOrder: publicProcedure
    .input(z.object({
      orderId: z.number().int().positive(),
      phone: z.string().optional(),
      token: z.string().max(64).optional(),
    }))
    .query(async ({ input }) => {
      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId));
      const order = orders[0];
      if (!order) throw orderNotFound();
      assertOrderAccess(order, { token: input.token, phone: input.phone });
      return {
        id: order.id,
        customerName: order.customerName,
        product: order.product,
        quantity: order.quantity,
        totalPrice: order.totalPrice,
        shippingServiceName: order.shippingServiceName,
        city: order.city,
        state: order.state,
        status: order.status,
        paymentStatus: order.paymentStatus,
        trackingCode: order.trackingCode,
        shippedAt: order.status === 'shipped' || order.status === 'delivered' ? order.updatedAt : null,
        createdAt: order.createdAt,
        // Ocorrência de entrega informada pelo Melhor Envio (não entregue, interrompida, suspensa).
        deliveryIssue: order.status === 'shipped' ? await latestShippingOccurrence(order.id) : null,
      };
    }),

  updateTracking: premiumAdminProcedure
    .input(z.object({
      id: z.number(),
      trackingCode: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await db.update(siteOrders)
        .set({ trackingCode: input.trackingCode, status: 'shipped', updatedAt: new Date() })
        .where(eq(siteOrders.id, input.id))
        .returning();

      // Avisa o cliente uma única vez (e-mail; WhatsApp só sem e-mail). Se o rastreio
      // automático já avisou o 'postado', salvar de novo no painel não reenvia.
      if (updated) {
        try {
          if (await claimShippingEvent(updated.id, 'posted', null)) {
            const channel = await notifyShippingEvent(updated, 'posted');
            if (channel) await markShippingEvent(updated.id, 'posted', channel);
            else await releaseShippingEvent(updated.id, 'posted');
          }
        } catch (e) { console.error('[updateTracking] aviso de envio falhou:', safeErr(e)); }
      }
      return updated;
    }),

  createPayment: publicProcedure
    .input(z.object({
      orderId: z.number(),
      phone: z.string().optional(),
      token: z.string().max(64).optional(),
    }))
    .mutation(async ({ input }) => {
      const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!token) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Configure MERCADO_PAGO_ACCESS_TOKEN no painel Vercel' });

      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId));
      const order = orders[0];
      if (!order) throw orderNotFound();
      // Acesso antes do status: "já foi pago" não pode vazar para quem não é dono.
      assertOrderAccess(order, { token: input.token, phone: input.phone });
      if (order.paymentStatus === 'confirmed') throw new TRPCError({ code: 'CONFLICT', message: 'Este pedido já foi pago.' });
      // Pagamento em pedido cancelado seria ignorado pelo webhook (dinheiro sem pedido).
      if (order.status === 'cancelled') throw new TRPCError({ code: 'CONFLICT', message: 'Este pedido foi cancelado.' });

      // Return URLs carry the opaque token, never the phone digits — this link is
      // handed to Mercado Pago and ends up in history/Referer.
      const back = (status: string) =>
        `${STORE_URL}/meu-pedido?pedido=${order.id}`
        + (order.trackToken ? `&t=${order.trackToken}` : '')
        + `&status=${status}`;

      const preference = {
        items: [{
          id: `order-${order.id}`,
          title: order.product ?? 'Sal Vita',
          quantity: 1,
          unit_price: parseFloat(order.totalPrice ?? String(CATALOG['1kg'].price)),
          currency_id: 'BRL',
        }],
        payer: {
          name: order.customerName.split(' ')[0],
          surname: order.customerName.split(' ').slice(1).join(' ') || '-',
          email: order.customerEmail ?? 'cliente@salvitarn.com.br',
          phone: { number: order.customerPhone.replace(/\D/g,'') },
        },
        back_urls: {
          success: back('pago'),
          failure: back('falhou'),
          pending: back('pendente'),
        },
        auto_return: 'approved',
        notification_url: `${STORE_URL}/api/mp-webhook`,
        external_reference: String(order.id),
        statement_descriptor: 'SAL VITA',
        payment_methods: { installments: 3 },
      };

      const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(preference),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.error(`[shipping] createPayment MP ${await mpErrorTag(res)}`);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Não foi possível gerar o pagamento agora. Tente novamente em instantes.' });
      }
      const data = await res.json();

      await db.update(siteOrders)
        .set({ mpPreferenceId: data.id, updatedAt: new Date() })
        .where(eq(siteOrders.id, input.orderId));

      return { initPoint: data.init_point as string };
    }),

  // Create a PIX payment directly (inline QR + copy-paste) so the customer never leaves the site.
  createPixPayment: publicProcedure
    .input(z.object({
      orderId: z.number(),
      phone: z.string().optional(),
      token: z.string().max(64).optional(),
    }))
    .mutation(async ({ input }) => {
      const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!token) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Configure MERCADO_PAGO_ACCESS_TOKEN' });
      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId));
      const order = orders[0];
      if (!order) throw orderNotFound();
      // Acesso antes do status: "já foi pago" não pode vazar para quem não é dono.
      assertOrderAccess(order, { token: input.token, phone: input.phone });
      if (order.paymentStatus === 'confirmed') throw new TRPCError({ code: 'CONFLICT', message: 'Este pedido já foi pago.' });
      // Pagamento em pedido cancelado seria ignorado pelo webhook (dinheiro sem pedido).
      if (order.status === 'cancelled') throw new TRPCError({ code: 'CONFLICT', message: 'Este pedido foi cancelado.' });

      const amount = parseFloat(order.totalPrice ?? '0');

      // Reuse the order's live PIX charge instead of minting a new one on every
      // click. Two QR codes for one order means the customer can pay an expired
      // code, or pay PIX *and* card — the second confirmation is then ignored and
      // there is no automatic refund.
      if (order.mpPaymentId) {
        try {
          const existing = await fetch(`https://api.mercadopago.com/v1/payments/${order.mpPaymentId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: AbortSignal.timeout(8000),
          });
          if (existing.ok) {
            const p = await existing.json() as any;
            const live = p?.status === 'pending' || p?.status === 'in_process';
            const td0 = p?.point_of_interaction?.transaction_data;
            if (live && td0?.qr_code && Math.abs((p.transaction_amount ?? 0) - amount) <= 0.01) {
              return {
                paymentId: String(p.id),
                qrCode: td0.qr_code as string,
                qrCodeBase64: (td0.qr_code_base64 ?? '') as string,
                amount,
              };
            }
          }
        } catch { /* fall through and create a fresh charge */ }
      }
      const email = (order.customerEmail && order.customerEmail.includes('@')) ? order.customerEmail : `cliente${order.id}@salvitarn.com.br`;
      const body: any = {
        transaction_amount: amount,
        description: `Pedido #${order.id} — Sal Vita`,
        payment_method_id: 'pix',
        payer: {
          email,
          first_name: order.customerName.split(' ')[0],
          last_name: order.customerName.split(' ').slice(1).join(' ') || '-',
        },
        external_reference: String(order.id),
        notification_url: `${STORE_URL}/api/mp-webhook`,
      };
      if (order.customerCpf) body.payer.identification = { type: 'CPF', number: order.customerCpf.replace(/\D/g, '') };

      const res = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          // Stable per-order key — `Date.now()` defeated idempotency entirely.
          'X-Idempotency-Key': `pix-${order.id}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        console.error(`[shipping] createPixPayment MP ${await mpErrorTag(res)}`);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Não foi possível gerar o PIX agora. Tente novamente em instantes.' });
      }
      const data = await res.json();
      const td = data?.point_of_interaction?.transaction_data;
      if (!td?.qr_code) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'PIX não retornou QR code.' });

      await db.update(siteOrders).set({ mpPaymentId: String(data.id), updatedAt: new Date() }).where(eq(siteOrders.id, order.id));

      return {
        paymentId: String(data.id),
        qrCode: td.qr_code as string,                 // copy-paste code
        qrCodeBase64: (td.qr_code_base64 ?? '') as string, // PNG base64
        amount,
      };
    }),

  // Lightweight poll for the PIX/checkout payment status (read-only — webhook does the writes).
  pixStatus: publicProcedure
    .input(z.object({
      orderId: z.number(),
      phone: z.string().optional(),
      token: z.string().max(64).optional(),
    }))
    // .mutation: o storefront chama com POST (tRPC 11 responde 405 a POST em query).
    .mutation(async ({ input }) => {
      const orders = await db.select({
        id: siteOrders.id,
        paymentStatus: siteOrders.paymentStatus,
        mpPaymentId: siteOrders.mpPaymentId,
        customerPhone: siteOrders.customerPhone,
        trackToken: siteOrders.trackToken,
      }).from(siteOrders).where(eq(siteOrders.id, input.orderId)).limit(1);
      const order = orders[0];
      if (!order) throw orderNotFound();
      assertOrderAccess(order, { token: input.token, phone: input.phone });
      if (order.paymentStatus === 'confirmed') return { paid: true, status: 'approved' };
      const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!token || !order.mpPaymentId) return { paid: false, status: order.paymentStatus };
      try {
        const r = await fetch(`https://api.mercadopago.com/v1/payments/${order.mpPaymentId}`, { headers: { 'Authorization': `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return { paid: false, status: order.paymentStatus };
        const p = await r.json() as any;
        return { paid: p.status === 'approved', status: p.status as string };
      } catch {
        return { paid: false, status: order.paymentStatus };
      }
    }),

  autoLabelReport: premiumAdminProcedure.query(async ({ ctx }) => {
    return autoLabelReport();
  }),

  generateLabel: premiumAdminProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return generateLabelForOrder(input.orderId);
    }),

  cancelOrder: premiumAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {

      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.id));
      const order = orders[0];
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      if (order.status === 'cancelled') throw new TRPCError({ code: 'CONFLICT', message: 'Pedido já cancelado.' });

      const results: string[] = [];

      // Reembolso PRIMEIRO: se falhar, o pedido continua como está (não vira 'cancelled'
      // com o dinheiro ainda com a loja) e a etiqueta não é mexida. Reembolso feito à mão
      // no painel do MP chega pelo webhook (refunded), que cancela o pedido sozinho.
      if (order.paymentStatus === 'confirmed' && order.mpPaymentId) {
        const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        if (!mpToken) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'MERCADO_PAGO_ACCESS_TOKEN não configurado — reembolse no painel do Mercado Pago; o webhook cancela o pedido.' });
        }
        try {
          const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${order.mpPaymentId}/refunds`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(8000),
          });
          if (!mpRes.ok) {
            const txt = await mpRes.text();
            throw new TRPCError({ code: 'BAD_GATEWAY', message: `Reembolso MP falhou (${mpRes.status}): ${txt.slice(0, 100)}. Pedido NÃO cancelado.` });
          }
          results.push('Reembolso MP solicitado');
        } catch (err) {
          if (err instanceof TRPCError) throw err;
          throw new TRPCError({ code: 'BAD_GATEWAY', message: 'Falha ao reembolsar no MP — pedido NÃO cancelado. Tente de novo ou reembolse no painel do Mercado Pago.' });
        }
      }

      if (order.meOrderId && order.meOrderId !== 'pending') {
        const meToken = process.env.MELHOR_ENVIO_TOKEN;
        if (meToken) {
          try {
            const meRes = await fetch(`${ME_BASE}/api/v2/me/shipment/cancel`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${meToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'SalVita/1.0 (contato@salvitarn.com.br)',
                'Accept': 'application/json',
              },
              body: JSON.stringify({ orders: [order.meOrderId] }),
              signal: AbortSignal.timeout(8000),
            });
            if (meRes.ok) results.push('Etiqueta ME cancelada');
            else results.push(`Aviso: ME retornou ${meRes.status} — verifique manualmente`);
          } catch {
            results.push('Aviso: falha ao cancelar etiqueta ME — verifique manualmente');
          }
        }
      }

      const [updated] = await db.update(siteOrders)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(siteOrders.id, input.id))
        .returning();

      results.push('Pedido cancelado');
      return { order: updated, actions: results };
    }),

  // Admin: permanently remove an order (e.g. test orders). No refund/label
  // cancellation is attempted — use cancelOrder first for real orders.
  deleteOrder: premiumAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Condicional no próprio DELETE: pedido pago não some (perde-se o rastro do dinheiro).
      const [deleted] = await db.delete(siteOrders)
        .where(and(eq(siteOrders.id, input.id), sql`${siteOrders.paymentStatus} <> 'confirmed'`))
        .returning();
      if (!deleted) {
        const [exists] = await db.select({ id: siteOrders.id }).from(siteOrders).where(eq(siteOrders.id, input.id)).limit(1);
        if (exists) throw new TRPCError({ code: 'FORBIDDEN', message: 'Pedido com pagamento confirmado não pode ser excluído. Cancele (com reembolso) em vez de excluir.' });
        throw new TRPCError({ code: 'NOT_FOUND' });
      }
      return { ok: true };
    }),

  // Admin: e-mail de "pedido postado" com o rastreio, enviado à mão (reenvio ou pedido
  // que ficou sem o aviso automático). Registra o evento para o automático não repetir.
  sendTrackingEmail: premiumAdminProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [order] = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId)).limit(1);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!order.customerEmail) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pedido sem e-mail do cliente.' });
      if (!order.trackingCode) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pedido sem código de rastreio.' });
      const { subject, html } = shippingUpdateEmail(
        'posted', order.customerName, order.id, order.trackingCode, trackingLink(order.trackingCode), ORDER_PAGE_URL(),
      );
      const r = await sendEmail(order.customerEmail, subject, html);
      if (!r.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `E-mail não enviado (${r.reason}).` });
      await claimShippingEvent(order.id, 'posted', null);
      await markShippingEvent(order.id, 'posted', 'email-manual');
      return { success: true, email: order.customerEmail };
    }),

  // Admin: send direct WhatsApp tracking notification via server API
  sendTrackingWhatsApp: premiumAdminProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId));
      const order = orders[0];
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      if (!order.customerPhone) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pedido sem telefone cadastrado.' });
      if (!order.trackingCode) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pedido sem código de rastreio.' });

      const tpls = await db.select().from(msgTemplates).where(and(eq(msgTemplates.type, 'general'), eq(msgTemplates.isDefault, true))).limit(1);
      const tpl = tpls[0];
      const vars = {
        nome: order.customerName,
        pedido: String(order.id),
        rastreio: order.trackingCode,
        link: trackingLink(order.trackingCode),
      };
      const msg = tpl
        ? renderTpl(tpl.body, vars)
        : `🧂 *Sal Vita — Pedido #${order.id}*\n\nOlá *${order.customerName}*! Seu pedido foi enviado! 🚚\n\n📦 Código de rastreio: *${order.trackingCode}*\n\n🔗 Rastreie: ${trackingLink(order.trackingCode)}\n\nOu acesse: ${STORE_URL}/meu-pedido\n\nObrigado! 🙏`;

      const sent = await sendWhatsAppMsg(order.customerPhone, msg);
      if (!sent) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao enviar mensagem pelo WhatsApp da VPS. Verifique se o serviço está online.' });
      }
      return { success: true };
    }),

  // Admin: generate shipping labels in batch for multiple paid orders
  batchGenerateLabels: premiumAdminProcedure
    .input(z.object({ orderIds: z.array(z.number()).max(25) }))
    .mutation(async ({ ctx, input }) => {
      if (!input.orderIds.length) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum pedido selecionado.' });

      const token = process.env.MELHOR_ENVIO_TOKEN;
      if (!token) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Configure MELHOR_ENVIO_TOKEN no painel Vercel' });

      const results: Array<{ orderId: number; success: boolean; labelUrl?: string; error?: string }> = [];
      const deadline = Date.now() + 45_000; // função serverless limitada a 60s
      for (const orderId of input.orderIds) {
        if (Date.now() > deadline) {
          results.push({ orderId, success: false, error: 'Tempo esgotado — tente novamente com os pedidos restantes' });
          continue;
        }
        let reserved = false;
        let purchased = false;
        try {
          const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, orderId));
          const order = orders[0];
          if (!order) {
            results.push({ orderId, success: false, error: 'Pedido não encontrado' });
            continue;
          }
          if (order.paymentStatus !== 'confirmed') {
            results.push({ orderId, success: false, error: 'Pagamento não confirmado' });
            continue;
          }
          if (order.meLabelUrl) {
            results.push({ orderId, success: true, labelUrl: order.meLabelUrl });
            continue;
          }

          const serviceIdNum = order.shippingServiceId ? parseInt(order.shippingServiceId, 10) : NaN;
          if (isNaN(serviceIdNum)) {
            results.push({ orderId, success: false, error: 'Serviço de frete inválido' });
            continue;
          }

          // Retomada: checkout do ME já pago e sem etiqueta → só generate + print (não cobra de novo).
          const step = decideLabelStep(order, new Date());
          if (step === 'busy' || step === 'done') {
            results.push({ orderId, success: false, error: LABEL_BUSY_MSG });
            continue;
          }
          const resume = step === 'resume';
          if (!(resume ? await claimResume(orderId, order.meOrderId!) : await reserveLabel(orderId))) {
            results.push({ orderId, success: false, error: LABEL_BUSY_MSG });
            continue;
          }
          reserved = !resume;
          purchased = resume;

          const labelProduct = resolveProduct(null, order.quantity);
          const labelPacks = Math.max(1, Math.round(order.quantity / CATALOG[labelProduct].kgPerUnit));
          const labelPkg = CATALOG[labelProduct].pkg;
          const weight = shipWeight(labelProduct, labelPacks);
          const declaredUnitPrice = parseFloat(order.unitPrice ?? String(CATALOG[labelProduct].price));
          const declaredValue = parseFloat(order.totalPrice ?? String(declaredUnitPrice * labelPacks));

          const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'SalVita/1.0 (contato@salvitarn.com.br)',
            'Accept': 'application/json',
          };

          const cartBody = {
            service: serviceIdNum,
            from: {
              name: 'Sal Vita',
              phone: '84214082120',
              email: 'contato@salvitarn.com.br',
              postal_code: SENDER_ADDRESS.postalCode,
              address: SENDER_ADDRESS.address,
              number: SENDER_ADDRESS.number,
              district: SENDER_ADDRESS.district,
              city: 'Mossoró',
              state_abbr: 'RN',
              country_id: 'BR',
            },
            to: {
              name: order.customerName,
              phone: (order.customerPhone || '').replace(/\D/g,''),
              email: order.customerEmail ?? 'cliente@salvitarn.com.br',
              document: order.customerCpf ? order.customerCpf.replace(/\D/g,'') : undefined,
              postal_code: order.postalCode,
              address: order.address,
              number: order.number,
              complement: order.complement ?? '',
              district: order.neighborhood,
              city: order.city,
              state_abbr: order.state,
              country_id: 'BR',
            },
            volumes: [{ ...labelPkg, weight }],
            options: { insurance_value: declaredValue, receipt: false, own_hand: false, non_commercial: false },
            products: [{
              name: order.product ?? CATALOG[labelProduct].name,
              quantity: labelPacks,
              unitary_value: declaredUnitPrice,
            }],
          };

          let meOrderId: string;
          if (resume) {
            meOrderId = order.meOrderId!;
          } else {
            const cartRes = await fetch(`${ME_BASE}/api/v2/me/cart`, { method: 'POST', headers, body: JSON.stringify(cartBody) });
            if (!cartRes.ok) {
              const txt = await cartRes.text();
              await releaseLabel(orderId);
              results.push({ orderId, success: false, error: `Cart ME: ${txt.slice(0, 80)}` });
              continue;
            }
            const cartData = await cartRes.json();
            meOrderId = cartData.id;

            const checkRes = await fetch(`${ME_BASE}/api/v2/me/shipment/checkout`, {
              method: 'POST', headers, body: JSON.stringify({ orders: [meOrderId] }),
            });
            if (!checkRes.ok) {
              await fetch(`${ME_BASE}/api/v2/me/cart/${meOrderId}`, { method: 'DELETE', headers }).catch(() => {});
              const txt = await checkRes.text();
              await releaseLabel(orderId);
              results.push({ orderId, success: false, error: `Checkout ME: ${txt.slice(0, 80)}` });
              continue;
            }

            purchased = true; // etiqueta paga: não libera mais a reserva
            await db.update(siteOrders).set({ meOrderId, updatedAt: new Date() }).where(eq(siteOrders.id, orderId));
          }

          const genRes = await fetch(`${ME_BASE}/api/v2/me/shipment/generate`, {
            method: 'POST', headers, body: JSON.stringify({ orders: [meOrderId] }),
          });
          if (!genRes.ok) {
            results.push({ orderId, success: false, error: 'Falha ao gerar etiqueta no ME' });
            continue;
          }

          const printRes = await fetch(`${ME_BASE}/api/v2/me/shipment/print`, {
            method: 'POST', headers, body: JSON.stringify({ orders: [meOrderId], mode: 'private' }),
          });
          if (!printRes.ok) {
            results.push({ orderId, success: false, error: 'Falha ao obter URL de impressão no ME' });
            continue;
          }
          const printData = await printRes.json();
          const labelUrl: string = printData.url;

          await db.update(siteOrders)
            .set({ meOrderId, meLabelUrl: labelUrl, status: 'label_generated', updatedAt: new Date() })
            .where(eq(siteOrders.id, orderId));
          await fillTrackingCodeAfterLabel(orderId, meOrderId, token);

          results.push({ orderId, success: true, labelUrl });
        } catch (e: any) {
          if (reserved && !purchased) await releaseLabel(orderId);
          results.push({ orderId, success: false, error: e?.message ?? 'Erro desconhecido' });
        }
      }

      return { results };
    }),
});
