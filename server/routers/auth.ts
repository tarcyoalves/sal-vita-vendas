import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { db } from '../db';
import { users } from '../db/schema';
import { hashPassword, verifyPassword, signToken } from '../auth';
import { COOKIE_NAME, ONE_YEAR_MS } from '../../shared/const';

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    return ctx.user ?? null;
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
});
