/**
 * Radar de Cargas — enriquecimento por scraping (Fase 2).
 *
 * Só cobre as funções puras de server/lib/radar/enrichment.ts e o bloco "Dados
 * da web" de buildTaskNotes (server/lib/radar/leads.ts). `loadEnrichments`,
 * `loadHeartbeat` e `enqueue` fazem I/O (Neon) e não têm banco disponível
 * neste ambiente de testes — foram só typecheckados (`npm run check`), não
 * exercitados aqui. O SQL do upsert de `enqueue` (o WHERE que espelha
 * `needsEnqueue`) também está só typechecado, pela mesma razão.
 */
import { describe, expect, it } from 'vitest';
import { buildTaskNotes } from '../server/lib/radar/leads';
import type { RadarEnrichmentRow } from '../server/db/schema';
import { RADAR_ENRICHER_ONLINE_MS } from '../shared/radar';

// server/lib/radar/enrichment.ts importa `db` (server/db/index.ts chama `neon()`
// no carregamento do módulo, de propósito — todo outro router do Radar faz o
// mesmo) só para as funções de I/O (loadEnrichments/loadHeartbeat/enqueue), que
// este arquivo não exercita (não há banco disponível no ambiente de teste — ver
// o comentário no topo do arquivo). Sem um DATABASE_URL no processo, porém, o
// import já quebraria antes mesmo de chegar nas funções puras que este arquivo
// testa. Um valor fictício resolve: `neon()` só confere que a string existe,
// nunca conecta de fato aqui. Import dinâmico porque a variável precisa estar
// setada antes do módulo carregar — um `import` estático seria içado (hoisted)
// para antes desta linha.
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
const {
  isEnricherOnline,
  needsEnqueue,
  toRadarEnrichment,
  toRadarEnrichmentData,
  RADAR_ENRICH_MAX_ATTEMPTS,
  RADAR_ENRICH_RETRY_COOLDOWN_MS,
} = await import('../server/lib/radar/enrichment');

function makeRow(overrides: Partial<RadarEnrichmentRow> = {}): RadarEnrichmentRow {
  return {
    cnpj: '12345678000199',
    status: 'pendente',
    priority: 0,
    requestedAt: new Date('2026-09-25T12:00:00Z'),
    requestedByUserId: 1,
    claimedAt: null,
    finishedAt: null,
    attempts: 0,
    result: null,
    error: null,
    expiresAt: null,
    ...overrides,
  };
}

const NOW = new Date('2026-09-25T15:00:00Z');

