import { describe, it, expect } from 'vitest';
import { resolveRobotOwnedFields } from '../server/lib/smbi';

const stored = { smbiMovsaiId: '1112', numeroNfe: '900', numeroCte: '77', comissaoComercialProtegida: 12.5 };

describe('resolveRobotOwnedFields — a tela nunca apaga o vínculo com o SMBI', () => {
  it('admin com espelho desatualizado (payload null) mantém movsai, NF-e e CT-e', () => {
    const r = resolveRobotOwnedFields(stored, { comissaoComercialProtegida: null }, true);
    expect(r).toEqual(stored);
  });

  it('nem um admin consegue trocar o movsai por aqui', () => {
    const r = resolveRobotOwnedFields(stored, { comissaoComercialProtegida: null }, true);
    expect(r.smbiMovsaiId).toBe('1112');
  });

  it('atendente/gerente mantêm tudo o que está gravado', () => {
    expect(resolveRobotOwnedFields(stored, { comissaoComercialProtegida: 99 }, false)).toEqual(stored);
  });

  it('pedido novo começa sem vínculo, para qualquer papel', () => {
    const vazio = { smbiMovsaiId: null, numeroNfe: null, numeroCte: null, comissaoComercialProtegida: null };
    expect(resolveRobotOwnedFields(undefined, { comissaoComercialProtegida: null }, true)).toEqual(vazio);
    expect(resolveRobotOwnedFields(undefined, { comissaoComercialProtegida: 5 }, false)).toEqual(vazio);
  });

  it('só o admin altera a comissão protegida, e payload nulo não a zera', () => {
    expect(resolveRobotOwnedFields(stored, { comissaoComercialProtegida: 20 }, true).comissaoComercialProtegida).toBe(20);
    expect(resolveRobotOwnedFields(stored, { comissaoComercialProtegida: null }, true).comissaoComercialProtegida).toBe(12.5);
    expect(resolveRobotOwnedFields(stored, {}, true).comissaoComercialProtegida).toBe(12.5);
    expect(resolveRobotOwnedFields(undefined, { comissaoComercialProtegida: 8 }, true).comissaoComercialProtegida).toBe(8);
  });
});
