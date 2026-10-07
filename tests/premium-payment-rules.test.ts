import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.hoisted(() => {
  process.env.JWT_SECRET ||= 'teste-jwt-secret-apenas-para-vitest-0123456789';
  process.env.DATABASE_URL ||= 'postgres://u:p@localhost/x'; // neon() não conecta ao construir
});
vi.mock('../server/db/ordersDb', () => ({ ordersDb: {} }));

import {
  idPagamentoMpValido, pagamentoAprovadoDuplicado, estornoPertenceAoPedido,
  motivoValorDivergente, linhaRevisar, anexarRevisar, quantidadeValida, cupomAtendeMinimo,
  acharPedidoDuplicado, mesmosDadosDoPedido, telefoneNormalizado, decidirTransicaoPagamento,
} from '../server/lib/paymentTransition';
import { shippingRouter, CATALOG } from '../server/routers/shipping';

const api = readFileSync('api/index.ts', 'utf8');
const shipping = readFileSync('server/routers/shipping.ts', 'utf8');
const mp = readFileSync('server/lib/mercadopago.ts', 'utf8');

describe('P0-1: pixStatus é mutation (o storefront chama com POST)', () => {
  it('procedure registrada como mutation', () => {
    const procs = (shippingRouter as unknown as { _def: { procedures: Record<string, { _def: { type: string } }> } })._def.procedures;
    expect(procs['pixStatus']._def.type).toBe('mutation');
  });
});

describe('P0-2: pedido cancelado não pode ser pago', () => {
  it('createPayment e createPixPayment recusam pedido cancelado', () => {
    expect(shipping.match(/order\.status === 'cancelled'\) throw new TRPCError\(\{ code: 'CONFLICT', message: 'Este pedido foi cancelado\.' \}\)/g)).toHaveLength(2);
  });
  it('PIX de follow-up (createPixPaymentForOrder) também recusa', () => {
    expect(mp).toMatch(/order\.status === 'cancelled'\) return null/);
  });
  it('cron de cobrança pula cancelados', () => {
    expect(api).toMatch(/ne\(siteOrders\.status, 'cancelled'\),[^\n]*\n\s*isNull\(siteOrders\.unpaidFollowupSentAt\)/);
  });
  it("aprovado em pedido cancelado: transição 'ignorar' + nota [REVISAR] no webhook", () => {
    expect(decidirTransicaoPagamento({ paymentStatus: 'failed', status: 'cancelled' }, 'approved')).toBe('ignorar');
    expect(api).toMatch(/pagamento aprovado em pedido cancelado — MP \$\{mpId\} — estornar manualmente/);
  });
});

describe('P0-3: pagamento ligado ao pedido', () => {
  it('segundo pagamento aprovado (id diferente) é detectado; o mesmo id não', () => {
    expect(pagamentoAprovadoDuplicado('111', '222')).toBe(true);
    expect(pagamentoAprovadoDuplicado('111', '111')).toBe(false);
    expect(pagamentoAprovadoDuplicado(null, '222')).toBe(false);
  });
  it('estorno só vale para o pagamento que confirmou o pedido', () => {
    expect(estornoPertenceAoPedido('111', '111')).toBe(true);
    expect(estornoPertenceAoPedido('111', '222')).toBe(false);
    expect(estornoPertenceAoPedido(null, '222')).toBe(false);
  });
  it("branch pending/in_process só grava o id com o pedido 'awaiting'", () => {
    expect(api).toMatch(/set\(\{ mpPaymentId: mpId, updatedAt: new Date\(\) \}\)\s*\.where\(and\(eq\(siteOrders\.id, orderId\), eq\(siteOrders\.paymentStatus, 'awaiting'\)\)\)/);
  });
  it('webhook usa as duas checagens', () => {
    expect(api).toContain('pagamentoAprovadoDuplicado(order.mpPaymentId, mpId)');
    expect(api).toContain('estornoPertenceAoPedido(order.mpPaymentId, mpId)');
  });
});

