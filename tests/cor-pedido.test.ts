import { describe, it, expect } from 'vitest';
import { estadoCorPedido } from '../client/src/lib/faturamento/corPedido';

describe('cor do pedido', () => {
  it('amarelo faturado, azul liberado, branco não liberado', () => {
    expect(estadoCorPedido({ status: 'faturado', aprovadoEm: null })).toBe('faturado');
    expect(estadoCorPedido({ status: 'faturado', aprovadoEm: '2026-10-01' })).toBe('faturado');
    expect(estadoCorPedido({ status: 'estimado', aprovadoEm: '2026-10-01' })).toBe('liberado');
    expect(estadoCorPedido({ status: 'estimado', aprovadoEm: null })).toBe('aguardando');
  });
});