describe('toRadarEnrichmentData — validação defensiva do JSONB do robô', () => {
  it('null/undefined/tipo primitivo/array vira null', () => {
    expect(toRadarEnrichmentData(null)).toBeNull();
    expect(toRadarEnrichmentData(undefined)).toBeNull();
    expect(toRadarEnrichmentData('lixo')).toBeNull();
    expect(toRadarEnrichmentData(42)).toBeNull();
    expect(toRadarEnrichmentData([])).toBeNull();
  });

  it('objeto vazio vira estrutura toda vazia, sem lançar', () => {
    expect(toRadarEnrichmentData({})).toEqual({
      website: null,
      maps: null,
      whatsapps: [],
      telefones: [],
      emails: [],
      instagram: null,
      facebook: null,
      fontes: [],
    });
  });

  it('aceita um resultado bem formado por completo', () => {
    const raw = {
      website: 'https://exemplo.com.br',
      maps: {
        url: 'https://maps.google.com/?cid=123',
        nome: 'Atacado Exemplo',
        categoria: 'Loja de produtos agropecuários',
        nota: 4.5,
        avaliacoes: 12,
        situacao: 'Aberto',
        endereco: 'Rua Exemplo, 100',
      },
      whatsapps: [{ value: '49991234567', source: 'site', url: 'https://exemplo.com.br/contato' }],
      telefones: [{ value: '4935441234', source: 'busca', url: null }],
      emails: [{ value: 'contato@exemplo.com.br', source: 'maps', url: 'https://maps.google.com/?cid=123' }],
      instagram: 'https://instagram.com/exemplo',
      facebook: 'https://facebook.com/exemplo',
      fontes: [
        { source: 'busca', ok: true, note: null },
        { source: 'site', ok: false, note: 'bloqueado' },
      ],
    };
    expect(toRadarEnrichmentData(raw)).toEqual(raw);
  });

  it('descarta item individual ruim de uma lista, mantendo os bons (não invalida tudo)', () => {
    const raw = {
      whatsapps: [
        { value: '49991234567', source: 'site', url: null }, // bom
        { value: '', source: 'site', url: null }, // value vazio — descarta
        { value: '49988887777', source: 'inexistente', url: null }, // source inválida — descarta
        { source: 'site', url: null }, // sem value — descarta
        'string solta', // nem objeto — descarta
        null, // descarta
        { value: '49977776666', source: 'social', url: 'https://instagram.com/x' }, // bom
      ],
    };
    const result = toRadarEnrichmentData(raw);
    expect(result?.whatsapps).toEqual([
      { value: '49991234567', source: 'site', url: null },
      { value: '49977776666', source: 'social', url: 'https://instagram.com/x' },
    ]);
  });

  it('campo que não é array vira lista vazia, sem lançar', () => {
    expect(toRadarEnrichmentData({ whatsapps: 'não é array', emails: { a: 1 }, fontes: null })).toEqual(
      expect.objectContaining({ whatsapps: [], emails: [], fontes: [] }),
    );
  });

  it('maps sem url é descartado por inteiro (não dá para linkar)', () => {
    expect(toRadarEnrichmentData({ maps: { nome: 'Sem URL' } })?.maps).toBeNull();
  });

  it('maps com nota/avaliações em formato errado vira null nesses campos, mas mantém a url', () => {
    const result = toRadarEnrichmentData({
      maps: { url: 'https://maps.google.com/x', nota: 'ótimo', avaliacoes: NaN, categoria: 42 },
    });
    expect(result?.maps).toEqual({
      url: 'https://maps.google.com/x',
      nome: null,
      categoria: null,
      nota: null,
      avaliacoes: null,
      situacao: null,
      endereco: null,
    });
  });

  it('fontes: item sem "ok" booleano é descartado', () => {
    const result = toRadarEnrichmentData({
      fontes: [
        { source: 'maps', ok: 'sim', note: null },
        { source: 'maps', ok: true, note: null },
      ],
    });
    expect(result?.fontes).toEqual([{ source: 'maps', ok: true, note: null }]);
  });

  it('strings vazias/só espaço contam como ausentes', () => {
    expect(toRadarEnrichmentData({ website: '   ', instagram: '', facebook: null })).toEqual(
      expect.objectContaining({ website: null, instagram: null, facebook: null }),
    );
  });
});

describe('toRadarEnrichment', () => {
  it('sem linha nenhuma devolve null', () => {
    expect(toRadarEnrichment(undefined, NOW)).toBeNull();
  });

  it('status desconhecido (corrompido) vira "falhou" defensivamente', () => {
    const row = makeRow({ status: 'quebrado' as unknown as string });
    expect(toRadarEnrichment(row, NOW)?.status).toBe('falhou');
  });

  it('"pronto" vencido ainda volta com status pronto e o data que tem — quem decide reenfileirar é needsEnqueue', () => {
    const row = makeRow({
      status: 'pronto',
      finishedAt: new Date('2026-08-01T00:00:00Z'),
      expiresAt: new Date('2026-08-31T00:00:00Z'), // já passou
      result: { website: 'https://exemplo.com.br' },
    });
    const enrichment = toRadarEnrichment(row, NOW);
    expect(enrichment?.status).toBe('pronto');
    expect(enrichment?.data?.website).toBe('https://exemplo.com.br');
  });

  it('updatedAt prioriza finishedAt > claimedAt > requestedAt', () => {
    const requestedAt = new Date('2026-09-25T10:00:00Z');
    const claimedAt = new Date('2026-09-25T10:05:00Z');
    const finishedAt = new Date('2026-09-25T10:10:00Z');

    expect(toRadarEnrichment(makeRow({ requestedAt }), NOW)?.updatedAt).toBe(requestedAt.toISOString());
    expect(toRadarEnrichment(makeRow({ requestedAt, claimedAt }), NOW)?.updatedAt).toBe(claimedAt.toISOString());
    expect(toRadarEnrichment(makeRow({ requestedAt, claimedAt, finishedAt }), NOW)?.updatedAt).toBe(finishedAt.toISOString());
  });

  it('result null vira data null', () => {
    expect(toRadarEnrichment(makeRow({ status: 'pendente', result: null }), NOW)?.data).toBeNull();
  });
});

