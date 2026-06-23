import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { users } from '../db/schema';
import { hashPassword, verifyPassword, signToken, DUMMY_HASH } from '../auth';
import { COOKIE_NAME } from '../../shared/const';
import { cached, cacheInvalidate } from '../lib/cache';

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const emergencyAttempts = new Map<string, { count: number; blockedUntil: number }>();

export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    return cached(`auth:me:${ctx.user.id}`, 30_000, async () => {
      const [dbUser] = await db.select().from(users).where(eq(users.id, ctx.user!.id));
      if (!dbUser) return null;
      return {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        mustChangePassword: dbUser.mustChangePassword,
      };
    });
  }),

  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db.select().from(users).where(eq(users.email, input.email));
      const valid = user ? verifyPassword(input.password, user.passwordHash) : (verifyPassword(input.password, DUMMY_HASH), false);
      if (!valid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Email ou senha inválidos' });
      }
      const token = signToken({ id: user.id, email: user.email, name: user.name, role: user.role });
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      ctx.res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly${secure}; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`,
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
        .set({ passwordHash: hashPassword(input.newPassword), mustChangePassword: false })
        .where(eq(users.id, ctx.user.id));
      cacheInvalidate(`auth:me:${ctx.user.id}`);
      cacheInvalidate(`user:${ctx.user.id}`);
      return { ok: true };
    }),

  forceChangePassword: protectedProcedure
    .input(z.object({ newPassword: z.string().min(6, 'Mínimo 6 caracteres') }))
    .mutation(async ({ input, ctx }) => {
      const [user] = await db.select().from(users).where(eq(users.id, ctx.user.id));
      if (!user) throw new Error('Usuário não encontrado');
      if (!user.mustChangePassword) throw new Error('Operação não permitida');
      await db.update(users)
        .set({ passwordHash: hashPassword(input.newPassword), mustChangePassword: false })
        .where(eq(users.id, ctx.user.id));
      cacheInvalidate(`auth:me:${ctx.user.id}`);
      cacheInvalidate(`user:${ctx.user.id}`);
      return { ok: true };
    }),

  adminResetPassword: adminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input }) => {
      const [user] = await db.select().from(users).where(eq(users.id, input.userId));
      if (!user) throw new Error('Usuário não encontrado');
      const generated = generatePassword();
      await db.update(users)
        .set({ passwordHash: hashPassword(generated), mustChangePassword: true })
        .where(eq(users.id, input.userId));
      cacheInvalidate(`auth:me:${input.userId}`);
      cacheInvalidate(`user:${input.userId}`);
      return { name: user.name, email: user.email, generatedPassword: generated };
    }),

  emergencyReset: publicProcedure
    .input(z.object({ email: z.string().email(), secret: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const ip = ctx.req.ip ?? ctx.req.socket.remoteAddress ?? 'unknown';
      const attempt = emergencyAttempts.get(ip);
      if (attempt && Date.now() < attempt.blockedUntil) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas. Tente novamente em alguns minutos.' });
      }

      const envSecret = process.env.ADMIN_RESET_SECRET;
      const genericError = 'Credenciais de recuperação inválidas';

      if (!envSecret || input.secret !== envSecret) {
        const prev = emergencyAttempts.get(ip) ?? { count: 0, blockedUntil: 0 };
        prev.count++;
        prev.blockedUntil = Date.now() + Math.min(prev.count * 30_000, 300_000);
        emergencyAttempts.set(ip, prev);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: genericError });
      }

      const [user] = await db.select().from(users).where(eq(users.email, input.email));
      if (!user || user.role !== 'admin') {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: genericError });
      }

      emergencyAttempts.delete(ip);
      const generated = generatePassword();
      await db.update(users)
        .set({ passwordHash: hashPassword(generated), mustChangePassword: true })
        .where(eq(users.id, user.id));
      return { name: user.name, generatedPassword: generated };
    }),
});
