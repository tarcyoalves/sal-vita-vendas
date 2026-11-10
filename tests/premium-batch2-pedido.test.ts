import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  transicaoAdminPermitida, statusAoSalvarRastreio, modoReembolso, cancelamentoExigeForce,
  insuranceValueCotacao, insuranceValueEtiqueta, notaFreteEstimado, NOTA_FRETE_ESTIMADO,
} from '../server/lib/pedidoAdmin';

const read = (p: string) => readFileSync(p, 'utf-8');
const ship = read('server/routers/shipping.ts');
const pago = { paymentStatus: 'confirmed' };

describe('transicaoAdminPermitida (fix 6)', () => {
  it('shipped exige pagamento confirmado', () => {
    expect(transicaoAdminPermitida('confirmed', 'shipped', { paymentStatus: 'awaiting' }).ok).toBe(false);
    expect(transicaoAdminPermitida('pending', 'shipped', { paymentStatus: 'failed' }).ok).toBe(false);
    expect(transicaoAdminPermitida('label_generated', 'shipped', pago).ok).toBe(true);
    expect(transicaoAdminPermitida('confirmed', 'shipped', pago).ok).toBe(true);
  });
  it('cancelado nunca vira enviado/entregue', () => {
    const r = transicaoAdminPermitida('cancelled', 'shipped', pago);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/cancelado/);
    expect(transicaoAdminPermitida('cancelled', 'delivered', { ...pago, trackingCode: 'AA1' }).ok).toBe(false);
  });
  it('delivered exige shipped, ou label_generated com rastreio', () => {
    expect(transicaoAdminPermitida('shipped', 'delivered', pago).ok).toBe(true);
    expect(transicaoAdminPermitida('label_generated', 'delivered', { ...pago, trackingCode: 'AA1' }).ok).toBe(true);
    expect(transicaoAdminPermitida('label_generated', 'delivered', { ...pago, trackingCode: ' ' }).ok).toBe(false);
    expect(transicaoAdminPermitida('confirmed', 'delivered', { ...pago, trackingCode: 'AA1' }).ok).toBe(false);
    expect(transicaoAdminPermitida('pending', 'delivered', pago).ok).toBe(false);
  });
  it('entregue não volta para enviado; mesmo status é idempotente', () => {
    expect(transicaoAdminPermitida('delivered', 'shipped', pago).ok).toBe(false);
    expect(transicaoAdminPermitida('delivered', 'delivered', pago).ok).toBe(true);
    expect(transicaoAdminPermitida('shipped', 'shipped', { paymentStatus: 'awaiting' }).ok).toBe(true);
  });
  it('caminho normal da UI segue liberado (confirmar pagamento, cancelar, enviar)', () => {
    expect(transicaoAdminPermitida('pending', 'confirmed', { paymentStatus: 'confirmed' }).ok).toBe(true);
    expect(transicaoAdminPermitida('confirmed', 'cancelled', pago).ok).toBe(true);
    expect(transicaoAdminPermitida('shipped', 'cancelled', pago).ok).toBe(true);
    expect(transicaoAdminPermitida('pending', 'pending', { paymentStatus: 'awaiting' }).ok).toBe(true);
  });
  it('mensagens em português', () => {
    const r = transicaoAdminPermitida('pending', 'delivered', pago);
    expect(!r.ok && r.message).toMatch(/entregue/);
  });
});

describe('statusAoSalvarRastreio', () => {
  it('só pedido pago e ainda não enviado vira shipped', () => {
    expect(statusAoSalvarRastreio('confirmed', 'confirmed')).toBe('shipped');
    expect(statusAoSalvarRastreio('label_generated', 'confirmed')).toBe('shipped');
    expect(statusAoSalvarRastreio('confirmed', 'awaiting')).toBeNull();
    expect(statusAoSalvarRastreio('cancelled', 'confirmed')).toBeNull();
    expect(statusAoSalvarRastreio('delivered', 'confirmed')).toBeNull();
    expect(statusAoSalvarRastreio('shipped', 'confirmed')).toBeNull();
  });
});

