import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validarDocumento } from '../server/lib/credito/documento';
import { decidirBloqueioCredito } from '../server/lib/credito/bloqueioSmbi';
import { decidirCache, limiteAtingido, consultaEmAndamentoViva, limiteMensalValido, TRAVA_CONSULTA_MS } from '../server/lib/credito/politica';
import { montarFiltrosListagem } from '../server/lib/credito/listagem';

describe('validação de documento', () => {
  it('aceita CNPJ e CPF válidos (com ou sem máscara) e normaliza para dígitos', () => {
    expect(validarDocumento('11.222.333/0001-81')).toEqual({ ok: true, documento: '11222333000181', tipo: 'CNPJ' });
    expect(validarDocumento('529.982.247-25')).toEqual({ ok: true, documento: '52998224725', tipo: 'CPF' });
  });
  it('recusa dígito verificador errado, repetidos e tamanho errado', () => {
    expect(validarDocumento('11222333000182').ok).toBe(false);
    expect(validarDocumento('52998224726').ok).toBe(false);
    expect(validarDocumento('11111111111').ok).toBe(false);
    expect(validarDocumento('123').ok).toBe(false);
    expect(validarDocumento('').ok).toBe(false);
  });
  it('tipo informado precisa bater com o documento', () => {
    expect(validarDocumento('11222333000181', 'CPF').ok).toBe(false);
    expect(validarDocumento('11222333000181', 'CNPJ').ok).toBe(true);
  });
});

describe('decidirBloqueioCredito', () => {
  const agora = new Date('2026-10-15T12:00:00Z');
  const reprovado = { veredito: 'REPROVADO_A_PRAZO', consultadoEm: '2026-10-01T12:00:00Z' };
  const base = { bloqueioAtivo: true, prazoSal: '30/60/90 dias', prazoFrete: 'À vista', ultimoRelatorio: reprovado, liberadoEm: null };
  const d = (over: Partial<typeof base>) => decidirBloqueioCredito({ ...base, ...over }, agora);

  it('bloqueia: interruptor ligado + prazo do sal a prazo + reprovado vigente + sem liberação', () => {
    const r = d({});
    expect(r.bloquear).toBe(true);
    expect(r.motivo).toContain('Crédito reprovado a prazo');
  });
  it('interruptor desligado nunca bloqueia', () => { expect(d({ bloqueioAtivo: false })).toEqual({ bloquear: false }); });
  it('sal à vista não bloqueia, mesmo com frete a prazo', () => {
    expect(d({ prazoSal: 'À vista', prazoFrete: '30 dias' }).bloquear).toBe(false);
    expect(d({ prazoSal: 'a vista' }).bloquear).toBe(false);
  });
  it('frete à vista com sal a prazo continua bloqueando', () => { expect(d({ prazoFrete: 'à vista' }).bloquear).toBe(true); });
  it('sem relatório: avisa e não bloqueia', () => {
    const r = d({ ultimoRelatorio: null });
    expect(r.bloquear).toBe(false);
    expect(r.aviso).toBeTruthy();
  });
  it('relatório vencido (>30 dias): avisa e não bloqueia', () => {
    const r = d({ ultimoRelatorio: { veredito: 'REPROVADO_A_PRAZO', consultadoEm: '2026-08-01T12:00:00Z' } });
    expect(r.bloquear).toBe(false);
    expect(r.aviso).toBeTruthy();
  });
  it('aprovado ou com restrição não bloqueia', () => {
    expect(d({ ultimoRelatorio: { veredito: 'APROVADO', consultadoEm: '2026-10-10T00:00:00Z' } }).bloquear).toBe(false);
    expect(d({ ultimoRelatorio: { veredito: 'COM_RESTRICAO', consultadoEm: '2026-10-10T00:00:00Z' } }).bloquear).toBe(false);
  });
  it('liberação manual do pedido destrava', () => {
    const r = d({ liberadoEm: '2026-10-14T10:00:00Z' });
    expect(r.bloquear).toBe(false);
    expect(r.aviso).toBeTruthy();
  });
  it('prazo ilegível (texto livre) é tratado como a prazo', () => { expect(d({ prazoSal: '30 dias após emissão da NF' }).bloquear).toBe(true); });
});

