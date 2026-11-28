// Sales AI — limites que protegem a cota de IA e o banco: lote tRPC não fura o limiter do vendedor virtual
// nem o da oferta pública; tetos por conversa, por visitante e por dia são ATÔMICOS (contados antes da IA);
// exceções do agente uma por conversa e tipo; frete acima de 10 caixas vai para uma pessoa; canal fechado
// no painel revoga reservas.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { SALES_SETTINGS_DEFAULTS } from '../shared/sales';
import { isForbiddenBatch, isRateLimitedProcedure, RATE_LIMITED_PROCEDURES } from '../server/lib/trpcBatchGuard';
import {
  acoesSemRepeticao, chaveExcecaoAgente, hashVisitante, limiteVisitanteDia, MAX_MENSAGENS_VISITANTE_DIA,
} from '../server/lib/sales/agente/limites';
import { caixasParaEncaminhar, MAX_CAIXAS_COTACAO } from '../server/lib/sales/agente/ferramentas';

const raiz = join(__dirname, '..');
const ler = (f: string) => readFileSync(join(raiz, f), 'utf8');

// ── Mocks de IO para exercitar servico.conversar sem banco nem rede ────────────────────────────
const h = vi.hoisted(() => ({
  execute: vi.fn(),
  conversa: null as null | Record<string, unknown>,
  registrarExcecao: vi.fn(async () => ({ id: 1, nova: true })),
}));
vi.mock('../server/db/ordersDb', () => {
  const cadeia = () => {
    const c: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'set', 'values']) c[m] = () => c;
    c.limit = async () => (h.conversa ? [h.conversa] : []);
    c.then = (ok: (v: unknown[]) => unknown) => Promise.resolve([]).then(ok);
    return c;
  };
  return { ordersDb: { execute: h.execute, select: () => cadeia(), insert: () => cadeia(), update: () => cadeia() } };
});
vi.mock('../server/lib/sales/settings', () => ({
  getSalesSettings: async () => ({ ...SALES_SETTINGS_DEFAULTS, agente: { ...SALES_SETTINGS_DEFAULTS.agente, ativo: true } }),
}));
vi.mock('../server/lib/aiChain', () => ({
  cadeiaConfigurada: () => true, chamarComFerramentas: vi.fn(), chamarLLM: vi.fn(), executarNaCadeia: vi.fn(),
}));
vi.mock('../server/lib/sales/excecoes', () => ({ registrarExcecao: h.registrarExcecao }));
vi.mock('../server/lib/sales/agente/kb', () => ({ listarKbAprovada: async () => [] }));
vi.mock('../server/lib/sales/agente/frete', () => ({
  cotarFreteCaixas: vi.fn(), produtoCaixa: async () => ({ nome: 'Caixa', precoCentavos: 14990 }),
}));

const dialeto = new PgDialect();
const consulta = (chamada: number) => dialeto.sqlToQuery(h.execute.mock.calls[chamada][0] as SQL);

