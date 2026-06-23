import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { sellers, users, tasks } from '../db/schema';
import { hashPassword } from '../auth';
import { sanitizeSignatureHtml } from '../email/marketing';
import { cached, cacheInvalidate } from '../lib/cache';

function generatePassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export function invalidateSellersCache() { cacheInvalidate('sellers:'); }

export const sellersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === 'admin') {
      return cached('sellers:admin', 60_000, () => db.select().from(sellers).orderBy(sellers.name));
    }
    return cached('sellers:user', 60_000, () =>
      db.select({ id: sellers.id, name: sellers.name, status: sellers.status })
        .from(sellers).where(eq(sellers.status, 'active')).orderBy(sellers.name)
    );
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      department: z.string().optional(),
      dailyGoal: z.number().optional().default(100),
      workHoursGoal: z.number().min(1).max(24).optional().default(8),
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
        mustChangePassword: true,
      }).returning();

      let created;
      try {
        [created] = await db.insert(sellers).values({
          ...input,
          userId: newUser.id,
        }).returning();
      } catch (err) {
        await db.delete(users).where(eq(users.id, newUser.id)).catch(() => {});
        throw err;
      }

      invalidateSellersCache();
      return { ...created, generatedPassword };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [seller] = await db.select().from(sellers).where(eq(sellers.id, input.id));
      if (seller) {
        await db.update(tasks).set({ assignedTo: null }).where(eq(tasks.assignedTo, seller.name));
        if (seller.userId > 0) {
          await db.delete(users).where(eq(users.id, seller.userId));
        }
      }
      await db.delete(sellers).where(eq(sellers.id, input.id));
      invalidateSellersCache();
      return { ok: true };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      phone: z.string().optional(),
      department: z.string().optional(),
      dailyGoal: z.number().optional(),
      workHoursGoal: z.number().min(1).max(24).optional(),
      status: z.enum(['active', 'inactive']).optional(),
      emailSignatureHtml: z.string().max(10000).optional(),
      emailSignatureImageUrl: z.string().max(1000).optional(),
      emailSignatureEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      // If name is changing, update tasks.assignedTo to match new name
      if (data.name) {
        const [existing] = await db.select().from(sellers).where(eq(sellers.id, id));
        if (existing && existing.name !== data.name) {
          await db.update(tasks).set({ assignedTo: data.name }).where(eq(tasks.assignedTo, existing.name));
        }
      }
      if (data.emailSignatureHtml !== undefined) {
        data.emailSignatureHtml = sanitizeSignatureHtml(data.emailSignatureHtml);
      }
      const [updated] = await db.update(sellers).set(data).where(eq(sellers.id, id)).returning();
      invalidateSellersCache();
      return updated;
    }),

  updateRole: adminProcedure
    .input(z.object({
      sellerId: z.number(),
      role: z.enum(['admin', 'user']),
    }))
    .mutation(async ({ input }) => {
      const [seller] = await db.select().from(sellers).where(eq(sellers.id, input.sellerId));
      if (!seller) throw new Error('Atendente não encontrado');
      const [updated] = await db.update(users).set({ role: input.role }).where(eq(users.id, seller.userId)).returning();
      return updated;
    }),

  listWithRole: adminProcedure.query(async () => {
    return db
      .select({
        id: sellers.id,
        userId: sellers.userId,
        name: sellers.name,
        email: sellers.email,
        phone: sellers.phone,
        department: sellers.department,
        dailyGoal: sellers.dailyGoal,
        workHoursGoal: sellers.workHoursGoal,
        status: sellers.status,
        emailSignatureHtml: sellers.emailSignatureHtml,
        emailSignatureImageUrl: sellers.emailSignatureImageUrl,
        emailSignatureEnabled: sellers.emailSignatureEnabled,
        createdAt: sellers.createdAt,
        updatedAt: sellers.updatedAt,
        userRole: users.role,
      })
      .from(sellers)
      .leftJoin(users, eq(sellers.userId, users.id))
      .orderBy(sellers.name);
  }),

  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const [seller] = await db.select().from(sellers).where(eq(sellers.userId, ctx.user.id)).limit(1);
    return seller ?? null;
  }),
});
