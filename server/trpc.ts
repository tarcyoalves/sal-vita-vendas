import { initTRPC, TRPCError } from '@trpc/server';
import { mensagemSeguraDeBanco } from './lib/dbErro';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import superjson from 'superjson';
import { getCookieFromRequest, verifyToken, currentPasswordVersion } from './auth';
import { tokenMatchesPassword } from './lib/sessionToken';
import { COOKIE_NAME, PREMIUM_COOKIE_NAME, UNAUTHED_ERR_MSG } from '../shared/const';
import { verifyPremiumToken, isPremiumOnlyRequest } from './lib/premiumSession';
import { db } from './db';
import { users, sellers } from './db/schema';
import { eq } from 'drizzle-orm';
import { cached, cacheInvalidate } from './lib/cache';
import { getClientIp } from './lib/clientIp';
import { canProceed, isSellerBlocked } from './lib/authGate';

export function invalidateUserCache(userId: number) {
  cacheInvalidate(`user:${userId}`);
}

function normalizeIp(raw: string): string {
  const s = raw.trim();
  if (s.startsWith('::ffff:')) return s.slice(7);
  return s;
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
  // Sessão do admin da loja Premium: valida só o JWT (sem banco) e NUNCA preenche ctx.user
  // (ids colidiriam com os do CRM e abririam rotas do CRM).
  const premiumAdmin = verifyPremiumToken(getCookieFromRequest(req.headers.cookie, PREMIUM_COOKIE_NAME));
  // Requisição só de procedures da loja com sessão da loja válida: não toca no banco do CRM.
  const authHeader = req.headers.authorization;
  const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const skipCrmUser = premiumAdmin !== null && isPremiumOnlyRequest(req.originalUrl ?? req.url);
  const token = skipCrmUser ? undefined : (getCookieFromRequest(req.headers.cookie, COOKIE_NAME) || bearerToken);
  let user: { id: number; email: string; name: string; role: string; mustChangePassword: boolean } | null = null;

  if (token) {
    try {
      const payload = verifyToken(token);
      // Token assinado mas sem id numérico não identifica ninguém (cai no catch: user = null).
      if (!payload || typeof payload !== 'object' || typeof payload.id !== 'number') throw new Error('token sem id');
      const decoded: { id: number; pv?: unknown; iat?: unknown } = payload;
      const loadUser = async () => {
        const [row] = await db
          .select({
            id: users.id, email: users.email, name: users.name, role: users.role,
            ipRestrictionEnabled: users.ipRestrictionEnabled, allowedIps: users.allowedIps,
            mustChangePassword: users.mustChangePassword, passwordHash: users.passwordHash,
          })
          .from(users)
          .where(eq(users.id, decoded.id));
        if (!row) return null;
        // Status do atendente entra no mesmo cache de 30 s (sem query extra por chamada).
        const [seller] = await db.select({ status: sellers.status }).from(sellers)
          .where(eq(sellers.userId, row.id)).limit(1);
        // No cache fica só o pv (impressão digital da senha), nunca o hash.
        const { passwordHash, ...rest } = row;
        return { ...rest, pv: currentPasswordVersion(passwordHash), sellerInactive: isSellerBlocked(row.role, seller?.status) };
      };
      let dbUser = await cached(`user:${decoded.id}`, 30_000, loadUser);
      // Troca de senha em outra instância: o cache local (30 s) ainda tem o pv antigo.
      // Divergência → relê do banco uma vez antes de recusar (evita derrubar quem acabou de trocar).
      if (dbUser && !tokenMatchesPassword(decoded, dbUser.pv)) {
        cacheInvalidate(`user:${decoded.id}`);
        dbUser = await cached(`user:${decoded.id}`, 30_000, loadUser);
        if (dbUser && !tokenMatchesPassword(decoded, dbUser.pv)) dbUser = null;
      }
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

  return { req, res, user, premiumAdmin, clientIp: getClientIp(req), token: user ? token : undefined };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  // Erro de banco (Drizzle/Neon) traz SQL e parâmetros na mensagem: troca por texto seguro antes de ir à tela.
  errorFormatter({ shape, error }) {
    const causa = error.cause instanceof Error ? error.cause.message : undefined;
    const segura = mensagemSeguraDeBanco(shape.message, causa);
    return segura ? { ...shape, message: segura } : shape;
  },
});

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

/** Quem executa uma procedure da loja: o admin da loja (sem id) ou um usuário do CRM. */
export type StoreActor =
  | { kind: 'premium'; email: string; name: string; id: null }
  | { kind: 'crm'; email: string; name: string; id: number };

function storeProcedure(roles: readonly string[], forbiddenMessage: string) {
  return t.procedure.use(({ ctx, next, path }) => {
    // Admin da loja: autorizado só pelo cookie da loja, sem consultar banco.
    if (ctx.premiumAdmin) {
      const actor: StoreActor = { kind: 'premium', email: ctx.premiumAdmin.email, name: 'Admin da loja', id: null };
      return next({ ctx: { ...ctx, actor } });
    }
    // Transição: usuário do CRM com papel autorizado continua entrando.
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: UNAUTHED_ERR_MSG });
    if (!canProceed(ctx.user, path)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Troque a senha para continuar' });
    }
    if (!roles.includes(ctx.user.role)) throw new TRPCError({ code: 'FORBIDDEN', message: forbiddenMessage });
    const actor: StoreActor = { kind: 'crm', email: ctx.user.email, name: ctx.user.name, id: ctx.user.id };
    return next({ ctx: { ...ctx, actor } });
  });
}

// Painel da loja Premium (banco ordersDb). Aceita o admin da loja OU admin/gerente do CRM.
export const premiumStaffProcedure = storeProcedure(['admin', 'manager'], 'Acesso restrito');
// Igual ao adminProcedure do CRM, para o que antes era só admin (pedidos, recuperação, leads B2B).
export const premiumAdminProcedure = storeProcedure(['admin'], 'Admin only');
