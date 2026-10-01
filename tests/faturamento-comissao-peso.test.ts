import { describe, it, expect } from 'vitest';
import { comissaoPedido, fatorPesoFaturado, notaPesoFaturado, pesoEfetivoKg, resumoAtendente, totalPedidoEfetivo } from '../client/src/lib/faturamento/calc';
import type { Pedido } from '../client/src/lib/faturamento/types';

// 38 sacos... na prática: 1 linha, peso 38.000 kg, R$ 100/unidade × 1.520 un. = R$ 152.000; comissão 3%.
function pedido(over: Partial<Pedido> = {}): Pedido {
  return {
    id: 'p1', sellerId: 7, sellerName: 'X', status: 'faturado', comissaoPct: 3,
    criadoEm: '2026-09-10T10:00:00Z', faturadoEm: '2026-09-30T09:52:09-03:00', previsaoFaturamentoEm: null,
    itens: [{ id: 'i1', produtoId: null, descricao: 'Sal', quantidade: 1520, pesoKg: 38000, valorUnitario: 100, pesoBrutoKg: 38000, comissaoFixaPct: null, isentoFrete: false }],
    smbiEspelhoFiscal: { movsais: [], faturadoEm: null, snapshotHash: null, recebidoEm: '', totalFiscal: 0, totalAcordado: 0, pesoFaturadoKg: 37000 },
    ...over,
  } as unknown as Pedido;
}

describe('comissão segue o peso faturado', () => {
  it('37 t faturadas de 38 t: comissão, valor e peso proporcionais', () => {
    const p = pedido();
    expect(fatorPesoFaturado(p)).toBeCloseTo(37 / 38, 10);
    expect(comissaoPedido(p)).toBeCloseTo(152000 * 0.03 * 37 / 38, 6);
    expect(totalPedidoEfetivo(p)).toBeCloseTo(152000 * 37 / 38, 6);
    expect(notaPesoFaturado(p)).toMatch(/37 t de 38 t/);
  });
  it('pedido que não está faturado não muda', () => {
    expect(fatorPesoFaturado(pedido({ status: 'estimado' }))).toBe(1);
    expect(comissaoPedido(pedido({ status: 'estimado' }))).toBeCloseTo(152000 * 0.03, 6);
  });
  it('sem peso no espelho, não muda (comportamento anterior)', () => {
    expect(fatorPesoFaturado(pedido({ smbiEspelhoFiscal: null }))).toBe(1);
  });
  it('peso igual ao do pedido: nada a ajustar', () => {
    const p = pedido({ smbiEspelhoFiscal: { ...pedido().smbiEspelhoFiscal!, pesoFaturadoKg: 38000 } });
    expect(fatorPesoFaturado(p)).toBe(1);
    expect(notaPesoFaturado(p)).toBeNull();
  });
  it('se o pedido for editado para 37 t, não corrige duas vezes', () => {
    const base = pedido();
    const editado = pedido({ itens: [{ ...base.itens[0], quantidade: 1480, pesoKg: 37000 }] });
    expect(fatorPesoFaturado(editado)).toBe(1);
    expect(comissaoPedido(editado)).toBeCloseTo(148000 * 0.03, 6);
  });
  it('o resumo do atendente usa o valor e a comissão efetivos', () => {
    const r = resumoAtendente([pedido()], 7, 'X', 3, { ano: 2026, mes: 8 });
    expect(r.comissaoEmbarcada).toBeCloseTo(152000 * 0.03 * 37 / 38, 6);
    expect(r.totalEmbarcado).toBeCloseTo(152000 * 37 / 38, 6);
    expect(r.pesoEmbarcadoKg).toBeCloseTo(37000, 6);
  });

  it('o peso mostrado é EXATAMENTE o do SMBI, inclusive quando a diferença é pequena ou o faturado é maior', () => {
    const base = pedido();
    const com = (kg: number) => pedido({ smbiEspelhoFiscal: { ...base.smbiEspelhoFiscal!, pesoFaturadoKg: kg } });
    expect(pesoEfetivoKg(com(37000))).toBe(37000);
    expect(pesoEfetivoKg(com(37999.5))).toBe(37999.5);
    expect(pesoEfetivoKg(com(39000))).toBe(39000);
    expect(comissaoPedido(com(39000))).toBeCloseTo(152000 * 0.03 * 39 / 38, 6);
    expect(pesoEfetivoKg(pedido({ status: 'estimado' }))).toBe(38000);
  });
});
