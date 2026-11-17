// Dados do CRM de que a extensão Vita Zap precisa além do que `tasks` já oferece. Só leitura, sem tabela nova.
// Mesma autenticação que a extensão já usa (cookie/Bearer do atendente → protectedProcedure).
import { and, asc, gt, isNotNull, eq, sql } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { tasks } from '../db/schema';
import { LIMITE_AGENDAMENTOS, paraAgendamento, type AgendamentoFuturo } from '../lib/zapAgendamentos';
import { userTaskFilter } from './tasks';

export const zapCrmRouter = router({
  /**
   * Agendamentos futuros pendentes (a "trava": quem está aqui não entra em reativação, campanha nem cobrança).
   * MESMA visibilidade de tasks.list: o admin vê todos; os demais, só as tarefas deles. Sem limite de antecedência
   * (um agendamento para daqui a 60 dias bloqueia). `truncado` = passou do limite e a lista pode estar incompleta.
   */
  agendamentosFuturos: protectedProcedure.query(async ({ ctx }) => {
    const agora = new Date();
    const base = and(
      isNotNull(tasks.reminderDate),
      gt(tasks.reminderDate, agora),
      eq(tasks.status, 'pending'),
      sql`${tasks.reminderEnabled} IS DISTINCT FROM false`,
    );
    const where = ctx.user.role === 'admin' ? base : and(await userTaskFilter(ctx.user.id, ctx.user.name ?? ''), base);
    const linhas = await db
      .select({ id: tasks.id, title: tasks.title, phone: tasks.phone, reminderDate: tasks.reminderDate })
      .from(tasks)
      .where(where)
      .orderBy(asc(tasks.reminderDate))
      .limit(LIMITE_AGENDAMENTOS + 1);
    const truncado = linhas.length > LIMITE_AGENDAMENTOS;
    const itens = linhas
      .slice(0, LIMITE_AGENDAMENTOS)
      .map((l) => paraAgendamento(l, agora))
      .filter((a): a is AgendamentoFuturo => a !== null);
    return { itens, truncado, consultadoEm: agora };
  }),
});

export type ZapCrmRouter = typeof zapCrmRouter;