describe('divergência de valor e notas [REVISAR]', () => {
  it('motivo traz valores em R$ e o id do MP', () => {
    expect(motivoValorDivergente(10, 29.9, '999')).toBe('valor pago R$ 10,00 difere do pedido R$ 29,90 — MP 999');
  });
  it('anexa sem sobrescrever e é idempotente', () => {
    const agora = new Date('2026-10-07T12:00:00Z');
    const m = motivoValorDivergente(10, 29.9, '999');
    const a = anexarRevisar(null, m, agora)!;
    expect(a).toBe(`[REVISAR] 2026-10-07T12:00:00.000Z ${m}`);
    const b = anexarRevisar('nota do admin', 'outro motivo', agora)!;
    expect(b.startsWith('nota do admin\n[REVISAR] 2026-10-07')).toBe(true);
    expect(anexarRevisar(a, m, agora)).toBeNull();
    expect(linhaRevisar('x', agora)).toMatch(/^\[REVISAR\] \d{4}-\d{2}-\d{2}T/);
  });
  it('webhook e reconcile registram a divergência', () => {
    expect(api.match(/motivoValorDivergente\(/g)!.length).toBe(2); // webhook + reconcile
  });
});

describe('validação do webhook', () => {
  it('data.id só dígitos', () => {
    expect(idPagamentoMpValido('123456')).toBe(true);
    expect(idPagamentoMpValido(123456)).toBe(true);
    for (const bad of ['12/../x', '1?a=b', '', 'abc', '12 3', null, undefined, {}]) expect(idPagamentoMpValido(bad)).toBe(false);
    expect(api).toContain("ignored: 'bad_id'");
  });
  it('não recusa notificação assinada antiga: replay é inofensivo e reenvio legítimo do MP não pode atrasar a confirmação', () => {
    expect(api).not.toContain('Stale signature');
    expect(api).not.toMatch(/tsWebhookExpirado/);
  });
});

describe('idempotência do PIX', () => {
  it('chave estável por pedido em mercadopago.ts', () => {
    expect(mp).toContain('`pix-${order.id}`');
    expect(mp).not.toMatch(/Date\.now\(\)/);
  });
});

describe('createOrder', () => {
  it('quantidade tem de ser múltiplo positivo do kg da unidade (contrato do storefront: 1, 3 e 10)', () => {
    expect(quantidadeValida(1, CATALOG['1kg'].kgPerUnit)).toBe(true);
    expect(quantidadeValida(7, CATALOG['1kg'].kgPerUnit)).toBe(true);
    expect(quantidadeValida(3, CATALOG['3kg'].kgPerUnit)).toBe(true);
    expect(quantidadeValida(10, CATALOG['caixa'].kgPerUnit)).toBe(true);
    expect(quantidadeValida(1, CATALOG['caixa'].kgPerUnit)).toBe(false); // caixa por R$ 29,90 era o furo
    expect(quantidadeValida(4, CATALOG['3kg'].kgPerUnit)).toBe(false);
    expect(quantidadeValida(0, 1)).toBe(false);
    expect(quantidadeValida(2.5, 1)).toBe(false);
    expect(shipping).toContain('Quantidade inválida para este produto.');
  });
  it('minOrderValue do cupom é checado contra o subtotal do servidor', () => {
    expect(cupomAtendeMinimo(50, '100')).toBe(false);
    expect(cupomAtendeMinimo(100, '100')).toBe(true);
    expect(cupomAtendeMinimo(10, '0')).toBe(true);
    expect(cupomAtendeMinimo(10, null)).toBe(true);
    expect(shipping).toContain('cupomAtendeMinimo(subtotal, c.minOrderValue)');
  });
  describe('pedido duplicado (15 min)', () => {
    const agora = Date.UTC(2026, 9, 7, 12, 0, 0);
    const base = { customerPhone: '84999990000', product: 'P', quantity: 1, postalCode: '59600000', paymentStatus: 'awaiting', status: 'pending', createdAt: new Date(agora - 5 * 60_000) };
    const novo = { customerPhone: '(84) 99999-0000', product: 'P', quantity: 1, postalCode: '59600-000' };
    it('casa por telefone normalizado, produto, quantidade e CEP', () => {
      expect(acharPedidoDuplicado([{ id: 1, ...base }], novo, agora)?.id).toBe(1);
      expect(telefoneNormalizado('+55 84 99999-0000')).toBe('84999990000');
      expect(acharPedidoDuplicado([{ id: 1, ...base, customerPhone: '5584999990000' }], novo, agora)?.id).toBe(1);
    });
    it('não casa: outro produto/quantidade/CEP/telefone, pago, cancelado ou antigo', () => {
      for (const alt of [{ product: 'Q' }, { quantity: 3 }, { postalCode: '59000000' }, { customerPhone: '84999991111' },
        { paymentStatus: 'confirmed' }, { status: 'cancelled' }, { createdAt: new Date(agora - 16 * 60_000) }]) {
        expect(acharPedidoDuplicado([{ id: 1, ...base, ...alt }], novo, agora)).toBeUndefined();
      }
    });
    it('devolve o mais recente', () => {
      const r = acharPedidoDuplicado([{ id: 1, ...base, createdAt: new Date(agora - 10 * 60_000) }, { id: 2, ...base }], novo, agora);
      expect(r?.id).toBe(2);
    });
    it('createOrder consulta antes de inserir', () => {
      expect(shipping.indexOf('acharPedidoDuplicado(')).toBeGreaterThan(0);
      expect(shipping.indexOf('acharPedidoDuplicado(')).toBeLessThan(shipping.indexOf('db.insert(siteOrders)'));
    });
  });
});

describe('timeouts, limiters e crons', () => {
  it('toda chamada ao MP/ViaCEP/ME de checkout de cliente tem timeout de 8 s', () => {
    expect(shipping).toMatch(/viacep\.com\.br[^\n]*AbortSignal\.timeout\(8000\)/);
    expect(shipping).toMatch(/shipment\/calculate[\s\S]{0,400}AbortSignal\.timeout\(8000\)/);
    expect(shipping).toMatch(/checkout\/preferences[\s\S]{0,300}AbortSignal\.timeout\(8000\)/);
    expect(mp).toContain('AbortSignal.timeout(8000)');
  });
  it('createOrder e pagamentos têm limiters separados', () => {
    expect(api).toMatch(/shipping\.createOrder', orderLimiter/);
    expect(api).toMatch(/shipping\.createPayment', paymentLimiter/);
    expect(api).toMatch(/shipping\.createPixPayment', paymentLimiter/);
  });
  it('e-mails dos crons e do B2B são aguardados, sem .catch(() => {})', () => {
    expect(api).not.toMatch(/sendEmail\([^\n]*\)\.catch\(\(\) => \{\}\)/);
    expect(api).not.toMatch(/notifyB2bLead\([\s\S]{0,300}\}\)\.catch/);
  });
  it('B2B: honeypot e dedup que só preenche vazios', () => {
    expect(api).toMatch(/honeypot/);
    expect(api).toMatch(/!existingCompany\?\.segment/);
    expect(api).toMatch(/existingContact\.name \|\| data\.contactName/);
  });
});

describe('idempotência do pedido não engole correção de dados', () => {
  const base = {
    customerName: 'Maria Souza', customerEmail: 'maria@ex.com', customerCpf: '123.456.789-09',
    address: 'Rua A', number: '10', complement: null, neighborhood: 'Centro', city: 'Mossoró',
    state: 'RN', shippingServiceName: 'PAC', couponCode: null,
  };
  it('mesmos dados (diferenças só de caixa, espaço e máscara) reaproveita', () => {
    expect(mesmosDadosDoPedido(base, { ...base, customerName: ' maria  souza ', customerCpf: '12345678909', state: 'rn' })).toBe(true);
  });
  it('createOrder só devolve o pedido anterior depois de comparar os dados editáveis', () => {
    const shippingSrc = readFileSync(new URL('../server/routers/shipping.ts', import.meta.url), 'utf8');
    expect(shippingSrc).toMatch(/if \(dup && mesmosDadosDoPedido\(dup,/);
  });
  it('qualquer campo corrigido cria pedido novo — senão o sal vai para o endereço errado', () => {
    for (const alt of [
      { number: '100' }, { address: 'Rua B' }, { complement: 'Apto 2' }, { neighborhood: 'Alto' },
      { customerName: 'Maria S.' }, { customerEmail: 'outra@ex.com' }, { customerCpf: '98765432100' },
      { shippingServiceName: 'SEDEX' }, { couponCode: 'BEMVINDO' },
    ]) expect(mesmosDadosDoPedido(base, { ...base, ...alt })).toBe(false);
  });
});
