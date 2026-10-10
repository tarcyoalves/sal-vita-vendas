import { describe, it, expect } from 'vitest';
import { casaNumeroCrm, rotuloNumeroCrm } from '../client/src/lib/faturamento/numeroCrm';

describe('número interno do pedido', () => {
  it('rótulo', () => {
    expect(rotuloNumeroCrm(123)).toBe('PED-123');
    expect(rotuloNumeroCrm(null)).toBe('--');
  });
  it('busca por várias formas, só número exato', () => {
    for (const q of ['123', 'ped123', 'PED-123', '#123', ' ped 123 ']) expect(casaNumeroCrm(123, q)).toBe(true);
    expect(casaNumeroCrm(123, '12')).toBe(false);
    expect(casaNumeroCrm(123, 'araxa')).toBe(false);
    expect(casaNumeroCrm(null, '1')).toBe(false);
  });
});
