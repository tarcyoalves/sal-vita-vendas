import { describe, it, expect, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import type { Request } from 'express';
vi.mock('../server/db/ordersDb', () => ({ ordersDb: {} }));
vi.mock('../server/routers/unsubscribe', () => ({ suppressEmailGlobal: vi.fn() }));

import { verifySvixSignature } from '../server/routers/resendWebhook';

const secretB64 = Buffer.from('segredo-de-teste-premium').toString('base64');

function signed(body: string, secret = secretB64) {
  const id = 'msg_1';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto.createHmac('sha256', Buffer.from(secret, 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  return { headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` } } as unknown as Request;
}

describe('verifySvixSignature (Premium)', () => {
  const old = process.env.RESEND_WEBHOOK_SECRET;
  afterEach(() => { process.env.RESEND_WEBHOOK_SECRET = old; if (old === undefined) delete process.env.RESEND_WEBHOOK_SECRET; });

  it('aceita assinatura do segredo do Premium e recusa a de outro segredo (que cai no handler do CRM)', () => {
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${secretB64}`;
    const body = '{"type":"email.opened"}';
    expect(verifySvixSignature(signed(body), Buffer.from(body))).toBe(true);
    const outro = Buffer.from('outro-segredo').toString('base64');
    expect(verifySvixSignature(signed(body, outro), Buffer.from(body))).toBe(false);
  });
});
