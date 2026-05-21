import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { verifyToken, COOKIE_NAME } from './auth';
import { db } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

export async function createContext({ req, res }: CreateExpressContextOptions) {
  // Accept cookie (web admin) or Bearer token (mobile app)
  const rawCookie = req.headers.cookie ?? '';
  const match = rawCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const cookieToken = match ? decodeURIComponent(match[1]) : null;
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = cookieToken ?? bearerToken;

  let user: { id: number; email: string; name: string; role: string } | null = null;
  if (token) {
    try {
      const decoded = verifyToken(token) as any;
      const [dbUser] = await db.select({ id: users.id, email: users.email, name: users.name, role: users.role }).from(users).where(eq(users.id, decoded.id));
      if (dbUser) user = dbUser;
    } catch { /* invalid token */ }
  }

  return { req, res, user };
}

type Context = Awaited<ReturnType<typeof createContext>>;
const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
  return next({ ctx });
});