describe('isEnricherOnline', () => {
  it('sem heartbeat nenhum: offline', () => {
    expect(isEnricherOnline(null, NOW)).toBe(false);
  });

  it('heartbeat inválido (não parseável): offline', () => {
    expect(isEnricherOnline('não é uma data', NOW)).toBe(false);
  });

  it('dentro da janela: online', () => {
    const iso = new Date(NOW.getTime() - RADAR_ENRICHER_ONLINE_MS + 1000).toISOString();
    expect(isEnricherOnline(iso, NOW)).toBe(true);
  });

  it('exatamente no limite ou depois: offline', () => {
    const noLimite = new Date(NOW.getTime() - RADAR_ENRICHER_ONLINE_MS).toISOString();
    const depoisDoLimite = new Date(NOW.getTime() - RADAR_ENRICHER_ONLINE_MS - 1000).toISOString();
    expect(isEnricherOnline(noLimite, NOW)).toBe(false);
    expect(isEnricherOnline(depoisDoLimite, NOW)).toBe(false);
  });
});

describe('needsEnqueue — matriz de status', () => {
  it('sem linha nenhuma: precisa (nunca foi pedido)', () => {
    expect(needsEnqueue(undefined, NOW)).toBe(true);
  });

  it('pendente: nunca precisa (já está na fila)', () => {
    expect(needsEnqueue(makeRow({ status: 'pendente' }), NOW)).toBe(false);
  });

  it('processando: nunca precisa (robô já reservou — reenfileirar destruiria o claim)', () => {
    expect(needsEnqueue(makeRow({ status: 'processando' }), NOW)).toBe(false);
  });

  it('falhou, poucas tentativas, já esfriou: precisa', () => {
    const row = makeRow({
      status: 'falhou',
      attempts: RADAR_ENRICH_MAX_ATTEMPTS - 1,
      finishedAt: new Date(NOW.getTime() - RADAR_ENRICH_RETRY_COOLDOWN_MS - 1000),
    });
    expect(needsEnqueue(row, NOW)).toBe(true);
  });

  it('falhou, poucas tentativas, mas ainda recente (< 1h): não precisa ainda', () => {
    const row = makeRow({
      status: 'falhou',
      attempts: 1,
      finishedAt: new Date(NOW.getTime() - RADAR_ENRICH_RETRY_COOLDOWN_MS + 1000),
    });
    expect(needsEnqueue(row, NOW)).toBe(false);
  });

  it('falhou, estourou o teto de tentativas: não precisa mais (só enrichNow force furaria isso)', () => {
    const row = makeRow({
      status: 'falhou',
      attempts: RADAR_ENRICH_MAX_ATTEMPTS,
      finishedAt: new Date(NOW.getTime() - RADAR_ENRICH_RETRY_COOLDOWN_MS - 1000),
    });
    expect(needsEnqueue(row, NOW)).toBe(false);
  });

  it('falhou sem finishedAt cai para requestedAt como referência de tempo', () => {
    const row = makeRow({
      status: 'falhou',
      attempts: 0,
      finishedAt: null,
      requestedAt: new Date(NOW.getTime() - RADAR_ENRICH_RETRY_COOLDOWN_MS - 1000),
    });
    expect(needsEnqueue(row, NOW)).toBe(true);
  });

  it('pronto e ainda dentro do prazo: não precisa', () => {
    const row = makeRow({ status: 'pronto', expiresAt: new Date(NOW.getTime() + 1000) });
    expect(needsEnqueue(row, NOW)).toBe(false);
  });

  it('pronto e vencido: precisa', () => {
    const row = makeRow({ status: 'pronto', expiresAt: new Date(NOW.getTime() - 1000) });
    expect(needsEnqueue(row, NOW)).toBe(true);
  });

  it('pronto sem expiresAt (não devia acontecer, mas é defensivo): trata como vencido', () => {
    const row = makeRow({ status: 'pronto', expiresAt: null });
    expect(needsEnqueue(row, NOW)).toBe(true);
  });

  it('status desconhecido/corrompido: trata como se nunca tivesse rodado', () => {
    const row = makeRow({ status: 'lixo' as unknown as string });
    expect(needsEnqueue(row, NOW)).toBe(true);
  });
});

