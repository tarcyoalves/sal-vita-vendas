import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Agendamentos futuros para a trava do Vita Zap. O banco é mockado; o filtro é conferido no SQL gerado.
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'teste-jwt-secret-apenas-para-vitest-0123456789';
  return {
    rows: [] as unknown[],
    where: undefined as unknown,
    wheres: [] as unknown[],
    limite: 0,
    /** Respostas das próximas consultas com .limit() (uma por chamada). */
    fila: [] as unknown[][],
    inseridos: [] as Array<Record<string, unknown>>,
    atualizacoes: [] as Array<Record<string, unknown>>,
    /** O que o UPDATE devolve (vazio = a guarda de concorrência não casou). */
    retornoUpdate: [{ id: 1 }] as unknown[],
    chamadas: [] as string[],
  };
});
vi.mock('../server/db', () => {
  const cadeia = {
    select: () => cadeia,
    from: () => cadeia,
    where: (w: unknown) => {
      m.where = w;
      m.wheres.push(w);
      return cadeia;
    },
    orderBy: () => cadeia,
    limit: (n: number) => {
      m.limite = n;
      m.chamadas.push('select');
      return Promise.resolve(m.fila.length > 0 ? m.fila.shift() : m.rows);
    },
    insert: () => cadeia,
    values: (v: Record<string, unknown>) => {
      m.inseridos.push(v);
      return cadeia;
    },
    update: () => cadeia,
    set: (v: Record<string, unknown>) => {
      m.atualizacoes.push(v);
      return cadeia;
    },
    returning: () => {
      m.chamadas.push('returning');
      return Promise.resolve(m.atualizacoes.length > 0 && m.inseridos.length === 0 ? m.retornoUpdate : [{ id: 99 }]);
    },
  };
  return { db: cadeia, sql: vi.fn() };
});
vi.mock('../server/routers/tasks', () => ({
  userTaskFilter: vi.fn(async () => sql`FILTRO_DO_DONO`),
  meusLeadsFilter: vi.fn(async () => sql`FILTRO_MEUS`),
}));

import { zapCrmRouter } from '../server/routers/zapCrm';
import { AGENDAR_MAX_MS, AGENDAR_MIN_MS, LIMITE_AGENDAMENTOS, MAX_NOTAS, agendamentoFuturoDa, anexarLinha, carimboDeNota, paraAgendamento, planejarRegistro } from '../server/lib/zapAgendamentos';

const chamador = (role: 'admin' | 'user') =>
  zapCrmRouter.createCaller({ user: { id: 7, email: 'a@b.c', name: 'Ana', role, mustChangePassword: false }, req: { headers: {} }, res: {} } as never);
const consulta = () => new PgDialect().sqlToQuery(m.where as never).sql;
/** O SQL de TODAS as condições da chamada (a busca, a atualização...). */
const todasAsConsultas = () => m.wheres.map((w) => new PgDialect().sqlToQuery(w as never).sql).join(' || ');
const dias = (n: number) => new Date(Date.now() + n * 86_400_000);

beforeEach(() => {
  m.rows = [];
  m.where = undefined;
  m.wheres = [];
  m.fila = [];
  m.inseridos = [];
  m.atualizacoes = [];
  m.retornoUpdate = [{ id: 1 }];
  m.chamadas = [];
});

