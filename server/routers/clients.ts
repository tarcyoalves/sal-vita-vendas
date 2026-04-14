import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { clients } from '../db/schema';

export const clientsRouter = router({
  list: protectedProcedure.query(async () => {
    return db.select().from(clients).orderBy(clients.name);
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [created] = await db.insert(clients).values(input).returning();
      return created;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(clients).where(eq(clients.id, input.id));
      return { ok: true };
    }),
});
