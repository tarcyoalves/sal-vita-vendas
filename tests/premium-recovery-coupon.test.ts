import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const rec = readFileSync('server/routers/recovery.ts', 'utf8');
const conf = readFileSync('server/lib/orderConfirmation.ts', 'utf8');

describe('cupom e logs', () => {
  it('validateCoupon: uma só mensagem para inexistente/expirado/esgotado', () => {
    expect(rec).toContain("Cupom inválido ou indisponível.");
    expect(rec).not.toMatch(/Este cupom expirou|Cupom esgotado|inválido ou expirado/);
  });
  it('cupom acima do limite vira nota [REVISAR] no pedido', () => {
    expect(conf).toMatch(/cupom \$\{code\} acima do limite de usos/);
    expect(conf).toMatch(/bumpCouponUsage\(order\.couponCode, 1, order\.id\)/);
  });
  it('logs [wa] mascaram telefone e não despejam corpo de erro', () => {
    expect(rec).not.toMatch(/\[wa\][^\n]*\$\{phone\}/);
    expect(conf).not.toMatch(/\[wa\][^\n]*\$\{phoneNum\}/);
    expect(conf).not.toMatch(/r\.text\(\)/);
  });
});
