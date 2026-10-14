import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isAdminPath,
  batchBlockReason,
  splitBatchSelection,
  computeKpis,
  matchesSearch,
  csvText,
  BATCH_LABEL_MAX,
} from '../client/src/components/premium/admin/adminLogic';

const app = readFileSync('client/src/App.tsx', 'utf8');
const admin = readFileSync('client/src/pages/SalVitaAdmin.tsx', 'utf8');
const recovery = readFileSync('client/src/pages/SalVitaRecovery.tsx', 'utf8');

describe('rotas do admin', () => {
  it('reconhece as 4 rotas, inclusive e-mail marketing, com ou sem barra final', () => {
    for (const p of ['/sal-vita-admin', '/sal-vita-recovery', '/sal-vita-b2b', '/sal-vita-email-marketing', '/sal-vita-email-marketing/']) {
      expect(isAdminPath(p)).toBe(true);
    }
    expect(isAdminPath('/sal-vita')).toBe(false);
    expect(isAdminPath('/')).toBe(false);
  });
  it('App.tsx usa isAdminPath no bloco isPremium', () => {
    expect(app).toMatch(/if \(isAdminPath\(path\)\)/);
  });
});

describe('etiquetas em lote', () => {
  const orders = [
    { id: 1, status: 'confirmed', paymentStatus: 'confirmed' },
    { id: 2, status: 'cancelled', paymentStatus: 'confirmed' },
    { id: 3, status: 'pending', paymentStatus: 'awaiting' },
    { id: 4, status: 'label_generated', paymentStatus: 'confirmed', meLabelUrl: 'x' },
  ];
  it('bloqueia cancelado, não pago e já com etiqueta', () => {
    expect(batchBlockReason(orders[0])).toBeNull();
    expect(batchBlockReason(orders[1])).toBe('cancelado');
    expect(batchBlockReason(orders[2])).toBe('pagamento não confirmado');
    expect(batchBlockReason(orders[3])).toBe('já tem etiqueta');
  });
  it('separa elegíveis de bloqueados e ignora ids fora da lista', () => {
    const r = splitBatchSelection(orders, [1, 2, 3, 99]);
    expect(r.eligible.map(o => o.id)).toEqual([1]);
    expect(r.blocked.map(b => b.order.id)).toEqual([2, 3]);
  });
  it('limite espelha o servidor (25)', () => {
    expect(BATCH_LABEL_MAX).toBe(25);
    expect(readFileSync('server/routers/shipping.ts', 'utf8')).toMatch(/orderIds: z\.array\(z\.number\(\)\)\.max\(25\)/);
  });
});

describe('KPIs', () => {
  const now = new Date('2026-10-14T12:00:00');
  const orders = [
    { id: 1, status: 'confirmed', paymentStatus: 'confirmed', totalPrice: '100.00', shippingPrice: '20.00', createdAt: now },
    { id: 2, status: 'label_generated', paymentStatus: 'confirmed', totalPrice: '50.00', shippingPrice: '10.00', createdAt: now },
    { id: 3, status: 'shipped', paymentStatus: 'confirmed', totalPrice: '30.00', shippingPrice: '5.00', createdAt: '2026-09-01T10:00:00' },
    { id: 4, status: 'cancelled', paymentStatus: 'confirmed', totalPrice: '999.00', shippingPrice: '0', createdAt: now },
    { id: 5, status: 'pending', paymentStatus: 'awaiting', totalPrice: '40.00', shippingPrice: '5.00', createdAt: now },
  ];
  const k = computeKpis(orders, now);
  it('separa produtos e frete; cancelado fora da receita', () => {
    expect(k.revenueTotal).toBe(180);
    expect(k.revenueShipping).toBe(35);
    expect(k.revenueProducts).toBe(145);
    expect(k.paidCount).toBe(3);
  });
  it('a expedir inclui pago sem etiqueta', () => {
    expect(k.toShip).toBe(2);
    expect(k.toShipNoLabel).toBe(1);
    expect(k.toShipWithLabel).toBe(1);
  });
  it('conta ativos, cancelados e aguardando', () => {
    expect(k.activeOrders).toBe(4);
    expect(k.cancelled).toBe(1);
    expect(k.awaiting).toBe(1);
  });
});

describe('busca e CSV', () => {
  const o = { id: 120, customerName: 'Maria', customerPhone: '84986207841', customerCpf: '123.456.789-09' };
  it('telefone formatado acha número cru', () => {
    expect(matchesSearch(o, '(84) 98620')).toBe(true);
    expect(matchesSearch(o, '#120')).toBe(true);
    expect(matchesSearch(o, '12')).toBe(false);
  });
  it('CSV neutraliza fórmula', () => {
    expect(csvText('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvText('Maria')).toBe('"Maria"');
  });
});

describe('admin: confirmações, erro e marca', () => {
  it('não usa window.confirm nem confirm() nativo', () => {
    expect(admin).not.toMatch(/window\.confirm|[^.\w]confirm\(/);
    expect(recovery).not.toMatch(/window\.confirm|[^.\w]confirm\(/);
  });
  it('pagamento manual só mostra sucesso no onSuccess e tem onError', () => {
    expect(admin).toMatch(/payMut = trpc\.shipping\.updateStatus\.useMutation\(\{[\s\S]{0,200}Pagamento do pedido[\s\S]{0,200}onError/);
    expect(admin).not.toMatch(/toast\.success\('Pagamento confirmado!'\)/);
  });
  it('exclusão exige digitar o número do pedido e some para pedido pago', () => {
    expect(admin).toMatch(/requireText: String\(order\.id\)/);
    expect(admin).toMatch(/isPaid \? \(\s*<p[^>]*>Pedido pago não pode ser excluído/);
  });
  it('falha de listOrders mostra ErrorState, não lista vazia', () => {
    expect(admin).toMatch(/isError && !data \?\s*\(\s*<ErrorState/);
    expect(admin).toMatch(/Tentar de novo/);
  });
  it('recuperação: todas as listas têm estado de erro', () => {
    expect((recovery.match(/<ErrorState/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
  it('seleção em lote é limpa ao trocar filtro', () => {
    expect(admin).toMatch(/setSelectedIds\(\[\]\);\s*\}, \[filter, period, search\]\)/);
  });
  it('usa a logo oficial e não o SVG redesenhado nem o selo Admin Center', () => {
    expect(admin).toMatch(/<BrandLogo/);
    expect(admin).not.toMatch(/Pacifico|#4a9eff|Admin Center|<svg/);
  });
  it('sem gradiente decorativo nem emoji como ícone na UI do admin', () => {
    expect(admin).not.toMatch(/bg-gradient|animate-ping/);
    expect(recovery).not.toMatch(/bg-gradient/);
    expect(recovery).not.toMatch(/📱|✉️/);
    expect(admin).not.toMatch(/🛍️|🚀 Rastreio|🎁/);
  });
});
