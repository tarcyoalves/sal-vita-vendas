import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { users, sellers } from '../db/schema';
import { hashPassword, verifyPassword, signToken, DUMMY_HASH } from '../auth';
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
      const valid = user ? verifyPassword(input.password, user.passwordHash) : (verifyPassword(input.password, DUMMY_HASH), false);
      if (!valid) {
        throw new Error('Email ou senha inválidos');
      }
      const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      ctx.res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly${secure}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`,
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

  // Emergency recovery for admin who lost their own password
  emergencyReset: publicProcedure
    .input(z.object({ email: z.string().email(), secret: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const envSecret = process.env.ADMIN_RESET_SECRET;
      if (!envSecret || input.secret !== envSecret) throw new Error('Chave de recuperação inválida');
      const [user] = await db.select().from(users).where(eq(users.email, input.email));
      if (!user) throw new Error('Email não encontrado');
      if (user.role !== 'admin') throw new Error('Apenas admins podem usar recuperação de emergência');
      const generated = generatePassword();
      await db.update(users)
        .set({ passwordHash: hashPassword(generated) })
        .where(eq(users.id, user.id));
      return { name: user.name, generatedPassword: generated };
    }),
});
