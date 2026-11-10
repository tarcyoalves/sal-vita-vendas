import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'teste-jwt-secret-apenas-para-vitest-0123456789';
  process.env.DATABASE_URL ||= 'postgres://u:p@localhost/x';
});
vi.mock('../server/db/ordersDb', () => ({ ordersDb: {} }));

import { alertaPedidoPago, alertaPedidoRevisao } from '../server/lib/ownerAlert';
import {
  inicioJanelaCompra, telefoneParaBusca, selecionarUmPorTelefone, regraDeAbandono,
  deveSuprimirCobranca, podeUsarTemplatePix,
} from '../server/lib/recoveryCadence';

describe('alertas ao dono', () => {
  const o = { id: 42, customerName: 'Maria Souza Lima', product: 'Sal Marinho Integral 1kg', city: 'Mossoró', state: 'RN', totalPrice: '74.90' };
  it('pedido pago: assunto, primeiro nome, cidade/UF, link do painel — sem PII extra', () => {
    const a = alertaPedidoPago(o, 'https://loja.exemplo');
    expect(a.subject).toBe('Novo pedido pago #42 — R$ 74,90');
    const txt = a.lines.join('\n');
    expect(txt).toContain('Maria');
    expect(txt).not.toContain('Souza');
    expect(txt).toContain('Mossoró/RN');
    expect(txt).toContain('https://loja.exemplo/sal-vita-admin');
  });
  it('revisão: assunto e motivo', () => {
    const a = alertaPedidoRevisao(9, 'valor pago R$ 1,00 difere do pedido R$ 2,00 — MP 1');
    expect(a.subject).toBe('Pedido #9 precisa de revisão');
    expect(a.lines.join('\n')).toContain('difere do pedido');
  });
  it('fiação: aviso de pago em confirmOrderPaid; de revisão só quando a linha foi escrita', () => {
    const oc = readFileSync('server/lib/orderConfirmation.ts', 'utf8');
    expect(oc).toMatch(/alertOwnerBestEffort\(alertaPedidoPago\(order\)\)/);
    expect(oc).toMatch(/\.returning\(\{ id: siteOrders\.id \}\);\s*if \(written\.length > 0\) await alertOwnerBestEffort\(alertaPedidoRevisao/);
  });
});

describe('cadência de carrinho abandonado', () => {
  it('um toque por telefone por rodada; os demais são adiados (não cancelados)', () => {
    const runs = [
      { id: 1, customerPhone: '5584999991234' },
      { id: 2, customerPhone: '(84) 99999-1234' },
      { id: 3, customerPhone: '84988887777' },
      { id: 4, customerPhone: '84999991234' },
    ];
    const { enviar, adiar } = selecionarUmPorTelefone(runs);
    expect(enviar.map(r => r.id)).toEqual([1, 3]);
    expect(adiar.map(r => r.id)).toEqual([2, 4]);
  });
  it('janela de compra: carrinho − 1 h; data inválida cai em 30 dias', () => {
    const c = new Date('2026-10-10T12:00:00Z');
    expect(inicioJanelaCompra(c).toISOString()).toBe('2026-10-10T11:00:00.000Z');
    const agora = Date.UTC(2026, 10, 1);
    expect(inicioJanelaCompra(null, agora).getTime()).toBe(agora - 30 * 24 * 3600 * 1000);
  });
  it('telefone para busca: sem DDI; curto demais não identifica ninguém', () => {
    expect(telefoneParaBusca('+55 (84) 99999-1234')).toBe('84999991234');
    expect(telefoneParaBusca('1234')).toBe('');
  });
  it('3º toque sem cupom cai no template simples', () => {
    expect(regraDeAbandono({ slug: 'abandoned_cupom', coupon: '' })).toEqual({ slug: 'abandoned_simples', coupon: '' });
    expect(regraDeAbandono({ slug: 'abandoned_cupom', coupon: 'VOLTA' })).toEqual({ slug: 'abandoned_cupom', coupon: 'VOLTA' });
    expect(regraDeAbandono(undefined).slug).toBe('abandoned_simples');
  });
  it('fiação no cron: checagem de compra, um por telefone, release, gate do WhatsApp', () => {
    const api = readFileSync('api/index.ts', 'utf8');
    expect(api).toMatch(/selecionarUmPorTelefone\(due\)[\s\S]{0,400}releaseClaimed\(adiar\.map/);
    expect(api).toMatch(/telefoneTemPedidoDesde\(run\.customerPhone, inicioJanelaCompra\(cart\.createdAt\)\)/);
    expect(api).toContain('regraDeAbandono(RULE_MAP[run.ruleName])');
    const iLabels = api.indexOf("runIsolated('auto-labels'");
    const iTrack = api.indexOf("runIsolated('me-tracking'");
    const iGate = api.indexOf('const waUp = await isWhatsAppConnected()');
    expect(iLabels).toBeGreaterThan(0);
    expect(iLabels).toBeLessThan(iGate);
    expect(iTrack).toBeLessThan(iGate);
    expect(api.match(/runIsolated\('auto-labels'/g)).toHaveLength(1);
  });
});

describe('cobrança de pedido não pago', () => {
  it('suprime com pedido mais novo pago ou nota [REVISAR]', () => {
    expect(deveSuprimirCobranca(null, false)).toBe(false);
    expect(deveSuprimirCobranca('obs', true)).toBe(true);
    expect(deveSuprimirCobranca('x\n[REVISAR] 2026 motivo', false)).toBe(true);
  });
  it('template de PIX só com código não vazio', () => {
    expect(podeUsarTemplatePix('000201...')).toBe(true);
    expect(podeUsarTemplatePix('')).toBe(false);
    expect(podeUsarTemplatePix('  ')).toBe(false);
    expect(podeUsarTemplatePix(null)).toBe(false);
  });
  it('fiação em processUnpaidFollowups', () => {
    const api = readFileSync('api/index.ts', 'utf8');
    expect(api).toMatch(/deveSuprimirCobranca\(o\.notes, maisNovoPago\)[\s\S]{0,200}continue;/);
    expect(api).toContain('podeUsarTemplatePix(code) && pixTpl');
  });
});
