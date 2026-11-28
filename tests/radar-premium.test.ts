import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';

import { RADAR_ALL_CNAES, segmentsForCnaes } from '../shared/radar';
import {
  PREMIUM_ALL_CNAES,
  PREMIUM_DEFAULT_SEGMENT_KEYS,
  PREMIUM_OPT_IN_SEGMENT_KEYS,
  PREMIUM_SEGMENTS,
  PREMIUM_SEGMENT_KEYS,
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
  parseSegmentosPremium,
  perfilTag,
  premiumCnaesProprios,
  resumoPorSegmentoPremium,
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
  it('CNAEs genéricos exigem nome (exceto o segmento minimercado, de propósito sem nome)', () => {
    for (const c of ['4729699', '4712100', '5611201']) {
      const segs = PREMIUM_SEGMENTS.filter((s) => (s.cnaes as readonly string[]).includes(c) && s.key !== 'minimercado');
      expect(segs.length).toBeGreaterThan(0);
      for (const s of segs) expect(s.requiresNameMatch).toBe(true);
    }
    expect(PREMIUM_SEGMENTS.find((s) => s.key === 'minimercado')?.requiresNameMatch).toBe(false);
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
    // minimercado (opt-in) casa 4712100 sem nome; nos segmentos padrão não há casamento.
    expect(premiumSegmentsFor(['4712100'], null, 'COMERCIAL DE ALIMENTOS LTDA', PREMIUM_DEFAULT_SEGMENT_KEYS)).toEqual([]);
    expect(premiumSegmentsFor(['4712100'], null, 'COMERCIAL DE ALIMENTOS LTDA')).toEqual(['minimercado']);
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
    expect(premiumSegmentsFor(['4712100'], null, 'ARMAZEM NATURAL LTDA')).toEqual(['mercado_natural', 'minimercado']);
  });
  it('usa CNAE secundário (lista de cnaes)', () => {
    expect(premiumSegmentsFor(['4711301', '5611201'], 'Vegano Bistrô', null)).toEqual(['restaurante_saudavel']);
  });
  it('"fit" só como palavra inteira: não casa fitness nem academia', () => {
    expect(premiumSegmentsFor(['5611201'], 'Restaurante Fit', null)).toEqual(['restaurante_saudavel']);
    expect(premiumSegmentsFor(['5611201'], 'Fitness Grill', null)).toEqual(['churrascaria']); // "grill", não "fit"
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
    expect(premiumCnaesAlvo(['4712100'], 'Mercadinho Z', null, PREMIUM_DEFAULT_SEGMENT_KEYS)).toEqual([]);
    expect(premiumCnaesAlvo(['4712100'], 'Mercadinho Z', null)).toEqual(['4712100']); // minimercado, sem nome
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
    // Padrão = sem os segmentos opt-in: os CNAEs exclusivos deles (açougue etc.) não entram.
    const padrao = targetCnaesForPerfil('premium');
    for (const c of ['4722901', '4722902', '4724500']) expect(padrao).not.toContain(c);
    expect(padrao).toContain('4712100'); // mercado_natural (padrão) usa o mesmo CNAE do minimercado
    expect(new Set(targetCnaesForPerfil('premium', PREMIUM_SEGMENT_KEYS))).toEqual(new Set(PREMIUM_ALL_CNAES));
    const ambos = targetCnaesForPerfil('ambos', PREMIUM_SEGMENT_KEYS);
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
    expect(contarPorSegmentoPremium(rows)).toEqual({ loja_natural: 2, suplementos: 1, temperos_especiarias: 1 }); // "Natural B" também é suplementos
  });
  it('arquivo filtrado de outro perfil é recusado; arquivo antigo (sem perfil) vale como cargas', () => {
    const base = { version: 1 as const, release: '2026-11', ufs: ['RN'], cnaes: [...RADAR_ALL_CNAES] };
    const esperado = { release: '2026-11', ufs: ['RN'], cnaes: RADAR_ALL_CNAES };
    expect(motivoFiltradoInvalido(base, esperado)).toBeNull();
    expect(motivoFiltradoInvalido(base, { ...esperado, perfil: 'cargas' })).toBeNull();
    expect(motivoFiltradoInvalido(base, { ...esperado, perfil: 'premium' })).toMatch(/perfil/);
  });
});

