import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eligibleForAutoLabel, isBalanceError, fetchMeBalance } from '../server/lib/meTracking';

const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const NOW = Date.parse('2026-10-15T15:00:00-03:00');
const ok = {
  paymentStatus: 'confirmed', status: 'confirmed', meOrderId: null,
  shippingServiceId: '15', createdAt: new Date('2026-10-15T10:00:00-03:00'),
};

describe('pedido elegível para etiqueta automática', () => {
  it('aceita pedido pago, não cancelado, sem etiqueta, com frete e recente', () => {
    expect(eligibleForAutoLabel(ok, NOW)).toBe(true);
  });
  it('recusa pago pendente, não pago, cancelado e já com etiqueta', () => {
    expect(eligibleForAutoLabel({ ...ok, paymentStatus: 'awaiting' }, NOW)).toBe(false);
    expect(eligibleForAutoLabel({ ...ok, paymentStatus: 'failed' }, NOW)).toBe(false);
    expect(eligibleForAutoLabel({ ...ok, status: 'cancelled' }, NOW)).toBe(false);
    expect(eligibleForAutoLabel({ ...ok, status: 'label_generated' }, NOW)).toBe(false);
    expect(eligibleForAutoLabel({ ...ok, status: 'shipped' }, NOW)).toBe(false);
    expect(eligibleForAutoLabel({ ...ok, meOrderId: 'pending' }, NOW)).toBe(false);
    expect(eligibleForAutoLabel({ ...ok, meOrderId: 'abc-123' }, NOW)).toBe(false);
  });
  it('recusa sem serviço de frete válido e pedido antigo', () => {
    expect(eligibleForAutoLabel({ ...ok, shippingServiceId: null }, NOW)).toBe(false);
    expect(eligibleForAutoLabel({ ...ok, shippingServiceId: 'abc' }, NOW)).toBe(false);
    expect(eligibleForAutoLabel({ ...ok, createdAt: new Date('2026-09-20T10:00:00-03:00') }, NOW)).toBe(false);
    expect(eligibleForAutoLabel({ ...ok, createdAt: null }, NOW)).toBe(false);
  });
});

describe('saldo do Melhor Envio', () => {
  it('reconhece erro de falta de saldo', () => {
    expect(isBalanceError('Erro checkout ME: Saldo insuficiente')).toBe(true);
    expect(isBalanceError('insufficient balance')).toBe(true);
    expect(isBalanceError('Erro cart ME: CEP inválido')).toBe(false);
  });
  it('lê o saldo e devolve null em erro de rede ou HTTP, sem lançar', async () => {
    const good = vi.fn(async () => new Response(JSON.stringify({ balance: 15.9, reserved: 0, debts: 0 }), { status: 200 }));
    expect(await fetchMeBalance('tok', good as unknown as typeof fetch)).toBe(15.9);
    const [url, init] = good.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://melhorenvio.com.br/api/v2/me/balance');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(await fetchMeBalance('tok', (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch)).toBeNull();
    expect(await fetchMeBalance('tok', (async () => { throw new Error('rede'); }) as unknown as typeof fetch)).toBeNull();
    expect(await fetchMeBalance('tok', (async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch)).toBeNull();
  });
});

describe('ligação no servidor', () => {
  const shipping = read('server/routers/shipping.ts');
  const confirmation = read('server/lib/orderConfirmation.ts');
  const api = read('api/index.ts');
  const fnBody = (src: string, header: string) => {
    const rest = src.slice(src.indexOf(header));
    return rest.slice(0, rest.search(/\r?\n\}\r?\n/));
  };

  it('o botão do painel e a rotina automática usam a MESMA função de gerar etiqueta', () => {
    expect(shipping).toMatch(/return generateLabelForOrder\(input\.orderId\)/);
    expect(fnBody(shipping, 'export async function autoGenerateLabels')).toMatch(/generateLabelForOrder\(order\.id\)/);
    // a compra continua protegida: só pago e com reserva contra etiqueta duplicada
    const gen = fnBody(shipping, 'async function generateLabelForOrder');
    expect(gen).toMatch(/paymentStatus !== 'confirmed'/);
    expect(gen).toMatch(/reserveLabel\(orderId\)/);
  });
  it('confere o saldo antes de comprar e avisa por e-mail uma vez por dia', () => {
    const auto = fnBody(shipping, 'export async function autoGenerateLabels');
    expect(auto.indexOf('fetchMeBalance(')).toBeLessThan(auto.indexOf('generateLabelForOrder(order.id)'));
    expect(auto).toMatch(/balance < price/);
    expect(auto).toMatch(/claimDailyAlert\('saldo'\)/);
    expect(auto).toMatch(/\.limit\(10\)/);
  });
  it('só pedido pago e não cancelado entra na consulta', () => {
    const auto = fnBody(shipping, 'export async function autoGenerateLabels');
    expect(auto).toMatch(/eq\(siteOrders\.paymentStatus, 'confirmed'\), eq\(siteOrders\.status, 'confirmed'\)/);
    expect(auto).toMatch(/isNull\(siteOrders\.meOrderId\)/);
  });
  it('roda no cron diário e logo após a confirmação do pagamento, com limite de tempo', () => {
    expect(api).toMatch(/runIsolated\('auto-labels'/);
    const conf = fnBody(confirmation, 'export async function confirmOrderPaid');
    expect(conf).toMatch(/autoGenerateLabels\(\{ orderId: order\.id \}\)/);
    expect(conf).toMatch(/20_000/);
    // é o último passo: nenhum passo de pagamento vem depois
    expect(conf.indexOf('autoGenerateLabels')).toBeGreaterThan(conf.indexOf('orderConfirmedHtml'));
  });
  it('o painel mostra o relatório e permite gerar manualmente o que ficou esperando', () => {
    const admin = read('client/src/pages/SalVitaAdmin.tsx');
    expect(admin).toMatch(/<AutoLabelPanel \/>/);
    expect(admin).toMatch(/shipping\.autoLabelReport\.useQuery/);
    expect(shipping).toMatch(/autoLabelReport: premiumAdminProcedure/);
  });
});
