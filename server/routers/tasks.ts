import { z } from 'zod';
import { eq, inArray, or, isNotNull, and, gte, count, sql, SQL } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { tasks, sellers } from '../db/schema';

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
      reminderDate: z.date().optional(),
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

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? eq(tasks.id, input.id)
        : and(eq(tasks.id, input.id), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));
      await db.delete(tasks).where(ownerFilter);
      return { ok: true };
    }),

  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      const ownerFilter = ctx.user.role === 'admin'
        ? inArray(tasks.id, input.ids)
        : and(inArray(tasks.id, input.ids), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));
      await db.delete(tasks).where(ownerFilter);
      return { ok: true, count: input.ids.length };
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
    if (ctx.user.role === 'admin') {
      const result = await db.select().from(tasks).where(isNotNull(tasks.reminderDate));
      return result.sort((a, b) => {
        const dateA = a.reminderDate ? new Date(a.reminderDate).getTime() : 0;
        const dateB = b.reminderDate ? new Date(b.reminderDate).getTime() : 0;
        return dateA - dateB;
      });
    }
    const filter = await userTaskFilter(ctx.user.id, ctx.user.name ?? '');
    const result = await db.select().from(tasks).where(filter);
    return result.filter(t => t.reminderDate).sort((a, b) => {
      const dateA = a.reminderDate ? new Date(a.reminderDate).getTime() : 0;
      const dateB = b.reminderDate ? new Date(b.reminderDate).getTime() : 0;
      return dateA - dateB;
    });
  }),
});
