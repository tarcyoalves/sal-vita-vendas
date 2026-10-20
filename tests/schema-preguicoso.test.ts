/**
 * Migração de schema preguiçosa: nenhuma requisição que não precise de banco pode acordar o Neon.
 *
 * Cobre (a) a decisão pura de quais schemas uma requisição precisa, (b) a memoização com
 * nova tentativa e backoff, e (c) testes de código-fonte: api/index.ts não migra no topo do
 * módulo e toda rota Express tem regra em schemasNecessarios.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  schemasNecessarios, rotaMapeada, procedimentosTrpc, NENHUM, SO_CRM, SO_LOJA, AMBOS,
} from '../server/lib/schemasNecessarios';
import { criarSchemaPreguicoso } from '../server/lib/schemaPreguicoso';

// Fortaleza = UTC-3, sem horário de verão. Janela padrão: 08:00-11:00 e 14:00-17:00.
const FORA = new Date('2026-10-20T03:20:00Z');   // 00:20 em Fortaleza (o caso dos logs de produção)
const DENTRO = new Date('2026-10-20T12:00:00Z'); // 09:00
const ALMOCO = new Date('2026-10-20T14:30:00Z'); // 11:30 — fora
const TARDE = new Date('2026-10-20T18:00:00Z');  // 15:00 — dentro

const req = (metodo: string, caminho: string, extra: Partial<Parameters<typeof schemasNecessarios>[0]> = {}) =>
  schemasNecessarios({ metodo, caminho, agora: DENTRO, janelaConfig: null, ...extra });

describe('schemasNecessarios — robô SMBI', () => {
  it('GET /api/smbi/pedidos fora da janela: nenhum banco', () => {
    expect(req('GET', '/api/smbi/pedidos', { agora: FORA, query: {} })).toEqual(NENHUM);
    expect(req('GET', '/api/smbi/pedidos', { agora: ALMOCO, query: {} })).toEqual(NENHUM);
  });
  it('GET /api/smbi/pedidos dentro da janela: CRM', () => {
    expect(req('GET', '/api/smbi/pedidos', { agora: DENTRO, query: {} })).toEqual(SO_CRM);
    expect(req('GET', '/api/smbi/pedidos', { agora: TARDE, query: {} })).toEqual(SO_CRM);
  });
  it('?id= e ?simular=1 passam sempre (CRM), mesmo fora da janela', () => {
    expect(req('GET', '/api/smbi/pedidos', { agora: FORA, query: { id: 'abc' } })).toEqual(SO_CRM);
    expect(req('GET', '/api/smbi/pedidos', { agora: FORA, query: { simular: '1' } })).toEqual(SO_CRM);
    // ?id= vazio não conta (igual ao handler)
    expect(req('GET', '/api/smbi/pedidos', { agora: FORA, query: { id: '' } })).toEqual(NENHUM);
  });
  it('janela "sempre" desliga o portão', () => {
    expect(req('GET', '/api/smbi/pedidos', { agora: FORA, janelaConfig: 'sempre', query: {} })).toEqual(SO_CRM);
  });
  it('POST /api/smbi/heartbeat fora da janela: nenhum banco; dentro: CRM', () => {
    expect(req('POST', '/api/smbi/heartbeat', { agora: FORA })).toEqual(NENHUM);
    expect(req('POST', '/api/smbi/heartbeat', { agora: DENTRO })).toEqual(SO_CRM);
  });
  it('retorno, iniciar, status, faturamento, cadastros/:id: sempre CRM, mesmo fora da janela', () => {
    for (const [m, c] of [
      ['POST', '/api/smbi/pedidos/123/retorno'],
      ['POST', '/api/smbi/pedidos/123/iniciar'],
      ['POST', '/api/smbi/pedidos/123/status'],
      ['POST', '/api/smbi/pedidos/123/faturamento'],
      ['POST', '/api/smbi/vinculos/9/resultado'],
      ['GET', '/api/smbi/cadastros/9'],
      ['POST', '/api/smbi/cadastros/9/resultado'],
    ]) {
      expect(req(m, c, { agora: FORA })).toEqual(SO_CRM);
    }
  });
  it('GET ligados e vinculos: fora da janela nenhum banco; dentro, CRM; "sempre" desliga o portão', () => {
    for (const c of ['/api/smbi/ligados', '/api/smbi/vinculos']) {
      expect(req('GET', c, { agora: FORA })).toEqual(NENHUM);
      expect(req('GET', c, { agora: ALMOCO })).toEqual(NENHUM);
      expect(req('GET', c, { agora: DENTRO })).toEqual(SO_CRM);
      expect(req('GET', c, { agora: TARDE })).toEqual(SO_CRM);
      expect(req('GET', c, { agora: FORA, janelaConfig: 'sempre' })).toEqual(SO_CRM);
    }
  });
  it('GET cadastros: fora da janela nenhum banco, exceto ?simular=1', () => {
    expect(req('GET', '/api/smbi/cadastros', { agora: FORA, query: {} })).toEqual(NENHUM);
    expect(req('GET', '/api/smbi/cadastros', { agora: FORA, query: { simular: '1' } })).toEqual(SO_CRM);
    expect(req('GET', '/api/smbi/cadastros', { agora: DENTRO, query: {} })).toEqual(SO_CRM);
  });
});

describe('schemasNecessarios — tRPC', () => {
  it('premiumAuth.login não usa banco nenhum', () => {
    expect(req('POST', '/api/trpc/premiumAuth.login')).toEqual(NENHUM);
    expect(req('GET', '/api/trpc/premiumAuth.me')).toEqual(NENHUM);
  });
  it('procedure do CRM espera só o CRM (inclui o 1º login)', () => {
    expect(req('POST', '/api/trpc/auth.login')).toEqual(SO_CRM);
    expect(req('GET', '/api/trpc/faturamento.getAll')).toEqual(SO_CRM);
  });
  it('procedure da loja espera só a loja', () => {
    for (const p of ['shipping.calculate', 'recovery.trackCart', 'b2b.list', 'premiumEmailMarketing.stats']) {
      expect(req('POST', `/api/trpc/${p}`)).toEqual(SO_LOJA);
    }
  });
  it('loja com cookie de sessão do CRM também espera o CRM (createContext consulta users)', () => {
    expect(req('GET', '/api/trpc/shipping.listOrders', { sessaoCrm: true })).toEqual(AMBOS);
    expect(req('POST', '/api/trpc/premiumAuth.login', { sessaoCrm: true })).toEqual(NENHUM);
  });
  it('lote misto = união', () => {
    expect(req('GET', '/api/trpc/premiumAuth.me,shipping.calculate')).toEqual(SO_LOJA);
    expect(req('GET', '/api/trpc/premiumAuth.me,auth.me')).toEqual(SO_CRM);
    expect(req('GET', '/api/trpc/shipping.calculate,auth.me,premiumAuth.me')).toEqual(AMBOS);
    expect(req('GET', '/api/trpc/premiumAuth.me,premiumAuth.login')).toEqual(NENHUM);
  });
  it('ignora a query string e o caso das letras', () => {
    expect(req('GET', '/api/trpc/PremiumAuth.Me?batch=1&input=%7B%7D')).toEqual(NENHUM);
    expect(procedimentosTrpc('/api/trpc/a.b,C.d')).toEqual(['a.b', 'c.d']);
  });
});

describe('schemasNecessarios — rotas da loja, crons e saúde', () => {
  it('webhooks e rotas da loja', () => {
    expect(req('POST', '/api/mp-webhook')).toEqual(SO_LOJA);
    expect(req('POST', '/api/me-webhook')).toEqual(SO_LOJA);
    expect(req('POST', '/api/b2b/inbound')).toEqual(SO_LOJA);
  });
  it('webhook do CRM (Brevo)', () => {
    expect(req('POST', '/api/brevo-webhook')).toEqual(SO_CRM);
  });
  it('crons', () => {
    expect(req('GET', '/api/cron/email-daily')).toEqual(SO_CRM);
    expect(req('GET', '/api/cron/abandoned-cart')).toEqual(AMBOS);
    expect(req('POST', '/api/cron/abandoned-cart')).toEqual(AMBOS);
  });
  it('descadastro consulta os dois bancos', () => {
    expect(req('GET', '/api/unsubscribe')).toEqual(AMBOS);
  });
  it('/api/health, db-health, db-stats e orders-health não migram', () => {
    for (const c of ['/api/health', '/api/db-health', '/api/db-stats', '/api/orders-health']) {
      expect(req('GET', c, { agora: FORA })).toEqual(NENHUM);
    }
  });
  it('rota desconhecida: nenhum banco', () => {
    expect(req('GET', '/api/qualquer-coisa')).toEqual(NENHUM);
  });
});

describe('criarSchemaPreguicoso', () => {
  it('não executa nada até alguém pedir', () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    criarSchemaPreguicoso({ nome: 't', executar, timeoutMs: 1000 });
    expect(executar).not.toHaveBeenCalled();
  });

  it('memoiza: chamadas simultâneas e posteriores executam uma única vez', async () => {
    const executar = vi.fn().mockResolvedValue(undefined);
    const s = criarSchemaPreguicoso({ nome: 't', executar, timeoutMs: 1000 });
    await Promise.all([s.garantir(), s.garantir(), s.garantir()]);
    await s.garantir();
    expect(executar).toHaveBeenCalledTimes(1);
    expect(s.estado().ok).toBe(true);
  });

  it('falha não é memoizada: tenta de novo depois do backoff, e não antes', async () => {
    let agora = 1_000_000;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const executar = vi.fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValue(undefined);
    const s = criarSchemaPreguicoso({ nome: 't', executar, timeoutMs: 1000, backoffMs: [5000], agora: () => agora });

    await expect(s.garantir()).resolves.toBeUndefined(); // nunca rejeita
    expect(executar).toHaveBeenCalledTimes(1);
    expect(s.estado()).toMatchObject({ ok: false, falhas: 1 });

    agora += 1000; // ainda em backoff: não martela
    await s.garantir();
    expect(executar).toHaveBeenCalledTimes(1);

    agora += 5000; // passou o backoff: nova tentativa
    await s.garantir();
    expect(executar).toHaveBeenCalledTimes(2);
    expect(s.estado()).toMatchObject({ ok: true, falhas: 0 });
  });

  it('o backoff cresce e repete o último valor', async () => {
    let agora = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const executar = vi.fn().mockRejectedValue(new Error('x'));
    const s = criarSchemaPreguicoso({ nome: 't', executar, timeoutMs: 1000, backoffMs: [100, 1000], agora: () => agora });
    await s.garantir();            // falha 1 → espera 100
    agora += 100; await s.garantir(); // falha 2 → espera 1000
    agora += 500; await s.garantir(); // ainda em backoff
    expect(executar).toHaveBeenCalledTimes(2);
    agora += 500; await s.garantir(); // falha 3 → espera 1000 (repete)
    expect(executar).toHaveBeenCalledTimes(3);
  });

  it('executar que lança de forma síncrona também vira nova tentativa, sem rejeitar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = criarSchemaPreguicoso({ nome: 't', executar: () => { throw new Error('boom'); }, timeoutMs: 1000 });
    await expect(s.garantir()).resolves.toBeUndefined();
    expect(s.estado().falhas).toBe(1);
  });

  it('estourou o tempo: a requisição segue e as próximas não esperam de novo', async () => {
    vi.useFakeTimers();
    try {
      let terminar!: () => void;
      const executar = vi.fn(() => new Promise<void>(r => { terminar = r; }));
      const s = criarSchemaPreguicoso({ nome: 't', executar, timeoutMs: 1000 });
      const primeira = s.garantir();
      await vi.advanceTimersByTimeAsync(1000);
      await primeira; // liberada pelo limite
      await s.garantir(); // segunda: não espera, não reexecuta
      expect(executar).toHaveBeenCalledTimes(1);
      expect(s.estado().emAndamento).toBe(true);
      terminar();
      await vi.advanceTimersByTimeAsync(0);
      expect(s.estado()).toMatchObject({ ok: true, emAndamento: false });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('api/index.ts — código-fonte', () => {
  const raiz = join(__dirname, '..');
  const fonte = readFileSync(join(raiz, 'api/index.ts'), 'utf8');

  it('NÃO migra no carregamento do módulo (nenhuma chamada ensure*TablesExist() na coluna 0)', () => {
    const linhas = fonte.split('\n');
    const noTopo = linhas.filter(l => /^\S.*\bensure(Orders|B2b)?TablesExist\s*\(/.test(l) && !l.startsWith('import') && !l.trimStart().startsWith('//'));
    expect(noTopo).toEqual([]);
    expect(fonte).not.toMatch(/\bdbReady\b\s*=/);
    expect(fonte).not.toMatch(/migrationSettled/);
    // Cada migração só existe dentro do executar() da fábrica preguiçosa (ou na rota de diagnóstico).
    expect(fonte).toMatch(/criarSchemaPreguicoso\(\{\s*nome: 'ensureTablesExist'/);
    expect(fonte).toMatch(/criarSchemaPreguicoso\(\{\s*nome: 'ensureOrdersTablesExist'/);
  });

  it('a rota de diagnóstico continua forçando ensureOrdersTablesExist(true)', () => {
    expect(fonte).toContain('await ensureOrdersTablesExist(true)');
  });

  it('o middleware do tRPC usa a decisão por requisição, não um dbReady global', () => {
    const trecho = fonte.slice(fonte.indexOf("app.use('/api/trpc', (req, _res, next) => {\n  aguardarSchemasDaRequisicao"));
    expect(trecho.startsWith("app.use('/api/trpc', (req, _res, next)")).toBe(true);
  });

  it('o portão do SMBI exige Bearer válido antes de aguardar qualquer schema', () => {
    const i = fonte.indexOf("app.use('/api/smbi'");
    expect(i).toBeGreaterThan(0);
    const trecho = fonte.slice(i, i + 400);
    expect(trecho.indexOf('isAuthorized')).toBeGreaterThan(-1);
    expect(trecho.indexOf('isAuthorized')).toBeLessThan(trecho.indexOf('aguardarSchemasDaRequisicao'));
  });

  it('toda rota Express (api/index.ts e register*Routes) tem regra em schemasNecessarios', () => {
    const arquivos = ['api/index.ts', 'server/smbiRoutes.ts', 'server/smbiCadastroRoutes.ts'];
    const faltando: string[] = [];
    let achadas = 0;
    for (const a of arquivos) {
      const src = readFileSync(join(raiz, a), 'utf8');
      for (const m of src.matchAll(/\bapp\.(get|post|all)\(\s*'(\/api\/[^']*)'/g)) {
        const metodo = m[1] === 'all' ? 'GET' : m[1].toUpperCase();
        const caminho = m[2].replace(/:[A-Za-z]+/g, '1');
        achadas++;
        if (!rotaMapeada(caminho, metodo)) faltando.push(`${metodo} ${m[2]}`);
      }
    }
    expect(achadas).toBeGreaterThan(20);
    expect(faltando).toEqual([]);
  });
});
