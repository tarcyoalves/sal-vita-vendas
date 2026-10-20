import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { documentosLiberadosPorTarefa, tarefaDaCarteira } from '../server/lib/credito/carteira';
import { validarDocumentoDaTarefa } from '../server/lib/taskDocumento';

describe('tarefaDaCarteira', () => {
  const consulta = new Date('2026-10-10T12:00:00Z');
  it('tarefa anterior à primeira consulta vale', () => {
    expect(tarefaDaCarteira(new Date('2026-10-01T00:00:00Z'), consulta)).toBe(true);
  });
  it('tarefa criada depois (ou no mesmo instante) da consulta não vale', () => {
    expect(tarefaDaCarteira(new Date('2026-10-11T00:00:00Z'), consulta)).toBe(false);
    expect(tarefaDaCarteira(consulta, consulta)).toBe(false);
  });
  it('sem consulta ou data inválida: não libera', () => {
    expect(tarefaDaCarteira(new Date(), null)).toBe(false);
    expect(tarefaDaCarteira(new Date(), undefined)).toBe(false);
    expect(tarefaDaCarteira('lixo', consulta)).toBe(false);
  });
  it('aceita datas em string (resultado de min() do SQL)', () => {
    expect(tarefaDaCarteira('2026-10-01T00:00:00Z', '2026-10-10T12:00:00Z')).toBe(true);
  });
});

describe('documentosLiberadosPorTarefa', () => {
  it('cada documento usa a própria data de corte', () => {
    const primeira = new Map([['A', '2026-10-10T00:00:00Z'], ['B', '2026-10-10T00:00:00Z']]);
    const r = documentosLiberadosPorTarefa([
      { documento: 'A', criadaEm: new Date('2026-10-01T00:00:00Z') },
      { documento: 'B', criadaEm: new Date('2026-10-12T00:00:00Z') },
      { documento: 'C', criadaEm: new Date('2026-10-01T00:00:00Z') },
    ], primeira);
    expect([...r]).toEqual(['A']);
  });
});

describe('validarDocumentoDaTarefa', () => {
  it('vazio é permitido', () => {
    expect(validarDocumentoDaTarefa(undefined)).toEqual({ ok: true, documento: undefined });
    expect(validarDocumentoDaTarefa('  ')).toEqual({ ok: true, documento: undefined });
    expect(validarDocumentoDaTarefa('--')).toEqual({ ok: true, documento: undefined });
  });
  it('CNPJ e CPF válidos são normalizados para dígitos', () => {
    expect(validarDocumentoDaTarefa('11.222.333/0001-81')).toEqual({ ok: true, documento: '11222333000181' });
    expect(validarDocumentoDaTarefa('111.468.126-12')).toEqual({ ok: true, documento: '11146812612' });
  });
  it('rejeita tamanho errado e DV inválido', () => {
    expect(validarDocumentoDaTarefa('123').ok).toBe(false);
    expect(validarDocumentoDaTarefa('11222333000182').ok).toBe(false);
    expect(validarDocumentoDaTarefa('11111111111').ok).toBe(false);
  });
});

describe('código-fonte: o router usa as regras', () => {
  const credito = readFileSync('server/routers/credito.ts', 'utf8');
  const tasks = readFileSync('server/routers/tasks.ts', 'utf8');
  it('crédito do atendente não libera por tarefa sem passar pela data de corte', () => {
    expect(credito).toMatch(/documentosLiberadosPorTarefa/);
    expect(credito).toMatch(/min\(\$\{creditReports\.consultadoEm\}\)/);
    expect(credito).not.toMatch(/if \(t\) return true/);
  });
  it('tasks.create valida o documento antes de gravar', () => {
    const create = tasks.slice(tasks.indexOf('  create: protectedProcedure'), tasks.indexOf('  bulkCreate:'));
    expect(create).toMatch(/validarDocumentoDaTarefa\(input\.cnpj\)/);
    expect(create).toMatch(/cnpj: doc\.documento/);
  });
});