describe('zapCrm.agendamentosFuturos', () => {
  it('devolve os agendamentos futuros (inclusive a 60 dias) com título, telefone e data', async () => {
    m.rows = [
      { id: 1, title: 'Ana Mercearia', phone: '84999990000', reminderDate: dias(60) },
      { id: 2, title: 'Pedro', phone: '  ', reminderDate: dias(2) },
    ];
    const r = await chamador('user').agendamentosFuturos();
    expect(r.itens).toEqual([
      { taskId: 1, titulo: 'Ana Mercearia', telefone: '84999990000', venceEm: m.rows[0] && (m.rows[0] as { reminderDate: Date }).reminderDate },
      { taskId: 2, titulo: 'Pedro', telefone: null, venceEm: (m.rows[1] as { reminderDate: Date }).reminderDate },
    ]);
    expect(r.truncado).toBe(false);
    expect(r.consultadoEm).toBeInstanceOf(Date);
  });

  it('o SQL filtra data futura sem teto de antecedência, status pendente e lembrete ligado', async () => {
    await chamador('admin').agendamentosFuturos();
    const q = consulta();
    expect(q).toMatch(/"reminder_date" is not null/);
    expect(q).toMatch(/"reminder_date" > \$/);
    expect(q).not.toMatch(/"reminder_date" <=?/); // sem janela superior: 60 dias bloqueiam
    expect(q).toMatch(/"status" = \$/);
    expect(q).toMatch(/"reminder_enabled" IS DISTINCT FROM false/);
  });

  it('atendente só vê as tarefas dele (mesmo filtro de tasks.list); admin vê todas', async () => {
    await chamador('user').agendamentosFuturos();
    expect(consulta()).toMatch(/FILTRO_DO_DONO/);
    await chamador('admin').agendamentosFuturos();
    expect(consulta()).not.toMatch(/FILTRO_DO_DONO/);
  });

  it('passou do limite: devolve só o limite e avisa que está truncado (a extensão falha fechada)', async () => {
    m.rows = Array.from({ length: LIMITE_AGENDAMENTOS + 1 }, (_, i) => ({ id: i + 1, title: `c${i}`, phone: null, reminderDate: dias(3) }));
    const r = await chamador('admin').agendamentosFuturos();
    expect(m.limite).toBe(LIMITE_AGENDAMENTOS + 1);
    expect(r.itens).toHaveLength(LIMITE_AGENDAMENTOS);
    expect(r.truncado).toBe(true);
  });

  it('paraAgendamento ignora data vencida, inválida ou ausente', () => {
    const agora = new Date('2026-11-17T12:00:00Z');
    expect(paraAgendamento({ id: 1, title: 'a', phone: null, reminderDate: new Date('2026-11-17T11:59:59Z') }, agora)).toBeNull();
    expect(paraAgendamento({ id: 1, title: 'a', phone: null, reminderDate: null }, agora)).toBeNull();
    expect(paraAgendamento({ id: 1, title: 'a', phone: null, reminderDate: 'lixo' }, agora)).toBeNull();
    expect(paraAgendamento({ id: 1, title: 'a', phone: null, reminderDate: '2027-01-01T00:00:00Z' }, agora)?.venceEm).toEqual(new Date('2027-01-01T00:00:00Z'));
  });
});


// ── Registrar a reativação ──────────────────────────────────────────────────

const agora = new Date('2026-11-17T15:00:00Z'); // 12:00 em Brasília
const tarefa = (extra: Record<string, unknown> = {}) => ({ id: 5, title: 'Ana Mercearia', notes: null, reminderDate: null, reminderEnabled: true, status: 'pending', ...extra });
const entrada = (extra: Record<string, unknown> = {}) => ({ taskId: 5, telefone: '5584999990000', titulo: 'Ana Mercearia', linha: 'Reativação 25d: falamos de sal. Decisão: precisa de mais tempo.', criar: false, ...extra });

