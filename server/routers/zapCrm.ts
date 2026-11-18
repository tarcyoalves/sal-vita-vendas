// Dados do CRM de que a extensão Vita Zap precisa além do que `tasks` já oferece. Só leitura, sem tabela nova.
// Mesma autenticação que a extensão já usa (cookie/Bearer do atendente → protectedProcedure).
import { and, asc, gt, isNotNull, eq, sql } from 'drizzle-orm';
import { normalizeBrPhone } from '../../shared/phone';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { tasks } from '../db/schema';
import { phoneVariants } from '../lib/whatsappLead';
import {
  desfazerAgendamentoInput,
  LIMITE_AGENDAMENTOS,
  paraAgendamento,
  planejarRegistro,
  registrarReativacaoInput,
  type AgendamentoFuturo,
  type PlanoRegistro,
  type TarefaParaRegistro,
} from '../lib/zapAgendamentos';
import { meusLeadsFilter, userTaskFilter } from './tasks';

export type RegistroFalha = { ok: false; codigo: 'sem_lead' | 'sem_telefone' | 'varios' | 'conflito'; mensagem: string };
const COLUNAS = { id: tasks.id, title: tasks.title, notes: tasks.notes, reminderDate: tasks.reminderDate, reminderEnabled: tasks.reminderEnabled, status: tasks.status };

function resultadoDoPlano(taskId: number, criou: boolean, plano: PlanoRegistro) {
  return {
    ok: true as const,
    taskId,
    criou,
    agendou: plano.agendar != null,
    ...(plano.semAgenda ? { semAgenda: plano.semAgenda.motivo, ...(plano.semAgenda.existente ? { agendamentoExistente: plano.semAgenda.existente } : {}) } : {}),
  };
}

