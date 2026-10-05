import { describe, it, expect } from 'vitest';
import {
  aplicarCompartilhado,
  classeTelefone,
  ordenarPorRanking,
  paginar,
  pesoPorte,
  ufsSemBase,
  type ChaveRanking,
} from '../server/lib/radar/ranking';
import { RADAR_TELEFONE_COMPARTILHADO_MIN, type RadarPhone } from '../shared/radar';

const fone = (digits: string, compartilhadoPor?: number): RadarPhone => ({
  digits, formatted: digits, likelyMobile: false, ...(compartilhadoPor !== undefined ? { compartilhadoPor } : {}),
});
const k = (nome: string, over: Partial<ChaveRanking> = {}): ChaveRanking => ({
  distanceKm: 10, phones: [fone('4935441234', 1)], porte: '01', nome, ...over,
});

describe('classeTelefone', () => {
  it('próprio, só compartilhado e sem telefone', () => {
    expect(classeTelefone([fone('4935441234', 1)])).toBe(0);
    expect(classeTelefone([fone('4935441234')])).toBe(0);
    expect(classeTelefone([fone('4935441234', RADAR_TELEFONE_COMPARTILHADO_MIN)])).toBe(1);
    expect(classeTelefone([fone('4935441234', 9), fone('4935445678', 2)])).toBe(0);
    expect(classeTelefone([])).toBe(2);
  });
});

describe('pesoPorte', () => {
  it('05 > 03 > 01 > 00/null', () => {
    expect(pesoPorte('05')).toBeGreaterThan(pesoPorte('03'));
    expect(pesoPorte('03')).toBeGreaterThan(pesoPorte('01'));
    expect(pesoPorte('01')).toBeGreaterThan(pesoPorte('00'));
    expect(pesoPorte('00')).toBe(pesoPorte(null));
  });
});

describe('ordenarPorRanking', () => {
  it('distância manda: perto sem telefone vem antes de longe com telefone', () => {
    const r = ordenarPorRanking(
      [k('longe', { distanceKm: 50 }), k('perto', { distanceKm: 5, phones: [] })],
      (x) => x,
    );
    expect(r.map((x) => x.nome)).toEqual(['perto', 'longe']);
  });

  it('mesma distância: próprio > compartilhado > sem telefone, depois porte, depois nome', () => {
    const compart = [fone('4935441234', 8)];
    const r = ordenarPorRanking(
      [
        k('sem', { phones: [], porte: '05' }),
        k('compartilhado', { phones: compart, porte: '05' }),
        k('me-b', { porte: '01' }),
        k('demais', { porte: '05' }),
        k('epp', { porte: '03' }),
        k('me-a', { porte: '01' }),
        k('nulo', { porte: null }),
      ],
      (x) => x,
    );
    expect(r.map((x) => x.nome)).toEqual(['demais', 'epp', 'me-a', 'me-b', 'nulo', 'compartilhado', 'sem']);
  });

  it('nome em pt-BR ignora acento e caixa; não altera a lista original', () => {
    const entrada = [k('Zé'), k('álvaro'), k('Bruno')];
    const r = ordenarPorRanking(entrada, (x) => x);
    expect(r.map((x) => x.nome)).toEqual(['álvaro', 'Bruno', 'Zé']);
    expect(entrada[0].nome).toBe('Zé');
  });
});

describe('paginar', () => {
  const lista = Array.from({ length: 5 }, (_, i) => i);
  it('fatias e hasMore', () => {
    expect(paginar(lista, 0, 2)).toEqual({ fatia: [0, 1], hasMore: true });
    expect(paginar(lista, 1, 2)).toEqual({ fatia: [2, 3], hasMore: true });
    expect(paginar(lista, 2, 2)).toEqual({ fatia: [4], hasMore: false });
    expect(paginar(lista, 3, 2)).toEqual({ fatia: [], hasMore: false });
  });
  it('tamanho exato não tem próxima', () => {
    expect(paginar([1, 2], 0, 2)).toEqual({ fatia: [1, 2], hasMore: false });
  });
});

describe('aplicarCompartilhado', () => {
  it('preenche só quem tem contagem, sem mutar o original', () => {
    const a = fone('4935441234');
    const b = fone('4935445678');
    const r = aplicarCompartilhado([a, b], new Map([['4935441234', 7]]));
    expect(r[0].compartilhadoPor).toBe(7);
    expect(r[1].compartilhadoPor).toBeUndefined();
    expect(a.compartilhadoPor).toBeUndefined();
  });
});

describe('ufsSemBase', () => {
  it('devolve UFs do raio sem empresas na base (únicas e ordenadas)', () => {
    const porUf = [{ uf: 'PR', count: 100 }, { uf: 'SC', count: 0 }];
    expect(ufsSemBase(['PR', 'SP', 'SC', 'SP', 'MS'], porUf)).toEqual(['MS', 'SC', 'SP']);
  });
  it('base vazia: todas as UFs do raio', () => {
    expect(ufsSemBase(['RS', 'PR', 'RS'], [])).toEqual(['PR', 'RS']);
  });
});