describe('buildTaskNotes — bloco "Dados da web"', () => {
  const base = {
    originLabel: 'Barracão - PR',
    bags: 400,
    cnpj: '12345678000199',
    razaoSocial: 'ATACADO EXEMPLO LTDA',
    endereco: 'Rua Exemplo, 100',
    sourceRelease: '2026-09',
    now: new Date('2026-09-25T15:00:00-03:00'),
  };

  it('sem enrichment (undefined/null): não aparece bloco nenhum', () => {
    expect(buildTaskNotes(base)).not.toContain('Dados da web');
    expect(buildTaskNotes({ ...base, enrichment: null })).not.toContain('Dados da web');
  });

  it('enrichment presente mas totalmente vazio: não aparece bloco (nada aproveitável)', () => {
    const notes = buildTaskNotes({
      ...base,
      enrichment: {
        website: null, maps: null, whatsapps: [], telefones: [], emails: [],
        instagram: null, facebook: null, fontes: [],
      },
    });
    expect(notes).not.toContain('Dados da web');
  });

  it('monta o bloco com site, maps, redes sociais, whatsapp formatado e e-mail, cada um com a fonte', () => {
    const notes = buildTaskNotes({
      ...base,
      enrichment: {
        website: 'https://exemplo.com.br',
        maps: {
          url: 'https://maps.google.com/?cid=123',
          nome: 'Atacado Exemplo',
          categoria: 'Loja de produtos agropecuários',
          nota: 4.5,
          avaliacoes: 12,
          situacao: 'Aberto',
          endereco: 'Rua Exemplo, 100',
        },
        whatsapps: [{ value: '49991234567', source: 'site', url: 'https://exemplo.com.br/contato' }],
        telefones: [],
        emails: [{ value: 'contato@exemplo.com.br', source: 'maps', url: null }],
        instagram: 'https://instagram.com/exemplo',
        facebook: 'https://facebook.com/exemplo',
        fontes: [],
      },
    });

    expect(notes).toContain('Dados da web:');
    expect(notes).toContain('Site: https://exemplo.com.br');
    expect(notes).toContain('Google Maps: https://maps.google.com/?cid=123 (Loja de produtos agropecuários — nota 4.5)');
    expect(notes).toContain('Instagram: https://instagram.com/exemplo');
    expect(notes).toContain('Facebook: https://facebook.com/exemplo');
    // Formata o WhatsApp cru (só dígitos) como (DDD) NNNNN-NNNN e cita a fonte.
    expect(notes).toContain('WhatsApp: (49) 99123-4567 (fonte: site da empresa)');
    expect(notes).toContain('E-mail: contato@exemplo.com.br (fonte: Google Maps)');
  });

  it('WhatsApp com valor que não bate 10/11 dígitos (lixo do robô) mantém o valor cru', () => {
    const notes = buildTaskNotes({
      ...base,
      enrichment: {
        website: null, maps: null, telefones: [], emails: [],
        whatsapps: [{ value: 'wa.me/551199999', source: 'busca', url: null }],
        instagram: null, facebook: null, fontes: [],
      },
    });
    expect(notes).toContain('WhatsApp: wa.me/551199999 (fonte: busca)');
  });

  it('convive com a mensagem sugerida (os dois blocos aparecem)', () => {
    const notes = buildTaskNotes({
      ...base,
      message: 'Olá, temos saldo de sal disponível.',
      enrichment: {
        website: 'https://exemplo.com.br', maps: null, whatsapps: [], telefones: [], emails: [],
        instagram: null, facebook: null, fontes: [],
      },
    });
    expect(notes).toContain('Mensagem sugerida:');
    expect(notes).toContain('Dados da web:');
    expect(notes.indexOf('Mensagem sugerida:')).toBeLessThan(notes.indexOf('Dados da web:'));
  });
});
