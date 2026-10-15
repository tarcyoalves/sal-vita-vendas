import { describe, it, expect } from 'vitest';
import { checkWebhookSecret } from '../server/lib/webhookSecret';

const S = 'segredo-de-teste-123';

describe('checkWebhookSecret', () => {
  it('aceita Authorization: Bearer', () => {
    expect(checkWebhookSecret(S, { authorization: `Bearer ${S}` }, {})).toEqual({ ok: true, via: 'header' });
    expect(checkWebhookSecret(S, { authorization: `bearer ${S}` }, {})).toEqual({ ok: true, via: 'header' });
  });
  it('aceita X-Webhook-Secret', () => {
    expect(checkWebhookSecret(S, { 'x-webhook-secret': S }, {})).toEqual({ ok: true, via: 'header' });
  });
  it('querystring ainda funciona como fallback e é sinalizada', () => {
    expect(checkWebhookSecret(S, {}, { secret: S })).toEqual({ ok: true, via: 'query' });
  });
  it('cabeçalho vale mesmo com querystring errada junto', () => {
    expect(checkWebhookSecret(S, { 'x-webhook-secret': S }, { secret: 'errado' })).toEqual({ ok: true, via: 'header' });
  });
  it('rejeita segredo errado, vazio ou ausente', () => {
    expect(checkWebhookSecret(S, { authorization: 'Bearer outro' }, {}).ok).toBe(false);
    expect(checkWebhookSecret(S, { 'x-webhook-secret': '' }, {}).ok).toBe(false);
    expect(checkWebhookSecret(S, {}, {}).ok).toBe(false);
    expect(checkWebhookSecret(S, { authorization: 'Basic abc' }, {}).ok).toBe(false);
  });
  it('rejeita quando o segredo esperado está vazio (não configurado)', () => {
    expect(checkWebhookSecret('', { 'x-webhook-secret': '' }, { secret: '' }).ok).toBe(false);
  });
  it('querystring em array (?secret=a&secret=b) não passa', () => {
    expect(checkWebhookSecret(S, {}, { secret: [S, S] }).ok).toBe(false);
  });
  it('WEBHOOK_ALLOW_QUERY_SECRET=0 desliga o fallback da querystring', () => {
    expect(checkWebhookSecret(S, {}, { secret: S }, { WEBHOOK_ALLOW_QUERY_SECRET: '0' }).ok).toBe(false);
    expect(checkWebhookSecret(S, { 'x-webhook-secret': S }, {}, { WEBHOOK_ALLOW_QUERY_SECRET: '0' }).ok).toBe(true);
  });
  it('comprimento diferente não lança', () => {
    expect(() => checkWebhookSecret(S, { 'x-webhook-secret': 'x' }, {})).not.toThrow();
  });
});
