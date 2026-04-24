import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { users, sellers } from '../db/schema';
import { hashPassword, verifyPassword, signToken } from '../auth';
import { COOKIE_NAME, ONE_YEAR_MS } from '../../shared/const';

function generatePassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const [dbUser] = await db.select().from(users).where(eq(users.id, ctx.user.id));
    if (!dbUser) return null;
    return { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role };
  }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db.select().from(users).where(eq(users.email, input.email));
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        throw new Error('Email ou senha inválidos');
      }
      const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
      ctx.res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${ONE_YEAR_MS / 1000}; SameSite=Lax`,
      );
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`);
    return { ok: true };
  }),

  // Any authenticated user can change their own password
  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6, 'Mínimo 6 caracteres'),
    }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id));
      if (!user) throw new Error('Usuário não encontrado');
      if (!verifyPassword(input.currentPassword, user.passwordHash)) {
        throw new Error('Senha atual incorreta');
      }
      await db.update(users)
        .set({ passwordHash: hashPassword(input.newPassword) })
        .where(eq(users.id, ctx.user.id));
      return { ok: true };
    }),

  // Admin resets any user's password (by userId) — returns generated password
  adminResetPassword: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const [user] = await db.select().from(users).where(eq(users.id, input.userId));
      if (!user) throw new Error('Usuário não encontrado');
      const generated = generatePassword();
      await db.update(users)
        .set({ passwordHash: hashPassword(generated) })
        .where(eq(users.id, input.userId));
      return { name: user.name, email: user.email, generatedPassword: generated };
    }),
});
