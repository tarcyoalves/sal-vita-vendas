import { describe, expect, it } from 'vitest';
import { foldText, searchTerms, SQL_ACENTOS, SQL_SEM_ACENTOS } from '../shared/searchText';

describe('busca sem acento', () => {
  it('foldText ignora acento, cedilha e maiúsculas', () => {
    expect(foldText('Laticínios SÃO João')).toBe('laticinios sao joao');
    expect(foldText('AÇÚCAR e Pão')).toBe('acucar e pao');
    expect(foldText(null)).toBe('');
  });
  it('com e sem acento dão o mesmo resultado', () => {
    expect(foldText('laticinio')).toBe(foldText('Laticínio'));
    expect(foldText('observacao')).toBe(foldText('OBSERVAÇÃO'));
  });
  it('searchTerms separa, dobra, tira vazios e repetidos', () => {
    expect(searchTerms('  Laticínio   CHAPADA laticinio ')).toEqual(['laticinio', 'chapada']);
    expect(searchTerms('')).toEqual([]);
    expect(searchTerms('a b c d e f g h', 3)).toEqual(['a', 'b', 'c']);
  });
  it('listas do SQL têm o mesmo tamanho e dobram igual ao foldText', () => {
    expect([...SQL_ACENTOS].length).toBe([...SQL_SEM_ACENTOS].length);
    const sql = (s: string) => [...s].map((c) => { const i = SQL_ACENTOS.indexOf(c); return i >= 0 ? SQL_SEM_ACENTOS[i] : c; }).join('').toLowerCase();
    for (const amostra of ['ação', 'Éder', 'ÇÃO', 'Pinhão', 'Niñez', 'ÀÈÌÒÙ', 'üÜ']) expect(sql(amostra)).toBe(foldText(amostra));
  });
});
