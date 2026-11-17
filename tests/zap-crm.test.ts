import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Agendamentos futuros para a trava do Vita Zap. O banco é mockado; o filtro é conferido no SQL gerado.
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'teste-jwt-secret-apenas-para-vitest-0123456789';
  return { rows: [] as unknown[], where: undefined as unknown, limite: 0 };
});
vi.mock('../server/db', () => {
  const cadeia = {
    select: () => cadeia,
    from: () => cadeia,
    where: (w: unknown) => {
      m.where = w;
      return cadeia;
    },
    orderBy: () => cadeia,
    limit: (n: number) => {
      m.limite = n;
      return Promise.resolve(m.rows);
    },
  };
  return { db: cadeia, sql: vi.fn() };
});
vi.mock('../server/routers/tasks', () => ({ userTaskFilter: vi.fn(async () => sql`FILTRO_DO_DONO`) }));

import { zapCrmRouter } from '../server/routers/zapCrm';
import { LIMITE_AGENDAMENTOS, paraAgendamento } from '../server/lib/zapAgendamentos';

const chamador = (role: 'admin' | 'user') =>
  zapCrmRouter.createCaller({ user: { id: 7, email: 'a@b.c', name: 'Ana', role, mustChangePassword: false }, req: { headers: {} }, res: {} } as never);
const consulta = () => new PgDialect().sqlToQuery(m.where as never).sql;
const dias = (n: number) => new Date(Date.now() + n * 86_400_000);

beforeEach(() => {
  m.rows = [];
  m.where = undefined;
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
