import { z } from 'zod';
import { eq, inArray, or, isNotNull, and, gte, count, sql, SQL, asc, desc } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { tasks, sellers, taskDeletionLogs } from '../db/schema';
import { runTriggerNow, cancelAllEnrollments } from '../email/automations';

// Normaliza CNPJ/telefone para somente dígitos. Para telefone, remove o código
// do país (55) quando presente, para casar números digitados com ou sem DDI.
function normalizeCnpj(value?: string | null): string | undefined {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits || undefined;
}
function normalizePhone(value?: string | null): string | undefined {
  let digits = (value ?? '').replace(/\D/g, '');
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  return digits || undefined;
}

// Build the assignedTo filter for a non-admin user.
// Uses case-insensitive comparison: tasks imported via CSV often have different
// capitalization than the seller name stored in the DB (e.g. "MATHEUS" vs "Matheus").
export async function userTaskFilter(userId: number, userName: string) {
  const sellerRows = await db.select({ name: sellers.name }).from(sellers).where(eq(sellers.userId, userId));
  const sellerName = sellerRows[0]?.name;
  const conditions: SQL<unknown>[] = [eq(tasks.userId, userId)];
  if (userName) conditions.push(sql`lower(${tasks.assignedTo}) = ${userName.toLowerCase()}`);
  if (sellerName) conditions.push(sql`lower(${tasks.assignedTo}) = ${sellerName.toLowerCase()}`);
  return or(...conditions);
}

// Columns returned by tasks.list — excludes `notes` (up to 5000 chars) and
// `description` (up to 2000 chars) to reduce transfer payload. Use tasks.getById
// to fetch the full task when opening a detail view.
const listColumns = {
  id: tasks.id,
  clientId: tasks.clientId,
  userId: tasks.userId,
  title: tasks.title,
  email: tasks.email,
  tags: tasks.tags,
  reminderDate: tasks.reminderDate,
  reminderEnabled: tasks.reminderEnabled,
  status: tasks.status,
  priority: tasks.priority,
  assignedTo: tasks.assignedTo,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  convertedAt: tasks.convertedAt,
  contactCount: tasks.contactCount,
  lastContactedAt: tasks.lastContactedAt,
  hotLead: tasks.hotLead,
  lastEngagementAt: tasks.lastEngagementAt,
  cnpj: tasks.cnpj,
  phone: tasks.phone,
  orderValue: tasks.orderValue,
  orderId: tasks.orderId,
  emailConfirmed: tasks.emailConfirmed,
  emailConfirmedAt: tasks.emailConfirmedAt,
  emailConfirmedBy: tasks.emailConfirmedBy,
};

