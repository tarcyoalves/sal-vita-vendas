import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'teste-jwt-secret-apenas-para-vitest-0123456789';
  process.env.DATABASE_URL ||= 'postgres://u:p@localhost/x';
});
vi.mock('../server/db/ordersDb', () => ({ ordersDb: {} }));

import { decidirTransicaoPagamento } from '../server/lib/paymentTransition';

const api = readFileSync('api/index.ts', 'utf8');
const oc = readFileSync('server/lib/orderConfirmation.ts', 'utf8');
const landing = readFileSync('client/src/pages/SalVitaLanding.tsx', 'utf8');
const app = readFileSync('client/src/App.tsx', 'utf8');
const track = readFileSync('client/src/pages/TrackOrder.tsx', 'utf8');

describe('review fix 1: pedido cancelado (ainda awaiting) não confirma', () => {
  it('approved + awaiting + cancelled → ignorar', () => {
    expect(decidirTransicaoPagamento({ paymentStatus: 'awaiting', status: 'cancelled' }, 'approved')).toBe('ignorar');
  });
  it('approved + awaiting em pedido pendente → confirmar', () => {
    expect(decidirTransicaoPagamento({ paymentStatus: 'awaiting', status: 'pending' }, 'approved')).toBe('confirmar');
  });
  it('podeConfirmarPagamento exige status <> cancelled também para awaiting', () => {
    expect(oc).toMatch(/podeConfirmarPagamento = and\(\s*ne\(siteOrders\.status, 'cancelled'\),\s*or\(/);
  });
  it('reconcile anota [REVISAR] em cancelado aprovado em vez de confirmar', () => {
    expect(api).toMatch(/o\.status === 'cancelled'\) \{[\s\S]{0,300}appendReviewNote\(o\.id, `pagamento aprovado em pedido cancelado/);
  });
});

describe('review fix 2: limite do poll de PIX', () => {
  it('limiter permite 300 por 15 min', () => {
    expect(api).toMatch(/pixStatusLimiter = rateLimit\(\{\s*windowMs: 15 \* 60 \* 1000,\s*max: 300,/);
  });
  it('cliente: 5s nos 2 primeiros minutos, depois 15s; 429 não conta como falha', () => {
    expect(landing).toMatch(/PIX_FAST_MS/);
    expect(landing).toMatch(/PIX_SLOW_INTERVAL_MS = 15_000/);
    expect(landing).toMatch(/r\.status === 429\) \{ schedule\(PIX_SLOW_INTERVAL_MS\); return; \}/);
    expect(landing).toMatch(/setTimeout\(tick/);
  });
});

describe('review fix 3-7 (cliente)', () => {
  it('resume: handleMpPay lê a mensagem do servidor e limpa o pendente se cancelado/pago', () => {
    expect(landing).toMatch(/foi cancelado\|já foi pago/);
    expect(landing.match(/if \(pedidoEncerrado\(apiMsg\)\) clearPending\(\)/g)).toHaveLength(2);
    expect(landing.match(/pedidoJaPago\(payErr\)[^\n]*Acompanhar pedido/g)).toHaveLength(2);
  });
  it('Voltar desabilitado durante createOrder e resposta tardia ignorada', () => {
    expect(landing).toMatch(/onClick=\{backToStep1\} disabled=\{checkoutLoading\}/);
    expect(landing).toMatch(/reqId !== createReqId\.current\) \{/);
    expect(landing).toMatch(/dlgOrderRef\.current !== orderDone\.id\) \{ setPixLoading\(false\); return; \}/); // fix 5
  });
  it('AddPaymentInfo só uma vez por pedido', () => {
    expect(landing.match(/addPaymentInfoSent\.current\.has\(/g)).toHaveLength(2);
  });
  it('cupom do link semeia o campo em openBuy', () => {
    expect(landing).toMatch(/setCouponCode\(autoCouponRef\.current\)/);
  });
});

describe('review fix 8-9', () => {
  it('preloadError usa timestamp (>60s) em vez de flag eterna', () => {
    expect(app).toMatch(/60_000/);
  });
  it('TrackOrder: erro inline e aviso de recarregar após o teto do poll', () => {
    expect(track).toMatch(/recarregue/i);
    expect(track).toMatch(/setPayErr\(apiMsg/);
    expect(track).not.toMatch(/alert\('Erro ao gerar link/);
  });
});
