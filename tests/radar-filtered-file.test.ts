import { describe, it, expect } from 'vitest';
import { linhaFiltradaValida, motivoFiltradoInvalido, type FilteredMeta } from '../server/lib/radar/filteredFile';

const meta: FilteredMeta = {
  version: 1, release: '2026-09', ufs: ['PR', 'SC'], cnaes: ['1011201', '4623109'],
  baseCompleta: true, rows: 10, createdAt: '2026-09-30T12:00:00Z',
};
const esperado = { release: '2026-09', ufs: ['SC', 'PR'], cnaes: ['4623109', '1011201'] };

describe('motivoFiltradoInvalido', () => {
  it('aceita release, UFs e CNAEs iguais, em qualquer ordem', () => {
    expect(motivoFiltradoInvalido(meta, esperado)).toBeNull();
  });
  it('recusa release diferente', () => {
    expect(motivoFiltradoInvalido(meta, { ...esperado, release: '2026-10' })).toMatch(/release/);
  });
  it('recusa UFs diferentes', () => {
    expect(motivoFiltradoInvalido(meta, { ...esperado, ufs: ['PR'] })).toMatch(/UFs/);
  });
  it('recusa quando a lista de CNAEs-alvo mudou', () => {
    expect(motivoFiltradoInvalido(meta, { ...esperado, cnaes: ['1011201'] })).toMatch(/CNAEs/);
  });
  it('recusa cabeçalho ausente ou de outra versão', () => {
    expect(motivoFiltradoInvalido(null, esperado)).toMatch(/cabeçalho/);
    expect(motivoFiltradoInvalido({ ...meta, version: 2 as unknown as 1 }, esperado)).toMatch(/cabeçalho/);
  });
});

describe('linhaFiltradaValida', () => {
  const ok = { cnpj: '12345678000195', uf: 'PR', razaoSocial: 'X', cnaesAlvo: ['1011201'], municipioIbge: 4106902 };
  it('aceita linha completa', () => expect(linhaFiltradaValida(ok, ['PR'])).toBe(true));
  it('recusa CNPJ fora do padrão, UF não pedida e CNAE vazio', () => {
    expect(linhaFiltradaValida({ ...ok, cnpj: '123' }, ['PR'])).toBe(false);
    expect(linhaFiltradaValida(ok, ['SC'])).toBe(false);
    expect(linhaFiltradaValida({ ...ok, cnaesAlvo: [] }, ['PR'])).toBe(false);
    expect(linhaFiltradaValida(null, ['PR'])).toBe(false);
  });
});