describe('zapCrm.registrarReativacao: regras puras', () => {
  it('carimbo no fuso de Brasília', () => {
    expect(carimboDeNota(agora)).toBe('[17/11/2026 12:00] ');
  });

  it('anexarLinha: anexa ao fim, não duplica reenvio e descarta linhas inteiras antigas ao passar de 5000', () => {
    expect(anexarLinha(null, 'a')).toBe('a');
    expect(anexarLinha('x\n', 'a')).toBe('x\na');
    expect(anexarLinha('x\na', 'a')).toBe('x\na');
    const velhas = Array.from({ length: 80 }, (_, i) => `[01/01/2026 00:00] linha antiga ${i} ${'y'.repeat(60)}`).join('\n');
    const r = anexarLinha(velhas, 'NOVA');
    expect(r.length).toBeLessThanOrEqual(MAX_NOTAS);
    expect(r.endsWith('\nNOVA')).toBe(true);
    expect(r).not.toMatch(/linha antiga 0 /);
    expect(r.split('\n').every((l) => l === 'NOVA' || /^\[01\/01\/2026 00:00\] linha antiga \d+ y+$/.test(l))).toBe(true);
  });

  it('agendamentoFuturoDa só vale para pendente, ligado e no futuro', () => {
    const f = new Date(agora.getTime() + 86_400_000);
    expect(agendamentoFuturoDa(tarefa({ reminderDate: f }), agora)).toEqual(f);
    expect(agendamentoFuturoDa(tarefa({ reminderDate: f, status: 'completed' }), agora)).toBeNull();
    expect(agendamentoFuturoDa(tarefa({ reminderDate: f, status: 'cancelled' }), agora)).toBeNull();
    expect(agendamentoFuturoDa(tarefa({ reminderDate: f, reminderEnabled: false }), agora)).toBeNull();
    expect(agendamentoFuturoDa(tarefa({ reminderDate: f, reminderEnabled: null }), agora)).toEqual(f);
    expect(agendamentoFuturoDa(tarefa({ reminderDate: new Date(agora.getTime() - 1) }), agora)).toBeNull();
    expect(agendamentoFuturoDa(tarefa({ reminderDate: null }), agora)).toBeNull();
  });

  it('planejarRegistro: agenda em tarefa sem agendamento futuro (inclusive com lembrete vencido)', () => {
    const quando = new Date(agora.getTime() + 30 * 86_400_000);
    const p = planejarRegistro(tarefa({ reminderDate: new Date(agora.getTime() - 5 * 86_400_000) }) as never, { linha: 'L', agendarEm: quando }, agora);
    expect(p.agendar).toEqual(quando);
    expect(p.semAgenda).toBeUndefined();
    expect(p.notas).toBe('[17/11/2026 12:00] L');
  });

  it('planejarRegistro: o agendamento que já existe PREVALECE (só a nota é gravada)', () => {
    const existente = new Date(agora.getTime() + 60 * 86_400_000);
    const p = planejarRegistro(tarefa({ reminderDate: existente }) as never, { linha: 'L', agendarEm: new Date(agora.getTime() + 30 * 86_400_000) }, agora);
    expect(p.agendar).toBeNull();
    expect(p.semAgenda).toEqual({ motivo: 'agendamento_existente', existente });
    expect(p.notas).toMatch(/L$/);
  });

  it('planejarRegistro: tarefa concluída/cancelada não é reaberta; data fora de 1 h a 400 dias é recusada', () => {
    const q = new Date(agora.getTime() + 30 * 86_400_000);
    expect(planejarRegistro(tarefa({ status: 'completed' }) as never, { linha: 'L', agendarEm: q }, agora).semAgenda?.motivo).toBe('tarefa_encerrada');
    expect(planejarRegistro(tarefa() as never, { linha: 'L', agendarEm: new Date(agora.getTime() + AGENDAR_MIN_MS - 1) }, agora).semAgenda?.motivo).toBe('data_invalida');
    expect(planejarRegistro(tarefa() as never, { linha: 'L', agendarEm: new Date(agora.getTime() + AGENDAR_MAX_MS + 1) }, agora).semAgenda?.motivo).toBe('data_invalida');
    expect(planejarRegistro(tarefa() as never, { linha: 'L' }, agora).agendar).toBeNull();
  });
});

