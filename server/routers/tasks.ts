import { z } from 'zod';
import { eq, inArray, or, isNotNull, and } from 'drizzle-orm';
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
