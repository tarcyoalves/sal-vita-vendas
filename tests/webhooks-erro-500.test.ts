// Webhooks: erro de banco/processamento responde 500 (o provedor reenvia); evento ignorado/corpo inválido não.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'segredo-so-para-teste';
  return { execute: vi.fn(), suppress: vi.fn() };
});
vi.mock('../server/db/ordersDb', () => ({ ordersDb: { execute: h.execute } }));
vi.mock('../server/db', () => ({ db: {} }));
vi.mock('../server/routers/unsubscribe', () => ({ suppressEmailGlobal: h.suppress }));

import crypto from 'crypto';
import { handleResendWebhook } from '../server/routers/resendWebhook';
import { corpoIgnoravel, responderFalhaTemporaria } from '../server/lib/webhookResposta';

const SECRET = 'segredo-de-teste';
function pedido(evento: unknown) {
  const raw = Buffer.from(typeof evento === 'string' ? evento : JSON.stringify(evento));
  const id = 'msg_1';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', Buffer.from(SECRET)).update(`${id}.${ts}.${raw.toString()}`).digest('base64');
  return { body: raw, headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` } } as never;
}
function resposta() {
  const r: any = { headersSent: false, statusCode: 0, json: vi.fn(() => r) };
  r.status = vi.fn((c: number) => { r.statusCode = c; return r; });
  return r;
}
const bounce = { type: 'email.bounced', data: { email_id: 'e1', to: ['a@x.com'] } };

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  h.execute.mockReset().mockResolvedValue({ rows: [] });
  h.suppress.mockReset().mockResolvedValue({ failures: [], primaryFailed: false });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('webhook Resend do Premium', () => {
  it('sucesso: 200', async () => {
    const res = resposta();
    await handleResendWebhook(pedido(bounce), res);
    expect(res.statusCode).toBe(200);
    expect(h.suppress).toHaveBeenCalledWith('a@x.com', 'bounce');
  });

  it('supressão principal falhou (primaryFailed): 500 para o Resend reenviar', async () => {
    h.suppress.mockResolvedValue({ failures: ['premium.email_suppressions'], primaryFailed: true });
    const res = resposta();
    await handleResendWebhook(pedido(bounce), res);
    expect(res.statusCode).toBe(500);
  });

  it('falha só em tabela secundária: 200', async () => {
    h.suppress.mockResolvedValue({ failures: ['crm.clients'], primaryFailed: false });
    const res = resposta();
    await handleResendWebhook(pedido(bounce), res);
    expect(res.statusCode).toBe(200);
  });

  it('erro de banco ao gravar o evento: 500', async () => {
    h.execute.mockRejectedValue(new Error('db down'));
    const res = resposta();
    await handleResendWebhook(pedido({ type: 'email.opened', data: { email_id: 'e1', to: ['a@x.com'] } }), res);
    expect(res.statusCode).toBe(500);
  });

  it('suppressEmailGlobal lançando: 500, sem rejeitar', async () => {
    h.suppress.mockRejectedValue(new Error('boom'));
    const res = resposta();
    await handleResendWebhook(pedido(bounce), res);
    expect(res.statusCode).toBe(500);
  });

  it('evento sem dados é ignorado com 200; JSON inválido continua 400', async () => {
    const a = resposta();
    await handleResendWebhook(pedido({ foo: 1 }), a);
    expect(a.statusCode).toBe(200);
    const b = resposta();
    await handleResendWebhook(pedido('{nao-json'), b);
    expect(b.statusCode).toBe(400);
  });
});

describe('helpers dos webhooks do CRM (Resend/Brevo)', () => {
  it('responderFalhaTemporaria: 500 se ainda não respondeu; nada se já respondeu', () => {
    const res = resposta();
    responderFalhaTemporaria(res, 'x', new Error('db'));
    expect(res.statusCode).toBe(500);
    const feito = resposta();
    feito.headersSent = true;
    responderFalhaTemporaria(feito, 'x', new Error('db'));
    expect(feito.status).not.toHaveBeenCalled();
  });

  it('corpoIgnoravel: só objeto JSON é processado', () => {
    expect(corpoIgnoravel(null)).toBe(true);
    expect(corpoIgnoravel('texto')).toBe(true);
    expect(corpoIgnoravel([1])).toBe(true);
    expect(corpoIgnoravel(undefined)).toBe(true);
    expect(corpoIgnoravel({ type: 'x' })).toBe(false);
  });
});