describe('segmentos do público ampliado', () => {
  const segs = (cnaes: string[], nf: string | null, rs = 'FULANO LTDA') => premiumSegmentsFor(cnaes, nf, rs);

  it('suplementos: palavras de nome casam com acento, caixa e plural', () => {
    for (const nome of ['Casa dos Suplementos', 'SUPLEMENTAÇÃO TOTAL', 'Whey Point', 'Nutrition Center', 'Nutri Vida', 'Loja Natural', 'Saúde & Vida']) {
      expect(segs(['4729699'], nome), nome).toContain('suplementos');
    }
  });
  it('suplementos: sem palavra no nome não casa; pedaço de palavra não casa', () => {
    expect(segs(['4729699'], 'Mercadinho do Zé')).not.toContain('suplementos');
    expect(segs(['4729699'], 'Wheyland')).not.toContain('suplementos');
    expect(segs(['4729699'], 'Nutritivo')).not.toContain('suplementos');
  });
  it('suplementos: "saude" vale só no nome fantasia, nunca na razão social', () => {
    expect(segs(['4729699'], 'Saude Bem')).toContain('suplementos');
    expect(segs(['4729699'], 'Loja do Ze', 'CLINICA SAUDE LTDA')).not.toContain('suplementos');
    expect(segs(['4729699'], null, 'SAUDE E VIDA COMERCIO LTDA')).not.toContain('suplementos');
    // as outras palavras continuam valendo na razão social
    expect(segs(['4729699'], null, 'CASA DOS SUPLEMENTOS LTDA')).toContain('suplementos');
  });
  it('suplementos: o veto de academia/gym/musculação/crossfit/pilates continua valendo', () => {
    expect(segs(['4729699'], 'Academia Fit Suplementos')).toEqual([]);
    for (const nome of ['Gym Suplementos', 'Musculação Whey', 'Crossfit Natural', 'Pilates Nutri']) {
      expect(segs(['4729699'], nome), nome).not.toContain('suplementos');
    }
    expect(segs(['4729699'], 'Casa dos Suplementos')).toEqual(['suplementos']);
  });
  it('suplementos: usa só CNAE verificado (4772500 e 4789099 não citam suplemento no IBGE)', () => {
    const seg = PREMIUM_SEGMENTS.find((s) => s.key === 'suplementos')!;
    expect([...seg.cnaes]).toEqual(['4729699']);
    expect(segs(['4772500'], 'Casa dos Suplementos')).toEqual([]);
    expect(segs(['4789099'], 'Casa dos Suplementos')).toEqual([]);
  });
  it('minimercado: 4712100 sem exigir nome; mercado_natural continua exigindo', () => {
    expect(segs(['4712100'], 'Mercadinho do Zé')).toEqual(['minimercado']);
    expect(segs(['4712100'], null)).toEqual(['minimercado']);
    expect(segs(['4712100'], 'Empório Natural')).toEqual(['mercado_natural', 'minimercado']);
  });
  it('açougue, peixaria e hortifruti: CNAE basta, sem nome', () => {
    expect(segs(['4722901'], null)).toEqual(['acougue_casa_de_carnes']);
    expect(segs(['4722902'], 'Qualquer Nome')).toEqual(['peixaria']);
    expect(segs(['4724500'], null)).toEqual(['hortifruti']);
    for (const k of ['acougue_casa_de_carnes', 'peixaria', 'hortifruti', 'minimercado']) {
      const seg = PREMIUM_SEGMENTS.find((s) => s.key === k)!;
      expect(seg.requiresNameMatch).toBe(false);
      expect(seg.keywords).toHaveLength(0);
    }
  });
  it('churrascaria: 5611201 + nome (churrasc, parrilla, grill, steak, espetinho, costelaria)', () => {
    for (const nome of ['Churrascaria Gaúcha', 'Churrasco do Zé', 'Parrilla Sul', 'Burger Grill', 'Steak House Prime', 'Espetinho da Maria', 'Costelaria 10', 'CHURRASC']) {
      expect(segs(['5611201'], nome), nome).toContain('churrascaria');
    }
    expect(segs(['5611201'], 'Restaurante Dona Ana')).toEqual([]);
    expect(segs(['5611201'], 'Grilled Chicken')).not.toContain('churrascaria'); // palavra inteira
    expect(segs(['5611203'], 'Churrascaria X')).not.toContain('churrascaria'); // CNAE errado
  });
  it('churrascaria é separada de restaurante_saudavel: cada uma com a sua regra', () => {
    expect(segs(['5611201'], 'Churrascaria Natural')).toEqual(['restaurante_saudavel', 'churrascaria']);
    expect(segs(['5611201'], 'Restaurante Natural')).toEqual(['restaurante_saudavel']);
    expect(segs(['5611201'], 'Churrascaria Gaúcha')).toEqual(['churrascaria']);
  });
  it('nenhum CNAE novo colide com o Radar de Cargas', () => {
    for (const k of ['suplementos', 'minimercado', 'acougue_casa_de_carnes', 'peixaria', 'hortifruti', 'churrascaria']) {
      const seg = PREMIUM_SEGMENTS.find((s) => s.key === k)!;
      for (const c of seg.cnaes) expect(RADAR_ALL_CNAES, `${k}:${c}`).not.toContain(c);
    }
  });
});

