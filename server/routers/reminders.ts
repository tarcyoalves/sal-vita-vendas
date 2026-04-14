import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { reminders } from '../db/schema';

export const remindersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(reminders).where(eq(reminders.userId, ctx.user.id));
  }),

  create: protectedProcedure
    .input(z.object({
      clientName: z.string().min(1),
      clientPhone: z.string().optional(),
      notes: z.string().optional(),
      scheduledDate: z.date(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [created] = await db.insert(reminders).values({
        userId: ctx.user.id,
        clientName: input.clientName,
        clientPhone: input.clientPhone,
        notes: input.notes,
        scheduledDate: input.scheduledDate,
        status: 'pending',
      }).returning();
      return created;
    }),

  complete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(reminders)
        .set({ status: 'completed', updatedAt: new Date() })
        .where(and(eq(reminders.id, input.id), eq(reminders.userId, ctx.user.id)))
        .returning();
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(reminders).where(
        and(eq(reminders.id, input.id), eq(reminders.userId, ctx.user.id)),
      );
      return { ok: true };
    }),
});