export type DesfazerFalha = { ok: false; codigo: 'sem_tarefa' | 'mudou'; mensagem: string };

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
  /**
   * Reativação (Vita Zap 0.7.56): grava o RESUMO da última conversa nas notas do lead (achado pelo vínculo ou pelo telefone) e,
   * se pedido, o agendamento. NÃO conta como contato (contactCount/lastContactedAt ficam como estão). Agendamento futuro que já
   * existe prevalece: nada é sobrescrito. `criar`: cria o lead (com lembrete só se houver agendamento) quando não existe.
   * Mesma visibilidade de tasks.update (admin: todas; demais: só as deles). Sem tabela nova.
   */
  registrarReativacao: protectedProcedure.input(registrarReativacaoInput).mutation(async ({ ctx, input }) => {
    const agora = new Date();
    const visivel = ctx.user.role === 'admin' ? undefined : await userTaskFilter(ctx.user.id, ctx.user.name ?? '');
    let tarefa: TarefaParaRegistro | null = null;

    if (input.taskId != null) {
      const cond = visivel ? and(eq(tasks.id, input.taskId), visivel) : eq(tasks.id, input.taskId);
      const [t] = await db.select(COLUNAS).from(tasks).where(cond).limit(1);
      tarefa = t ?? null; // vínculo velho (tarefa apagada ou de outro atendente): cai na busca pelo telefone
    }
    if (!tarefa) {
      const variantes = phoneVariants(input.telefone);
      if (variantes.length > 0) {
        const porTel = sql`regexp_replace(coalesce(${tasks.phone}, ''), '[^0-9]', '', 'g') IN (${sql.join(variantes.map((v) => sql`${v}`), sql`, `)})`;
        const achadas = await db.select(COLUNAS).from(tasks).where(visivel ? and(visivel, porTel) : porTel).limit(5);
        if (achadas.length === 1) tarefa = achadas[0];
        else if (achadas.length > 1) {
          const minhas = await db.select(COLUNAS).from(tasks).where(and(await meusLeadsFilter(ctx.user.id, ctx.user.name ?? ''), porTel)).limit(3);
          if (minhas.length !== 1) return { ok: false, codigo: 'varios', mensagem: 'Há mais de um lead com este telefone no CRM. Não salvei nada: confira.' } satisfies RegistroFalha;
          tarefa = minhas[0];
        }
      }
    }

    if (!tarefa) {
      if (!input.criar) return { ok: false, codigo: 'sem_lead', mensagem: 'Este contato não tem lead no CRM.' } satisfies RegistroFalha;
      const telefone = normalizeBrPhone(input.telefone);
      if (!telefone) return { ok: false, codigo: 'sem_telefone', mensagem: 'Sem telefone válido para criar o lead no CRM.' } satisfies RegistroFalha;
      const vazia: TarefaParaRegistro = { id: 0, title: input.titulo, notes: null, reminderDate: null, reminderEnabled: null, status: 'pending' };
      const plano = planejarRegistro(vazia, input, agora);
      const [criada] = await db
        .insert(tasks)
        .values({
          userId: ctx.user.id,
          clientId: 0,
          title: input.titulo,
          notes: plano.notas,
          tags: [],
          reminderDate: plano.agendar,
          reminderEnabled: plano.agendar != null,
          priority: 'medium',
          assignedTo: ctx.user.role !== 'admin' ? ctx.user.name : undefined,
          status: 'pending',
          phone: telefone,
        })
        .returning({ id: tasks.id });
      return resultadoDoPlano(criada.id, true, plano);
    }

    // Tarefa existente: grava com guarda de concorrência (as notas não podem ter mudado desde a leitura).
    for (let tentativa = 0; tentativa < 3 && tarefa; tentativa += 1) {
      const plano = planejarRegistro(tarefa, input, agora);
      if (plano.notas === (tarefa.notes ?? '').replace(/\s+$/, '') && plano.agendar == null) return resultadoDoPlano(tarefa.id, false, plano); // reenvio: nada a mudar
      const set = { notes: plano.notas, updatedAt: agora, ...(plano.agendar ? { reminderDate: plano.agendar, reminderEnabled: true } : {}) };
      const [gravada] = await db
        .update(tasks)
        .set(set)
        .where(and(eq(tasks.id, tarefa.id), sql`${tasks.notes} IS NOT DISTINCT FROM ${tarefa.notes}`))
        .returning({ id: tasks.id });
      if (gravada) return resultadoDoPlano(tarefa.id, false, plano);
      const [atual] = await db.select(COLUNAS).from(tasks).where(eq(tasks.id, tarefa.id)).limit(1);
      tarefa = atual ?? null;
    }
    return { ok: false, codigo: 'conflito', mensagem: 'O lead foi alterado enquanto eu salvava. Tente de novo.' } satisfies RegistroFalha;
  }),
  /**
   * Desfaz o agendamento que a IA criou (Vita Zap 0.7.59, "O que a IA fez" > Desfazer): remove SÓ o lembrete da tarefa, e somente se ele
   * ainda for exatamente o instante que a IA gravou e a tarefa seguir pendente (se o atendente mudou a data, nada é tocado). As notas e a
   * tarefa ficam como estão. Mesma visibilidade de tasks.update (admin: todas; demais: só as deles). Sem tabela nem coluna nova.
   */
  desfazerAgendamento: protectedProcedure.input(desfazerAgendamentoInput).mutation(async ({ ctx, input }) => {
    const visivel = ctx.user.role === 'admin' ? undefined : await userTaskFilter(ctx.user.id, ctx.user.name ?? '');
    const base = and(eq(tasks.id, input.taskId), ...(visivel ? [visivel] : []));
    const [tirou] = await db
      .update(tasks)
      .set({ reminderDate: null, reminderEnabled: false, updatedAt: new Date() })
      .where(and(base, eq(tasks.reminderDate, input.agendadoEm), eq(tasks.status, 'pending')))
      .returning({ id: tasks.id });
    if (tirou) return { ok: true as const, taskId: tirou.id };
    const [atual] = await db.select(COLUNAS).from(tasks).where(base).limit(1);
    if (!atual) return { ok: false, codigo: 'sem_tarefa', mensagem: 'A tarefa não existe mais no CRM (ou não é sua). Nada foi alterado.' } satisfies DesfazerFalha;
    return { ok: false, codigo: 'mudou', mensagem: 'O agendamento já foi alterado ou concluído depois que a IA o criou. Não mexi em nada.' } satisfies DesfazerFalha;
  }),
});

export type ZapCrmRouter = typeof zapCrmRouter;
