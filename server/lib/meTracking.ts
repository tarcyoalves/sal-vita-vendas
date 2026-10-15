// Rastreio dos envios do Melhor Envio.
// - Consulta: POST /api/v2/me/shipment/tracking → objeto indexado pelo id da etiqueta.
//   Doc: https://docs.melhorenvio.com.br/reference/rastreio-de-envios
// - Webhook: eventos order.posted / delivered / undelivered / paused / suspended / cancelled,
//   assinados com X-ME-Signature (HMAC-SHA256 do corpo com o segredo do app).
//   Doc: https://docs.melhorenvio.com.br/docs/webhooks
// O Melhor Envio NÃO informa "saiu para entrega" nem cada movimentação da transportadora:
// os eventos possíveis são os de ShippingEvent abaixo.
import crypto from 'crypto';

export const ME_BASE = 'https://melhorenvio.com.br';
const ME_USER_AGENT = 'SalVita/1.0 (contato@salvitarn.com.br)';

export type MeTrackingInfo = {
  id: string;
  status?: string | null;
  tracking?: string | null;
  melhorenvio_tracking?: string | null;
  self_tracking?: string | null;
  tracking_url?: string | null;
  posted_at?: string | null;
  delivered_at?: string | null;
  canceled_at?: string | null;
};

/** Eventos que viram aviso ao cliente (um por pedido e evento). */
export type ShippingEvent = 'posted' | 'delivered' | 'undelivered' | 'paused' | 'suspended';
export const OCCURRENCE_EVENTS: ShippingEvent[] = ['undelivered', 'paused', 'suspended'];

/**
 * Link de rastreio que funciona para qualquer transportadora do Melhor Envio
 * (Correios, Jadlog, Azul Cargo, J&T). O link dos Correios não acha código AZL-…
 */
export function trackingLink(code: string): string {
  return `https://melhorrastreio.com.br/rastreio/${encodeURIComponent(code.trim())}`;
}

/** Código que o cliente usa: o da transportadora; o do Melhor Envio só se ela não tiver. */
export function pickTrackingCode(info: MeTrackingInfo): string | null {
  const code = (info.tracking || info.melhorenvio_tracking || info.self_tracking || '').trim();
  return code || null;
}

/** Status do Melhor Envio (consulta ou webhook "order.x") → evento nosso. */
export function eventFromInfo(info: MeTrackingInfo): ShippingEvent | null {
  const s = String(info.status ?? '').replace(/^order\./, '').toLowerCase();
  if (info.canceled_at || s === 'canceled' || s === 'cancelled') return null;
  if (info.delivered_at || s === 'delivered') return 'delivered';
  if (s === 'undelivered' || s === 'paused' || s === 'suspended') return s;
  if (info.posted_at || s === 'posted') return 'posted';
  return null;
}

export type TrackingDecision = {
  trackingCode: string | null;                // código a gravar (null = não mexer)
  status: 'shipped' | 'delivered' | null;     // novo status do pedido (null = não mexer)
  event: ShippingEvent | null;                // evento a registrar/avisar (null = nada)
};

/**
 * O que fazer com um pedido a partir do rastreio. O status do pedido só avança
 * (label_generated → shipped → delivered); ocorrência não muda o status, só gera evento.
 * "Postado" sem código ainda não é avisado (a transportadora pode levar até um dia útil
 * para gerar o código) — o evento sai na próxima consulta, quando o código existir.
 */
export function decideTrackingUpdate(
  order: { status: string | null; trackingCode: string | null },
  info: MeTrackingInfo,
): TrackingDecision {
  const none: TrackingDecision = { trackingCode: null, status: null, event: null };
  if (order.status !== 'label_generated' && order.status !== 'shipped') return none;
  const code = pickTrackingCode(info);
  const newCode = code && code !== order.trackingCode ? code : null;
  const event = eventFromInfo(info);
  if (!event) return { ...none, trackingCode: newCode };

  const status = event === 'delivered' ? 'delivered'
    : order.status === 'label_generated' ? 'shipped' : null;
  const knownCode = code ?? order.trackingCode;
  // Sem código não dá para avisar "postado" com rastreio: espera a próxima consulta.
  const notifiable = event === 'posted' ? !!knownCode : true;
  return { trackingCode: newCode, status, event: notifiable ? event : null };
}

/** Só avisa evento recente: quem foi entregue há semanas não recebe "foi entregue" agora. */
export function isRecentEvent(info: MeTrackingInfo, event: ShippingEvent, now = Date.now()): boolean {
  const raw = event === 'delivered' ? info.delivered_at : event === 'posted' ? info.posted_at : null;
  if (!raw) return true; // ocorrências não trazem data: o próprio status é atual
  const t = Date.parse(raw.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(raw) ? '' : '-03:00'));
  if (Number.isNaN(t)) return true;
  return now - t <= 4 * 24 * 60 * 60 * 1000;
}

/** Verifica X-ME-Signature (HMAC-SHA256 do corpo cru), aceitando hex ou base64. */
export function verifyMeSignature(rawBody: string | Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  const mac = crypto.createHmac('sha256', secret).update(rawBody);
  const digest = mac.digest();
  const given = signature.trim();
  for (const expected of [digest.toString('hex'), digest.toString('base64')]) {
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** Consulta o rastreio de até 100 etiquetas. Lança em erro HTTP; o chamador decide. */
export async function fetchMeTracking(
  ids: string[],
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, MeTrackingInfo>> {
  if (!ids.length) return {};
  const res = await fetchImpl(`${ME_BASE}/api/v2/me/shipment/tracking`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': ME_USER_AGENT,
    },
    body: JSON.stringify({ orders: ids.slice(0, 100) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Melhor Envio tracking ${res.status}`);
  const data = await res.json().catch(() => ({}));
  return (data && typeof data === 'object') ? data as Record<string, MeTrackingInfo> : {};
}
