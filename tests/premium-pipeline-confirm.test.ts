import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'teste-jwt-secret-apenas-para-vitest-0123456789';
  process.env.DATABASE_URL ||= 'postgres://u:p@localhost/x';
});

const returning = vi.fn();
const chain: any = {};
chain.set = vi.fn(() => chain);
chain.where = vi.fn(() => chain);
chain.returning = (...a: unknown[]) => returning(...a);
vi.mock('../server/db/ordersDb', () => ({ ordersDb: { update: vi.fn(() => chain) } }));
const appendReviewNote = vi.fn(async () => {});
const confirmOrderPaid = vi.fn(async () => {});
vi.mock('../server/lib/orderConfirmation', () => ({
  appendReviewNote: (...a: unknown[]) => (appendReviewNote as any)(...a),
  confirmOrderPaid: (...a: unknown[]) => (confirmOrderPaid as any)(...a),
  podeConfirmarPagamento: {},
}));

import { confirmApprovedPayment, valorDivergente, deveReenviarWebhook } from '../server/lib/confirmApprovedPayment';
import { freteInformadoValido } from '../server/lib/paymentTransition';

const order = (o: Record<string, unknown> = {}) => ({ id: 7, paymentStatus: 'awaiting', status: 'pending', totalPrice: '29.90', mpPaymentId: null, ...o }) as any;
const pay = (o: Record<string, unknown> = {}) => ({ status: 'approved', id: 555, transaction_amount: 29.9, ...o });

beforeEach(() => { returning.mockReset(); appendReviewNote.mockClear(); confirmOrderPaid.mockClear(); });

describe('confirmApprovedPayment (rotina única webhook/reconcile/pixStatus)', () => {
  it('confirma e roda confirmOrderPaid só quando o UPDATE devolve linha', async () => {
    returning.mockResolvedValue([{ id: 7 }]);
    const r = await confirmApprovedPayment(order(), pay(), 'pixStatus');
    expect(r.resultado).toBe('confirmado');
    expect(confirmOrderPaid).toHaveBeenCalledTimes(1);
  });
  it('UPDATE sem linha (outro chamador venceu): não repete efeitos', async () => {
    returning.mockResolvedValue([]);
    const r = await confirmApprovedPayment(order(), pay(), 'webhook');
    expect(r.resultado).toBe('concorrente');
    expect(confirmOrderPaid).not.toHaveBeenCalled();
  });
  it('já confirmado pelo mesmo pagamento: idempotente, sem nota', async () => {
    const r = await confirmApprovedPayment(order({ paymentStatus: 'confirmed', mpPaymentId: '555' }), pay(), 'pixStatus');
    expect(r.resultado).toBe('ja_confirmado');
    expect(appendReviewNote).not.toHaveBeenCalled();
    expect(confirmOrderPaid).not.toHaveBeenCalled();
  });
  it('já confirmado por OUTRO pagamento: nota de duplicidade', async () => {
    const r = await confirmApprovedPayment(order({ paymentStatus: 'confirmed', mpPaymentId: '111' }), pay(), 'webhook');
    expect(r.resultado).toBe('ja_confirmado');
    expect(appendReviewNote).toHaveBeenCalledWith(7, expect.stringContaining('segundo pagamento aprovado'));
  });
  it('pedido cancelado: ignora e anota, nunca confirma', async () => {
    const r = await confirmApprovedPayment(order({ status: 'cancelled' }), pay(), 'reconcile');
    expect(r.resultado).toBe('ignorado');
    expect(appendReviewNote).toHaveBeenCalledWith(7, expect.stringContaining('pedido cancelado'));
    expect(returning).not.toHaveBeenCalled();
  });
  it('valor divergente: anota e NÃO confirma', async () => {
    const r = await confirmApprovedPayment(order(), pay({ transaction_amount: 10 }), 'reconcile');
    expect(r.resultado).toBe('divergente');
    expect(appendReviewNote).toHaveBeenCalledWith(7, expect.stringContaining('difere do pedido'));
    expect(returning).not.toHaveBeenCalled();
  });
  it('status diferente de approved não faz nada', async () => {
    expect((await confirmApprovedPayment(order(), pay({ status: 'pending' }), 'webhook')).resultado).toBe('nao_aprovado');
  });
  it('valorDivergente: tolerância de 1 centavo e sem valor/total', () => {
    expect(valorDivergente(29.9, '29.90')).toBe(false);
    expect(valorDivergente(29.905, '29.90')).toBe(false);
    expect(valorDivergente(30, '29.90')).toBe(true);
    expect(valorDivergente(undefined, '29.90')).toBe(false);
    expect(valorDivergente(5, '0')).toBe(false);
  });
});

describe('webhook reenviável', () => {
  it('5xx e 429 pedem reenvio; 404/4xx não', () => {
    for (const s of [500, 502, 503, 429]) expect(deveReenviarWebhook(s)).toBe(true);
    for (const s of [400, 401, 403, 404]) expect(deveReenviarWebhook(s)).toBe(false);
  });
});

describe('frete informado (teto de R$ 200 removido)', () => {
  it('aceita SEDEX da caixa de 10 kg; recusa negativo, absurdo e NaN', () => {
    expect(freteInformadoValido(272)).toBe(true);
    expect(freteInformadoValido(0)).toBe(true);
    expect(freteInformadoValido(1000)).toBe(true);
    expect(freteInformadoValido(1000.01)).toBe(false);
    expect(freteInformadoValido(-1)).toBe(false);
    expect(freteInformadoValido(NaN)).toBe(false);
  });
});

describe('fiação (guardas de texto)', () => {
  const api = readFileSync('api/index.ts', 'utf8');
  const ship = readFileSync('server/routers/shipping.ts', 'utf8');
  it('webhook, reconcile e pixStatus usam a rotina compartilhada', () => {
    expect(api).toContain("confirmApprovedPayment(order, payment, 'webhook')");
    expect(api).toContain("'reconcile'");
    expect(ship).toContain("'pixStatus'");
  });
  it('webhook responde 500 em 5xx/429 do MP', () => {
    expect(api).toMatch(/deveReenviarWebhook\(payRes\.status\)[\s\S]{0,400}res\.status\(500\)/);
  });
  it('createOrder usa freteInformadoValido, sem o teto de 200', () => {
    expect(ship).toContain('freteInformadoValido(input.shippingPrice)');
    expect(ship).not.toMatch(/shippingPrice > 200/);
  });
  it('alertOwner vive em lib e não é mais local do shipping', () => {
    expect(ship).not.toMatch(/async function alertOwner/);
    expect(ship).toContain("from '../lib/ownerAlert'");
  });
});
