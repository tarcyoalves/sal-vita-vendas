import { z } from 'zod';
import crypto from 'crypto';
import { eq, and, inArray, isNotNull, ne, desc, count, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../trpc';
import { db } from '../db';
import {
  emailTemplates, emailCampaigns, emailCampaignRecipients, emailSuppressions,
  tasks, clients, sellers,
} from '../db/schema';
import { pickAccount, sendBatch, layout, renderTemplate, type BatchMessage } from '../email/marketing';

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';

// Tasks are titled "NOME - EMPRESA - telefone - email - cidade - UF" — use the
// first segment as the recipient's display name for {nome} personalization.
function firstPart(title: string): string {
  return (title.split(' - ')[0] || title).trim();
}

interface AudienceRow {
  email: string;
  name: string;
  replyTo?: string;
  taskId?: number;
}

const audienceInput = z.object({
  source: z.enum(['leads', 'clients', 'both']).default('leads'),
  assignedTo: z.string().optional(),
});

async function buildAudience(opts: { source: 'leads' | 'clients' | 'both'; assignedTo?: string }): Promise<AudienceRow[]> {
  const rows: AudienceRow[] = [];

  if (opts.source === 'leads' || opts.source === 'both') {
    const sellerRows = await db.select({ name: sellers.name, email: sellers.email }).from(sellers);
    const sellerMap = new Map(sellerRows.map(s => [s.name.toLowerCase(), s.email]));

    const conditions = [isNotNull(tasks.email), ne(tasks.email, '')];
    if (opts.assignedTo) conditions.push(eq(tasks.assignedTo, opts.assignedTo));
    const taskRows = await db.select({
      id: tasks.id, email: tasks.email, title: tasks.title, assignedTo: tasks.assignedTo,
    }).from(tasks).where(and(...conditions));

    for (const t of taskRows) {
      if (!t.email) continue;
      rows.push({
        email: t.email.toLowerCase().trim(),
        name: firstPart(t.title),
        replyTo: t.assignedTo ? sellerMap.get(t.assignedTo.toLowerCase()) : undefined,
        taskId: t.id,
      });
    }
  }

  if (opts.source === 'clients' || opts.source === 'both') {
    const clientRows = await db.select({ email: clients.email, name: clients.name })
      .from(clients)
      .where(and(isNotNull(clients.email), ne(clients.email, ''), eq(clients.unsubscribed, false)));
    for (const c of clientRows) {
      if (!c.email) continue;
      rows.push({ email: c.email.toLowerCase().trim(), name: c.name });
    }
  }

  // Dedup by e-mail (first occurrence wins)
  const seen = new Set<string>();
  const deduped = rows.filter(r => {
    if (seen.has(r.email)) return false;
    seen.add(r.email);
    return true;
  });

  if (deduped.length === 0) return [];
  const suppressed = await db.select({ email: emailSuppressions.email }).from(emailSuppressions);
  const suppressedSet = new Set(suppressed.map(s => s.email.toLowerCase()));
  return deduped.filter(r => !suppressedSet.has(r.email));
}

export const emailMarketingRouter = router({
  // ── Templates ──────────────────────────────────────────────────────────────
  listTemplates: adminProcedure.query(async () => {
    return db.select().from(emailTemplates).orderBy(emailTemplates.name);
  }),

  upsertTemplate: adminProcedure
    .input(z.object({
      id: z.number().optional(),
      slug: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      subject: z.string().min(1).max(300),
      htmlBody: z.string().min(1),
      active: z.boolean().optional().default(true),
    }))
    .mutation(async ({ input }) => {
      if (input.id) {
        const { id, ...data } = input;
        const [updated] = await db.update(emailTemplates)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(emailTemplates.id, id))
          .returning();
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Template não encontrado' });
        return updated;
      }
      const [created] = await db.insert(emailTemplates).values(input).returning();
      return created;
    }),

  deleteTemplate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(emailTemplates).where(eq(emailTemplates.id, input.id));
      return { ok: true };
    }),

  // ── Audience / segmentação ────────────────────────────────────────────────
  audiencePreview: adminProcedure
    .input(audienceInput)
    .query(async ({ input }) => {
      const rows = await buildAudience(input);
      return { count: rows.length, sample: rows.slice(0, 20).map(r => ({ email: r.email, name: r.name })) };
    }),

  // ── Campanhas ──────────────────────────────────────────────────────────────
  listCampaigns: adminProcedure.query(async () => {
    return db.select().from(emailCampaigns).orderBy(desc(emailCampaigns.createdAt));
  }),

  createCampaign: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      subject: z.string().min(1).max(300),
      htmlBody: z.string().min(1),
      source: z.enum(['leads', 'clients', 'both']).default('leads'),
      assignedTo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const audience = await buildAudience(input);

      const [campaign] = await db.insert(emailCampaigns).values({
        name: input.name,
        subject: input.subject,
        htmlBody: input.htmlBody,
        totalRecipients: audience.length,
        createdByUserId: ctx.user.id,
      }).returning();

      if (audience.length > 0) {
        await db.insert(emailCampaignRecipients).values(audience.map(r => ({
          campaignId: campaign.id,
          email: r.email,
          name: r.name,
          replyTo: r.replyTo,
          taskId: r.taskId,
          unsubToken: crypto.randomUUID(),
        })));
      }

      return campaign;
    }),

  // Used by the Tasks page: add selected tasks (leads) directly to a draft campaign.
  addRecipientsFromTasks: adminProcedure
    .input(z.object({ campaignId: z.number(), taskIds: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, input.campaignId));
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campanha não encontrada' });

      const sellerRows = await db.select({ name: sellers.name, email: sellers.email }).from(sellers);
      const sellerMap = new Map(sellerRows.map(s => [s.name.toLowerCase(), s.email]));

      const taskRows = await db.select({ id: tasks.id, email: tasks.email, title: tasks.title, assignedTo: tasks.assignedTo })
        .from(tasks).where(inArray(tasks.id, input.taskIds));

      const existing = await db.select({ email: emailCampaignRecipients.email })
        .from(emailCampaignRecipients).where(eq(emailCampaignRecipients.campaignId, input.campaignId));
      const existingSet = new Set(existing.map(e => e.email.toLowerCase()));

      const suppressed = await db.select({ email: emailSuppressions.email }).from(emailSuppressions);
      const suppressedSet = new Set(suppressed.map(s => s.email.toLowerCase()));

      const toInsert: (typeof emailCampaignRecipients.$inferInsert)[] = [];
      const seen = new Set<string>();
      let skippedNoEmail = 0;

      for (const t of taskRows) {
        if (!t.email) { skippedNoEmail++; continue; }
        const email = t.email.toLowerCase().trim();
        if (existingSet.has(email) || suppressedSet.has(email) || seen.has(email)) continue;
        seen.add(email);
        toInsert.push({
          campaignId: input.campaignId,
          email,
          name: firstPart(t.title),
          replyTo: t.assignedTo ? sellerMap.get(t.assignedTo.toLowerCase()) : undefined,
          taskId: t.id,
          unsubToken: crypto.randomUUID(),
        });
      }

      if (toInsert.length > 0) {
        await db.insert(emailCampaignRecipients).values(toInsert);
        await db.update(emailCampaigns)
          .set({ totalRecipients: sql`${emailCampaigns.totalRecipients} + ${toInsert.length}`, updatedAt: new Date() })
          .where(eq(emailCampaigns.id, input.campaignId));
      }

      return {
        added: toInsert.length,
        skippedNoEmail,
        skippedDuplicateOrSuppressed: taskRows.length - toInsert.length - skippedNoEmail,
      };
    }),

  getCampaign: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, input.id));
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campanha não encontrada' });
      const recipients = await db.select().from(emailCampaignRecipients)
        .where(eq(emailCampaignRecipients.campaignId, input.id))
        .orderBy(emailCampaignRecipients.id)
        .limit(500);
      return { campaign, recipients };
    }),

  deleteCampaign: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(emailCampaignRecipients).where(eq(emailCampaignRecipients.campaignId, input.id));
      await db.delete(emailCampaigns).where(eq(emailCampaigns.id, input.id));
      return { ok: true };
    }),

  // ── Motor de envio (polling) ──────────────────────────────────────────────
  // Sends ONE batch (≤100, bounded by the active account's remaining daily
  // quota) and returns. The frontend calls this in a loop until done:true —
  // this keeps each call well under Vercel's serverless timeout.
  processBatch: adminProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input }) => {
      const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, input.campaignId));
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campanha não encontrada' });

      const [pendingRow] = await db.select({ cnt: count() })
        .from(emailCampaignRecipients)
        .where(and(eq(emailCampaignRecipients.campaignId, input.campaignId), eq(emailCampaignRecipients.status, 'pending')));
      const pendingCount = Number(pendingRow?.cnt ?? 0);

      if (pendingCount === 0) {
        await db.update(emailCampaigns).set({ status: 'sent', updatedAt: new Date() }).where(eq(emailCampaigns.id, input.campaignId));
        return { done: true, sentNow: 0, failedNow: 0, remaining: 0 } as const;
      }

      const picked = await pickAccount();
      if (!picked) {
        return { done: false, sentNow: 0, failedNow: 0, remaining: pendingCount, reason: 'daily_limit_all' as const };
      }

      const batchSize = Math.min(100, picked.remaining, pendingCount);
      const recipients = await db.select().from(emailCampaignRecipients)
        .where(and(eq(emailCampaignRecipients.campaignId, input.campaignId), eq(emailCampaignRecipients.status, 'pending')))
        .limit(batchSize);

      // Re-check suppressions added since the campaign was created
      const suppressed = await db.select({ email: emailSuppressions.email }).from(emailSuppressions);
      const suppressedSet = new Set(suppressed.map(s => s.email.toLowerCase()));
      const toSend = recipients.filter(r => !suppressedSet.has(r.email.toLowerCase()));
      const toSkip = recipients.filter(r => suppressedSet.has(r.email.toLowerCase()));

      for (const r of toSkip) {
        await db.update(emailCampaignRecipients).set({ status: 'skipped', error: 'suppressed' }).where(eq(emailCampaignRecipients.id, r.id));
      }

      let sentNow = 0, failedNow = 0;
      if (toSend.length > 0) {
        const messages: BatchMessage[] = toSend.map(r => {
          const unsubUrl = `${PUBLIC_APP_URL}/api/unsubscribe?t=${r.unsubToken}`;
          return {
            to: r.email,
            subject: renderTemplate(campaign.subject, { nome: r.name ?? '' }),
            html: layout(renderTemplate(campaign.htmlBody, { nome: r.name ?? '', unsubscribe: unsubUrl }), unsubUrl),
            replyTo: r.replyTo ?? undefined,
            unsubToken: r.unsubToken,
          };
        });

        const results = await sendBatch(picked.account, messages);
        for (let i = 0; i < toSend.length; i++) {
          const r = toSend[i];
          const res = results[i];
          if (res.ok) {
            sentNow++;
            await db.update(emailCampaignRecipients)
              .set({ status: 'sent', accountKey: picked.account.key, messageId: res.messageId, sentAt: new Date() })
              .where(eq(emailCampaignRecipients.id, r.id));
          } else {
            failedNow++;
            await db.update(emailCampaignRecipients)
              .set({ status: 'failed', accountKey: picked.account.key, error: res.error })
              .where(eq(emailCampaignRecipients.id, r.id));
          }
        }
      }

      await db.update(emailCampaigns).set({
        sentCount: sql`${emailCampaigns.sentCount} + ${sentNow}`,
        failedCount: sql`${emailCampaigns.failedCount} + ${failedNow}`,
        status: 'sending',
        updatedAt: new Date(),
      }).where(eq(emailCampaigns.id, input.campaignId));

      const remaining = Math.max(0, pendingCount - sentNow - failedNow - toSkip.length);
      if (remaining === 0) {
        await db.update(emailCampaigns).set({ status: 'sent', updatedAt: new Date() }).where(eq(emailCampaigns.id, input.campaignId));
      }

      return { done: remaining === 0, sentNow, failedNow, remaining, account: picked.account.key };
    }),

  // ── Descadastrados ─────────────────────────────────────────────────────────
  listSuppressions: adminProcedure.query(async () => {
    return db.select().from(emailSuppressions).orderBy(desc(emailSuppressions.createdAt)).limit(500);
  }),

  addSuppression: adminProcedure
    .input(z.object({ email: z.string().email(), reason: z.string().optional().default('manual') }))
    .mutation(async ({ input }) => {
      await db.insert(emailSuppressions)
        .values({ email: input.email.toLowerCase().trim(), reason: input.reason })
        .onConflictDoNothing();
      return { ok: true };
    }),
});
