import { describe, expect, it } from 'vitest';
import {
  addRecentCity,
  coverageNotice,
  defaultState,
  emptyAdvice,
  filterBySegments,
  filterByText,
  groupByMunicipio,
  groupTitle,
  mergeLeadPages,
  parseRecentCities,
  porteRank,
  restoreState,
  segmentsPresent,
  serializeState,
  sortLeads,
} from '../client/src/components/radar/buscadorLogic';
import { RADAR_SEGMENT_KEYS, type RadarLead } from '../shared/radar';

const DEFAULTS = RADAR_SEGMENT_KEYS.filter((k) => k !== 'racao_varejo' && k !== 'supermercado');

function lead(p: Partial<RadarLead> & { cnpj: string }): RadarLead {
  return {
    razaoSocial: 'EMPRESA LTDA',
    nomeFantasia: null,
    cnaePrincipal: '4623109',
    segments: ['racao_atacado'],
    matchedByPrincipal: true,
    municipio: { ibge: 1, nome: 'Chapecó', uf: 'SC' },
    distanceKm: 10,
    endereco: null,
    cep: null,
    phones: [],
    email: null,
    emailSuppressed: false,
    porte: '01',
    dataInicio: '2010-01-01',
    crm: { kind: 'novo' },
    enrichment: null,
    activity: { contactedAt: null, contactedByName: null, contactChannel: null, contactCount: 0, discarded: null },
    ...p,
  };
}

describe('groupByMunicipio', () => {
  it('mantém a ordem do servidor e conta empresas', () => {
    const g = groupByMunicipio([
      lead({ cnpj: '1' }),
      lead({ cnpj: '2', municipio: { ibge: 2, nome: 'Xaxim', uf: 'SC' }, distanceKm: 20 }),
      lead({ cnpj: '3' }),
    ]);
    expect(g.map((x) => x.nome)).toEqual(['Chapecó', 'Xaxim']);
    expect(g[0].leads.map((l) => l.cnpj)).toEqual(['1', '3']);
    expect(groupTitle(g[0])).toBe('Chapecó/SC · 10 km · 2 empresas');
    expect(groupTitle(g[1])).toBe('Xaxim/SC · 20 km · 1 empresa');
  });
});

describe('filtros', () => {
  const leads = [
    lead({ cnpj: '11222333000144', nomeFantasia: 'Agropecuária São João', razaoSocial: 'JOAO LTDA' }),
    lead({ cnpj: '99888777000166', razaoSocial: 'Laticínios Ação', segments: ['laticinio'], municipio: { ibge: 2, nome: 'São Miguel', uf: 'SC' } }),
  ];
  it('texto ignora acento e caixa, aceita CNPJ e cidade', () => {
    expect(filterByText(leads, 'sao joao').map((l) => l.cnpj)).toEqual(['11222333000144']);
    expect(filterByText(leads, 'acao').map((l) => l.cnpj)).toEqual(['99888777000166']);
    expect(filterByText(leads, '11.222.333').map((l) => l.cnpj)).toEqual(['11222333000144']);
    expect(filterByText(leads, 'miguel')).toHaveLength(1);
    expect(filterByText(leads, '  ')).toHaveLength(2);
  });
  it('segmentos presentes e filtro', () => {
    expect(segmentsPresent(leads)).toEqual([
      { key: 'racao_atacado', count: 1 },
      { key: 'laticinio', count: 1 },
    ]);
    expect(filterBySegments(leads, ['laticinio'])).toHaveLength(1);
    expect(filterBySegments(leads, [])).toHaveLength(2);
  });
});

