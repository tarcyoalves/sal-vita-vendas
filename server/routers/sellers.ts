import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { sellers, users } from '../db/schema';
import { hashPassword } from '../auth';

function generatePassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

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
      // Check if email already in use
      const existing = await db.select().from(users).where(eq(users.email, input.email));
      if (existing.length > 0) {
        throw new Error('Este email já está cadastrado');
      }

      // Generate password and create login account
      const generatedPassword = generatePassword();
      const passwordHash = hashPassword(generatedPassword);

      const [newUser] = await db.insert(users).values({
        name: input.name,
        email: input.email,
        passwordHash,
        role: 'user',
      }).returning();

      // Create seller linked to user account
      const [created] = await db.insert(sellers).values({
        ...input,
        userId: newUser.id,
      }).returning();

      return { ...created, generatedPassword };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      // Also remove the linked user account
      const [seller] = await db.select().from(sellers).where(eq(sellers.id, input.id));
      if (seller && seller.userId > 0) {
        await db.delete(users).where(eq(users.id, seller.userId));
      }
      await db.delete(sellers).where(eq(sellers.id, input.id));
      return { ok: true };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      phone: z.string().optional(),
      department: z.string().optional(),
      dailyGoal: z.number().optional(),
      status: z.enum(['active', 'inactive']).optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const [updated] = await db.update(sellers).set(data).where(eq(sellers.id, id)).returning();
      return updated;
    }),
});
