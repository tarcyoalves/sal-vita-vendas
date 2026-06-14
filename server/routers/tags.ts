import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { tags, tasks } from '../db/schema';
import { eq, sql, asc } from 'drizzle-orm';

export const tagsRouter = router({
  // Catalog of admin-curated tags. Attendants pick from this list when
  // tagging tasks instead of free-typing new tags.
  list: protectedProcedure.query(async () => {
    return db.select().from(tags).orderBy(asc(tags.name));
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(40),
      color: z.string().trim().min(1).max(20).optional(),
    }))
    .mutation(async ({ input }) => {
      const [row] = await db.insert(tags)
        .values({ name: input.name, color: input.color || '#6366f1' })
        .onConflictDoNothing({ target: tags.name })
        .returning();
      if (!row) throw new TRPCError({ code: 'CONFLICT', message: 'Já existe uma tag com esse nome' });
      return row;
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().trim().min(1).max(40).optional(),
      color: z.string().trim().min(1).max(20).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...rest } = input;
      const [existing] = await db.select().from(tags).where(eq(tags.id, id));
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag não encontrada' });

      let updated;
      try {
        [updated] = await db.update(tags).set(rest).where(eq(tags.id, id)).returning();
      } catch {
        throw new TRPCError({ code: 'CONFLICT', message: 'Já existe uma tag com esse nome' });
      }

      // Keep tasks in sync: rename the tag across every task that uses it.
      if (rest.name && rest.name !== existing.name) {
        await db.update(tasks)
          .set({ tags: sql`array_replace(${tasks.tags}, ${existing.name}, ${rest.name})` })
          .where(sql`${existing.name} = ANY(${tasks.tags})`);
      }

      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [existing] = await db.select().from(tags).where(eq(tags.id, input.id));
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Tag não encontrada' });

      // Remove the tag from every task that uses it before deleting the catalog entry.
      await db.update(tasks)
        .set({ tags: sql`array_remove(${tasks.tags}, ${existing.name})` })
        .where(sql`${existing.name} = ANY(${tasks.tags})`);

      await db.delete(tags).where(eq(tags.id, input.id));
      return { success: true };
    }),
});