describe('cache, teto e trava (funções puras)', () => {
  const agora = new Date('2026-10-15T12:00:00Z');
  const recente = { consultadoEm: '2026-10-01T12:00:00Z', provedor: 'boavista_apifull' };
  it('reaproveita relatório válido do mesmo provedor', () => {
    expect(decidirCache(recente, { provedorAtual: 'boavista_apifull', agora })).toBe('REAPROVEITAR');
  });
  it('consulta de novo: forçada, vencida, inexistente ou de outro provedor', () => {
    expect(decidirCache(recente, { provedorAtual: 'boavista_apifull', forcarNova: true, agora })).toBe('CONSULTAR');
    expect(decidirCache({ ...recente, consultadoEm: '2026-08-01T00:00:00Z' }, { provedorAtual: 'boavista_apifull', agora })).toBe('CONSULTAR');
    expect(decidirCache(null, { provedorAtual: 'boavista_apifull', agora })).toBe('CONSULTAR');
    expect(decidirCache({ ...recente, provedor: 'simulado' }, { provedorAtual: 'boavista_apifull', agora })).toBe('CONSULTAR');
  });
  it('teto mensal', () => {
    expect(limiteAtingido(49, 50)).toBe(false);
    expect(limiteAtingido(50, 50)).toBe(true);
    expect(limiteAtingido(0, 0)).toBe(true);
    expect(limiteMensalValido(50)).toBe(true);
    expect(limiteMensalValido(-1)).toBe(false);
    expect(limiteMensalValido(1.5)).toBe(false);
  });
  it('trava de 2 minutos', () => {
    expect(TRAVA_CONSULTA_MS).toBe(120_000);
    expect(consultaEmAndamentoViva(new Date(agora.getTime() - 60_000), agora)).toBe(true);
    expect(consultaEmAndamentoViva(new Date(agora.getTime() - 121_000), agora)).toBe(false);
  });
});

describe('filtros da listagem de análises', () => {
  const base = { pagina: 1, porPagina: 20 };
  it('busca de texto vira termos sem acento e minúsculos', () => {
    const f = montarFiltrosListagem({ ...base, busca: '  Laticínios  MOSSORÓ ' });
    expect(f.termosTexto).toEqual(['laticinios', 'mossoro']);
    expect(f.digitosBusca).toBeNull();
  });
  it('busca numérica (com máscara) procura no documento', () => {
    const f = montarFiltrosListagem({ ...base, busca: '11.222.333' });
    expect(f.digitosBusca).toBe('11222333');
    expect(f.termosTexto).toEqual([]);
  });
  it('filtros auxiliares e paginação limitada', () => {
    const f = montarFiltrosListagem({ ...base, documento: '11.222.333/0001-81', uf: 'rn', municipio: 'Mossoró', veredito: 'APROVADO', pagina: 3, porPagina: 500 });
    expect(f).toMatchObject({ documento: '11222333000181', uf: 'RN', municipioFold: 'mossoro', veredito: 'APROVADO', limite: 50, offset: 100 });
  });
  it('entrada vazia não filtra nada', () => {
    const f = montarFiltrosListagem(base);
    expect(f).toMatchObject({ termosTexto: [], digitosBusca: null, documento: null, uf: null, municipioFold: null, veredito: null, de: null, ate: null, limite: 20, offset: 0 });
  });
});

describe('contrato do banco e do router', () => {
  const repo = readFileSync('server/lib/credito/repo.ts', 'utf8');
  const migrate = readFileSync('server/db/migrate.ts', 'utf8');
  const router = readFileSync('server/routers/credito.ts', 'utf8');
  it('vínculo é idempotente: INSERT ... WHERE NOT EXISTS, sem índice único', () => {
    expect(repo).toMatch(/INSERT INTO credit_report_links[\s\S]*WHERE NOT EXISTS/);
    expect(migrate).not.toMatch(/UNIQUE INDEX[^\n]*credit_/i);
  });
  it('a trava contra clique duplo é um INSERT condicional atômico', () => {
    expect(router).toMatch(/INSERT INTO credit_queries[\s\S]*WHERE NOT EXISTS[\s\S]*RETURNING id/);
    expect(router).toContain('Consulta já em andamento');
  });
  it('consultar e ações pagas são adminProcedure estrito; listar é staff', () => {
    expect(router).toMatch(/consultar: adminProcedure/);
    expect(router).toMatch(/listar: staffProcedure/);
    expect(router).toMatch(/liberarPedido: adminProcedure/);
    expect(router).toMatch(/saldo: adminProcedure/);
  });
  it('nenhuma resposta do router inclui o payload bruto', () => {
    const retornos = router.split('\n').filter((l) => /return|=>\s*\(\{|entrega/.test(l)).join('\n');
    expect(retornos).not.toMatch(/payloadBruto/);
  });
  it('colunas e tabelas de crédito têm migração', () => {
    for (const t of ['credit_reports', 'credit_queries', 'credit_settings', 'credit_report_links']) expect(migrate).toContain(`CREATE TABLE IF NOT EXISTS ${t}`);
    for (const c of ['credito_liberado_por', 'credito_liberado_em', 'credito_liberado_motivo']) expect(migrate).toContain(`ADD COLUMN IF NOT EXISTS ${c}`);
  });
});
