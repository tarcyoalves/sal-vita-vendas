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

function getClientIp(req: CreateExpressContextOptions['req']): string {
  return req.ip ?? req.socket.remoteAddress ?? '';
}

function ipMatchesEntry(ip: string, entry: string): boolean {
  const clientNum = ipToNum(ip);
  if (clientNum === -1) return false;
  if (entry.includes('/')) {
    const [subnet, bits] = entry.split('/');
    const subnetNum = ipToNum(subnet);
    if (subnetNum === -1) return false;
    const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
    return (clientNum & mask) === (subnetNum & mask);
  }
  return ip === entry;
}

function ipToNum(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return -1;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const token = getCookieFromRequest(req.headers.cookie, COOKIE_NAME);
  let user: { id: number; email: string; name: string; role: string } | null = null;

  if (token) {
    try {
      const decoded = verifyToken(token) as any;
      const dbUser = await cached(`user:${decoded.id}`, 30_000, async () => {
        const [row] = await db
          .select({
            id: users.id, email: users.email, name: users.name, role: users.role,
            ipRestrictionEnabled: users.ipRestrictionEnabled, allowedIps: users.allowedIps,
          })
          .from(users)
          .where(eq(users.id, decoded.id));
        return row ?? null;
      });
      if (dbUser) {
        if (dbUser.ipRestrictionEnabled && dbUser.allowedIps.length > 0 && dbUser.role !== 'admin') {
          const clientIp = getClientIp(req);
          const allowed = dbUser.allowedIps.some(entry => ipMatchesEntry(clientIp, entry));
          if (!allowed) {
            user = null;
          } else {
            user = { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role };
          }
        } else {
          user = { id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role };
        }
      }
    } catch {
      // invalid token — user stays null
    }
  }

  return { req, res, user, clientIp: getClientIp(req) };
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
