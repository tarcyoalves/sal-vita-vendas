import { describe, it, expect } from 'vitest';
import { resolverFaturamento, componentesFiscais, fiscalComparavel } from '../server/lib/smbiFaturamento';
import type { SmbiMovsaiFiscal } from '../shared/smbiEstados';
import type { FatOrder } from '../server/db/schema';

const AGORA = new Date('2026-10-01T15:00:00.000Z');
const item = (id: string, peso: number, valorUnitario: number, isentoFrete = false) => ({
  id, produtoId: null, descricao: 'Sal', quantidade: peso, pesoKg: peso, valorUnitario,
  pesoBrutoKg: 0, comissaoFixaPct: null, isentoFrete,
});
// 30 t a R$ 0,10/kg = sal 3000; frete R$ 50/t = 1500; total acordado 4500.
const pedido = (itens: FatOrder['itens'], frete = 50) => ({
  smbiMovsaiId: '1', smbiVinculoMovsais: null, status: 'estimado', faturadoEm: null, itens, valorFretePorUnidade: frete,
});
const um = [item('a', 30000, 0.1)];
const dois = [item('a', 15000, 0.1), item('b', 15000, 0.1)];

const mov = (id: string, peso: number, sal?: number, frete?: number): SmbiMovsaiFiscal => ({
  id, pesoKg: peso,
  ...(sal !== undefined ? { nfe: { numero: 'N' + id, valorSal: sal } } : {}),
  ...(frete !== undefined ? { cte: { numero: 'C' + id, valorFrete: frete } } : {}),
});
const alerta = (p: ReturnType<typeof pedido>, movsais: SmbiMovsaiFiscal[], total = 4500) =>
  resolverFaturamento(p, { movsais, faturadoEm: '2026-10-01T10:00:00-03:00' }, total, AGORA, 30000).patch.smbiAlertaDesconto;

describe('BIZ-9 alerta de desconto com fiscal parcial', () => {
  it('só sal (sem CT-e): não alerta', () => {
    expect(alerta(pedido(um), [mov('1', 30000, 3000)])).toBe(false);
  });
  it('só frete (sem NF-e de sal): não alerta', () => {
    expect(alerta(pedido(um), [mov('1', 30000, undefined, 1500)])).toBe(false);
  });
  it('sal + frete iguais ao esperado: não alerta', () => {
    expect(alerta(pedido(um), [mov('1', 30000, 3000, 1500)])).toBe(false);
  });
  it('realocação sal→frete (total igual): não alerta', () => {
    expect(alerta(pedido(um), [mov('1', 30000, 2700, 1800)])).toBe(false);
  });
  it('sal + frete com desconto real: alerta', () => {
    expect(alerta(pedido(um), [mov('1', 30000, 2800, 1500)])).toBe(true);
  });
  it('multi-item: igual não alerta, com desconto alerta', () => {
    expect(alerta(pedido(dois), [mov('1', 30000, 3000, 1500)])).toBe(false);
    expect(alerta(pedido(dois), [mov('1', 30000, 2500, 1500)])).toBe(true);
  });
  it('pedido sem frete: só sal já é comparável', () => {
    const p = pedido([item('a', 30000, 0.1, true)], 50); // isento de frete
    expect(alerta(p, [mov('1', 30000, 3000)], 3000)).toBe(false);
    expect(alerta(p, [mov('1', 30000, 2900)], 3000)).toBe(true);
  });
  it('helpers', () => {
    expect(componentesFiscais([mov('1', 1, 10)])).toEqual({ temSal: true, temFrete: false });
    expect(fiscalComparavel({ temSal: false, temFrete: true }, 0)).toBe(false);
    expect(fiscalComparavel({ temSal: true, temFrete: false }, 100)).toBe(false);
    expect(fiscalComparavel({ temSal: true, temFrete: false }, null)).toBe(false);
  });
});
