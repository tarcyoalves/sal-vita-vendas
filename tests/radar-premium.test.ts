import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';

import { RADAR_ALL_CNAES, segmentsForCnaes } from '../shared/radar';
import {
  PREMIUM_ALL_CNAES,
  PREMIUM_SEGMENTS,
  PREMIUM_WAVE_1_UFS,
  normalizePremiumText,
  premiumCnaesAlvo,
  premiumSegmentsFor,
} from '../shared/radarPremium';
import { cargoScopeCondition, isCargoEstablishment } from '../server/lib/radar/cargoScope';
import {
  aplicarPerfil,
  cnaesAlvoDoPerfil,
  contarPorSegmentoPremium,
  parsePerfil,
  targetCnaesForPerfil,
} from '../server/lib/radar/premiumImport';
import { motivoFiltradoInvalido } from '../server/lib/radar/filteredFile';
import type { RadarEstablishmentRow } from '../server/lib/radar/receitaParse';

// premiumCandidatos importa enrichment.ts, que importa `db` (neon() exige a variável existir
// no carregamento; nunca conecta aqui). Mesmo truque de tests/radar-enrichment.test.ts.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
const { montarCandidatoPremium } = await import('../server/lib/radar/premiumCandidatos');

function row(over: Partial<RadarEstablishmentRow> = {}): RadarEstablishmentRow {
  return {
    cnpjBasico: '12345678', cnpj: '12345678000199', cnaePrincipal: '4729699', cnaesAlvo: ['4729699'],
    municipioIbge: 2408102, uf: 'RN', endereco: 'RUA A, 1 - CENTRO', cep: '59000000',
    telefone1: '8433331111', telefone2: null, email: null, dataInicio: '2015-01-01',
    nomeFantasia: null, razaoSocial: 'FULANO LTDA', porte: '01', ...over,
  };
}

describe('catálogo Premium', () => {
  it('todo CNAE tem 7 dígitos e PREMIUM_ALL_CNAES não repete', () => {
    for (const c of PREMIUM_ALL_CNAES) expect(c).toMatch(/^\d{7}$/);
    expect(new Set(PREMIUM_ALL_CNAES).size).toBe(PREMIUM_ALL_CNAES.length);
  });
  it('não invade o Radar de Cargas: nenhum CNAE em comum', () => {
    expect(PREMIUM_ALL_CNAES.filter((c) => RADAR_ALL_CNAES.includes(c))).toEqual([]);
  });
  it('chaves de segmento únicas; segmento sem exigência de nome não tem palavras-chave', () => {
    const keys = PREMIUM_SEGMENTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of PREMIUM_SEGMENTS) if (!s.requiresNameMatch) expect(s.keywords).toHaveLength(0);
  });
  it('CNAEs genéricos exigem nome', () => {
    for (const c of ['4729699', '4712100', '5611201']) {
      const segs = PREMIUM_SEGMENTS.filter((s) => (s.cnaes as readonly string[]).includes(c));
      expect(segs.length).toBeGreaterThan(0);
      for (const s of segs) expect(s.requiresNameMatch).toBe(true);
    }
  });
  it('onda 1 = RN, CE, PB, PE', () => {
    expect([...PREMIUM_WAVE_1_UFS]).toEqual(['RN', 'CE', 'PB', 'PE']);
  });
});

