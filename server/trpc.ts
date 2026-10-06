import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { getCookieFromRequest, verifyToken } from './auth';
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '../shared/const';
import { db } from './db';
import { users, sellers } from './db/schema';
import { eq } from 'drizzle-orm';
import { cached, cacheInvalidate } from './lib/cache';
import { canProceed, isSellerBlocked } from './lib/authGate';

export function invalidateUserCache(userId: number) {
  cacheInvalidate(`user:${userId}`);
}

function normalizeIp(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('::ffff:')) return s.slice(7);
  return s;
}

function getClientIp(req: CreateExpressContextOptions['req']): string {
  return normalizeIp(req.ip ?? req.socket.remoteAddress ?? '');
}

function ipMatchesEntry(ip: string, entry: string): boolean {
  const nIp = normalizeIp(ip);
  const nEntry = normalizeIp(entry);

  const clientNum = ipToNum(nIp);
  if (clientNum !== -1) {
    if (nEntry.includes('/')) {
      const [subnet, bits] = nEntry.split('/');
      const subnetNum = ipToNum(subnet);
      if (subnetNum === -1) return false;
      const mask = ~((1 << (32 - parseInt(bits))) - 1) >>> 0;
      return (clientNum & mask) === (subnetNum & mask);
    }
    return nIp === nEntry;
  }

  return nIp.toLowerCase() === nEntry.toLowerCase();
}

function ipToNum(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return -1;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const token = getCookieFromRequest(req.headers.cookie, COOKIE_NAME);
  let user: { id: number; email: string; name: string; role: string; mustChangePassword: boolean } | null = null;

  if (token) {
    try {
      const decoded = verifyToken(token) as any;
      const dbUser = await cached(`user:${decoded.id}`, 30_000, async () => {
        const [row] = await db
          .select({
            id: users.id, email: users.email, name: users.name, role: users.role,
            ipRestrictionEnabled: users.ipRestrictionEnabled, allowedIps: users.allowedIps,
            mustChangePassword: users.mustChangePassword,
          })
          .from(users)
          .where(eq(users.id, decoded.id));
        if (!row) return null;
        // Status do atendente entra no mesmo cache de 30 s (sem query extra por chamada).
        const [seller] = await db.select({ status: sellers.status }).from(sellers)
          .where(eq(sellers.userId, row.id)).limit(1);
        return { ...row, sellerInactive: isSellerBlocked(row.role, seller?.status) };
      });
      if (dbUser && !dbUser.sellerInactive) {
        const base = {
          id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role,
          mustChangePassword: dbUser.mustChangePassword,
        };
        if (dbUser.ipRestrictionEnabled && dbUser.allowedIps.length > 0 && dbUser.role !== 'admin') {
          const clientIp = getClientIp(req);
          const allowed = dbUser.allowedIps.some(entry => ipMatchesEntry(clientIp, entry));
          user = allowed ? base : null;
        } else {
          user = base;
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

export const protectedProcedure = t.procedure.use(({ ctx, next, path }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: UNAUTHED_ERR_MSG });
  }
  if (!canProceed(ctx.user, path)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Troque a senha para continuar' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
  }
  return next({ ctx });
});

// 'manager' = atendente promovido com acesso restrito (dashboard, próprias
// tarefas, e-mail marketing e faturamento completos — sem IA nem gestão de
// atendentes/clientes). staffProcedure cobre 'admin' (acesso total) e 'manager'.
export const staffProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Acesso restrito' });
  }
  return next({ ctx });
});
