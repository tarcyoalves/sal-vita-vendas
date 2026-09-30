import { describe, it, expect } from 'vitest';
import { dataLimiteAbertura } from '../server/lib/radar/abertura';

describe('dataLimiteAbertura', () => {
  it('recua N anos na mesma data', () => {
    expect(dataLimiteAbertura(new Date('2026-09-30T12:00:00Z'), 2)).toBe('2024-09-30');
  });
  it('29/02 em ano não bissexto vira 28/02', () => {
    expect(dataLimiteAbertura(new Date('2028-02-29T12:00:00Z'), 1)).toBe('2027-02-28');
  });
  it('empresa aberta exatamente na data-limite conta como 2 anos', () => {
    const limite = dataLimiteAbertura(new Date('2026-09-30T12:00:00Z'), 2);
    expect('2024-09-30' <= limite).toBe(true);
    expect('2024-10-01' <= limite).toBe(false);
  });
});
