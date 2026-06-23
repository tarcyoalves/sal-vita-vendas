import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { getCookieFromRequest, verifyToken } from './auth';
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '../shared/const';
import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';
import { cached, cacheInvalidate } from './lib/cache';

export function invalidateUserCache(userId: number) {
  cacheInvalidate(`user:${userId}`);
}

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const token = getCookieFromRequest(req.headers.cookie, COOKIE_NAME);
  let user: { id: number; email: string; name: string; role: string } | null = null;

  if (token) {
    try {
      const decoded = verifyToken(token) as any;
      const dbUser = await cached(`user:${decoded.id}`, 30_000, async () => {
        const [row] = await db
          .select({ id: users.id, email: users.email, name: users.name, role: users.role })
          .from(users)
          .where(eq(users.id, decoded.id));
        return row ?? null;
      });
      if (dbUser) user = dbUser;
    } catch {
      // invalid token — user stays null
    }
  }

  return { req, res, user };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
  }
  return next({ ctx });
});