describe('zapCrm.registrarReativacao: procedimento', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(agora);
    return () => vi.useRealTimers();
  });

  it('grava só as notas e o lembrete: NUNCA mexe em contactCount nem lastContactedAt', async () => {
    m.fila = [[tarefa({ notes: '[01/11/2026 09:00] oi' })]];
    const quando = new Date(agora.getTime() + 30 * 86_400_000);
    const r = await chamador('user').registrarReativacao(entrada({ agendarEm: quando }) as never);
    expect(r).toMatchObject({ ok: true, taskId: 5, criou: false, agendou: true });
    expect(m.atualizacoes).toHaveLength(1);
    expect(Object.keys(m.atualizacoes[0]).sort()).toEqual(['notes', 'reminderDate', 'reminderEnabled', 'updatedAt']);
    expect(m.atualizacoes[0].notes).toBe('[01/11/2026 09:00] oi\n[17/11/2026 12:00] Reativação 25d: falamos de sal. Decisão: precisa de mais tempo.');
    expect(m.atualizacoes[0].reminderDate).toEqual(quando);
  });

  it('agendamento existente prevalece e é devolvido; a nota é salva mesmo assim', async () => {
    const existente = new Date(agora.getTime() + 60 * 86_400_000);
    m.fila = [[tarefa({ reminderDate: existente })]];
    const r = await chamador('user').registrarReativacao(entrada({ agendarEm: new Date(agora.getTime() + 30 * 86_400_000) }) as never);
    expect(r).toMatchObject({ ok: true, agendou: false, semAgenda: 'agendamento_existente', agendamentoExistente: existente });
    expect(Object.keys(m.atualizacoes[0]).sort()).toEqual(['notes', 'updatedAt']);
  });

  it('atendente: a busca respeita a visibilidade (FILTRO_DO_DONO); admin não filtra', async () => {
    m.fila = [[tarefa()]];
    await chamador('user').registrarReativacao(entrada() as never);
    expect(todasAsConsultas()).toMatch(/FILTRO_DO_DONO/);
    m.wheres = [];
    m.fila = [[tarefa()]];
    await chamador('admin').registrarReativacao(entrada() as never);
    expect(todasAsConsultas()).not.toMatch(/FILTRO_DO_DONO/);
  });

  it('vínculo velho: sem tarefa pelo id, acha pelo telefone (variantes com e sem 9 e DDI)', async () => {
    m.fila = [[], [tarefa({ id: 8 })]];
    const r = await chamador('user').registrarReativacao(entrada() as never);
    expect(r).toMatchObject({ ok: true, taskId: 8 });
    expect(todasAsConsultas()).toMatch(/regexp_replace\(coalesce\("tasks"."phone"/);
  });

  it('mais de um lead com o telefone e nenhum só meu: não grava nada (varios)', async () => {
    m.fila = [[], [tarefa({ id: 1 }), tarefa({ id: 2 })], [tarefa({ id: 1 }), tarefa({ id: 2 })]];
    const r = await chamador('user').registrarReativacao(entrada() as never);
    expect(r).toMatchObject({ ok: false, codigo: 'varios' });
    expect(m.atualizacoes).toHaveLength(0);
    expect(m.inseridos).toHaveLength(0);
  });

  it('sem lead e sem permissão para criar: sem_lead', async () => {
    m.fila = [[], []];
    expect(await chamador('user').registrarReativacao(entrada({ criar: false }) as never)).toMatchObject({ ok: false, codigo: 'sem_lead' });
  });

  it('criar: cria o lead com o telefone normalizado, a nota e o lembrete só se houver agendamento', async () => {
    m.fila = [[], []];
    const quando = new Date(agora.getTime() + 45 * 86_400_000);
    const r = await chamador('user').registrarReativacao(entrada({ criar: true, agendarEm: quando }) as never);
    expect(r).toMatchObject({ ok: true, criou: true, taskId: 99, agendou: true });
    expect(m.inseridos[0]).toMatchObject({ title: 'Ana Mercearia', phone: '84999990000', reminderDate: quando, reminderEnabled: true, status: 'pending', assignedTo: 'Ana' });

    m.fila = [[], []];
    m.inseridos = [];
    await chamador('user').registrarReativacao(entrada({ criar: true }) as never);
    expect(m.inseridos[0]).toMatchObject({ reminderDate: null, reminderEnabled: false });
    expect(String(m.inseridos[0].notes)).toMatch(/^\[17\/11\/2026 12:00\] Reativação/);
  });

  it('criar sem telefone válido: sem_telefone (nunca cria lead sem número)', async () => {
    m.fila = [[]];
    expect(await chamador('user').registrarReativacao(entrada({ taskId: undefined, telefone: undefined, criar: true }) as never)).toMatchObject({ ok: false, codigo: 'sem_telefone' });
    expect(m.inseridos).toHaveLength(0);
  });

  it('conflito de concorrência: relê e tenta de novo; depois de 3 tentativas devolve conflito', async () => {
    m.retornoUpdate = [];
    m.fila = [[tarefa()], [tarefa({ notes: 'mudou' })], [tarefa({ notes: 'mudou de novo' })], [tarefa({ notes: 'e outra vez' })]];
    expect(await chamador('user').registrarReativacao(entrada() as never)).toMatchObject({ ok: false, codigo: 'conflito' });
    expect(m.atualizacoes).toHaveLength(3);
  });

  it('reenvio da mesma linha (mesmo minuto): nada a gravar', async () => {
    m.fila = [[tarefa({ notes: '[17/11/2026 12:00] Reativação 25d: falamos de sal. Decisão: precisa de mais tempo.' })]];
    expect(await chamador('user').registrarReativacao(entrada() as never)).toMatchObject({ ok: true, agendou: false });
    expect(m.atualizacoes).toHaveLength(0);
  });

  it('zod: linha vazia/enorme e título vazio são recusados', async () => {
    const c = chamador('user');
    await expect(c.registrarReativacao(entrada({ linha: '' }) as never)).rejects.toThrow();
    await expect(c.registrarReativacao(entrada({ linha: 'x'.repeat(701) }) as never)).rejects.toThrow();
    await expect(c.registrarReativacao(entrada({ titulo: '' }) as never)).rejects.toThrow();
  });
});

