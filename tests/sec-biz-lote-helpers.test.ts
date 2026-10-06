import { describe, it, expect } from 'vitest';
import { matchAssignee, ehDuplicada, lembreteEscalonado, executarComOrcamento } from '../server/lib/taskImport';
import { isRetryableProviderError, retryMarker, jaTentouDeNovo } from '../server/lib/emailRetry';
import { spWeekday, spNextBusinessDay, spHHmm, spDDMM } from '../server/lib/tz';

describe('matchAssignee', () => {
  it('normaliza para a grafia do cadastro', () => {
    expect(matchAssignee('  matheus ', ['Matheus', 'Ana'], [])).toBe('Matheus');
    expect(matchAssignee('TARCYO', ['Ana'], ['Tarcyo Alves', 'Tarcyo'])).toBe('Tarcyo');
  });
  it('nome inexistente ou vazio → null', () => {
    expect(matchAssignee('Fulano', ['Ana'], ['Admin'])).toBeNull();
    expect(matchAssignee('   ', ['Ana'], [])).toBeNull();
    expect(matchAssignee('Ana Maria', ['Ana'], [])).toBeNull(); // sem parcial
  });
});

describe('importação: duplicadas e lembretes', () => {
  const ja = { cnpjs: new Set(['111']), phones: new Set(['84999']) };
  it('detecta por cnpj ou telefone', () => {
    expect(ehDuplicada({ cnpj: '111' }, ja)).toBe(true);
    expect(ehDuplicada({ phone: '84999' }, ja)).toBe(true);
    expect(ehDuplicada({ cnpj: '222', phone: '8400' }, ja)).toBe(false);
    expect(ehDuplicada({}, ja)).toBe(false);
  });
  it('escalona 2 em 2 minutos', () => {
    const base = new Date('2026-10-06T12:00:00Z');
    expect(lembreteEscalonado(base, 0).toISOString()).toBe('2026-10-06T12:00:00.000Z');
    expect(lembreteEscalonado(base, 3).toISOString()).toBe('2026-10-06T12:06:00.000Z');
  });
});

describe('executarComOrcamento', () => {
  it('roda tudo quando cabe no orçamento (200 sequenciais + resto concorrente)', async () => {
    const itens = Array.from({ length: 25 }, (_, i) => i);
    const feitos: number[] = [];
    let ativos = 0, pico = 0;
    const r = await executarComOrcamento(itens, async (n) => {
      ativos++; pico = Math.max(pico, ativos);
      await new Promise(res => setTimeout(res, 1));
      feitos.push(n); ativos--;
    }, { sequenciais: 5, concorrencia: 10, orcamentoMs: 10_000 });
    expect(r).toEqual({ executados: 25, falhas: 0, naoExecutados: [] });
    expect(pico).toBeLessThanOrEqual(10);
    expect(pico).toBeGreaterThan(1);
  });
  it('para ao esgotar o orçamento e devolve o resto', async () => {
    let t = 0;
    const r = await executarComOrcamento([1, 2, 3, 4, 5, 6], async () => { t += 10; }, {
      sequenciais: 2, concorrencia: 2, orcamentoMs: 25, agora: () => t,
    });
    expect(r.executados + r.naoExecutados.length).toBe(6);
    expect(r.naoExecutados.length).toBeGreaterThan(0);
  });
  it('contabiliza falhas sem interromper', async () => {
    const r = await executarComOrcamento([1, 2, 3], async (n) => { if (n === 2) throw new Error('x'); }, { sequenciais: 1, concorrencia: 2, orcamentoMs: 1000 });
    expect(r).toEqual({ executados: 2, falhas: 1, naoExecutados: [] });
  });
});

describe('retry de e-mail', () => {
  it('429 e 5xx são retentáveis; 4xx e rede não', () => {
    for (const e of ['resend_429', 'resend_500', 'brevo_503', 'resend_502']) expect(isRetryableProviderError(e)).toBe(true);
    for (const e of ['resend_422', 'brevo_400', 'network_error', 'blocked_domain', undefined, null]) expect(isRetryableProviderError(e)).toBe(false);
  });
  it('marcador impede segunda tentativa', () => {
    expect(jaTentouDeNovo(null)).toBe(false);
    expect(jaTentouDeNovo(retryMarker('resend_429'))).toBe(true);
  });
});

describe('fuso de São Paulo (DB-16)', () => {
  it('quinta 22h em SP (sexta 01h UTC): o próximo dia útil é sexta, não segunda', () => {
    const quintaNoite = new Date('2026-10-02T01:00:00Z'); // quinta 01/10 22:00 em SP
    expect(spWeekday(quintaNoite)).toBe(4);
    const prox = spNextBusinessDay(quintaNoite);
    expect(spWeekday(prox)).toBe(5);
  });
  it('sexta → segunda; sábado → segunda', () => {
    expect(spWeekday(spNextBusinessDay(new Date('2026-10-02T15:00:00Z')))).toBe(1);
    expect(spWeekday(spNextBusinessDay(new Date('2026-10-03T15:00:00Z')))).toBe(1);
  });
  it('hora e data formatadas em SP', () => {
    expect(spHHmm(new Date('2026-10-06T11:05:00Z'))).toBe('08:05');
    expect(spDDMM(new Date('2026-10-06T01:00:00Z'))).toBe('05/10');
  });
});