describe('cancelamento (fix 1)', () => {
  it('modo de reembolso', () => {
    expect(modoReembolso({ paymentStatus: 'confirmed', mpPaymentId: '123' })).toBe('mercadopago');
    expect(modoReembolso({ paymentStatus: 'confirmed', mpPaymentId: null })).toBe('manual');
    expect(modoReembolso({ paymentStatus: 'awaiting', mpPaymentId: '123' })).toBe('none');
  });
  it('shipped/delivered exigem force', () => {
    expect(cancelamentoExigeForce('shipped')).toBe(true);
    expect(cancelamentoExigeForce('delivered')).toBe(true);
    expect(cancelamentoExigeForce('confirmed')).toBe(false);
    expect(cancelamentoExigeForce('label_generated')).toBe(false);
  });
  it('wiring no servidor: sem refund MP no modo manual, cupom devolvido só no manual, e-mail best-effort', () => {
    const c = ship.slice(ship.indexOf('cancelOrder: premiumAdminProcedure'), ship.indexOf('deleteOrder: premiumAdminProcedure'));
    expect(c).toContain("force: z.boolean().optional()");
    expect(c).toContain("if (refund === 'mercadopago')");
    expect(c).toContain("refund === 'manual' && order.couponCode");
    expect(c).toContain('bumpCouponUsage(order.couponCode, -1)');
    expect(c).toContain('ne(siteOrders.status, \'cancelled\')');
    expect(c).toMatch(/try \{[\s\S]*orderCancelledEmail[\s\S]*\} catch/);
    // não mexe em paymentStatus: o webhook de estorno continua sendo o único a devolver o cupom do pagamento MP
    expect(c).not.toMatch(/paymentStatus: 'failed'/);
  });
  it('UI: aviso de reembolso manual, confirmação de pacote postado, toast de erro da etiqueta', () => {
    const ui = read('client/src/pages/SalVitaAdmin.tsx');
    expect(ui).toContain('Este pagamento foi confirmado manualmente: faça o reembolso por fora.');
    expect(ui).toContain('O pacote já foi postado. O reembolso não para a entrega. Cancelar mesmo assim?');
    expect(ui).toMatch(/labelCancelFailed\) toast\.error/);
    expect(ui).toContain("force: order.status === 'shipped' ? true : undefined");
  });
  it('e-mail de cancelamento: número do pedido, situação do reembolso, contato, sem prazo', async () => {
    process.env.ORDERS_DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
    process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
    process.env.JWT_SECRET ??= 'test-jwt-secret-min-32-chars-long!';
    const { orderCancelledEmail } = await import('../server/email/resend');
    const auto = orderCancelledEmail('Maria <b>', 10050, 'automatic');
    expect(auto.subject).toContain('#10050');
    expect(auto.html).toContain('Mercado Pago');
    expect(auto.html).toContain('contato@salvitarn.com.br');
    expect(auto.html).not.toContain('<b>');
    expect(orderCancelledEmail('Maria', 10050, 'manual').html).toContain('Nossa equipe');
    expect(auto.html).not.toMatch(/\d+ dias/);
  });
});

