import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  trackingLink, pickTrackingCode, decideTrackingUpdate, fetchMeTracking, eventFromInfo,
  isRecentEvent, verifyMeSignature, type MeTrackingInfo,
} from '../server/lib/meTracking';
import { trackingLink as clientTrackingLink } from '../client/src/lib/trackingLink';

const info = (p: Partial<MeTrackingInfo>): MeTrackingInfo => ({ id: 'x', ...p });
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const shippingSrc = read('server/routers/shipping.ts');

describe('link de rastreio', () => {
  it('serve para qualquer transportadora (código AZL não vai para os Correios)', () => {
    expect(trackingLink('AZL-KT02990978')).toBe('https://melhorrastreio.com.br/rastreio/AZL-KT02990978');
    expect(trackingLink(' AA123456789BR ')).toBe('https://melhorrastreio.com.br/rastreio/AA123456789BR');
  });
  it('cliente e servidor geram o mesmo link', () => {
    expect(clientTrackingLink('AZL-KT02990978')).toBe(trackingLink('AZL-KT02990978'));
  });
  it('nenhum link fixo dos Correios sobra no rastreio da loja', () => {
    for (const f of ['server/routers/shipping.ts', 'client/src/pages/TrackOrder.tsx', 'client/src/pages/SalVitaAdmin.tsx']) {
      expect(read(f)).not.toContain('rastreamento.correios.com.br');
    }
  });
});

describe('código e evento', () => {
  it('prefere o código da transportadora ao do Melhor Envio', () => {
    expect(pickTrackingCode(info({ tracking: 'AZL-1', melhorenvio_tracking: 'ME1' }))).toBe('AZL-1');
    expect(pickTrackingCode(info({ tracking: null, melhorenvio_tracking: 'ME1' }))).toBe('ME1');
    expect(pickTrackingCode(info({}))).toBeNull();
  });
  it('traduz status da consulta e do webhook', () => {
    expect(eventFromInfo(info({ status: 'posted' }))).toBe('posted');
    expect(eventFromInfo(info({ status: 'order.posted' }))).toBe('posted');
    expect(eventFromInfo(info({ status: 'order.delivered' }))).toBe('delivered');
    expect(eventFromInfo(info({ status: 'undelivered' }))).toBe('undelivered');
    expect(eventFromInfo(info({ status: 'order.paused' }))).toBe('paused');
    expect(eventFromInfo(info({ status: 'suspended' }))).toBe('suspended');
    expect(eventFromInfo(info({ status: 'released' }))).toBeNull();
    expect(eventFromInfo(info({ status: 'posted', canceled_at: 'x' }))).toBeNull();
  });
});

describe('decideTrackingUpdate', () => {
  const gen = { status: 'label_generated', trackingCode: null };
  const shipped = { status: 'shipped', trackingCode: 'AZL-1' };

  it('etiqueta paga e não postada: só grava o código', () => {
    expect(decideTrackingUpdate(gen, info({ status: 'released', tracking: 'AZL-1' })))
      .toEqual({ trackingCode: 'AZL-1', status: null, event: null });
  });
  it('postada (caso do pedido #10004): vira shipped e gera o evento', () => {
    expect(decideTrackingUpdate(gen, info({ status: 'posted', tracking: 'AZL-KT02990978', posted_at: '2026-10-15 10:00:00' })))
      .toEqual({ trackingCode: 'AZL-KT02990978', status: 'shipped', event: 'posted' });
  });
  it('postada sem código ainda: marca shipped mas espera o código para avisar', () => {
    expect(decideTrackingUpdate(gen, info({ status: 'posted', posted_at: 'x' })))
      .toEqual({ trackingCode: null, status: 'shipped', event: null });
  });
  it('já shipped pelo painel: o evento existe, a trava decide se avisa', () => {
    expect(decideTrackingUpdate(shipped, info({ status: 'posted', tracking: 'AZL-1', posted_at: 'x' })))
      .toEqual({ trackingCode: null, status: null, event: 'posted' });
  });
  it('entregue: vira delivered', () => {
    expect(decideTrackingUpdate(shipped, info({ tracking: 'AZL-1', delivered_at: 'x' })))
      .toEqual({ trackingCode: null, status: 'delivered', event: 'delivered' });
  });
  it('ocorrência: não muda o status, gera evento', () => {
    expect(decideTrackingUpdate(shipped, info({ status: 'undelivered', tracking: 'AZL-1' })))
      .toEqual({ trackingCode: null, status: null, event: 'undelivered' });
  });
  it('pedido cancelado, entregue ou etiqueta cancelada: não mexe', () => {
    expect(decideTrackingUpdate({ status: 'cancelled', trackingCode: null }, info({ status: 'posted', tracking: 'A' })).event).toBeNull();
    expect(decideTrackingUpdate({ status: 'delivered', trackingCode: 'A' }, info({ status: 'delivered' })).event).toBeNull();
    expect(decideTrackingUpdate(gen, info({ status: 'posted', tracking: 'A', canceled_at: 'y' })).status).toBeNull();
  });
});

