import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// O remetente das etiquetas do Melhor Envio é definido pelo dono (14/10/2026).
// As duas rotas de etiqueta (individual e em lote) têm de usar a mesma constante.
const src = readFileSync(join(__dirname, '..', 'server', 'routers', 'shipping.ts'), 'utf8');

describe('remetente das etiquetas', () => {
  it('usa o endereço da Santa Delmira, com bairro', () => {
    expect(src).toContain("address: 'Rua Francisco Moura Filho'");
    expect(src).toContain("number: '705'");
    expect(src).toContain("district: 'Santa Delmira'");
    expect(src).toContain("postalCode: '59615200'");
  });

  it('não sobra o endereço antigo nem remetente montado à mão', () => {
    expect(src).not.toContain('Presidente Dutra');
    expect(src.match(/address: SENDER_ADDRESS\.address/g)?.length).toBe(2);
    expect(src.match(/district: SENDER_ADDRESS\.district/g)?.length).toBe(2);
  });
});
