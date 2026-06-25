import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { router, publicProcedure, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { users, passwordResetTokens } from '../db/schema';
import { hashPassword, verifyPassword, signToken, DUMMY_HASH } from '../auth';
import { sendEmail } from '../email/resend';
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

  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const [user] = await db.select().from(users).where(eq(users.email, input.email));
      if (!user) return { ok: true };

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      await db.insert(passwordResetTokens).values({
        userId: user.id,
        token,
        expiresAt,
      });

      const baseUrl = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';
      const resetLink = `${baseUrl}/?reset=${token}`;

      const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
<tr><td align="center" style="padding:24px 8px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
<tr><td style="padding:32px 32px 24px;">
<p style="margin:0 0 16px;font-size:15px;color:#444;">Olá, <strong>${user.name}</strong>!</p>
<p style="margin:0 0 16px;font-size:15px;color:#444;">Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
<tr><td style="background:#0C3680;border-radius:6px;">
<a href="${resetLink}" style="display:block;padding:14px 32px;color:#fff;text-decoration:none;font-size:15px;font-weight:bold;">Redefinir minha senha</a>
</td></tr></table>
<p style="margin:16px 0 0;font-size:13px;color:#888;">Se você não solicitou essa alteração, ignore este e-mail. O link expira em 30 minutos.</p>
<p style="margin:16px 0 0;font-size:12px;color:#aaa;word-break:break-all;">Link direto: ${resetLink}</p>
</td></tr>
<tr><td style="background:#f4f4f4;padding:16px 32px;border-top:1px solid #e0e0e0;text-align:center;">
<p style="margin:0;font-size:12px;color:#888;"><strong>Sal Vita</strong> — Sistema de Gestão</p>
</td></tr>
</table></td></tr></table></body></html>`;

      await sendEmail(input.email, 'Recuperação de Senha — Sal Vita', html);
      return { ok: true };
    }),

  resetPasswordWithToken: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      newPassword: z.string().min(6, 'Mínimo 6 caracteres'),
    }))
    .mutation(async ({ input }) => {
      const [resetToken] = await db
        .select()
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.token, input.token),
            gt(passwordResetTokens.expiresAt, new Date()),
            isNull(passwordResetTokens.usedAt),
          ),
        );

      if (!resetToken) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Link inválido ou expirado. Solicite uma nova recuperação.' });
      }

      const [user] = await db.select().from(users).where(eq(users.id, resetToken.userId));
      if (!user) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Usuário não encontrado.' });
      }

      await db.update(users)
        .set({ passwordHash: hashPassword(input.newPassword), mustChangePassword: false })
        .where(eq(users.id, user.id));

      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));

      cacheInvalidate(`auth:me:${user.id}`);
      cacheInvalidate(`user:${user.id}`);
      return { ok: true, name: user.name };
    }),
});
