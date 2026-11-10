import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { isValidCpf, nationalPhone, isValidFullName, isValidEmail, checkoutError } from '../server/lib/checkoutValidation';
import { whatsappVariants } from '../server/lib/whatsappVariants';

const read = (p: string) => readFileSync(p, 'utf8');

describe('checkout: CPF', () => {
  it('aceita CPF válido, com ou sem máscara', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true);
    expect(isValidCpf('52998224725')).toBe(true);
  });
  it('rejeita dígito errado, sequência repetida e tamanho errado', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('1234')).toBe(false);
  });
});

describe('checkout: telefone', () => {
  it('aceita celular mascarado, fixo e prefixo 55', () => {
    expect(nationalPhone('(84) 99999-9999')).toBe('84999999999');
    expect(nationalPhone('(84) 3315-1234')).toBe('8433151234');
    expect(nationalPhone('+55 84 99999-9999')).toBe('84999999999');
    expect(nationalPhone('558433151234')).toBe('8433151234');
  });
  it('rejeita DDD inválido, 11 dígitos sem 9 e tamanhos errados', () => {
    expect(nationalPhone('(10) 99999-9999')).toBeNull();
    expect(nationalPhone('(84) 89999-9999')).toBeNull();
    expect(nationalPhone('849999999')).toBeNull();
    expect(nationalPhone('849999999999999')).toBeNull();
  });
});

describe('checkout: nome, e-mail e mensagem', () => {
  it('nome precisa de ao menos 2 palavras', () => {
    expect(isValidFullName('Maria')).toBe(false);
    expect(isValidFullName('  Maria  Silva ')).toBe(true);
  });
  it('e-mail', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
  });
  it('checkoutError: ok para checkout atual e mensagens em português', () => {
    const ok = { customerName: 'Maria Silva', customerPhone: '(84) 99999-9999', customerEmail: 'm@x.com', customerCpf: '529.982.247-25' };
    expect(checkoutError(ok)).toBeNull();
    expect(checkoutError({ ...ok, customerName: 'Maria' })).toMatch(/nome completo/);
    expect(checkoutError({ ...ok, customerPhone: '123' })).toMatch(/Telefone/);
    expect(checkoutError({ ...ok, customerEmail: '' })).toMatch(/e-mail/);
    expect(checkoutError({ ...ok, customerCpf: '111.111.111-11' })).toMatch(/CPF/);
  });
  it('createOrder chama a validação antes de tudo', () => {
    const src = read('server/routers/shipping.ts');
    expect(src).toMatch(/const invalido = checkoutError\(input\);\s+if \(invalido\) throw new TRPCError\(\{ code: 'BAD_REQUEST'/);
  });
});

describe('WhatsApp: variantes do 9º dígito', () => {
  it('celular de 11 dígitos gera a variante sem o 9', () => {
    expect(whatsappVariants('84999991234')).toEqual(['5584999991234', '558499991234']);
    expect(whatsappVariants('5584999991234')).toEqual(['5584999991234', '558499991234']);
  });
  it('10 dígitos (fixo ou celular antigo) NUNCA ganha 9', () => {
    expect(whatsappVariants('8433151234')).toEqual(['558433151234']);
    expect(whatsappVariants('558433151234')).toEqual(['558433151234']);
  });
  it('11 dígitos sem 9 na 3ª posição não gera variante', () => {
    expect(whatsappVariants('84899991234')).toEqual(['5584899991234']);
  });
  it('DDD 55 (RS) sem prefixo não é confundido com código do país', () => {
    expect(whatsappVariants('55999991234')).toEqual(['5555999991234', '555599991234']);
  });
});

describe('cota de e-mail transacional separada do marketing', () => {
  const tx = read('server/email/resend.ts');
  it('resend.ts usa chave própria e não a do marketing', () => {
    expect(tx).toMatch(/TX_QUOTA_KEY = 'resend_tx'/);
    expect(tx).not.toMatch(/'resend_1'/);
  });
  it('marketing deixa folga: 70 + 30 <= 100', () => {
    expect(read('server/email/marketing.ts')).toMatch(/RESEND_MKT_DAILY_LIMIT \?\? '70'/);
    expect(tx).toMatch(/\?\? '30'/);
  });
  it('log de cota estourada sem e-mail do cliente', () => {
    expect(tx).toMatch(/cota transacional diária/);
  });
});

describe('histórico de ações do admin', () => {
  const mig = read('server/db/ordersMigrate.ts');
  it('tabela e índice migrados, versão e lock subidos', () => {
    expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS admin_order_actions/);
    expect(mig).toMatch(/CREATE INDEX IF NOT EXISTS admin_order_actions_order_idx/);
    const v = mig.match(/ORDERS_SCHEMA_VERSION = '([^']+)'/)![1];
    expect(read('tests/schema-version.lock.json')).toContain(v);
  });
  it('procedures do admin registram a ação e orderHistory existe', () => {
    const src = read('server/routers/shipping.ts');
    for (const a of ['edit_order', 'update_status', 'confirm_payment_manual', 'update_tracking', 'cancel_order', 'generate_label', 'delete_order']) {
      expect(src).toContain(`'${a}'`);
    }
    expect(src).toMatch(/orderHistory: premiumAdminProcedure/);
    expect(src).toMatch(/\.limit\(50\)/);
  });
  it('updateOrder registra só nomes de campos (sem valores)', () => {
    expect(read('server/routers/shipping.ts')).toMatch(/Campos: \$\{campos\.join\(', '\)\}/);
  });
  it('falha do log nunca propaga', () => {
    const src = read('server/lib/adminOrderLog.ts');
    expect(src).toMatch(/try \{[\s\S]*\} catch \(e\)/);
  });
});

describe('carrinho abandonado: link do e-mail leva o cupom', () => {
  it('link com ?cupom= codificado é o usado no e-mail', () => {
    const src = read('api/index.ts');
    expect(src).toContain('?cupom=${encodeURIComponent(ruleCfg.coupon)}');
    expect(src).toContain('abandonedCartHtml(cart.customerName, link, ruleCfg.coupon)');
  });
});
