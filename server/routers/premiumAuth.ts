import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import { verifyPassword, getDummyHash } from '../auth';
import { safeEqual } from '../lib/safeEqual';
import { getPremiumConfig, signPremiumToken, premiumCookieHeader, clearPremiumCookieHeader } from '../lib/premiumSession';
import { PREMIUM_COOKIE_NAME } from '../../shared/const';

// Login do admin da loja Premium. NÃO consulta banco: e-mail e hash vêm do ambiente
// (PREMIUM_ADMIN_EMAIL / PREMIUM_ADMIN_PASSWORD_HASH). Não registra e-mail nem senha em log.

// Atraso progressivo POR IP (30 s a cada falha seguida, máx. 5 min). Só por IP, de propósito:
// uma chave por e-mail deixaria qualquer pessoa trancar o dono para fora do painel.
// O limite por IP+e-mail do Express (api/index.ts) complementa.
const falhas = new Map<string, { count: number; until: number }>();
const throttle = {
  blocked: (ip: string) => (falhas.get(ip)?.until ?? 0) > Date.now(),
  fail(ip: string) {
    if (falhas.size > 5000) falhas.clear();
    const n = (falhas.get(ip)?.count ?? 0) + 1;
    falhas.set(ip, { count: n, until: Date.now() + Math.min(n * 30_000, 300_000) });
  },
  ok: (ip: string) => { falhas.delete(ip); },
};
const GENERIC = 'Email ou senha inválidos';

/** Hash malformado no ambiente (ex.: iterações inválidas) não pode virar erro 500 nem aceitar a senha. */
function safeVerify(password: string, hash: string): boolean {
  try { return verifyPassword(password, hash); } catch { return false; }
}

export const premiumAuthRouter = router({
  me: publicProcedure.query(({ ctx }) =>
    ctx.premiumAdmin ? { email: ctx.premiumAdmin.email, role: 'admin' as const } : null),

  login: publicProcedure
    // z.string() sem .email(): o formato inválido não pode responder diferente de "não confere".
    .input(z.object({ email: z.string().trim().min(1).max(254), password: z.string().min(1).max(256) }))
    .mutation(({ input, ctx }) => {
      const cfg = getPremiumConfig();
      if (!cfg) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Login da loja não configurado' });
      }
      const typed = input.email.trim().toLowerCase();
      const emailOk = safeEqual(typed, cfg.email);
      if (throttle.blocked(ctx.clientIp)) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Muitas tentativas. Tente novamente em alguns minutos.' });
      }
      // Tempo constante: o PBKDF2 roda sempre (contra um hash fictício quando o e-mail não confere).
      const passOk = emailOk
        ? safeVerify(input.password, cfg.passwordHash)
        : (safeVerify(input.password, getDummyHash()), false);
      if (!passOk) {
        throttle.fail(ctx.clientIp);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: GENERIC });
      }
      throttle.ok(ctx.clientIp);
      ctx.res.setHeader('Set-Cookie', premiumCookieHeader(PREMIUM_COOKIE_NAME, signPremiumToken(cfg)));
      return { email: cfg.email, role: 'admin' as const };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.setHeader('Set-Cookie', clearPremiumCookieHeader(PREMIUM_COOKIE_NAME));
    return { ok: true };
  }),
});
