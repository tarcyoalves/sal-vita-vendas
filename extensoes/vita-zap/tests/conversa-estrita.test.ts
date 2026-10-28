// 0.7.28 (revisão da 0.7.26): autor x título sem `includes`; envio automático com regra estrita.
import { describe, expect, it } from 'vitest';
import { autorBateComTitulo } from '../src/content/execucao';

describe('autorBateComTitulo', () => {
  it('igualdade depois de normalizar', () => {
    expect(autorBateComTitulo('ana cliente', 'Ana Cliente', true)).toBe(true);
  });
  it('nunca aceita "contido em" (grupo "Ana e Equipe" com membro "Ana")', () => {
    expect(autorBateComTitulo('ana', 'Ana e Equipe', false)).toBe(false);
    expect(autorBateComTitulo('ana', 'Ana e Equipe', true)).toBe(false);
    expect(autorBateComTitulo('ana cliente goias', 'Ana', false)).toBe(false);
  });
  it('vazio nunca bate', () => {
    expect(autorBateComTitulo('…', 'Ana Cliente', false)).toBe(false);
    expect(autorBateComTitulo('ana cliente', '…', false)).toBe(false);
  });
  it('título cortado com "…" aceita prefixo de 5+ letras, também no estrito', () => {
    expect(autorBateComTitulo('adriano cliente goias agroline', 'Adriano Cliente Goi…', true)).toBe(true);
    expect(autorBateComTitulo('ana xyz', 'Ana…', true)).toBe(false);
  });
  it('autor cortado só vale fora do estrito', () => {
    expect(autorBateComTitulo('adriano clien…', 'Adriano Cliente Goiás', false)).toBe(true);
    expect(autorBateComTitulo('adriano clien…', 'Adriano Cliente Goiás', true)).toBe(false);
  });
  it('título com formato CRM (delimitador ou sufixo Cliente) aceita autor base', () => {
    expect(autorBateComTitulo('ismael roberto', 'Ismael Roberto - AGROPECUÁRIA PRADAL', true)).toBe(true);
    expect(autorBateComTitulo('agro comercial penteado', 'Agro Comercial Penteado Cliente Imbituva PR', true)).toBe(true);
    expect(autorBateComTitulo('robson', 'Robson Cliente Itabela Ba', true)).toBe(true);
    expect(autorBateComTitulo('robson', 'Robson (Fazenda Sol)', true)).toBe(true);
  });
});
