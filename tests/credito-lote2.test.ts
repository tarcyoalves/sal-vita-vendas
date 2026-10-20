import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { escolherEfetivo } from '../server/lib/credito/produtos';
import { redePodeTerCobrado } from '../server/lib/credito/provedores/boavistaApifull';
import { JANELA_COBRANCA_INCERTA_MS, bloqueioPorCobrancaIncerta } from '../server/lib/credito/cobrancaIncerta';

const AGORA = new Date('2026-10-20T12:00:00Z');
const L = (produto: string, veredito: string, consultadoEm: string) => ({ produto, veredito, consultadoEm, provedor: 'boavista_apifull' });

describe('escolherEfetivo — mais recente por produto, depois o pior entre produtos', () => {
  it('relatório novo APROVADO do mesmo produto substitui o antigo REPROVADO', () => {
    const e = escolherEfetivo([
      L('boavista', 'APROVADO', '2026-10-18T00:00:00Z'),
      L('boavista', 'REPROVADO_A_PRAZO', '2026-10-05T00:00:00Z'), // mais antigo do mesmo produto: não conta
    ], AGORA);
    expect(e).toMatchObject({ veredito: 'APROVADO', valido: true });
    expect(e?.principal.consultadoEm).toBe('2026-10-18T00:00:00Z');
  });
  it('entre produtos distintos continua valendo o pior', () => {
    const e = escolherEfetivo([
      L('boavista', 'APROVADO', '2026-10-18T00:00:00Z'),
      L('serasa_premium', 'COM_RESTRICAO', '2026-10-10T00:00:00Z'),
      L('boavista', 'REPROVADO_A_PRAZO', '2026-10-01T00:00:00Z'),
    ], AGORA);
    expect(e).toMatchObject({ veredito: 'COM_RESTRICAO', valido: true });
    expect(e?.principal.produto).toBe('serasa_premium');
  });
  it('vencidos continuam fora; sem válidos devolve o mais recente como vencido', () => {
    expect(escolherEfetivo([L('boavista', 'APROVADO', '2026-08-01T00:00:00Z')], AGORA)).toMatchObject({ valido: false, veredito: 'APROVADO' });
    expect(escolherEfetivo([], AGORA)).toBeNull();
  });
});

describe('redePodeTerCobrado — queda depois do envio marca cobrança incerta', () => {
  const erro = (msg: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(msg), extra);
  it('tempo esgotado e quedas no meio da conexão são incertos', () => {
    expect(redePodeTerCobrado(Object.assign(new Error('aborted'), { name: 'AbortError' }))).toBe(true);
    expect(redePodeTerCobrado(erro('read ECONNRESET', { code: 'ECONNRESET' }))).toBe(true);
    expect(redePodeTerCobrado(erro('socket hang up'))).toBe(true);
    expect(redePodeTerCobrado(erro('fetch failed'))).toBe(true);
    expect(redePodeTerCobrado(erro('fetch failed', { cause: erro('other side closed', { code: 'UND_ERR_SOCKET' }) }))).toBe(true);
    expect(redePodeTerCobrado('estranho')).toBe(true);
  });
  it('DNS e conexão recusada provam que nada foi enviado', () => {
    expect(redePodeTerCobrado(erro('fetch failed', { cause: erro('getaddrinfo ENOTFOUND api', { code: 'ENOTFOUND' }) }))).toBe(false);
    expect(redePodeTerCobrado(erro('fetch failed', { cause: erro('connect ECONNREFUSED', { code: 'ECONNREFUSED' }) }))).toBe(false);
  });
  it('o provedor usa a regra só na consulta paga (saldo nunca cobra)', () => {
    const src = readFileSync('server/lib/credito/provedores/boavistaApifull.ts', 'utf8');
    expect(src).toMatch(/redePodeTerCobrado\(e\)/);
    expect(src).toMatch(/erroDeRede\(e, false\)/);
  });
});

describe('bloqueioPorCobrancaIncerta', () => {
  const agora = Date.UTC(2026, 9, 20, 12, 0, 0);
  const minutosAtras = (m: number) => new Date(agora - m * 60_000);
  it('bloqueia o mesmo produto por 10 minutos, com mensagem clara', () => {
    const msg = bloqueioPorCobrancaIncerta([{ produto: 'boavista', finalizadoEm: minutosAtras(3) }], ['boavista'], { agora });
    expect(msg).toMatch(/PODE ter sido cobrada/);
    expect(msg).toMatch(/~7 min/);
  });
  it('libera depois da janela, para outro produto ou com confirmação explícita', () => {
    expect(bloqueioPorCobrancaIncerta([{ produto: 'boavista', finalizadoEm: new Date(agora - JANELA_COBRANCA_INCERTA_MS) }], ['boavista'], { agora })).toBeNull();
    expect(bloqueioPorCobrancaIncerta([{ produto: 'serasa_premium', finalizadoEm: minutosAtras(1) }], ['boavista'], { agora })).toBeNull();
    expect(bloqueioPorCobrancaIncerta([{ produto: 'boavista', finalizadoEm: minutosAtras(1) }], ['boavista'], { agora, confirmarRepeticao: true })).toBeNull();
    expect(bloqueioPorCobrancaIncerta([], ['boavista'], { agora })).toBeNull();
  });
});

describe('consultar (código-fonte)', () => {
  const src = readFileSync('server/routers/credito.ts', 'utf8');
  it('checa erro incerto recente antes de reservar/pagar e aceita confirmarRepeticao', () => {
    const consultar = src.slice(src.indexOf('  consultar: adminProcedure'), src.indexOf('  historico:'));
    expect(consultar).toMatch(/confirmarRepeticao: z\.boolean\(\)\.optional\(\)/);
    const iBloqueio = consultar.indexOf('bloqueioPorCobrancaIncerta(');
    expect(iBloqueio).toBeGreaterThan(-1);
    expect(iBloqueio).toBeLessThan(consultar.indexOf('INSERT INTO credit_queries'));
    expect(consultar).toMatch(/\$\{MARCA_COBRANCA_INCERTA\}/);
  });
});