describe('valor declarado (fix 2)', () => {
  it('cotação: preço de catálogo × pacotes, sem frete', () => {
    expect(insuranceValueCotacao(29.9, 1)).toBe(29.9);
    expect(insuranceValueCotacao(74.9, 2)).toBe(149.8);
    expect(insuranceValueCotacao(149.9, 0)).toBe(149.9);
  });
  it('etiqueta: total − frete (já com cupom)', () => {
    expect(insuranceValueEtiqueta({ totalPrice: '47.90', shippingPrice: '18.00', packs: 1, catalogPrice: 29.9 })).toBe(29.9);
    // cupom de R$ 5: 29,90 − 5 + 18 = 42,90
    expect(insuranceValueEtiqueta({ totalPrice: '42.90', shippingPrice: '18.00', packs: 1, catalogPrice: 29.9 })).toBe(24.9);
    // frete grátis / sem frete gravado
    expect(insuranceValueEtiqueta({ totalPrice: '29.90', shippingPrice: null, packs: 1, catalogPrice: 29.9 })).toBe(29.9);
  });
  it('etiqueta: sem total, cai em unitário × pacotes − desconto, e em catálogo se faltar tudo', () => {
    expect(insuranceValueEtiqueta({ totalPrice: null, unitPrice: '29.90', couponDiscount: '5', packs: 2, catalogPrice: 29.9 })).toBe(54.8);
    expect(insuranceValueEtiqueta({ totalPrice: null, packs: 3, catalogPrice: 29.9 })).toBe(89.7);
  });
  it('sem cupom a cotação e a etiqueta declaram o mesmo valor', () => {
    const q = insuranceValueCotacao(74.9, 1);
    expect(insuranceValueEtiqueta({ totalPrice: String(74.9 + 22), shippingPrice: '22', packs: 1, catalogPrice: 74.9 })).toBe(q);
  });
  it('wiring: cotação e as duas etiquetas (individual e em lote) usam o helper', () => {
    expect(ship).toContain('insurance_value: insuranceValueCotacao(CATALOG[product].price, packs)');
    expect(ship.match(/insuranceValueEtiqueta\(/g)?.length).toBe(2);
    expect(ship).not.toMatch(/declaredValue = parseFloat/);
  });
});

describe('frete estimado (fix 3)', () => {
  it('só a fonte static gera nota', () => {
    expect(notaFreteEstimado('static')).toBe(NOTA_FRETE_ESTIMADO);
    expect(notaFreteEstimado('api')).toBeNull();
    expect(NOTA_FRETE_ESTIMADO).toContain('Melhor Envio indisponível');
  });
  it('createOrder anota o pedido', () => {
    expect(ship).toMatch(/notaFreteEstimado\(quote\.source\)[\s\S]{0,120}appendReviewNote\(order\.id/);
  });
});

describe('reply-to (fix 4)', () => {
  it('sendEmail manda reply_to e mantém o FROM', () => {
    const r = read('server/email/resend.ts');
    expect(r).toContain("export const REPLY_TO = 'contato@salvitarn.com.br'");
    expect(r).toMatch(/from: FROM, to, subject, html, reply_to: REPLY_TO/);
    expect(r).toContain("const FROM = 'Sal Vita <noreply@premium.salvitarn.com.br>'");
  });
});

describe('um e-mail de pós-venda (fix 5)', () => {
  beforeAll(() => {
    process.env.ORDERS_DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
    process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
    process.env.JWT_SECRET ??= 'test-jwt-secret-min-32-chars-long!';
  });
  it('texto neutro quando marcado à mão; padrão mantém "transportadora confirmou"', async () => {
    const { postPurchaseEmail } = await import('../server/email/resend');
    const manual = postPurchaseEmail('Ana', 7, 'https://x/meu-pedido', true);
    expect(manual.html).not.toContain('transportadora confirmou');
    expect(manual.html).toContain('foi entregue');
    expect(postPurchaseEmail('Ana', 7, 'https://x/meu-pedido').html).toContain('transportadora confirmou');
  });
  it('Pós-compra dia 0 não repete a pergunta "chegou bem?"', async () => {
    const { POS_COMPRA } = await import('../server/email/followupSequences');
    const d0 = POS_COMPRA.steps[0];
    expect(d0.delayDays).toBe(0);
    expect(`${d0.subject} ${d0.htmlBody}`.toLowerCase()).not.toMatch(/chegou/);
  });
  it('Marcar Entregue passa por claimShippingEvent e avisa em modo manual', () => {
    const u = ship.slice(ship.indexOf('updateStatus: premiumAdminProcedure'), ship.indexOf('trackOrder: publicProcedure'));
    expect(u).toMatch(/claimShippingEvent\(updated\.id, 'delivered', null\)/);
    expect(u).toContain("notifyShippingEvent(updated, 'delivered', { manual: true })");
    expect(u).toContain('transicaoAdminPermitida(');
  });
});
