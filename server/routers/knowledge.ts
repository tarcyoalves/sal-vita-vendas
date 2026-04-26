import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { knowledgeDocuments } from '../db/schema';

export const knowledgeRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.userId, ctx.user.id)).orderBy(knowledgeDocuments.createdAt);
  }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      category: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [created] = await db.insert(knowledgeDocuments).values({
        userId: ctx.user.id,
        title: input.title,
        content: input.content,
        category: input.category,
      }).returning();
      return created;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.delete(knowledgeDocuments).where(
        and(eq(knowledgeDocuments.id, input.id), eq(knowledgeDocuments.userId, ctx.user.id))
      );
      return { ok: true };
    }),
});
