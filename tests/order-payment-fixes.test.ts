import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const calls: string[] = [];

vi.mock('../server/db/ordersDb', () => {
  const failing = () => ({ set: () => ({ where: () => { calls.push('update'); return Promise.reject(new Error('db down')); } }) });
  const empty = { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) };
  return { ordersDb: { update: failing, select: () => empty } };
});
vi.mock('../server/email/resend', () => ({
  orderConfirmedHtml: () => '<p>ok</p>',
  sendEmail: vi.fn(async () => { await new Promise(r => setTimeout(r, 20)); calls.push('email-done'); }),
}));

import { confirmOrderPaid, CONFIRMABLE_PAYMENT_STATUSES } from '../server/lib/orderConfirmation';

const order = {
  id: 7, customerName: 'Ana', customerPhone: '(84) 99999-0000', customerEmail: 'a@b.com',
  totalPrice: '29.90', couponCode: null,
} as unknown as Parameters<typeof confirmOrderPaid>[0];

describe('confirmOrderPaid (DB-5)', () => {
  beforeEach(() => { calls.length = 0; vi.spyOn(console, 'error').mockImplementation(() => {}); });

  it('um passo de banco falho não impede os seguintes e o e-mail é aguardado', async () => {
    await expect(confirmOrderPaid(order)).resolves.toBeUndefined();
    // os dois UPDATEs (automações e carrinho) foram tentados mesmo com o primeiro falhando
    expect(calls.filter(c => c === 'update')).toHaveLength(2);
    // o e-mail terminou ANTES da função retornar (await, não fire-and-forget)
    expect(calls).toContain('email-done');
  });
});

describe('DB-1: estados que aceitam confirmação', () => {
  it("'failed' (cartão recusado, depois PIX pago) também confirma", () => {
    expect([...CONFIRMABLE_PAYMENT_STATUSES]).toEqual(['awaiting', 'failed']);
  });
  it("mas pedido 'failed' CANCELADO não é confirmado por pagamento tardio", () => {
    const src = readFileSync('server/lib/orderConfirmation.ts', 'utf8');
    expect(src).toMatch(/podeConfirmarPagamento = or\([\s\S]*'failed'\), ne\(siteOrders\.status, 'cancelled'\)/);
  });
  it('webhook e reconcile usam a lista; rejected só rebaixa awaiting; erro de banco responde 500', () => {
    const src = readFileSync('api/index.ts', 'utf8');
    expect(src.match(/eq\(siteOrders\.id, (orderId|o\.id)\), podeConfirmarPagamento\)/g)).toHaveLength(2);
    expect(src).toMatch(/paymentStatus: 'failed', mpPaymentId: mpId[\s\S]{0,60}\}\)\s*\.where\(and\(eq\(siteOrders\.id, orderId\), eq\(siteOrders\.paymentStatus, 'awaiting'\)\)\)/);
    expect(src).toMatch(/MP webhook error[\s\S]{0,300}res\.status\(500\)/);
  });
});

describe('guardas de código (DB-6/12/13/21/22/23)', () => {
  const ship = readFileSync('server/routers/shipping.ts', 'utf8');
  const api = readFileSync('api/index.ts', 'utf8');
  const mig = readFileSync('server/db/migrate.ts', 'utf8');

  it('etiqueta: reserva atômica e lote limitado', () => {
    expect(ship).toContain("meOrderId: 'pending'");
    expect(ship).toMatch(/orderIds: z\.array\(z\.number\(\)\)\.max\(25\)/);
    expect((ship.match(/reserveLabel\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
  it('deleteOrder bloqueia pedido confirmado', () => {
    expect(ship).toMatch(/payment_status|paymentStatus\} <> 'confirmed'/);
  });
  it('cron de abandono faz claim atômico e reconcile ordena por created_at desc', () => {
    expect(api).toMatch(/SET status = 'sending'[\s\S]{0,400}FOR UPDATE SKIP LOCKED/);
    expect(api).toContain('.orderBy(desc(siteOrders.createdAt)).limit(20)');
    expect(api).toContain("INTERVAL '730 days'");
  });
  it('purge de work_sessions usa ended e chat usa o dia de São Paulo', () => {
    expect(mig).not.toContain("status = 'completed'");
    expect(mig).not.toContain('chat_messages WHERE created_at < CURRENT_DATE');
    expect(mig).toContain("America/Sao_Paulo");
  });
});
