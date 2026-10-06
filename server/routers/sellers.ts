import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { eq, and, ne, sql, count } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { randomInt } from 'crypto';
import { router, protectedProcedure, adminProcedure, staffProcedure, invalidateUserCache } from '../trpc';
import { db } from '../db';
import { sellers, users, tasks, workSessions, fatOrders, fatCommissions } from '../db/schema';
import { hashPassword } from '../auth';
import { sanitizeSignatureHtml } from '../email/marketing';
import { cached, cacheInvalidate } from '../lib/cache';
import { emailEquals, normalizeEmail } from '../lib/userEmail';

// assigned_to é texto livre com o nome do atendente: compara sem diferenciar caixa/espaços
const assignedToIs = (name: string) => sql`lower(trim(${tasks.assignedTo})) = ${name.trim().toLowerCase()}`;

function generatePassword(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join('');
}

export function invalidateSellersCache() { cacheInvalidate('sellers:'); }

export const sellersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role === 'admin') {
      return cached('sellers:admin', 120_000, () => db.select().from(sellers).orderBy(sellers.name));
    }
    return cached('sellers:user', 120_000, () =>
      db.select({ id: sellers.id, name: sellers.name, status: sellers.status })
        .from(sellers).where(eq(sellers.status, 'active')).orderBy(sellers.name)
    );
  }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      department: z.string().optional(),
      dailyGoal: z.number().optional().default(100),
      workHoursGoal: z.number().min(1).max(24).optional().default(8),
      status: z.enum(['active', 'inactive']).optional().default('active'),
    }))
    .mutation(async ({ input }) => {
      // Check if email already in use
      const email = normalizeEmail(input.email);
      const existing = await db.select({ id: users.id }).from(users).where(emailEquals(users.email, email));
      if (existing.length > 0) {
        throw new Error('Este email já está cadastrado');
      }

      // Generate password and create login account
      const generatedPassword = generatePassword();
      const passwordHash = hashPassword(generatedPassword);

      const [newUser] = await db.insert(users).values({
        name: input.name,
        email,
        passwordHash,
        role: 'user',
        mustChangePassword: true,
      }).returning();

      let created;
      try {
        [created] = await db.insert(sellers).values({
          ...input,
          email,
          userId: newUser.id,
        }).returning();
      } catch (err) {
        await db.delete(users).where(eq(users.id, newUser.id)).catch(() => {});
        throw err;
      }

      invalidateSellersCache();
      return { ...created, generatedPassword };
    }),

  // Só exclui de verdade o atendente sem nenhum dado vinculado (tarefas, pedidos,
  // sessões, comissão). Com dados, apagar deixaria órfãos e quebraria relatórios e
  // comissões — então apenas desativa (perde o acesso, histórico intacto).
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [seller] = await db.select().from(sellers).where(eq(sellers.id, input.id));
      if (!seller) return { ok: true, deactivated: false };

      const hasUser = seller.userId > 0;
      const linked = await Promise.all([
        db.select({ id: tasks.id }).from(tasks)
          .where(hasUser ? sql`(${assignedToIs(seller.name)} or ${tasks.userId} = ${seller.userId})` : assignedToIs(seller.name))
          .limit(1),
        db.select({ id: fatOrders.id }).from(fatOrders).where(eq(fatOrders.sellerId, seller.id)).limit(1),
        db.select({ id: fatCommissions.sellerId }).from(fatCommissions).where(eq(fatCommissions.sellerId, seller.id)).limit(1),
        hasUser
          ? db.select({ id: workSessions.id }).from(workSessions).where(eq(workSessions.userId, seller.userId)).limit(1)
          : Promise.resolve([]),
      ]);

      if (linked.some(rows => rows.length > 0)) {
        await db.update(sellers).set({ status: 'inactive', updatedAt: new Date() }).where(eq(sellers.id, seller.id));
        invalidateSellersCache();
        if (hasUser) {
          invalidateUserCache(seller.userId);
          cacheInvalidate(`auth:me:${seller.userId}`);
        }
        return { ok: true, deactivated: true };
      }

      // Sem dados vinculados: remove atendente e login juntos (atômico)
      const stmts: [BatchItem<'pg'>, ...BatchItem<'pg'>[]] = [db.delete(sellers).where(eq(sellers.id, seller.id))];
      if (hasUser) stmts.push(db.delete(users).where(eq(users.id, seller.userId)));
      await db.batch(stmts);
      invalidateSellersCache();
      if (hasUser) {
        invalidateUserCache(seller.userId);
        cacheInvalidate(`auth:me:${seller.userId}`);
      }
      return { ok: true, deactivated: false };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      department: z.string().optional(),
      dailyGoal: z.number().optional(),
      workHoursGoal: z.number().min(1).max(24).optional(),
      status: z.enum(['active', 'inactive']).optional(),
      emailSignatureHtml: z.string().max(10000).optional(),
      emailSignatureImageUrl: z.string().max(1000).optional(),
      emailSignatureEnabled: z.boolean().optional(),
      emailMarketingEnabled: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, email: newEmailRaw, ...data } = input;
      const [existing] = await db.select().from(sellers).where(eq(sellers.id, id));
      if (!existing) throw new Error('Atendente não encontrado');

      // Valida TUDO antes de gravar qualquer coisa
      const newName = data.name?.trim();
      const renamed = !!newName && newName !== existing.name;
      const newEmail = newEmailRaw ? normalizeEmail(newEmailRaw) : undefined;
      const emailChanged = !!newEmail && newEmail !== existing.email.trim().toLowerCase();
      if (emailChanged) {
        const [emailTaken] = await db.select({ id: users.id }).from(users)
          .where(and(emailEquals(users.email, newEmail!), ne(users.id, existing.userId))).limit(1);
        if (emailTaken) throw new Error('Este email já está em uso por outro usuário');
      }
      if (data.emailSignatureHtml !== undefined) {
        data.emailSignatureHtml = sanitizeSignatureHtml(data.emailSignatureHtml);
      }

      const sellerUpdate: Record<string, unknown> = { ...data };
      if (renamed) sellerUpdate.name = newName;
      else delete sellerUpdate.name;
      if (emailChanged) sellerUpdate.email = newEmail;

      // Atendente + tarefas + login mudam juntos (db.batch é atômico no neon-http)
      const stmts: [BatchItem<'pg'>, ...BatchItem<'pg'>[]] = [
        db.update(sellers).set(sellerUpdate).where(eq(sellers.id, id)).returning(),
      ];
      if (renamed) {
        stmts.push(db.update(tasks).set({ assignedTo: newName }).where(assignedToIs(existing.name)));
      }
      const userUpdate: { name?: string; email?: string } = {};
      // tasks.create usa o nome de users (contexto) como assignedTo: mantém igual ao novo
      if (renamed && existing.userId > 0) userUpdate.name = newName;
      if (emailChanged) userUpdate.email = newEmail;
      if (existing.userId > 0 && Object.keys(userUpdate).length > 0) {
        stmts.push(db.update(users).set(userUpdate).where(eq(users.id, existing.userId)));
      }
      const [sellerRows] = await db.batch(stmts) as [Array<typeof sellers.$inferSelect>, ...unknown[]];
      const updated = sellerRows[0];

      invalidateSellersCache();
      invalidateUserCache(existing.userId);
      cacheInvalidate(`auth:me:${existing.userId}`);
      cacheInvalidate(`user:${existing.userId}`);
      return updated;
    }),

  // role: 'admin' (acesso total — não concedido por aqui, só manualmente no banco; por isso
  // o input só aceita manager/user),
  // 'manager' (atendente promovido: dashboard, próprias tarefas, e-mail marketing e
  // faturamento completos, sem IA nem gestão de atendentes/clientes), 'user' (atendente).
  updateRole: adminProcedure
    .input(z.object({
      sellerId: z.number(),
      role: z.enum(['manager', 'user']),
    }))
    .mutation(async ({ input }) => {
      const [seller] = await db.select().from(sellers).where(eq(sellers.id, input.sellerId));
      if (!seller) throw new Error('Atendente não encontrado');
      if (seller.userId <= 0) throw new Error('Atendente sem conta de acesso');
      // Nunca deixa o sistema sem administrador: rebaixar o último admin é bloqueado
      const [target] = await db.select({ role: users.role }).from(users).where(eq(users.id, seller.userId));
      if (target?.role === 'admin') {
        const [{ n }] = await db.select({ n: count() }).from(users).where(eq(users.role, 'admin'));
        if (Number(n) <= 1) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível rebaixar o último administrador' });
        }
      }
      const [updated] = await db.update(users).set({ role: input.role }).where(eq(users.id, seller.userId)).returning();
      invalidateUserCache(seller.userId);
      cacheInvalidate(`auth:me:${seller.userId}`);
      return updated;
    }),

  listWithRole: adminProcedure.query(async () => {
    return db
      .select({
        id: sellers.id,
        userId: sellers.userId,
        name: sellers.name,
        email: sellers.email,
        phone: sellers.phone,
        department: sellers.department,
        dailyGoal: sellers.dailyGoal,
        workHoursGoal: sellers.workHoursGoal,
        status: sellers.status,
        emailSignatureHtml: sellers.emailSignatureHtml,
        emailSignatureImageUrl: sellers.emailSignatureImageUrl,
        emailSignatureEnabled: sellers.emailSignatureEnabled,
        emailMarketingEnabled: sellers.emailMarketingEnabled,
        createdAt: sellers.createdAt,
        updatedAt: sellers.updatedAt,
        userRole: users.role,
        ipRestrictionEnabled: users.ipRestrictionEnabled,
        allowedIps: users.allowedIps,
        lastLoginIp: users.lastLoginIp,
        lastLoginAt: users.lastLoginAt,
      })
      .from(sellers)
      .leftJoin(users, eq(sellers.userId, users.id))
      .orderBy(sellers.name);
  }),

  myProfile: protectedProcedure.query(async ({ ctx }) => {
    const [seller] = await db.select().from(sellers).where(eq(sellers.userId, ctx.user.id)).limit(1);
    return seller ?? null;
  }),

  // Restrito a admin/manager — atendentes comuns não configuram a própria
  // assinatura (é o admin quem cadastra, em /attendants). Cria o registro em
  // `sellers` automaticamente se o admin ainda não tiver um (ex.: conta criada
  // direto como admin, nunca passou por sellers.create).
  updateMySignature: staffProcedure
    .input(z.object({
      emailSignatureHtml: z.string().max(10000),
      emailSignatureImageUrl: z.string().max(1000).optional(),
      emailSignatureEnabled: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      let [seller] = await db.select({ id: sellers.id }).from(sellers).where(eq(sellers.userId, ctx.user.id)).limit(1);
      if (!seller) {
        [seller] = await db.insert(sellers).values({
          userId: ctx.user.id,
          name: ctx.user.name,
          email: ctx.user.email,
        }).returning({ id: sellers.id });
      }

      const [updated] = await db.update(sellers).set({
        emailSignatureHtml: sanitizeSignatureHtml(input.emailSignatureHtml),
        emailSignatureImageUrl: input.emailSignatureImageUrl,
        emailSignatureEnabled: input.emailSignatureEnabled,
      }).where(eq(sellers.id, seller.id)).returning();

      invalidateSellersCache();
      cacheInvalidate(`auth:me:${ctx.user.id}`);
      return updated;
    }),

  getIpRestriction: adminProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input }) => {
      const [user] = await db
        .select({ ipRestrictionEnabled: users.ipRestrictionEnabled, allowedIps: users.allowedIps })
        .from(users)
        .where(eq(users.id, input.userId));
      return user ?? { ipRestrictionEnabled: false, allowedIps: [] };
    }),

  setIpRestriction: adminProcedure
    .input(z.object({
      userId: z.number(),
      enabled: z.boolean(),
      allowedIps: z.array(z.string().min(1).max(45)).max(20),
    }))
    .mutation(async ({ input }) => {
      const cleaned = input.allowedIps
        .map(ip => ip.trim())
        .filter(ip => /^[\da-fA-F.:\/]+$/.test(ip));
      // Ligar a restrição sem nenhum IP salvo faz o createContext pular a checagem
      // inteira (allowedIps.length > 0) — vira uma restrição "ligada" que não bloqueia
      // ninguém, silenciosamente. Bloqueia esse estado aqui.
      if (input.enabled && cleaned.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Adicione ao menos um IP antes de ativar a restrição' });
      }
      await db.update(users)
        .set({ ipRestrictionEnabled: input.enabled, allowedIps: cleaned })
        .where(eq(users.id, input.userId));
      invalidateUserCache(input.userId);
      cacheInvalidate(`auth:me:${input.userId}`);
      return { ok: true };
    }),
});
