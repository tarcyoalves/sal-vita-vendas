import { z } from 'zod';
import { eq, inArray, or, isNotNull, and, gte, count, sql, SQL, asc, desc } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { tasks, sellers, taskDeletionLogs } from '../db/schema';

// Build the assignedTo filter for a non-admin user.
// Uses case-insensitive comparison: tasks imported via CSV often have different
// capitalization than the seller name stored in the DB (e.g. "MATHEUS" vs "Matheus").
async function userTaskFilter(userId: number, userName: string) {
  const sellerRows = await db.select({ name: sellers.name }).from(sellers).where(eq(sellers.userId, userId));
  const sellerName = sellerRows[0]?.name;
  const conditions: SQL<unknown>[] = [eq(tasks.userId, userId)];
  if (userName) conditions.push(sql`lower(${tasks.assignedTo}) = ${userName.toLowerCase()}`);
  if (sellerName) conditions.push(sql`lower(${tasks.assignedTo}) = ${sellerName.toLowerCase()}`);
  return or(...conditions);
}

export const tasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === 'admin') {
      return db.select().from(tasks).orderBy(tasks.createdAt);
    }
    const filter = await userTaskFilter(ctx.user.id, ctx.user.name ?? '');
    return db.select().from(tasks).where(filter).orderBy(tasks.createdAt);
  }),

  create: protectedProcedure
    .input(z.object({
      clientId: z.number().optional().default(0),
      title: z.string().min(1).max(500),
      description: z.string().max(2000).optional(),
      notes: z.string().max(5000).optional(),
      reminderDate: z.date({ required_error: 'Data do lembrete é obrigatória' }),
      reminderEnabled: z.boolean().optional().default(true),
      priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
      assignedTo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const assignedTo = input.assignedTo || (ctx.user.role !== 'admin' ? ctx.user.name : undefined);
      const [created] = await db.insert(tasks).values({
        userId: ctx.user.id,
        clientId: input.clientId,
        title: input.title,
        description: input.description,
        notes: input.notes,
        reminderDate: input.reminderDate,
        reminderEnabled: input.reminderEnabled,
        priority: input.priority,
        assignedTo,
        status: 'pending',
      }).returning();
      return created;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().max(500).optional(),
      description: z.string().max(2000).optional(),
      notes: z.string().max(5000).optional(),
      reminderDate: z.date().optional().nullable(),
      reminderEnabled: z.boolean().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      assignedTo: z.string().optional(),
      status: z.enum(['pending', 'completed', 'cancelled']).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, id)
        : and(eq(tasks.id, id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));
      // Mark real contact: attendant manually saved notes (>15 chars = real annotation)
      const now = new Date();
      const setData: Record<string, any> = { ...data, updatedAt: now };
      if (data.notes && data.notes.trim().length > 15) {
        setData.lastContactedAt = now;
        setData.contactCount = sql`${tasks.contactCount} + 1`;
      }
      const [updated] = await db
        .update(tasks)
        .set(setData)
        .where(ownerFilter)
        .returning();
      if (!updated) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tarefa não encontrada ou sem permissão' });
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

  // Marca/desmarca o lead como cliente ativo (conversão). Não altera status do lembrete —
  // lembretes continuam recorrentes; isto é apenas um marco de negócio (virou venda).
  toggleConverted: protectedProcedure
    .input(z.object({ id: z.number(), converted: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, input.id)
        : and(eq(tasks.id, input.id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));
      const [updated] = await db.update(tasks)
        .set({ convertedAt: input.converted ? new Date() : null, updatedAt: new Date() })
        .where(ownerFilter)
        .returning();
      if (!updated) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tarefa não encontrada ou sem permissão' });
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

      const [task] = await db.select({ id: tasks.id, title: tasks.title, notes: tasks.notes })
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

      const found = await db.select({ id: tasks.id, title: tasks.title, notes: tasks.notes })
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
      })));

      await db.delete(tasks).where(inArray(tasks.id, found.map(t => t.id)));
      return { ok: true, count: found.length };
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
      notes: tasks.notes, assignedTo: tasks.assignedTo,
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
