import { describe, it, expect } from 'vitest';
import { ultimoMesComPedidos } from '../client/src/lib/faturamento/calc';
import type { Pedido } from '../client/src/lib/faturamento/types';

const ped = (over: Partial<Pedido>) => ({ id: 'x', status: 'faturado', criadoEm: '2026-09-01T10:00:00Z', ...over } as unknown as Pedido);

describe('ultimoMesComPedidos', () => {
  it('no 1º dia do mês novo, aponta o último mês que tem pedidos', () => {
    const pedidos = [
      ped({ id: 'a', faturadoEm: '2026-09-30T09:00:00-03:00' }),
      ped({ id: 'b', faturadoEm: '2026-09-19T11:00:00-03:00' }),
      ped({ id: 'c', faturadoEm: '2026-08-10T11:00:00-03:00' }),
    ];
    expect(ultimoMesComPedidos(pedidos, { ano: 2026, mes: 9 })).toEqual({ mes: { ano: 2026, mes: 8 }, qtd: 2 });
  });
  it('quando o mês do filtro já tem pedido, não avisa nada', () => {
    const pedidos = [ped({ id: 'a', faturadoEm: '2026-10-01T09:00:00-03:00' }), ped({ id: 'b', faturadoEm: '2026-09-19T11:00:00-03:00' })];
    expect(ultimoMesComPedidos(pedidos, { ano: 2026, mes: 9 })).toBeNull();
  });
  it('sem nenhum pedido anterior, não avisa', () => {
    expect(ultimoMesComPedidos([], { ano: 2026, mes: 9 })).toBeNull();
  });
  it('mês de outro ano', () => {
    const pedidos = [ped({ id: 'a', faturadoEm: '2025-12-20T09:00:00-03:00' })];
    expect(ultimoMesComPedidos(pedidos, { ano: 2026, mes: 0 })).toEqual({ mes: { ano: 2025, mes: 11 }, qtd: 1 });
  });
});
