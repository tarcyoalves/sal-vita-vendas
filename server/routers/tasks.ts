import { z } from 'zod';
import { eq, inArray, or, isNotNull, and, gte, desc } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { db } from '../db';
import { tasks } from '../db/schema';

export const tasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === 'admin') {
      return db.select().from(tasks).orderBy(tasks.createdAt);
    }
    // Show tasks the user created OR tasks assigned to them by name
    const userName = ctx.user.name ?? '';
    return db.select().from(tasks)
      .where(or(eq(tasks.userId, ctx.user.id), eq(tasks.assignedTo, userName)))
      .orderBy(tasks.createdAt);
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
      const userName = ctx.user.name ?? '';
      const where = ctx.user.role === 'admin'
        ? eq(tasks.id, id)
        : and(eq(tasks.id, id), or(eq(tasks.userId, ctx.user.id), eq(tasks.assignedTo, userName)));
      // Mark real contact: attendant manually saved notes (>15 chars = real annotation)
      const now = new Date();
      const setData: Record<string, any> = { ...data, updatedAt: now };
      if (data.notes && data.notes.trim().length > 15) {
        setData.lastContactedAt = now;
      }
      const [updated] = await db
        .update(tasks)
        .set(setData)
        .where(where)
        .returning();
      if (!updated) throw new TRPCError({ code: 'FORBIDDEN', message: 'Tarefa não encontrada ou sem permissão' });

      // Real-time fraud detection — runs every time a contact is logged
      if (setData.lastContactedAt && ctx.user.role !== 'admin') {
        const tenMinAgo   = new Date(now.getTime() - 10 * 60_000);
        const thirtyMinAgo = new Date(now.getTime() - 30 * 60_000);
        const todayStart  = new Date(now); todayStart.setHours(0, 0, 0, 0);

        const [burst10, burst30, todayAll] = await Promise.all([
          db.select({ id: tasks.id }).from(tasks).where(
            and(or(eq(tasks.userId, ctx.user.id), eq(tasks.assignedTo, userName)), gte(tasks.lastContactedAt, tenMinAgo))
          ),
          db.select({ id: tasks.id }).from(tasks).where(
            and(or(eq(tasks.userId, ctx.user.id), eq(tasks.assignedTo, userName)), gte(tasks.lastContactedAt, thirtyMinAgo))
          ),
          db.select({ id: tasks.id }).from(tasks).where(
            and(or(eq(tasks.userId, ctx.user.id), eq(tasks.assignedTo, userName)), gte(tasks.lastContactedAt, todayStart))
          ),
        ]);

        const fraudAlerts: Array<{ type: string; count: number; window: string; message: string }> = [];
        if (burst10.length >= 5) {
          fraudAlerts.push({ type: 'burst_10min', count: burst10.length, window: '10min', message: `${burst10.length} contatos em menos de 10 minutos — isso é monitorado pelo gestor como possível simulação de atividade.` });
        }
        if (burst30.length >= 15) {
          fraudAlerts.push({ type: 'burst_30min', count: burst30.length, window: '30min', message: `${burst30.length} contatos em menos de 30 minutos — ritmo acima do esperado.` });
        }
        if (todayAll.length >= 30 && todayAll.length % 10 === 0) {
          // Fire every 10 contacts above 30, not every single save
          fraudAlerts.push({ type: 'daily_high', count: todayAll.length, window: 'hoje', message: `${todayAll.length} contatos registrados hoje. Volume elevado — certifique-se de que todos foram contatos reais.` });
        }

        if (fraudAlerts.length > 0) {
          return { ...updated, fraudAlerts };
        }
      }

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const userName = ctx.user.name ?? '';
      const where = ctx.user.role === 'admin'
        ? eq(tasks.id, input.id)
        : and(eq(tasks.id, input.id), or(eq(tasks.userId, ctx.user.id), eq(tasks.assignedTo, userName)));
      await db.delete(tasks).where(where);
      return { ok: true };
    }),

  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      const userName = ctx.user.name ?? '';
      const where = ctx.user.role === 'admin'
        ? inArray(tasks.id, input.ids)
        : and(inArray(tasks.id, input.ids), or(eq(tasks.userId, ctx.user.id), eq(tasks.assignedTo, userName)));
      await db.delete(tasks).where(where);
      return { ok: true, count: input.ids.length };
    }),

  // Self-performance metrics for the logged-in attendant — used by frontend to show behavioral alerts
  myPerformance: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const oneDayAgo = new Date(now.getTime() - 86400000);

    const userName = ctx.user.name ?? '';
    const myTasks = await db.select().from(tasks)
      .where(or(eq(tasks.userId, ctx.user.id), eq(tasks.assignedTo, userName)));

    const withReminder = myTasks.filter(t => t.reminderDate && t.reminderEnabled !== false);
    const overdue = withReminder.filter(t => new Date(t.reminderDate!) < now);
    const noNotes = myTasks.filter(t => !t.notes || t.notes.trim().length < 15);
    const disabledReminders = myTasks.filter(t => t.reminderEnabled === false);
    const ghostClients = myTasks.filter(t =>
      !t.lastContactedAt || new Date(t.lastContactedAt) < thirtyDaysAgo
    );
    // Tasks imported/created but never meaningfully edited (updatedAt ≈ createdAt within 2 min)
    const neverUpdated = myTasks.filter(t => {
      const diff = new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime();
      return diff < 2 * 60 * 1000;
    });
    // Rescheduled recently but no real contact logged — simulated activity signal
    const reschedNoContact = myTasks.filter(t =>
      new Date(t.updatedAt) > sevenDaysAgo &&
      (!t.lastContactedAt || new Date(t.lastContactedAt) < sevenDaysAgo) &&
      t.reminderDate
    );
    // Reminders disabled in the last 24h — hiding tasks signal
    const recentlyDisabled = myTasks.filter(t =>
      t.reminderEnabled === false && new Date(t.updatedAt) > oneDayAgo
    );

    // Burst detection: ≥5 contacts logged within any 10-min window
    const contactedSorted = myTasks
      .filter(t => t.lastContactedAt)
      .sort((a, b) => new Date(a.lastContactedAt!).getTime() - new Date(b.lastContactedAt!).getTime());
    let burstMax = 0;
    for (let i = 0; i < contactedSorted.length; i++) {
      const base = new Date(contactedSorted[i].lastContactedAt!).getTime();
      const inWindow = contactedSorted.filter(t => {
        const d = new Date(t.lastContactedAt!).getTime() - base;
        return d >= 0 && d <= 600_000;
      }).length;
      if (inWindow > burstMax) burstMax = inWindow;
    }

    const total = myTasks.length;
    return {
      total,
      overdue: overdue.length,
      noNotes: noNotes.length,
      disabledReminders: disabledReminders.length,
      recentlyDisabledCount: recentlyDisabled.length,
      ghostClients: ghostClients.length,
      neverUpdated: neverUpdated.length,
      reschedNoContact: reschedNoContact.length,
      burstDetected: burstMax >= 5,
      burstMax,
      activeRate: total > 0 ? Math.round((withReminder.length / total) * 100) : 0,
    };
  }),

  // Recent audit log for admin — last edits across all tasks
  recentActivity: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
    const twoHoursAgo = new Date(Date.now() - 2 * 3600_000);
    return db.select().from(tasks)
      .where(gte(tasks.updatedAt, twoHoursAgo))
      .orderBy(desc(tasks.updatedAt))
      .limit(50);
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
    // Include tasks created by user OR assigned to them by name
    const userName = ctx.user.name ?? '';
    const result = await db.select().from(tasks)
      .where(or(eq(tasks.userId, ctx.user.id), eq(tasks.assignedTo, userName)));
    return result.filter(t => t.reminderDate).sort((a, b) => {
      const dateA = a.reminderDate ? new Date(a.reminderDate).getTime() : 0;
      const dateB = b.reminderDate ? new Date(b.reminderDate).getTime() : 0;
      return dateA - dateB;
    });
  }),
});