describe('lote tRPC não fura os limiters do Sales AI', () => {
  const procs = ['salesAgent.chat', 'salesPublic.oferta', 'salesPublic.simularRevenda'];
  it('as três procedures públicas estão na lista (o cliente as manda sozinhas)', () => {
    for (const p of procs) {
      expect(isRateLimitedProcedure(p)).toBe(true);
      expect(isRateLimitedProcedure(p.toUpperCase())).toBe(true);
    }
  });
  it('lote que contenha qualquer uma delas é recusado; sozinha passa', () => {
    expect(isForbiddenBatch('/salesAgent.chat,salesAgent.chat')).toBe(true);
    expect(isForbiddenBatch('/salesAgent.estado,salesAgent.chat')).toBe(true);
    expect(isForbiddenBatch('/salesPublic.oferta,auth.me')).toBe(true);
    expect(isForbiddenBatch('/auth.me,salespublic.simularrevenda')).toBe(true);
    expect(isForbiddenBatch('/salesAgent.chat')).toBe(false);
    expect(isForbiddenBatch('/salesAgent%2Echat')).toBe(true);
  });
  it('api/index.ts monta limiter no caminho EXATO de cada procedure da lista, e nunca por prefixo de namespace', () => {
    const fonte = ler('api/index.ts');
    for (const p of RATE_LIMITED_PROCEDURES) {
      expect(fonte, p).toMatch(new RegExp(`app\\.use\\('/api/trpc/${p.replace('.', '\\.')}', \\w*[Ll]imiter`));
    }
    expect(fonte).not.toMatch(/app\.use\('\/api\/trpc\/salesPublic',/);
    expect(fonte).toMatch(/app\.use\('\/api\/trpc\/salesPublic\.oferta', salesPublicLimiter\)/);
    expect(fonte).toMatch(/app\.use\('\/api\/trpc\/salesPublic\.simularRevenda', salesPublicLimiter\)/);
    expect(fonte).toMatch(/const salesPublicLimiter = rateLimit\(/);
  });
  it('o cliente decide o link sozinho pela mesma lista do servidor', () => {
    expect(ler('client/src/main.tsx')).toMatch(/condition: op => isRateLimitedProcedure\(op\.path\)/);
  });
});

describe('tetos do vendedor virtual (puro)', () => {
  it('teto diário por visitante nunca fica abaixo do teto por conversa', () => {
    expect(limiteVisitanteDia({ maxMensagensPorConversa: 10 })).toBe(MAX_MENSAGENS_VISITANTE_DIA);
    expect(limiteVisitanteDia({ maxMensagensPorConversa: 60 })).toBe(60);
  });
  it('chave de exceção estável por conversa e tipo', () => {
    expect(chaveExcecaoAgente('pedido_grande', 'c1')).toBe('agente:pedido_grande:c1');
    expect(chaveExcecaoAgente('pedido_grande', 'c1')).toBe(chaveExcecaoAgente('pedido_grande', 'c1'));
    expect(chaveExcecaoAgente('pediu_pessoa', 'c1')).not.toBe(chaveExcecaoAgente('pedido_grande', 'c1'));
    expect(chaveExcecaoAgente('pedido_grande', 'c2')).not.toBe(chaveExcecaoAgente('pedido_grande', 'c1'));
  });
  it('no mesmo turno, cada tipo de exceção e o opt-in entram uma vez só', () => {
    const a = acoesSemRepeticao([
      { tipo: 'excecao', kind: 'pediu_pessoa' }, { tipo: 'excecao', kind: 'pediu_pessoa' },
      { tipo: 'excecao', kind: 'pedido_grande' }, { tipo: 'opt_in' }, { tipo: 'opt_in' }, { tipo: 'excecao', kind: 'pedido_grande' },
    ]);
    expect(a).toEqual([{ tipo: 'excecao', kind: 'pediu_pessoa' }, { tipo: 'excecao', kind: 'pedido_grande' }, { tipo: 'opt_in' }]);
  });
});

describe('frete: acima de 10 caixas não é cotável', () => {
  it('o encaminhamento é o menor entre o painel e 11', () => {
    expect(MAX_CAIXAS_COTACAO).toBe(10);
    expect(caixasParaEncaminhar({ caixasParaEncaminhar: 20 })).toBe(11);
    expect(caixasParaEncaminhar({ caixasParaEncaminhar: 1000 })).toBe(11);
    expect(caixasParaEncaminhar({ caixasParaEncaminhar: 5 })).toBe(5);
  });
  it('cotarFreteCaixas recusa mais de 10 caixas antes de chamar o shipping (rede de segurança)', async () => {
    const real = await vi.importActual<typeof import('../server/lib/sales/agente/frete')>('../server/lib/sales/agente/frete');
    await expect(real.cotarFreteCaixas('59600000', 11)).rejects.toThrow(/fora do limite/);
    await expect(real.cotarFreteCaixas('59600000', 0)).rejects.toThrow(/fora do limite/);
  });
});

describe('servico.conversar: a mensagem é contada atomicamente ANTES da IA', () => {
  const META = { ip: '203.0.113.9', userAgent: 'UA' };
  const AGORA = new Date('2026-11-28T15:00:00Z');
  const ID = '6f1c2f0e-1d2b-4c3a-9f8e-7a6b5c4d3e2f';
  beforeEach(() => {
    process.env.JWT_SECRET = 'segredo-de-teste-jwt';
    h.execute.mockReset();
    h.conversa = null;
  });

  it('conversa existente sem cota (UPDATE condicional sem linha): formulário e a IA não é chamada', async () => {
    const { conversar } = await import('../server/lib/sales/agente/servico');
    h.conversa = { id: ID, visitorHash: hashVisitante(META.ip, META.userAgent, 'segredo-de-teste-jwt'), messageCount: 3, expiresAt: null, profile: null };
    h.execute.mockResolvedValue({ rows: [] });
    const completar = vi.fn();
    const r = await conversar({ conversationId: ID, mensagem: 'oi' }, META, AGORA, { completar });
    expect(r.modo).toBe('formulario');
    expect(r.conversationId).toBe(ID);
    expect(completar).not.toHaveBeenCalled();
    const q = consulta(0);
    expect(q.sql).toMatch(/UPDATE sales_agent_conversations SET message_count = message_count \+ 1/);
    expect(q.sql).toMatch(/message_count < \$\d+/);
    expect(q.sql).toMatch(/sum\(v\.message_count\)/);
    expect(q.sql).toMatch(/RETURNING message_count/);
    expect(q.params).toContain(SALES_SETTINGS_DEFAULTS.agente.maxMensagensPorConversa);
    expect(q.params).toContain(limiteVisitanteDia(SALES_SETTINGS_DEFAULTS.agente));
  });

  it('conversa nova sem cota do dia ou do visitante (INSERT ... SELECT ... WHERE sem linha): formulário sem IA', async () => {
    const { conversar } = await import('../server/lib/sales/agente/servico');
    h.execute.mockResolvedValue({ rows: [] });
    const completar = vi.fn();
    const r = await conversar({ mensagem: 'oi' }, META, AGORA, { completar });
    expect(r.modo).toBe('formulario');
    expect(completar).not.toHaveBeenCalled();
    const q = consulta(0);
    expect(q.sql).toMatch(/INSERT INTO sales_agent_conversations[\s\S]*SELECT[\s\S]*WHERE \(SELECT count\(\*\) FROM sales_agent_conversations WHERE started_at > /);
    expect(q.sql).toMatch(/RETURNING id/);
    expect(q.params).toContain(SALES_SETTINGS_DEFAULTS.agente.maxConversasPorDia);
    expect(q.params).toContain(limiteVisitanteDia(SALES_SETTINGS_DEFAULTS.agente));
    expect(q.params).toContain(AGORA.toISOString());
  });

  it('conversa cheia pela leitura nem chega a consultar o banco de novo', async () => {
    const { conversar } = await import('../server/lib/sales/agente/servico');
    h.conversa = { id: ID, visitorHash: hashVisitante(META.ip, META.userAgent, 'segredo-de-teste-jwt'), messageCount: 30, expiresAt: null, profile: null };
    const completar = vi.fn();
    const r = await conversar({ conversationId: ID, mensagem: 'oi' }, META, AGORA, { completar });
    expect(r.modo).toBe('formulario');
    expect(h.execute).not.toHaveBeenCalled();
    expect(completar).not.toHaveBeenCalled();
  });

  it('nenhum outro ponto do serviço incrementa o contador (sem contagem dupla depois da IA)', () => {
    const fonte = ler('server/lib/sales/agente/servico.ts');
    expect(fonte).not.toMatch(/messageCount\}\s*\+\s*1/);
    expect(fonte.match(/message_count \+ 1/g)).toHaveLength(1);
    // A cota é decidida antes de executarTurno (a chamada à IA).
    const i = fonte.indexOf('export async function conversar');
    const corpo = fonte.slice(i);
    expect(corpo.indexOf('contarMensagem(')).toBeLessThan(corpo.indexOf('executarTurno('));
    expect(corpo.indexOf('criarConversaComCota(')).toBeLessThan(corpo.indexOf('executarTurno('));
  });

  it('exceções do agente usam a chave por conversa e tipo; o lead de atacado abre uma tarefa por conversa', () => {
    const fonte = ler('server/lib/sales/agente/servico.ts');
    expect(fonte).not.toMatch(/idempotencyKey: `agente:/);
    expect(fonte).toMatch(/idempotencyKey: chaveExcecaoAgente\(ac\.kind, conversa\.id\)/);
    expect(fonte).toMatch(/idempotencyKey: chaveExcecaoAgente\('lead_atacado', conversa\.id\),\s*kind: 'lead_atacado', severity: 'normal'/);
    expect(fonte).toMatch(/for \(const ac of acoesSemRepeticao\(acoes\)\)/);
  });
});

describe('painel: canal fechado revoga reservas', () => {
  it('settingsSalvar chama revogarReservas DEPOIS de gravar, só para canal desligado ou política desaprovada', () => {
    const fonte = ler('server/routers/sales.ts');
    expect(fonte).toMatch(/import \* as acoes from '\.\.\/lib\/sales\/acoes'/);
    const i = fonte.indexOf('settingsSalvar:');
    const corpo = fonte.slice(i, fonte.indexOf('definirModo:', i));
    expect(corpo.indexOf('setSalesSetting(')).toBeGreaterThan(-1);
    expect(corpo.indexOf('acoes.revogarReservas(')).toBeGreaterThan(corpo.indexOf('setSalesSetting('));
    expect(corpo).toMatch(/key === 'canal' && canalFechado\(/);
    expect(fonte).toMatch(/c\.ativo === false \|\| c\.politicaAprovada === false/);
    expect(fonte).not.toMatch(/\bas any\b/);
  });
});