describe('casamento de segmento com regra de nome', () => {
  it('normaliza acento e caixa', () => {
    expect(normalizePremiumText('  EMPÓRIO São João!! ')).toBe('emporio sao joao');
  });
  it('CNAE genérico sem palavra-chave NÃO casa', () => {
    expect(premiumSegmentsFor(['4729699'], 'MERCADINHO DO ZE', 'JOSE SILVA ME')).toEqual([]);
    expect(premiumSegmentsFor(['4712100'], null, 'COMERCIAL DE ALIMENTOS LTDA')).toEqual([]);
    expect(premiumSegmentsFor(['5611201'], 'BAR E RESTAURANTE DO PEIXE', 'MARIA ME')).toEqual([]);
  });
  it('casa com acento, caixa alta e plural', () => {
    expect(premiumSegmentsFor(['4729699'], 'EMPÓRIO DA TERRA', 'X LTDA')).toContain('loja_natural');
    expect(premiumSegmentsFor(['4729699'], 'Casa dos Naturais', null)).toContain('loja_natural');
    expect(premiumSegmentsFor(['4729699'], 'Orgânicos do Vale', null)).toContain('loja_natural');
    expect(premiumSegmentsFor(['4729699'], 'Cerealista Nordeste', null)).toContain('granel_cerealista');
    expect(premiumSegmentsFor(['4729699'], 'Casa de Grãos', null)).toContain('granel_cerealista');
    expect(premiumSegmentsFor(['4729699'], 'Mundo a Granel', null)).toContain('granel_cerealista');
  });
  it('casa pela razão social quando o fantasia está vazio', () => {
    expect(premiumSegmentsFor(['4712100'], null, 'ARMAZEM NATURAL LTDA')).toEqual(['mercado_natural']);
  });
  it('usa CNAE secundário (lista de cnaes)', () => {
    expect(premiumSegmentsFor(['4711301', '5611201'], 'Vegano Bistrô', null)).toEqual(['restaurante_saudavel']);
  });
  it('"fit" só como palavra inteira: não casa fitness nem academia', () => {
    expect(premiumSegmentsFor(['5611201'], 'Restaurante Fit', null)).toEqual(['restaurante_saudavel']);
    expect(premiumSegmentsFor(['5611201'], 'Fitness Grill', null)).toEqual([]);
    expect(premiumSegmentsFor(['5611201'], 'Academia Fit Lanches', null)).toEqual([]);
    expect(premiumSegmentsFor(['5611201'], 'CrossFit Box Restaurante', null)).toEqual([]);
    expect(premiumSegmentsFor(['5620104'], 'Marmitas Fit da Ana', null)).toEqual(['marmita_saudavel']);
  });
  it('palavra-chave como pedaço de outra palavra não casa', () => {
    expect(premiumSegmentsFor(['4729699'], 'Desnaturalizados Ltda', null)).toEqual([]);
    expect(premiumSegmentsFor(['4729699'], 'Integralmente Brasil', null)).toEqual([]);
    expect(premiumSegmentsFor(['4729699'], 'Granelhas SA', null)).toEqual([]);
  });
  it('palavra do segmento errado não casa: "grãos" não faz restaurante virar saudável', () => {
    expect(premiumSegmentsFor(['5611201'], 'Grãos e Brasas', null)).toEqual([]);
  });
  it('padaria só entra se artesanal/integral/natural', () => {
    expect(premiumSegmentsFor(['1091102'], 'Padaria Pão Quente', null)).toEqual([]);
    expect(premiumSegmentsFor(['1091102'], 'Padaria Artesanal Levain', null)).toEqual(['padaria_artesanal']);
  });
  it('CNAEs específicos (temperos, conservas) casam sem nome', () => {
    expect(premiumSegmentsFor(['1095300'], null, 'TEMPEROS DO SERTAO LTDA')).toEqual(['temperos_especiarias']);
    expect(premiumSegmentsFor(['1032599'], 'Conservas Boa', null)).toEqual(['conservas']);
  });
  it('4729699 pode cair em mais de um segmento', () => {
    expect(premiumSegmentsFor(['4729699'], 'Empório a Granel', null).sort()).toEqual(['granel_cerealista', 'loja_natural']);
  });
  it('CNAE de cargas sozinho não casa Premium', () => {
    expect(premiumSegmentsFor(['4711301'], 'Supermercado Natural', null)).toEqual([]);
  });
  it('premiumCnaesAlvo guarda só os CNAEs que sustentam um segmento casado', () => {
    expect(premiumCnaesAlvo(['4711301', '4712100', '1095300'], 'Empório X', null)).toEqual(['4712100', '1095300']);
    expect(premiumCnaesAlvo(['4712100'], 'Mercadinho Z', null)).toEqual([]);
  });
});

