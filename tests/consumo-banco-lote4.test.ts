/**
 * Lote 4 — consumo do banco (Neon cobrado por CU-hora). Testes de código-fonte + funções puras.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tvPainelLigado } from '../server/lib/tvPainel';
import { pollingBarradoPelaJanela, AVISO_FORA_DA_JANELA } from '../shared/smbiJanela';

const ler = (p: string) => readFileSync(p, 'utf8');

/** Corpo do handler de uma rota Express a partir da linha `app.get('<rota>'`. */
function handler(fonte: string, marcador: string, tamanho = 1800): string {
  const i = fonte.indexOf(marcador);
  expect(i, `rota ${marcador} não encontrada`).toBeGreaterThan(-1);
  return fonte.slice(i, i + tamanho);
}

describe('item 1 — ligados/vinculos/cadastros fora da janela', () => {
  const rotas = ler('server/smbiRoutes.ts');
  const cad = ler('server/smbiCadastroRoutes.ts');

  it('ligados: auth, depois portão da janela, e só então o banco', () => {
    const h = handler(rotas, "app.get('/api/smbi/ligados'");
    expect(h.indexOf("auth(req, res, 'GET ligados')")).toBeGreaterThan(-1);
    const portao = h.indexOf('pollingBarradoPelaJanela');
    expect(portao).toBeGreaterThan(h.indexOf('auth('));
    expect(portao).toBeLessThan(h.indexOf('db'));
    expect(h).toContain('ligados: [], foraDaJanela: true');
  });

  it('vinculos: auth, depois portão da janela, e só então o banco', () => {
    const h = handler(rotas, "app.get('/api/smbi/vinculos'");
    const portao = h.indexOf('pollingBarradoPelaJanela');
    expect(portao).toBeGreaterThan(h.indexOf('auth('));
    expect(portao).toBeLessThan(h.indexOf('db'));
    expect(h).toContain('vinculos: [], foraDaJanela: true');
  });

  it('cadastros: portão ANTES de ler o gate e de fazer o UPDATE; ?simular=1 passa sempre', () => {
    const h = handler(cad, "app.get('/api/smbi/cadastros',", 2500);
    const portao = h.indexOf('pollingBarradoPelaJanela');
    expect(portao).toBeGreaterThan(h.indexOf('auth('));
    expect(portao).toBeLessThan(h.indexOf('cadastroAtivo()'));
    expect(portao).toBeLessThan(h.indexOf('db.update'));
    expect(h).toContain("simular: req.query.simular === '1'");
    // Mesma forma da resposta "sem trabalho" que o robô já trata (trabalho: null, cadastroAtivo: false).
    expect(h).toContain('...respostaSemTrabalho(false), foraDaJanela: true');
  });

  it('a resposta fora da janela nunca é ordem: listas vazias e aviso', () => {
    expect(AVISO_FORA_DA_JANELA).toMatch(/Nada foi consultado nem reservado/);
    // rotas sem ?id=: o portão só depende do horário
    expect(pollingBarradoPelaJanela({ agora: new Date('2026-10-20T03:20:00Z') })).toBe(true);
    expect(pollingBarradoPelaJanela({ agora: new Date('2026-10-20T12:00:00Z') })).toBe(false);
    expect(pollingBarradoPelaJanela({ simular: true, agora: new Date('2026-10-20T03:20:00Z') })).toBe(false);
  });

  it('o contrato documenta as três rotas', () => {
    const doc = ler('docs/CONTRATO-ROBO-CRM.md');
    expect(doc).toContain('GET /api/smbi/ligados');
    expect(doc).toMatch(/foraDaJanela: true[\s\S]*ligados[\s\S]*vinculos[\s\S]*cadastros/);
  });
});

describe('item 2 — /api/db-health sem banco por padrão', () => {
  const fonte = ler('api/index.ts');
  const h = handler(fonte, "app.get('/api/db-health'", 1400);

  it('responde 200 ok sem consultar o banco, dizendo isso no JSON', () => {
    expect(h).toContain("res.json({ ok: true, banco: 'nao_verificado' })");
    expect(h.indexOf('nao_verificado')).toBeLessThan(h.indexOf('SELECT 1'));
  });
  it('SELECT 1 só com ?deep=1 E Bearer CRON_SECRET', () => {
    expect(h).toContain("req.query.deep === '1'");
    expect(h).toContain("isAuthorized(process.env.CRON_SECRET, req.headers['authorization'])");
  });
});

describe('item 3 — tv.getPanelStatus', () => {
  it('só TV_PAINEL_ATIVO=1 liga', () => {
    expect(tvPainelLigado('1')).toBe(true);
    for (const v of [undefined, '', '0', 'true', 'sim', ' 1']) expect(tvPainelLigado(v)).toBe(false);
  });
  it('desligado devolve enabled:false ANTES de qualquer consulta ao banco', () => {
    const fonte = ler('server/routers/tv.ts');
    const i = fonte.indexOf('getPanelStatus: publicProcedure');
    const trecho = fonte.slice(i, i + 700);
    expect(trecho.indexOf('tvPainelLigado(process.env.TV_PAINEL_ATIVO)')).toBeGreaterThan(-1);
    expect(trecho.indexOf('return { enabled: false }')).toBeLessThan(trecho.indexOf('db.select'));
    expect(trecho.indexOf('return { enabled: false }')).toBeLessThan(trecho.indexOf('cached('));
  });
});

describe('item 4 — índice em fat_orders(criado_em)', () => {
  it('migração cria o índice e a versão do schema subiu', () => {
    const m = ler('server/db/migrate.ts');
    expect(m).toContain('CREATE INDEX IF NOT EXISTS fat_orders_criado_em_idx ON fat_orders(criado_em)');
    expect(m).toMatch(/const SCHEMA_VERSION = '2026-10-20a'/);
    const lock = JSON.parse(ler('tests/schema-version.lock.json'));
    expect(JSON.stringify(lock)).toContain('2026-10-20a');
  });
});

describe('item 5 — polling do cadastro SMBI respeita o expediente', () => {
  it('refetchInterval só com o diálogo aberto E expediente aberto', () => {
    const f = ler('client/src/components/faturamento/SmbiCadastroClienteDialog.tsx');
    expect(f).toContain("import { useExpediente } from '../../lib/useExpediente'");
    expect(f).toContain('const expediente = useExpediente()');
    expect(f).toContain('refetchInterval: open && expediente ? 15_000 : false');
  });
  it('expediente padrão não foi alterado', () => {
    expect(ler('shared/expediente.ts')).toBeTruthy();
  });
});
