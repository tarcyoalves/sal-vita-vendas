import { describe, it, expect } from 'vitest';
import { parseIntOr, numberInputValue, safePercent } from '../client/src/lib/numbers';

describe('parseIntOr', () => {
  it('campo vazio ou lixo cai no fallback, nunca NaN', () => {
    expect(parseIntOr('', 8)).toBe(8);
    expect(parseIntOr('abc', 8)).toBe(8);
    expect(parseIntOr('6', 8)).toBe(6);
  });
});

describe('numberInputValue', () => {
  it('NaN vira campo vazio', () => {
    expect(numberInputValue(NaN)).toBe('');
    expect(numberInputValue(100)).toBe(100);
  });
});

describe('safePercent', () => {
  it('meta 0 ou inválida não gera NaN nem Infinity', () => {
    expect(safePercent(10, 0)).toBe(0);
    expect(safePercent(0, 0)).toBe(0);
    expect(safePercent(10, NaN)).toBe(0);
    expect(safePercent(NaN, 10)).toBe(0);
  });
  it('arredonda e limita a 100', () => {
    expect(safePercent(1, 3)).toBe(33);
    expect(safePercent(50, 10)).toBe(100);
    expect(safePercent(-5, 10)).toBe(0);
  });
});