describe('perfil do importador', () => {
  it('padrão é cargas; valor inválido falha', () => {
    expect(parsePerfil(undefined)).toBe('cargas');
    expect(parsePerfil('premium')).toBe('premium');
    expect(parsePerfil('ambos')).toBe('ambos');
    expect(() => parsePerfil('outro')).toThrow(/perfil/);
  });
  it('cargas mantém exatamente a lista e as linhas de antes', () => {
    expect(targetCnaesForPerfil('cargas')).toEqual(RADAR_ALL_CNAES);
    const rows = [row({ cnaesAlvo: ['4711301'], cnaePrincipal: '4711301' }), row({ cnpj: '2', cnaesAlvo: ['4729699'] })];
    expect(aplicarPerfil(rows, 'cargas')).toEqual(rows);
  });
  it('premium: lista de CNAEs é a Premium; ambos é a união', () => {
    expect(targetCnaesForPerfil('premium')).toEqual(PREMIUM_ALL_CNAES);
    const ambos = targetCnaesForPerfil('ambos');
    expect(new Set(ambos)).toEqual(new Set([...RADAR_ALL_CNAES, ...PREMIUM_ALL_CNAES]));
    expect(new Set(ambos).size).toBe(ambos.length);
  });
  it('premium mantém quem passa na regra de nome e descarta o resto', () => {
    const rows = [
      row({ cnpj: '1', nomeFantasia: 'EMPORIO DO SERTAO' }),
      row({ cnpj: '2', nomeFantasia: 'MERCADINHO DO ZE' }),
      row({ cnpj: '3', cnaesAlvo: ['1095300'], cnaePrincipal: '1095300', razaoSocial: 'TEMPERO LTDA' }),
    ];
    expect(aplicarPerfil(rows, 'premium').map((r) => r.cnpj)).toEqual(['1', '3']);
  });
  it('cnaes_alvo guarda só os CNAEs do perfil que casou', () => {
    const r = row({ cnaesAlvo: ['4711301', '4712100'], cnaePrincipal: '4711301', nomeFantasia: 'Empório Bom' });
    expect(cnaesAlvoDoPerfil(r, 'cargas')).toEqual(['4711301']);
    expect(cnaesAlvoDoPerfil(r, 'premium')).toEqual(['4712100']);
    expect(cnaesAlvoDoPerfil(r, 'ambos')).toEqual(['4711301', '4712100']);
    const semNome = row({ cnaesAlvo: ['4711301', '4712100'], cnaePrincipal: '4711301', nomeFantasia: 'Mercadão' });
    expect(cnaesAlvoDoPerfil(semNome, 'ambos')).toEqual(['4711301']);
  });
  it('contagem por segmento Premium', () => {
    const rows = aplicarPerfil([
      row({ cnpj: '1', nomeFantasia: 'Empório A' }),
      row({ cnpj: '2', nomeFantasia: 'Natural B' }),
      row({ cnpj: '3', cnaesAlvo: ['1095300'], cnaePrincipal: '1095300' }),
    ], 'premium');
    expect(contarPorSegmentoPremium(rows)).toEqual({ loja_natural: 2, temperos_especiarias: 1 });
  });
  it('arquivo filtrado de outro perfil é recusado; arquivo antigo (sem perfil) vale como cargas', () => {
    const base = { version: 1 as const, release: '2026-11', ufs: ['RN'], cnaes: [...RADAR_ALL_CNAES] };
    const esperado = { release: '2026-11', ufs: ['RN'], cnaes: RADAR_ALL_CNAES };
    expect(motivoFiltradoInvalido(base, esperado)).toBeNull();
    expect(motivoFiltradoInvalido(base, { ...esperado, perfil: 'cargas' })).toBeNull();
    expect(motivoFiltradoInvalido(base, { ...esperado, perfil: 'premium' })).toMatch(/perfil/);
  });
});

