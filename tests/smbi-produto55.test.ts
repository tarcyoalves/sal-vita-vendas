import { describe, expect, it } from 'vitest';
import { SMBI_PRODUTOS_CATALOGO } from '../client/src/lib/faturamento/smbiCatalog';

describe('de-para autorizado pelo Tarcyo: produto SMBI 55', () => {
  it('vincula o nome exato a um único código 55 com saco de 25 kg', () => {
    const produtos = SMBI_PRODUTOS_CATALOGO.filter(
      p => p.nome === 'SAL CHURRASCO COM IODO VITA 25 KG',
    );
    expect(produtos).toEqual([{
      smbiId: '55',
      nome: 'SAL CHURRASCO COM IODO VITA 25 KG',
      pesoUnitarioKg: 25,
      tipoEmbalagem: 'saco',
    }]);
    expect(SMBI_PRODUTOS_CATALOGO.filter(p => p.smbiId === '55')).toHaveLength(1);
  });
});