export const tasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === 'admin') {
      return db.select(listColumns).from(tasks).orderBy(tasks.createdAt);
    }
    const filter = await userTaskFilter(ctx.user.id, ctx.user.name ?? '');
    return db.select(listColumns).from(tasks).where(filter).orderBy(tasks.createdAt);
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, input.id));
      if (!task) throw new TRPCError({ code: 'NOT_FOUND' });
      if (ctx.user.role !== 'admin') {
        const filter = await userTaskFilter(ctx.user.id, ctx.user.name ?? '');
        const [owned] = await db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, input.id), filter));
        if (!owned) throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return task;
    }),

  create: protectedProcedure
    .input(z.object({
      clientId: z.number().optional().default(0),
      title: z.string().min(1).max(500),
      description: z.string().max(2000).optional(),
      notes: z.string().max(5000).optional(),
      email: z.string().email().max(200).optional().or(z.literal('')),
      tags: z.array(z.string()).optional(),
      reminderDate: z.date({ required_error: 'Data do lembrete é obrigatória' }),
      reminderEnabled: z.boolean().optional().default(true),
      priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
      assignedTo: z.string().optional(),
      cnpj: z.string().optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const assignedTo = input.assignedTo || (ctx.user.role !== 'admin' ? ctx.user.name : undefined);
      const email = input.email ? input.email.toLowerCase().trim() : undefined;
      // E-mail digitado à mão pelo atendente já entra confirmado (importações não
      // passam o campo `email` — elas o preenchem depois via backfill, logo ficam
      // não-confirmadas até o atendente editar/confirmar).
      const emailConfirmer = ctx.user.name ?? ctx.user.email;
      const [created] = await db.insert(tasks).values({
        userId: ctx.user.id,
        clientId: input.clientId,
        title: input.title,
        description: input.description,
        notes: input.notes,
        email,
        tags: input.tags,
        reminderDate: input.reminderDate,
        reminderEnabled: input.reminderEnabled,
        priority: input.priority,
        assignedTo,
        status: 'pending',
        cnpj: normalizeCnpj(input.cnpj),
        phone: normalizePhone(input.phone),
        emailConfirmed: !!email,
        emailConfirmedAt: email ? new Date() : null,
        emailConfirmedBy: email ? emailConfirmer : null,
      }).returning();

      if (created?.email) {
        try {
          await runTriggerNow('lead_created', {
            id: created.id,
            email: created.email,
            title: created.title,
            tags: created.tags,
            assignedTo: created.assignedTo,
          });
        } catch (err) {
          console.error('[tasks.create] runTriggerNow(lead_created) failed:', err);
        }
      }

      return created;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().max(500).optional(),
      description: z.string().max(2000).optional(),
      notes: z.string().max(5000).optional(),
      email: z.string().email().max(200).optional().or(z.literal('')),
      tags: z.array(z.string()).optional(),
      reminderDate: z.date().optional().nullable(),
      reminderEnabled: z.boolean().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      assignedTo: z.string().optional(),
      status: z.enum(['pending', 'completed', 'cancelled']).optional(),
      // Quando o atendente edita o e-mail para um novo valor, o front envia
      // `emailConfirmed: true` (e-mail digitado = confirmado). Em saves que não
      // mexem no e-mail, o campo vem `undefined` e a confirmação não é tocada.
      emailConfirmed: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, emailConfirmed, ...data } = input;
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, id)
        : and(eq(tasks.id, id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));
      // Mark real contact: attendant manually saved notes (>15 chars = real annotation)
      const now = new Date();
      const setData: Record<string, any> = { ...data, updatedAt: now };
      let confirmedNow = false;
      if (data.email !== undefined) {
        const newEmail = data.email ? data.email.toLowerCase().trim() : null;
        setData.email = newEmail;
        if (!newEmail) {
          // E-mail removido → deixa de ser confirmado.
          setData.emailConfirmed = false;
          setData.emailConfirmedAt = null;
          setData.emailConfirmedBy = null;
        } else if (emailConfirmed === true) {
          setData.emailConfirmed = true;
          setData.emailConfirmedAt = now;
          setData.emailConfirmedBy = ctx.user.name ?? ctx.user.email;
          confirmedNow = true;
        } else if (emailConfirmed === false) {
          setData.emailConfirmed = false;
          setData.emailConfirmedAt = null;
          setData.emailConfirmedBy = null;
        }
        // emailConfirmed === undefined → e-mail inalterado: não mexe na confirmação.
      }
      if (data.notes && data.notes.trim().length > 15) {
        setData.lastContactedAt = now;
        setData.contactCount = sql`${tasks.contactCount} + 1`;
      }
      let oldEmail: string | null = null;
      if (data.email !== undefined) {
        const [prev] = await db.select({ email: tasks.email }).from(tasks).where(ownerFilter).limit(1);
        oldEmail = prev?.email?.toLowerCase().trim() ?? null;
      }

      const [updated] = await db
        .update(tasks)
        .set(setData)
        .where(ownerFilter)
        .returning();
      if (!updated) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tarefa não encontrada ou sem permissão' });

      if (oldEmail && oldEmail !== (updated.email?.toLowerCase().trim() ?? null)) {
        try {
          await cancelAllEnrollments(oldEmail);
        } catch (err) {
          console.error('[tasks.update] cancelAllEnrollments for old email failed:', err);
        }
      }

      if (confirmedNow && updated.email) {
        try {
          await runTriggerNow('lead_created', {
            id: updated.id, email: updated.email, title: updated.title, tags: updated.tags, assignedTo: updated.assignedTo,
          });
        } catch (err) {
          console.error('[tasks.update] runTriggerNow(lead_created) failed:', err);
        }
      }
      let burstWarning = false;
      let burstCount = 0;
      if (ctx.user.role !== 'admin' && setData.lastContactedAt) {
        const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
        const [burstRow] = await db.select({ cnt: count() })
          .from(tasks)
          .where(and(eq(tasks.userId, ctx.user.id), isNotNull(tasks.lastContactedAt), gte(tasks.lastContactedAt, tenMinAgo)));
        burstCount = Number(burstRow?.cnt ?? 0);
        burstWarning = burstCount >= 10;
      }
      return { ...updated, burstWarning, burstCount };
    }),

  // Confirma manualmente o e-mail de uma tarefa (sem alterar o valor) — usado para
  // liberar e-mails IMPORTADOS, que começam não-confirmados. Só após isso o e-mail
  // pode ser usado em campanhas/sequências/automações.
  confirmEmail: protectedProcedure
    .input(z.object({ id: z.number(), confirmed: z.boolean().optional().default(true) }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, input.id)
        : and(eq(tasks.id, input.id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));

      const [task] = await db.select({ id: tasks.id, email: tasks.email }).from(tasks).where(ownerFilter).limit(1);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tarefa não encontrada ou sem permissão' });
      if (input.confirmed && !task.email) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Esta tarefa não tem e-mail para confirmar' });
      }

      const now = new Date();
      const [updated] = await db.update(tasks)
        .set(input.confirmed
          ? { emailConfirmed: true, emailConfirmedAt: now, emailConfirmedBy: ctx.user.name ?? ctx.user.email, updatedAt: now }
          : { emailConfirmed: false, emailConfirmedAt: null, emailConfirmedBy: null, updatedAt: now })
        .where(ownerFilter)
        .returning();

      // Ao confirmar, o lead "entra" de fato no marketing → dispara a automação
      // "lead criado" (idempotente, seguro re-disparar).
      if (input.confirmed && updated?.email) {
        try {
          await runTriggerNow('lead_created', {
            id: updated.id, email: updated.email, title: updated.title, tags: updated.tags, assignedTo: updated.assignedTo,
          });
        } catch (err) {
          console.error('[tasks.confirmEmail] runTriggerNow(lead_created) failed:', err);
        }
      }

      return updated;
    }),

  // Marca/desmarca o lead como cliente ativo (conversão). Não altera status do lembrete —
  // lembretes continuam recorrentes; isto é apenas um marco de negócio (virou venda).
  toggleConverted: protectedProcedure
    .input(z.object({
      id: z.number(),
      converted: z.boolean(),
      orderValue: z.number().min(0).max(999999.99).optional(),
      orderId: z.string().max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, input.id)
        : and(eq(tasks.id, input.id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));

      const [existing] = await db.select({ tags: tasks.tags }).from(tasks).where(eq(tasks.id, input.id));
      const currentTags = existing?.tags ?? [];
      const newTags = input.converted
        ? (currentTags.includes('ativo') ? currentTags : [...currentTags, 'ativo'])
        : currentTags.filter(t => t !== 'ativo');

      const setData: Record<string, any> = {
        convertedAt: input.converted ? new Date() : null,
        updatedAt: new Date(),
        tags: newTags,
      };
      if (input.converted) {
        if (input.orderValue !== undefined) setData.orderValue = input.orderValue.toFixed(2);
        if (input.orderId !== undefined) setData.orderId = input.orderId;
      } else {
        setData.orderValue = null;
        setData.orderId = null;
      }
      const [updated] = await db.update(tasks)
        .set(setData)
        .where(ownerFilter)
        .returning();
      if (!updated) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tarefa não encontrada ou sem permissão' });

      if (input.converted && updated.email) {
        try {
          await runTriggerNow('lead_converted', {
            id: updated.id,
            email: updated.email,
            title: updated.title,
            tags: updated.tags,
            assignedTo: updated.assignedTo,
          });
        } catch (err) {
          console.error('[tasks.toggleConverted] runTriggerNow(lead_converted) failed:', err);
        }
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
      reason: z.string().max(500).optional().default('Não informado'),
    }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, input.id)
        : and(eq(tasks.id, input.id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));

      const [task] = await db.select({ id: tasks.id, title: tasks.title, notes: tasks.notes, cnpj: tasks.cnpj, phone: tasks.phone })
        .from(tasks).where(ownerFilter).limit(1);
      if (!task) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tarefa não encontrada ou sem permissão' });

      await db.insert(taskDeletionLogs).values({
        taskId: task.id,
        taskTitle: task.title,
        taskNotes: task.notes ?? null,
        deletedByUserId: ctx.user.id,
        deletedByName: ctx.user.name ?? ctx.user.email,
        reason: input.reason,
        reviewedByAdmin: ctx.user.role === 'admin',
        cnpj: task.cnpj,
        phone: task.phone,
      });

      await db.delete(tasks).where(eq(tasks.id, task.id));
      return { ok: true };
    }),

  deleteMany: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      reason: z.string().max(500).optional().default('Não informado'),
    }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? inArray(tasks.id, input.ids)
        : and(inArray(tasks.id, input.ids), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));

      const found = await db.select({ id: tasks.id, title: tasks.title, notes: tasks.notes, cnpj: tasks.cnpj, phone: tasks.phone })
        .from(tasks).where(ownerFilter);
      if (found.length === 0) throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhuma tarefa encontrada ou sem permissão' });

      await db.insert(taskDeletionLogs).values(found.map(t => ({
        taskId: t.id,
        taskTitle: t.title,
        taskNotes: t.notes ?? null,
        deletedByUserId: ctx.user.id,
        deletedByName: ctx.user.name ?? ctx.user.email,
        reason: input.reason,
        reviewedByAdmin: ctx.user.role === 'admin',
        cnpj: t.cnpj,
        phone: t.phone,
      })));

      await db.delete(tasks).where(inArray(tasks.id, found.map(t => t.id)));
      return { ok: true, count: found.length };
    }),

  // Verifica, antes de importar, quais CNPJs/telefones já correspondem a uma tarefa
  // excluída anteriormente (task_deletion_logs) — usado para não reimportar leads
  // que um atendente já removeu.
  checkCancelledMatches: protectedProcedure
    .input(z.object({
      items: z.array(z.object({ cnpj: z.string().optional(), phone: z.string().optional() })).max(2000),
    }))
    .query(async ({ input }) => {
      const cnpjs = [...new Set(input.items.map(i => normalizeCnpj(i.cnpj)).filter((v): v is string => !!v))];
      const phones = [...new Set(input.items.map(i => normalizePhone(i.phone)).filter((v): v is string => !!v))];
      if (cnpjs.length === 0 && phones.length === 0) return { cnpjs: [], phones: [] };

      const conditions: SQL<unknown>[] = [];
      if (cnpjs.length) conditions.push(inArray(taskDeletionLogs.cnpj, cnpjs));
      if (phones.length) conditions.push(inArray(taskDeletionLogs.phone, phones));

      const rows = await db.select({ cnpj: taskDeletionLogs.cnpj, phone: taskDeletionLogs.phone })
        .from(taskDeletionLogs)
        .where(or(...conditions));

      return {
        cnpjs: [...new Set(rows.map(r => r.cnpj).filter((v): v is string => !!v))],
        phones: [...new Set(rows.map(r => r.phone).filter((v): v is string => !!v))],
      };
    }),

  // Admin: list pending deletion log reviews
  deletionLogs: adminProcedure
    .input(z.object({ onlyUnreviewed: z.boolean().optional().default(true) }).optional())
    .query(async ({ input }) => {
      const filter = input?.onlyUnreviewed !== false
        ? eq(taskDeletionLogs.reviewedByAdmin, false)
        : undefined;
      return db.select().from(taskDeletionLogs)
        .where(filter)
        .orderBy(desc(taskDeletionLogs.createdAt))
        .limit(100);
    }),

  // Admin: mark a deletion log as reviewed
  markDeletionReviewed: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.update(taskDeletionLogs)
        .set({ reviewedByAdmin: true })
        .where(eq(taskDeletionLogs.id, input.id));
      return { ok: true };
    }),

  fraudAlerts: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [burstRows, hourRows, allSellers] = await Promise.all([
      db.select({ userId: tasks.userId, cnt: count() }).from(tasks)
        .where(and(isNotNull(tasks.lastContactedAt), gte(tasks.lastContactedAt, tenMinAgo)))
        .groupBy(tasks.userId),
      db.select({ userId: tasks.userId, cnt: count() }).from(tasks)
        .where(and(isNotNull(tasks.lastContactedAt), gte(tasks.lastContactedAt, oneHourAgo)))
        .groupBy(tasks.userId),
      db.select({ name: sellers.name, userId: sellers.userId }).from(sellers),
    ]);
    const alerts: { sellerName: string; type: string; message: string; severity: 'high' | 'medium'; count: number }[] = [];
    for (const row of burstRows) {
      if (Number(row.cnt) >= 10) {
        const seller = allSellers.find(s => s.userId === row.userId);
        if (seller) alerts.push({ sellerName: seller.name, type: 'burst', message: `${row.cnt} contatos em menos de 10 minutos`, severity: 'high', count: Number(row.cnt) });
      }
    }
    for (const row of hourRows) {
      if (Number(row.cnt) >= 45) {
        const seller = allSellers.find(s => s.userId === row.userId);
        if (seller && !alerts.some(a => a.sellerName === seller.name)) {
          alerts.push({ sellerName: seller.name, type: 'burst_hour', message: `${row.cnt} contatos em menos de 1 hora`, severity: 'medium', count: Number(row.cnt) });
        }
      }
    }
    return alerts;
  }),

  reminders: protectedProcedure.query(async ({ ctx }) => {
    // Only fetch reminders from yesterday onward — no need for historical data for notifications
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const reminderFields = {
      id: tasks.id, title: tasks.title, reminderDate: tasks.reminderDate,
      reminderEnabled: tasks.reminderEnabled, status: tasks.status,
      // Truncated: only used for short notification bodies, no need for the full text.
      notes: sql<string | null>`substring(${tasks.notes}, 1, 300)`,
      assignedTo: tasks.assignedTo,
    };
    if (ctx.user.role === 'admin') {
      return db.select(reminderFields).from(tasks)
        .where(and(isNotNull(tasks.reminderDate), gte(tasks.reminderDate, yesterday)))
        .orderBy(asc(tasks.reminderDate))
        .limit(300);
    }
    const filter = await userTaskFilter(ctx.user.id, ctx.user.name ?? '');
    return db.select(reminderFields).from(tasks)
      .where(and(filter, isNotNull(tasks.reminderDate), gte(tasks.reminderDate, yesterday)))
      .orderBy(asc(tasks.reminderDate))
      .limit(300);
  }),
});