describe('isolamento do Radar de Cargas', () => {
  // CNAE principal é de cargas, mas cnaes_alvo (o que o perfil Premium gravou) é só Premium.
  const premiumOnly = { cnaePrincipal: '4711301', cnaesAlvo: ['4712100'] };
  it('linha só-Premium não é de cargas, mesmo com CNAE principal de cargas', () => {
    expect(isCargoEstablishment(premiumOnly.cnaesAlvo)).toBe(false);
    expect(segmentsForCnaes(premiumOnly.cnaesAlvo)).toEqual([]);
    expect(isCargoEstablishment(['4712100', '4711301'])).toBe(true);
    expect(isCargoEstablishment(['1095300'])).toBe(false);
  });
  it('a condição SQL exige overlap de cnaes_alvo com RADAR_ALL_CNAES, parametrizada', () => {
    const q = new PgDialect().sqlToQuery(cargoScopeCondition());
    expect(q.sql).toMatch(/"cnaes_alvo" && ARRAY\[/);
    expect(q.params).toEqual(RADAR_ALL_CNAES);
    for (const c of PREMIUM_ALL_CNAES) expect(q.params).not.toContain(c);
    expect(q.sql).not.toMatch(/\d{7}/); // nenhum CNAE colado no texto SQL
  });
  it('o roteador de cargas aplica a condição na busca, na contagem por UF e na release', () => {
    const src = readFileSync('server/routers/prospectingRadar.ts', 'utf8');
    expect(src).toContain("from '../lib/radar/cargoScope'");
    expect(src).toMatch(/cnaeMatch, cargoScopeCondition\(\), abertaHaAnos/);
    expect((src.match(/cargoScopeCondition\(\)/g) ?? []).length).toBe(3);
  });
});

describe('montarCandidatoPremium', () => {
  const estab = {
    cnpj: '12345678000199', razaoSocial: 'EMPORIO DA TERRA LTDA', nomeFantasia: 'Empório da Terra',
    uf: 'CE', municipioIbge: 2304400, endereco: 'RUA B, 2', cep: '60000000',
    cnaesAlvo: ['4729699'], telefone1: '8533334444', telefone2: '85999998888', email: 'Contato@Terra.com.br',
  };
  const result = {
    website: 'https://emporiodaterra.com.br',
    maps: { url: 'https://maps.google.com/?cid=1', nome: 'Empório da Terra Natural', categoria: 'Loja de produtos naturais', nota: 4.8, avaliacoes: 10, situacao: 'Aberto', endereco: null },
    whatsapps: [{ value: '85999998888', source: 'site', url: 'https://emporiodaterra.com.br/contato' }],
    telefones: [{ value: '8533334444', source: 'maps', url: null }],
    emails: [
      { value: 'contato@terra.com.br', source: 'site', url: 'https://emporiodaterra.com.br' },
      { value: 'vendas@terra.com.br', source: 'site', url: 'https://emporiodaterra.com.br/contato' },
      { value: 'oi@terra.com.br', source: 'social', url: 'https://instagram.com/terra' },
    ],
    instagram: 'https://instagram.com/terra', facebook: null,
    fontes: [{ source: 'site', ok: true, note: null }],
  };
  const linha = { status: 'pronto', result, finishedAt: new Date('2026-11-20T10:00:00Z') };

  it('monta os campos e deduplica e-mails mantendo a primeira fonte', () => {
    const c = montarCandidatoPremium(estab, linha);
    expect(c.cnpj).toBe(estab.cnpj);
    expect(c.segmentos).toContain('loja_natural');
    expect(c.emails).toEqual([
      { email: 'contato@terra.com.br', fonte: 'receita', url: null },
      { email: 'vendas@terra.com.br', fonte: 'site', url: 'https://emporiodaterra.com.br/contato' },
      { email: 'oi@terra.com.br', fonte: 'social', url: 'https://instagram.com/terra' },
    ]);
    expect(c.site).toBe('https://emporiodaterra.com.br');
    expect(c.telefones).toEqual(['8533334444', '85999998888']);
    expect(c.enriquecimentoStatus).toBe('pronto');
    expect(c.atualizadoEm).toBe('2026-11-20T10:00:00.000Z');
    expect(c.uf).toBe('CE');
  });
  it('sinais vêm do nome e do enriquecimento, sem inventar', () => {
    const c = montarCandidatoPremium(estab, linha);
    expect(c.sinais).toContain('nome:emporio');
    expect(c.sinais).toContain('maps_categoria:Loja de produtos naturais');
    expect(c.sinais).toContain('maps_nome_palavra:natural');
    expect(c.sinais.every((s) => /^(nome|maps_categoria|maps_nome|site|instagram|facebook)/.test(s))).toBe(true);
  });
  it('sem enriquecimento: usa só o que veio da Receita', () => {
    const c = montarCandidatoPremium(estab, null);
    expect(c.enriquecimentoStatus).toBe('nao_pedido');
    expect(c.atualizadoEm).toBeNull();
    expect(c.site).toBeNull();
    expect(c.emails).toEqual([{ email: 'contato@terra.com.br', fonte: 'receita', url: null }]);
    expect(c.telefones).toEqual(['8533334444', '85999998888']);
  });
  it('resultado malformado e status desconhecido não quebram', () => {
    const c = montarCandidatoPremium(estab, { status: 'estranho', result: 'lixo', finishedAt: null });
    expect(c.enriquecimentoStatus).toBe('falhou');
    expect(c.emails).toHaveLength(1);
    expect(montarCandidatoPremium({ ...estab, email: 'nao-e-email' }, null).emails).toEqual([]);
  });
});