describe('zapCrm.desfazerAgendamento (desfazer da tela "O que a IA fez")', () => {
  const quando = dias(30);

  it('remove SÓ o lembrete quando ele ainda é o instante que a IA gravou (notas e tarefa ficam)', async () => {
    const r = await chamador('admin').desfazerAgendamento({ taskId: 5, agendadoEm: quando });
    expect(r).toEqual({ ok: true, taskId: 1 });
    expect(m.atualizacoes).toHaveLength(1);
    expect(m.atualizacoes[0]).toMatchObject({ reminderDate: null, reminderEnabled: false });
    expect(Object.keys(m.atualizacoes[0])).not.toContain('notes');
    const q = todasAsConsultas();
    expect(q).toMatch(/"reminder_date" = \$/);
    expect(q).toMatch(/"status" = \$/);
  });

  it('se o atendente mudou a data (a guarda não casou), não mexe em nada e explica', async () => {
    m.retornoUpdate = [];
    m.fila = [[{ id: 5, title: 'Ana', notes: null, reminderDate: dias(10), reminderEnabled: true, status: 'pending' }]];
    const r = await chamador('admin').desfazerAgendamento({ taskId: 5, agendadoEm: quando });
    expect(r).toMatchObject({ ok: false, codigo: 'mudou' });
  });

  it('tarefa que não existe (ou não é do atendente): sem_tarefa', async () => {
    m.retornoUpdate = [];
    m.fila = [[]];
    const r = await chamador('user').desfazerAgendamento({ taskId: 5, agendadoEm: quando });
    expect(r).toMatchObject({ ok: false, codigo: 'sem_tarefa' });
    expect(todasAsConsultas()).toMatch(/FILTRO_DO_DONO/);
  });

  it('exige o id e o instante (entrada inválida é recusada)', async () => {
    await expect(chamador('admin').desfazerAgendamento({ taskId: 0, agendadoEm: quando })).rejects.toThrow();
    await expect(chamador('admin').desfazerAgendamento({ taskId: 1, agendadoEm: 'amanhã' as unknown as Date })).rejects.toThrow();
  });
});