describe('--segmentos-premium', () => {
  const opt: string[] = [...PREMIUM_OPT_IN_SEGMENT_KEYS];

  it('opt-in são exatamente minimercado, açougue, peixaria e hortifruti', () => {
    expect([...opt].sort()).toEqual(['acougue_casa_de_carnes', 'hortifruti', 'minimercado', 'peixaria']);
  });
  it('padrão = todos os segmentos menos os opt-in (e inclui os novos não opt-in)', () => {
    expect(parseSegmentosPremium(undefined)).toEqual(PREMIUM_DEFAULT_SEGMENT_KEYS);
    expect(PREMIUM_DEFAULT_SEGMENT_KEYS).toEqual(PREMIUM_SEGMENT_KEYS.filter((k) => !opt.includes(k)));
    expect(PREMIUM_DEFAULT_SEGMENT_KEYS).toContain('suplementos');
    expect(PREMIUM_DEFAULT_SEGMENT_KEYS).toContain('churrascaria');
    expect(PREMIUM_DEFAULT_SEGMENT_KEYS).toContain('mercado_natural');
    for (const k of opt) expect(PREMIUM_DEFAULT_SEGMENT_KEYS).not.toContain(k);
  });
  it('lista separada por vírgula: ignora espaço/caixa/repetição e segue a ordem do catálogo', () => {
    expect(parseSegmentosPremium(' Peixaria , suplementos,peixaria')).toEqual(['suplementos', 'peixaria']);
    expect(parseSegmentosPremium('hortifruti')).toEqual(['hortifruti']);
  });
  it('chave desconhecida ou lista vazia falha com mensagem útil', () => {
    expect(() => parseSegmentosPremium('suplementos,padaria')).toThrow(/desconhecido: padaria/);
    expect(() => parseSegmentosPremium('')).toThrow(/vazio/);
    expect(() => parseSegmentosPremium(' , ')).toThrow(/vazio/);
  });
  it('importador padrão não grava açougue/peixaria/hortifruti/minimercado', () => {
    const rows = [
      row({ cnpj: '1', cnaesAlvo: ['4722901'], cnaePrincipal: '4722901' }),
      row({ cnpj: '2', cnaesAlvo: ['4722902'], cnaePrincipal: '4722902' }),
      row({ cnpj: '3', cnaesAlvo: ['4724500'], cnaePrincipal: '4724500' }),
      row({ cnpj: '4', cnaesAlvo: ['4712100'], cnaePrincipal: '4712100', nomeFantasia: 'Mercadinho do Zé' }),
      row({ cnpj: '5', cnaesAlvo: ['4729699'], nomeFantasia: 'Casa dos Suplementos' }),
    ];
    expect(aplicarPerfil(rows, 'premium').map((r) => r.cnpj)).toEqual(['5']);
  });
  it('com opt-in explícito, o segmento entra e só ele', () => {
    const rows = [
      row({ cnpj: '1', cnaesAlvo: ['4722901'], cnaePrincipal: '4722901' }),
      row({ cnpj: '4', cnaesAlvo: ['4712100'], cnaePrincipal: '4712100', nomeFantasia: 'Mercadinho do Zé' }),
      row({ cnpj: '5', cnaesAlvo: ['4729699'], nomeFantasia: 'Casa dos Suplementos' }),
    ];
    expect(aplicarPerfil(rows, 'premium', ['acougue_casa_de_carnes']).map((r) => r.cnpj)).toEqual(['1']);
    expect(aplicarPerfil(rows, 'premium', ['minimercado', 'suplementos']).map((r) => r.cnpj)).toEqual(['4', '5']);
  });
  it('cnaes_alvo não vaza o CNAE de segmento não escolhido', () => {
    const r = row({ cnaesAlvo: ['4712100', '4722901'], cnaePrincipal: '4712100', nomeFantasia: 'Mercadinho' });
    expect(cnaesAlvoDoPerfil(r, 'premium', ['minimercado'])).toEqual(['4712100']);
    expect(cnaesAlvoDoPerfil(r, 'premium', ['acougue_casa_de_carnes'])).toEqual(['4722901']);
    expect(cnaesAlvoDoPerfil(r, 'premium')).toEqual([]);
  });
  it('dry-run: os segmentos novos aparecem na contagem, inclusive com 0', () => {
    const rows = aplicarPerfil([
      row({ cnpj: '1', nomeFantasia: 'Casa dos Suplementos' }),
      row({ cnpj: '2', cnaesAlvo: ['5611201'], cnaePrincipal: '5611201', nomeFantasia: 'Churrascaria Boa' }),
    ], 'premium');
    expect(contarPorSegmentoPremium(rows)).toEqual({ suplementos: 1, churrascaria: 1 });
    const resumo = resumoPorSegmentoPremium(rows);
    expect(Object.keys(resumo)).toEqual(PREMIUM_DEFAULT_SEGMENT_KEYS);
    expect(resumo.suplementos).toBe(1);
    expect(resumo.churrascaria).toBe(1);
    expect(resumo.loja_natural).toBe(0);
    expect(resumoPorSegmentoPremium([], ['peixaria'])).toEqual({ peixaria: 0 });
  });
  it('mesma linha em minimercado e mercado_natural conta nos dois', () => {
    const r = row({ cnaesAlvo: ['4712100'], cnaePrincipal: '4712100', nomeFantasia: 'Empório Natural' });
    expect(contarPorSegmentoPremium([r], ['mercado_natural', 'minimercado'])).toEqual({ mercado_natural: 1, minimercado: 1 });
  });
  it('limpeza: CNAE compartilhado com segmento não escolhido não é "próprio"', () => {
    expect(premiumCnaesProprios(PREMIUM_DEFAULT_SEGMENT_KEYS)).not.toContain('4712100');
    expect(premiumCnaesProprios(PREMIUM_DEFAULT_SEGMENT_KEYS)).not.toContain('4722901');
    expect(premiumCnaesProprios(['acougue_casa_de_carnes'])).toEqual(['4722901']);
    expect(new Set(premiumCnaesProprios(PREMIUM_SEGMENT_KEYS))).toEqual(new Set(PREMIUM_ALL_CNAES));
  });
  it('arquivo filtrado só serve para a mesma seleção de segmentos', () => {
    expect(perfilTag('premium')).toBe('premium');
    expect(perfilTag('cargas')).toBe('cargas');
    const tagAcougue = perfilTag('premium', ['acougue_casa_de_carnes']);
    expect(tagAcougue).not.toBe('premium');
    const base = { version: 1 as const, release: '2026-11', ufs: ['RN'], cnaes: ['4722901'], perfil: tagAcougue };
    const esperado = { release: '2026-11', ufs: ['RN'], cnaes: ['4722901'] };
    expect(motivoFiltradoInvalido(base, { ...esperado, perfil: tagAcougue })).toBeNull();
    expect(motivoFiltradoInvalido(base, { ...esperado, perfil: perfilTag('premium') })).toMatch(/perfil/);
  });
  it('flag no script: --segmentos-premium só com premium/ambos', () => {
    const src = readFileSync('scripts/radar/import-receita.ts', 'utf8');
    expect(src).toContain("case '--segmentos-premium'");
    expect(src).toMatch(/--segmentos-premium só vale com --perfil premium ou ambos/);
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
