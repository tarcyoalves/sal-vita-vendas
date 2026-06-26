import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { knowledgeDocuments } from '../db/schema';

export const knowledgeRouter = router({
  // Base de conhecimento COMPARTILHADA: todos os usuários (e a IA de todos) leem
  // os mesmos documentos. O admin cadastra scripts/políticas/regras e os
  // atendentes — junto com o assistente de IA — passam a enxergar tudo.
  list: protectedProcedure.query(async () => {
    return db.select().from(knowledgeDocuments).orderBy(knowledgeDocuments.createdAt);
  }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(500),
      content: z.string().min(1).max(100_000),
      category: z.string().max(100).optional(),
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
      // Base compartilhada: admin pode excluir qualquer documento; atendente só
      // remove os que ele mesmo cadastrou.
      const where = ctx.user.role === 'admin'
        ? eq(knowledgeDocuments.id, input.id)
        : and(eq(knowledgeDocuments.id, input.id), eq(knowledgeDocuments.userId, ctx.user.id));
      await db.delete(knowledgeDocuments).where(where);
      return { ok: true };
    }),
});
