import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { sellers } from '../db/schema';

export const sellersRouter = router({
  list: protectedProcedure.query(async () => {
    return db.select().from(sellers).orderBy(sellers.name);
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      department: z.string().optional(),
      dailyGoal: z.number().optional().default(10),
      status: z.enum(['active', 'inactive']).optional().default('active'),
    }))
    .mutation(async ({ input }) => {
      const [created] = await db.insert(sellers).values({
        ...input,
        userId: 0,
      }).returning();
      return created;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(sellers).where(eq(sellers.id, input.id));
      return { ok: true };
    }),
});