describe('isRecentEvent', () => {
  const now = Date.parse('2026-10-15T15:00:00-03:00');
  it('avisa evento dos últimos dias e não avisa entrega antiga', () => {
    expect(isRecentEvent(info({ posted_at: '2026-10-14 16:00:00' }), 'posted', now)).toBe(true);
    expect(isRecentEvent(info({ delivered_at: '2026-09-20 10:00:00' }), 'delivered', now)).toBe(false);
    expect(isRecentEvent(info({ status: 'paused' }), 'paused', now)).toBe(true);
  });
});

describe('assinatura do webhook', () => {
  const body = JSON.stringify({ event: 'order.posted', data: { id: 'abc' } });
  const mac = crypto.createHmac('sha256', 'segredo').update(body).digest();
  it('aceita HMAC em hex ou base64 e recusa o resto', () => {
    expect(verifyMeSignature(body, mac.toString('hex'), 'segredo')).toBe(true);
    expect(verifyMeSignature(body, mac.toString('base64'), 'segredo')).toBe(true);
    expect(verifyMeSignature(body, mac.toString('hex'), 'outro')).toBe(false);
    expect(verifyMeSignature(body + ' ', mac.toString('hex'), 'segredo')).toBe(false);
    expect(verifyMeSignature(body, undefined, 'segredo')).toBe(false);
    expect(verifyMeSignature(body, mac.toString('hex'), '')).toBe(false);
  });
});

describe('fetchMeTracking (sem rede)', () => {
  it('chama o endpoint de rastreio com os ids e o token', async () => {
    const body = { abc: { id: 'abc', tracking: 'AZL-1', posted_at: 'x' } };
    const fake = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const out = await fetchMeTracking(['abc'], 'tok', fake as unknown as typeof fetch);
    expect(out.abc.tracking).toBe('AZL-1');
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://melhorenvio.com.br/api/v2/me/shipment/tracking');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ orders: ['abc'] });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });
  it('lança em erro HTTP e não chama nada sem ids', async () => {
    const fake = vi.fn(async () => new Response('{}', { status: 401 }));
    await expect(fetchMeTracking(['abc'], 'tok', fake as unknown as typeof fetch)).rejects.toThrow('401');
    expect(await fetchMeTracking([], 'tok', fake as unknown as typeof fetch)).toEqual({});
    expect(fake).toHaveBeenCalledTimes(1);
  });
});

describe('e-mails de envio', () => {
  it('um texto por evento, com código, link e nome escapado', async () => {
    // resend.ts importa a cota (banco) — sem URL o módulo recusa carregar; não há conexão real.
    process.env.ORDERS_DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
    const { shippingUpdateEmail } = await import('../server/email/resend');
    const link = trackingLink('AZL-KT02990978');
    const page = 'https://www.premium.salvitarn.com.br/meu-pedido';
    const posted = shippingUpdateEmail('posted', 'Ana <b>', 10004, 'AZL-KT02990978', link, page);
    expect(posted.subject).toBe('Pedido #10004 postado — rastreio AZL-KT02990978');
    expect(posted.html).toContain(link);
    expect(posted.html).toContain('Ana &lt;b&gt;');
    expect(posted.html).not.toContain('Ana <b>');
    expect(shippingUpdateEmail('delivered', 'Ana', 1, 'X', link, page).subject).toBe('Pedido #1 entregue');
    for (const e of ['undelivered', 'paused', 'suspended'] as const) {
      expect(shippingUpdateEmail(e, 'Ana', 1, 'X', link, page).html).toContain('WhatsApp');
    }
  });
});

describe('ligação no servidor', () => {
  const api = read('api/index.ts');
  const migrate = read('server/db/ordersMigrate.ts');
  it('o cron diário roda a sincronização isolada e o webhook exige assinatura', () => {
    expect(api).toMatch(/runIsolated\('me-tracking', syncMeTracking/);
    expect(api).toMatch(/app\.post\('\/api\/me-webhook'/);
    expect(api).toMatch(/!secret \|\| !verifyMeSignature\(/);
  });
  it('um aviso por pedido e evento: trava em shipping_events com chave (order_id, event)', () => {
    expect(migrate).toMatch(/CREATE TABLE IF NOT EXISTS shipping_events/);
    expect(migrate).toMatch(/PRIMARY KEY \(order_id, event\)/);
    expect(shippingSrc).toMatch(/ON CONFLICT DO NOTHING\s+RETURNING order_id/);
  });
  it('pedidos já enviados antes da automação não recebem aviso de postado', () => {
    expect(migrate).toMatch(/SELECT id, 'posted', 'backfill' FROM site_orders WHERE status IN \('shipped', 'delivered'\)/);
  });
  it('aviso tenta e-mail antes do WhatsApp, e WhatsApp só no postado', () => {
    const fn = shippingSrc.slice(shippingSrc.indexOf('export async function notifyShippingEvent'));
    expect(fn.indexOf('sendEmail(')).toBeGreaterThan(0);
    expect(fn.indexOf('sendEmail(')).toBeLessThan(fn.indexOf('notifyShippedWhatsApp(order, code)'));
    expect(fn).toMatch(/if \(event === 'posted' && code\)/);
  });
  it('as duas rotas de etiqueta tentam gravar o código logo após gerar', () => {
    expect(shippingSrc.match(/await fillTrackingCodeAfterLabel\((input\.)?orderId, meOrderId, token\)/g)?.length).toBe(2);
  });
});
