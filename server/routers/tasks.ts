import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { tasks } from '../db/schema';

export const tasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    // Admins see all tasks; vendors see only their own
    if (ctx.user.role === 'admin') {
      return db.select().from(tasks).orderBy(tasks.createdAt);
    }
    return db.select().from(tasks).where(eq(tasks.userId, ctx.user.id)).orderBy(tasks.createdAt);
  }),

  create: protectedProcedure
    .input(z.object({
      clientId: z.number().optional().default(0),
      title: z.string().min(1),
      description: z.string().optional(),
      notes: z.string().optional(),
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
      title: z.string().optional(),
      description: z.string().optional(),
      notes: z.string().optional(),
      reminderDate: z.date().optional().nullable(),
      reminderEnabled: z.boolean().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      assignedTo: z.string().optional(),
      status: z.enum(['pending', 'completed', 'cancelled']).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const [updated] = await db
        .update(tasks)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(tasks.id, id))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(tasks).where(eq(tasks.id, input.id));
      return { ok: true };
    }),

  deleteMany: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      await db.delete(tasks).where(inArray(tasks.id, input.ids));
      return { ok: true, count: input.ids.length };
    }),

  reminders: protectedProcedure.query(async ({ ctx }) => {
    // Admins see all reminders; users see only their own
    if (ctx.user.role === 'admin') {
      const result = await db.select().from(tasks).where(tasks.reminderDate.isNotNull());
      return result.sort((a, b) => {
        const dateA = a.reminderDate ? new Date(a.reminderDate).getTime() : 0;
        const dateB = b.reminderDate ? new Date(b.reminderDate).getTime() : 0;
        return dateA - dateB;
      });
    }
    const result = await db.select().from(tasks).where(eq(tasks.userId, ctx.user.id));
    return result.filter(t => t.reminderDate).sort((a, b) => {
      const dateA = a.reminderDate ? new Date(a.reminderDate).getTime() : 0;
      const dateB = b.reminderDate ? new Date(b.reminderDate).getTime() : 0;
      return dateA - dateB;
    });
  }),
});