describe('sortLeads', () => {
  const a = lead({ cnpj: 'a', porte: '01', dataInicio: '2015-01-01', nomeFantasia: 'Zeta' });
  const b = lead({ cnpj: 'b', porte: '05', dataInicio: null, nomeFantasia: 'Beta' });
  const c = lead({ cnpj: 'c', porte: '03', dataInicio: '2001-05-05', nomeFantasia: 'Álfa' });
  it('porte: 05 > 03 > 01', () => {
    expect(porteRank('05')).toBeGreaterThan(porteRank('03'));
    expect(sortLeads([a, b, c], 'porte').map((l) => l.cnpj)).toEqual(['b', 'c', 'a']);
  });
  it('mais antigas: sem data no fim', () => {
    expect(sortLeads([a, b, c], 'antigas').map((l) => l.cnpj)).toEqual(['c', 'a', 'b']);
  });
  it('nome e distância (não altera o original)', () => {
    const input = [a, b, c];
    expect(sortLeads(input, 'nome').map((l) => l.cnpj)).toEqual(['c', 'b', 'a']);
    expect(sortLeads(input, 'distancia')).toBe(input);
    expect(input.map((l) => l.cnpj)).toEqual(['a', 'b', 'c']);
  });
});

describe('mergeLeadPages', () => {
  it('acrescenta sem duplicar CNPJ', () => {
    const out = mergeLeadPages([lead({ cnpj: '1' }), lead({ cnpj: '2' })], [lead({ cnpj: '2' }), lead({ cnpj: '3' })]);
    expect(out.map((l) => l.cnpj)).toEqual(['1', '2', '3']);
  });
});

describe('cobertura e vazio', () => {
  it('aviso de UFs sem base', () => {
    expect(coverageNotice(['SP', 'MG'], ['PR', 'SC'])).toBe(
      'A base de empresas ainda não cobre: SP, MG. Só aparecem empresas de PR, SC.',
    );
    expect(coverageNotice([], ['PR'])).toBeNull();
    expect(coverageNotice(undefined, ['PR'])).toBeNull();
  });
  it('sugestão de estado vazio', () => {
    expect(emptyAdvice({ minAnosAbertura: 2, segmentsCount: 3 })).toBe('abertura');
    expect(emptyAdvice({ minAnosAbertura: 0, segmentsCount: 3 })).toBe('segmentos');
    expect(emptyAdvice({ minAnosAbertura: 0, segmentsCount: RADAR_SEGMENT_KEYS.length })).toBe('raio');
  });
});

describe('estado salvo', () => {
  it('ida e volta', () => {
    const s = {
      ...defaultState(DEFAULTS),
      mode: 'novas' as const,
      city: { ibge: 4204202, nome: 'Chapecó', uf: 'SC' },
      radiusKm: 80,
      sort: 'porte' as const,
      lastSearch: 'novas' as const,
      scrollTop: 420,
    };
    expect(restoreState(serializeState(s), DEFAULTS)).toEqual(s);
  });
  it('lixo cai no padrão sem lançar', () => {
    expect(restoreState(null, DEFAULTS)).toEqual(defaultState(DEFAULTS));
    expect(restoreState('{nao json', DEFAULTS)).toEqual(defaultState(DEFAULTS));
    const r = restoreState(
      JSON.stringify({ mode: 'x', radiusKm: 7, segments: ['zzz', 'laticinio'], city: { ibge: 'a' }, sort: 'foo' }),
      DEFAULTS,
    );
    expect(r.mode).toBe('carteira');
    expect(r.radiusKm).toBe(50);
    expect(r.segments).toEqual(['laticinio']);
    expect(r.city).toBeNull();
    expect(r.sort).toBe('distancia');
  });
});

describe('cidades recentes', () => {
  const c = (n: number) => ({ ibge: n, nome: `C${n}`, uf: 'SC' });
  it('mais recente primeiro, sem repetir, máximo 5', () => {
    let l = [c(1), c(2), c(3), c(4), c(5)];
    l = addRecentCity(l, c(3));
    expect(l.map((x) => x.ibge)).toEqual([3, 1, 2, 4, 5]);
    l = addRecentCity(l, c(6));
    expect(l.map((x) => x.ibge)).toEqual([6, 3, 1, 2, 4]);
  });
  it('parse tolerante', () => {
    expect(parseRecentCities('lixo')).toEqual([]);
    expect(parseRecentCities(JSON.stringify([c(1), { x: 1 }]))).toEqual([c(1)]);
  });
});
