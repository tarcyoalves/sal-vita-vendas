import { z } from 'zod';
import crypto from 'crypto';
import { eq, and, or, inArray, isNotNull, isNull, ne, desc, asc, count, gte, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure, protectedProcedure } from '../trpc';
import { db } from '../db';
import {
  emailTemplates, emailCampaigns, emailCampaignRecipients, emailSuppressions,
  emailSequences, emailSequenceSteps, emailSequenceEnrollments, emailSequenceSends,
  emailEvents, automationRules, emailSendCounters,
  tasks, clients, sellers,
} from '../db/schema';
import { pickAccount, sendBatch, layout, renderTemplate, renderSignature, getUsage, type BatchMessage } from '../email/marketing';
import { enrollInSequence } from '../email/automations';
import { userTaskFilter } from './tasks';

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';
const MKT_DAILY_LIMIT = parseInt(process.env.RESEND_MKT_DAILY_LIMIT ?? '90');

// Tasks are titled "NOME - EMPRESA - telefone - email - cidade - UF" — use the
// first segment as the recipient's display name for {nome} personalization.
function firstPart(title: string): string {
  return (title.split(' - ')[0] || title).trim();
}

// Third segment of the title is the phone number (same convention as firstPart).
function phonePart(title: string): string | null {
  return title.split(' - ')[2]?.trim() || null;
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
  tags: z.array(z.string()).optional(),
});

async function buildAudience(opts: { source: 'leads' | 'clients' | 'both'; assignedTo?: string; tags?: string[] }): Promise<AudienceRow[]> {
  const rows: AudienceRow[] = [];

  if (opts.source === 'leads' || opts.source === 'both') {
    const sellerRows = await db.select({ name: sellers.name, email: sellers.email }).from(sellers);
    const sellerMap = new Map(sellerRows.map(s => [s.name.toLowerCase(), s.email]));

    // Só e-mails confirmados manualmente pelo atendente entram no público.
    const conditions = [isNotNull(tasks.email), ne(tasks.email, ''), eq(tasks.emailConfirmed, true)];
    if (opts.assignedTo) conditions.push(eq(tasks.assignedTo, opts.assignedTo));
    // Postgres array overlap operator: matches tasks that have at least one of the given tags.
    if (opts.tags && opts.tags.length > 0) {
      conditions.push(sql`${tasks.tags} && ARRAY[${sql.join(opts.tags.map(t => sql`${t}`), sql`, `)}]::text[]`);
    }
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

// Loads each seller's e-mail signature (when enabled) keyed by their e-mail
// (lowercase) — matches `replyTo`, which is already resolved from `assignedTo`
// via `sellerMap` at audience-build time. Used to inject `signatureHtml` into
// `layout()` at send time, for both campaigns and sequences.
// Cached briefly: campaign/sequence sends call this once per batch, and a warm
// serverless instance would otherwise re-fetch all signature HTML from `sellers`
// on every batch of the same run.
let signatureMapCache: { map: Map<string, string>; expiresAt: number } | null = null;
const SIGNATURE_MAP_TTL_MS = 5 * 60 * 1000;

async function buildSignatureMap(): Promise<Map<string, string>> {
  if (signatureMapCache && signatureMapCache.expiresAt > Date.now()) {
    return signatureMapCache.map;
  }

  const rows = await db.select({
    name: sellers.name, email: sellers.email, phone: sellers.phone, department: sellers.department,
    sig: sellers.emailSignatureHtml, sigOn: sellers.emailSignatureEnabled,
  }).from(sellers);

  const map = new Map<string, string>();
  for (const s of rows) {
    if (!s.sigOn || !s.sig) continue;
    map.set(s.email.toLowerCase(), renderSignature(s.sig, s));
  }

  signatureMapCache = { map, expiresAt: Date.now() + SIGNATURE_MAP_TTL_MS };
  return map;
}

// Same UNION-join used by `engagementByTaskIds`, but restricted to events on or
// after `windowStart` — used by `exportLeads` to filter by recent engagement.
async function exportEngagementBatch(
  taskIds: number[],
  windowStart: Date,
): Promise<Map<number, { opens: number; clicks: number; lastEventAt: string | null }>> {
  const out = new Map<number, { opens: number; clicks: number; lastEventAt: string | null }>();
  if (taskIds.length === 0) return out;

  const result = await db.execute<{ task_id: number; opens: number; clicks: number; last_event_at: string }>(sql`
    WITH msgs AS (
      SELECT task_id, message_id FROM ${emailCampaignRecipients}
      WHERE task_id IN (${sql.join(taskIds.map(id => sql`${id}`), sql`, `)})
        AND message_id IS NOT NULL
      UNION ALL
      SELECT en.task_id, sd.message_id
      FROM ${emailSequenceSends} sd
      INNER JOIN ${emailSequenceEnrollments} en ON en.id = sd.enrollment_id
      WHERE en.task_id IN (${sql.join(taskIds.map(id => sql`${id}`), sql`, `)})
        AND sd.message_id IS NOT NULL
    )
    SELECT
      m.task_id,
      COUNT(*) FILTER (WHERE e.event_type = 'opened')::int AS opens,
      COUNT(*) FILTER (WHERE e.event_type = 'clicked')::int AS clicks,
      MAX(e.created_at) AS last_event_at
    FROM msgs m
    INNER JOIN ${emailEvents} e ON e.message_id = m.message_id AND e.created_at >= ${windowStart}
    GROUP BY m.task_id
  `);

  for (const row of result.rows) {
    out.set(Number(row.task_id), {
      opens: Number(row.opens),
      clicks: Number(row.clicks),
      lastEventAt: row.last_event_at ?? null,
    });
  }
  return out;
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
      tags: z.array(z.string()).optional(),
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

  // ── Disparo Rápido (Broadcast) ──────────────────────────────────────────────
  // Envio avulso: lista manual de e-mails + anexos opcionais. Cria uma campanha
  // (is_broadcast) e seus destinatários; o envio reusa o motor processBatch.
  sendBroadcast: adminProcedure
    .input(z.object({
      name: z.string().max(200).optional(),
      subject: z.string().min(1).max(300),
      htmlBody: z.string().min(1),
      replyTo: z.string().email().optional(),
      recipients: z.array(z.object({
        email: z.string().email(),
        name: z.string().optional(),
      })).max(2000).optional(),
      audienceSource: z.enum(['leads', 'clients', 'both']).optional(),
      audienceAssignedTo: z.string().optional(),
      audienceTags: z.array(z.string()).optional(),
      attachments: z.array(z.object({
        filename: z.string().min(1).max(255),
        content: z.string().min(1), // base64
      })).max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.attachments && input.attachments.length > 0) {
        const totalBase64 = input.attachments.reduce((sum, a) => sum + a.content.length, 0);
        if (totalBase64 > 3_500_000) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Anexos muito grandes (máx. ~3,5 MB no total). Reduza ou envie um link.' });
        }
      }

      let allRecipients: { email: string; name?: string }[] = [];

      if (input.audienceSource) {
        const audience = await buildAudience({
          source: input.audienceSource,
          assignedTo: input.audienceAssignedTo,
          tags: input.audienceTags,
        });
        allRecipients.push(...audience.map(r => ({ email: r.email, name: r.name })));
      }

      if (input.recipients && input.recipients.length > 0) {
        allRecipients.push(...input.recipients);
      }

      if (allRecipients.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum destinatário. Adicione e-mails manualmente ou selecione uma audiência.' });
      }

      const suppressed = await db.select({ email: emailSuppressions.email }).from(emailSuppressions);
      const suppressedSet = new Set(suppressed.map(s => s.email.toLowerCase()));

      const seen = new Set<string>();
      const clean: { email: string; name?: string }[] = [];
      let skippedSuppressed = 0;
      let skippedDuplicate = 0;
      for (const r of allRecipients) {
        const email = r.email.toLowerCase().trim();
        if (seen.has(email)) { skippedDuplicate++; continue; }
        seen.add(email);
        if (suppressedSet.has(email)) { skippedSuppressed++; continue; }
        clean.push({ email, name: r.name?.trim() || undefined });
      }

      if (clean.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum destinatário válido (todos duplicados ou descadastrados).' });
      }

      const [campaign] = await db.insert(emailCampaigns).values({
        name: input.name?.trim() || `Disparo ${new Date().toLocaleDateString('pt-BR')}`,
        subject: input.subject,
        htmlBody: input.htmlBody,
        isBroadcast: true,
        attachments: input.attachments && input.attachments.length > 0 ? input.attachments : null,
        totalRecipients: clean.length,
        createdByUserId: ctx.user.id,
      }).returning();

      await db.insert(emailCampaignRecipients).values(clean.map(r => ({
        campaignId: campaign.id,
        email: r.email,
        name: r.name,
        replyTo: input.replyTo,
        unsubToken: crypto.randomUUID(),
      })));

      return {
        campaignId: campaign.id,
        recipientCount: clean.length,
        skippedSuppressed,
        skippedDuplicate,
      };
    }),

  // Used by the Tasks page: add selected tasks (leads) directly to a draft campaign.
  addRecipientsFromTasks: adminProcedure
    .input(z.object({ campaignId: z.number(), taskIds: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, input.campaignId));
      if (!campaign) throw new TRPCError({ code: 'NOT_FOUND', message: 'Campanha não encontrada' });

      const sellerRows = await db.select({ name: sellers.name, email: sellers.email }).from(sellers);
      const sellerMap = new Map(sellerRows.map(s => [s.name.toLowerCase(), s.email]));

      const taskRows = await db.select({ id: tasks.id, email: tasks.email, title: tasks.title, assignedTo: tasks.assignedTo, emailConfirmed: tasks.emailConfirmed })
        .from(tasks).where(inArray(tasks.id, input.taskIds));

      const existing = await db.select({ email: emailCampaignRecipients.email })
        .from(emailCampaignRecipients).where(eq(emailCampaignRecipients.campaignId, input.campaignId));
      const existingSet = new Set(existing.map(e => e.email.toLowerCase()));

      const suppressed = await db.select({ email: emailSuppressions.email }).from(emailSuppressions);
      const suppressedSet = new Set(suppressed.map(s => s.email.toLowerCase()));

      const toInsert: (typeof emailCampaignRecipients.$inferInsert)[] = [];
      const seen = new Set<string>();
      let skippedNoEmail = 0;
      let skippedUnconfirmed = 0;

      for (const t of taskRows) {
        if (!t.email) { skippedNoEmail++; continue; }
        if (!t.emailConfirmed) { skippedUnconfirmed++; continue; }
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
        skippedUnconfirmed,
        skippedDuplicateOrSuppressed: taskRows.length - toInsert.length - skippedNoEmail - skippedUnconfirmed,
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

      // Broadcasts may carry file attachments (base64) — applied to every message.
      const campaignAttachments = (campaign.attachments as { filename: string; content: string }[] | null) ?? undefined;

      let sentNow = 0, failedNow = 0;
      if (toSend.length > 0) {
        const signatureMap = await buildSignatureMap();
        const messages: BatchMessage[] = toSend.map(r => {
          const unsubUrl = `${PUBLIC_APP_URL}/api/unsubscribe?t=${r.unsubToken}`;
          const signatureHtml = r.replyTo ? signatureMap.get(r.replyTo.toLowerCase()) : undefined;
          return {
            to: r.email,
            subject: renderTemplate(campaign.subject, { nome: r.name ?? '' }),
            html: layout(renderTemplate(campaign.htmlBody, { nome: r.name ?? '', unsubscribe: unsubUrl }), unsubUrl, signatureHtml),
            replyTo: r.replyTo ?? undefined,
            unsubToken: r.unsubToken,
            attachments: campaignAttachments,
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
        // Clear stored attachments once finished to keep the DB lean.
        await db.update(emailCampaigns).set({ status: 'sent', attachments: null, updatedAt: new Date() }).where(eq(emailCampaigns.id, input.campaignId));
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

  // ── Tags ───────────────────────────────────────────────────────────────────
  // Autocomplete: distinct tags currently used across tasks.tags.
  listTags: adminProcedure.query(async () => {
    const result = await db.execute<{ tag: string }>(sql`
      SELECT DISTINCT unnest(${tasks.tags}) AS tag
      FROM ${tasks}
      WHERE array_length(${tasks.tags}, 1) > 0
      ORDER BY 1
    `);
    return result.rows.map(r => r.tag);
  }),

  // ── Sequências ────────────────────────────────────────────────────────────
  listSequences: adminProcedure.query(async () => {
    const sequencesRows = await db.select().from(emailSequences).orderBy(desc(emailSequences.createdAt));
    if (sequencesRows.length === 0) return [];

    const [activeCounts, stepCounts] = await Promise.all([
      db.select({ sequenceId: emailSequenceEnrollments.sequenceId, cnt: count() })
        .from(emailSequenceEnrollments)
        .where(eq(emailSequenceEnrollments.status, 'active'))
        .groupBy(emailSequenceEnrollments.sequenceId),
      db.select({ sequenceId: emailSequenceSteps.sequenceId, cnt: count() })
        .from(emailSequenceSteps)
        .groupBy(emailSequenceSteps.sequenceId),
    ]);
    const activeMap = new Map(activeCounts.map(r => [r.sequenceId, Number(r.cnt)]));
    const stepMap = new Map(stepCounts.map(r => [r.sequenceId, Number(r.cnt)]));

    return sequencesRows.map(s => ({
      ...s,
      activeEnrollments: activeMap.get(s.id) ?? 0,
      stepCount: stepMap.get(s.id) ?? 0,
    }));
  }),

  upsertSequence: adminProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      active: z.boolean().optional().default(true),
      // E-mail Marketing Fase 3 — sequências recorrentes (loop mensal).
      repeat: z.boolean().optional().default(false),
      repeatIntervalDays: z.number().int().min(1).max(365).optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.repeat && !input.repeatIntervalDays) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Informe o intervalo (em dias) para reiniciar a sequência.' });
      }
      if (input.id) {
        const { id, ...data } = input;
        const [updated] = await db.update(emailSequences)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(emailSequences.id, id))
          .returning();
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sequência não encontrada' });
        return updated;
      }
      const [created] = await db.insert(emailSequences).values(input).returning();
      return created;
    }),

  deleteSequence: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [activeRow] = await db.select({ cnt: count() })
        .from(emailSequenceEnrollments)
        .where(and(eq(emailSequenceEnrollments.sequenceId, input.id), eq(emailSequenceEnrollments.status, 'active')));
      if (Number(activeRow?.cnt ?? 0) > 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Não é possível excluir: há inscrições ativas nesta sequência. Cancele-as primeiro.' });
      }
      await db.delete(emailSequenceSends).where(
        inArray(emailSequenceSends.enrollmentId,
          db.select({ id: emailSequenceEnrollments.id }).from(emailSequenceEnrollments).where(eq(emailSequenceEnrollments.sequenceId, input.id)),
        ),
      );
      await db.delete(emailSequenceEnrollments).where(eq(emailSequenceEnrollments.sequenceId, input.id));
      await db.delete(emailSequenceSteps).where(eq(emailSequenceSteps.sequenceId, input.id));
      await db.delete(emailSequences).where(eq(emailSequences.id, input.id));
      return { ok: true };
    }),

  // ── Passos da sequência ───────────────────────────────────────────────────
  listSequenceSteps: adminProcedure
    .input(z.object({ sequenceId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(emailSequenceSteps)
        .where(eq(emailSequenceSteps.sequenceId, input.sequenceId))
        .orderBy(asc(emailSequenceSteps.stepOrder));
    }),

  upsertSequenceStep: adminProcedure
    .input(z.object({
      id: z.number().optional(),
      sequenceId: z.number(),
      stepOrder: z.number().int().min(1),
      delayDays: z.number().int().min(0),
      subject: z.string().min(1).max(300),
      htmlBody: z.string().min(1),
      // E-mail Marketing Fase 3 — condição de envio (ramificação por engajamento).
      sendCondition: z.enum(['always', 'if_opened', 'if_not_opened', 'if_clicked', 'if_not_clicked']).optional().default('always'),
    }))
    .mutation(async ({ input }) => {
      if (input.id) {
        const { id, ...data } = input;
        const [updated] = await db.update(emailSequenceSteps)
          .set(data)
          .where(eq(emailSequenceSteps.id, id))
          .returning();
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Passo não encontrado' });
        return updated;
      }
      const [created] = await db.insert(emailSequenceSteps).values(input).returning();
      return created;
    }),

  deleteSequenceStep: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(emailSequenceSteps).where(eq(emailSequenceSteps.id, input.id));
      return { ok: true };
    }),

  // ── Inscrição manual de leads ────────────────────────────────────────────
  enrollTasksInSequence: adminProcedure
    .input(z.object({ sequenceId: z.number(), taskIds: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      const [sequence] = await db.select().from(emailSequences).where(eq(emailSequences.id, input.sequenceId));
      if (!sequence) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sequência não encontrada' });

      const sellerRows = await db.select({ name: sellers.name, email: sellers.email }).from(sellers);
      const sellerMap = new Map(sellerRows.map(s => [s.name.toLowerCase(), s.email]));

      const taskRows = await db.select({ id: tasks.id, email: tasks.email, title: tasks.title, assignedTo: tasks.assignedTo, emailConfirmed: tasks.emailConfirmed })
        .from(tasks).where(inArray(tasks.id, input.taskIds));

      let enrolled = 0;
      let skippedNoEmail = 0;
      let skippedUnconfirmed = 0;
      let skippedDuplicateOrSuppressed = 0;

      for (const t of taskRows) {
        if (!t.email) { skippedNoEmail++; continue; }
        if (!t.emailConfirmed) { skippedUnconfirmed++; continue; }
        const result = await enrollInSequence(input.sequenceId, {
          email: t.email,
          name: firstPart(t.title),
          replyTo: t.assignedTo ? sellerMap.get(t.assignedTo.toLowerCase()) : undefined,
          taskId: t.id,
        });
        if (result.enrolled) enrolled++;
        else skippedDuplicateOrSuppressed++;
      }

      return { enrolled, skippedNoEmail, skippedUnconfirmed, skippedDuplicateOrSuppressed };
    }),

  // ── Inscrições ────────────────────────────────────────────────────────────
  listEnrollments: adminProcedure
    .input(z.object({
      sequenceId: z.number(),
      status: z.enum(['active', 'paused', 'completed', 'cancelled']).optional(),
      limit: z.number().int().min(1).max(500).optional().default(100),
      offset: z.number().int().min(0).optional().default(0),
    }))
    .query(async ({ input }) => {
      const conditions = [eq(emailSequenceEnrollments.sequenceId, input.sequenceId)];
      if (input.status) conditions.push(eq(emailSequenceEnrollments.status, input.status));

      const [rows, totalRow] = await Promise.all([
        db.select().from(emailSequenceEnrollments)
          .where(and(...conditions))
          .orderBy(desc(emailSequenceEnrollments.enrolledAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ cnt: count() }).from(emailSequenceEnrollments).where(and(...conditions)),
      ]);

      return { rows, total: Number(totalRow[0]?.cnt ?? 0) };
    }),

  pauseEnrollment: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [updated] = await db.update(emailSequenceEnrollments)
        .set({ status: 'paused', updatedAt: new Date() })
        .where(eq(emailSequenceEnrollments.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
      return updated;
    }),

  resumeEnrollment: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [enrollment] = await db.select().from(emailSequenceEnrollments).where(eq(emailSequenceEnrollments.id, input.id));
      if (!enrollment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });

      // Recompute nextSendAt from the current step so a long pause doesn't
      // cause a flood of overdue sends the moment it's resumed.
      const steps = await db.select({ delayDays: emailSequenceSteps.delayDays })
        .from(emailSequenceSteps)
        .where(eq(emailSequenceSteps.sequenceId, enrollment.sequenceId))
        .orderBy(asc(emailSequenceSteps.stepOrder));

      const now = new Date();
      const hasNextStep = enrollment.currentStep < steps.length;
      const nextSendAt = hasNextStep ? now : null;
      const status = hasNextStep ? 'active' : 'completed';

      const [updated] = await db.update(emailSequenceEnrollments)
        .set({ status, nextSendAt, updatedAt: now })
        .where(eq(emailSequenceEnrollments.id, input.id))
        .returning();
      return updated;
    }),

  cancelEnrollment: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [updated] = await db.update(emailSequenceEnrollments)
        .set({ status: 'cancelled', nextSendAt: null, updatedAt: new Date() })
        .where(eq(emailSequenceEnrollments.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
      return updated;
    }),

  // ── Automações ────────────────────────────────────────────────────────────
  listAutomationRules: adminProcedure.query(async () => {
    return db.select().from(automationRules).orderBy(desc(automationRules.createdAt));
  }),

  upsertAutomationRule: adminProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(200),
      triggerType: z.enum(['lead_created', 'lead_converted', 'inactive_days']),
      triggerConfig: z.record(z.any()).optional(),
      actionType: z.enum(['enroll_sequence', 'add_tag']),
      actionConfig: z.record(z.any()),
      active: z.boolean().optional().default(true),
    }))
    .mutation(async ({ input }) => {
      const data = {
        name: input.name,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig ? JSON.stringify(input.triggerConfig) : null,
        actionType: input.actionType,
        actionConfig: JSON.stringify(input.actionConfig),
        active: input.active,
      };
      if (input.id) {
        const [updated] = await db.update(automationRules)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(automationRules.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Regra não encontrada' });
        return updated;
      }
      const [created] = await db.insert(automationRules).values(data).returning();
      return created;
    }),

  deleteAutomationRule: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(automationRules).where(eq(automationRules.id, input.id));
      return { ok: true };
    }),

  // ── Estatísticas ──────────────────────────────────────────────────────────
  campaignStats: adminProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      const result = await db.execute<{ event_type: string; cnt: number }>(sql`
        SELECT e.event_type, COUNT(*)::int AS cnt
        FROM ${emailEvents} e
        INNER JOIN ${emailCampaignRecipients} r ON r.message_id = e.message_id
        WHERE r.campaign_id = ${input.campaignId}
        GROUP BY e.event_type
      `);
      const counts: Record<string, number> = {};
      for (const row of result.rows) counts[row.event_type] = Number(row.cnt);
      return {
        delivered: counts.delivered ?? 0,
        opened: counts.opened ?? 0,
        clicked: counts.clicked ?? 0,
        bounced: counts.bounced ?? 0,
        complained: counts.complained ?? 0,
      };
    }),

  sequenceStats: adminProcedure
    .input(z.object({ sequenceId: z.number() }))
    .query(async ({ input }) => {
      const steps = await db.select().from(emailSequenceSteps)
        .where(eq(emailSequenceSteps.sequenceId, input.sequenceId))
        .orderBy(asc(emailSequenceSteps.stepOrder));
      if (steps.length === 0) return [];

      const result = await db.execute<{ step_id: number; sent: number; skipped: number; opened: number; clicked: number }>(sql`
        SELECT
          s.step_id,
          COUNT(*) FILTER (WHERE s.status = 'sent')::int AS sent,
          COUNT(*) FILTER (WHERE s.status = 'skipped')::int AS skipped,
          COUNT(DISTINCT e_opened.id)::int AS opened,
          COUNT(DISTINCT e_clicked.id)::int AS clicked
        FROM ${emailSequenceSends} s
        LEFT JOIN ${emailEvents} e_opened
          ON e_opened.message_id = s.message_id AND e_opened.event_type = 'opened'
        LEFT JOIN ${emailEvents} e_clicked
          ON e_clicked.message_id = s.message_id AND e_clicked.event_type = 'clicked'
        WHERE s.step_id IN (${sql.join(steps.map(st => sql`${st.id}`), sql`, `)})
        GROUP BY s.step_id
      `);
      const statsMap = new Map(result.rows.map(r => [Number(r.step_id), {
        sent: Number(r.sent), skipped: Number(r.skipped), opened: Number(r.opened), clicked: Number(r.clicked),
      }]));

      return steps.map(step => ({
        stepId: step.id,
        stepOrder: step.stepOrder,
        delayDays: step.delayDays,
        subject: step.subject,
        sendCondition: step.sendCondition,
        ...(statsMap.get(step.id) ?? { sent: 0, skipped: 0, opened: 0, clicked: 0 }),
      }));
    }),

  usageStats: adminProcedure.query(async () => {
    const accounts = await getUsage();
    const totals = accounts.reduce(
      (acc, a) => ({
        sentToday: acc.sentToday + a.sentToday,
        dailyLimit: acc.dailyLimit + a.dailyLimit,
        sentThisMonth: acc.sentThisMonth + a.sentThisMonth,
        monthlyLimit: acc.monthlyLimit + a.monthlyLimit,
      }),
      { sentToday: 0, dailyLimit: 0, sentThisMonth: 0, monthlyLimit: 0 },
    );
    return {
      accounts,
      totals: {
        ...totals,
        remainingToday: Math.max(0, totals.dailyLimit - totals.sentToday),
        remainingMonth: Math.max(0, totals.monthlyLimit - totals.sentThisMonth),
      },
      hasAccounts: accounts.length > 0,
    };
  }),

  overviewStats: adminProcedure.query(async () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [campaignSentRow] = await db.select({ cnt: count() })
      .from(emailCampaignRecipients)
      .where(and(eq(emailCampaignRecipients.status, 'sent'), gte(emailCampaignRecipients.sentAt, thirtyDaysAgo)));

    const [sequenceSentRow] = await db.select({ cnt: count() })
      .from(emailSequenceSends)
      .where(and(eq(emailSequenceSends.status, 'sent'), gte(emailSequenceSends.sentAt, thirtyDaysAgo)));

    const eventCountsResult = await db.execute<{ event_type: string; cnt: number }>(sql`
      SELECT event_type, COUNT(*)::int AS cnt
      FROM ${emailEvents}
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY event_type
    `);
    const eventCounts: Record<string, number> = {};
    for (const row of eventCountsResult.rows) eventCounts[row.event_type] = Number(row.cnt);

    const [unsubRow] = await db.select({ cnt: count() })
      .from(emailSuppressions)
      .where(and(eq(emailSuppressions.reason, 'unsubscribe'), gte(emailSuppressions.createdAt, thirtyDaysAgo)));

    const totalSent = Number(campaignSentRow?.cnt ?? 0) + Number(sequenceSentRow?.cnt ?? 0);
    const opened = eventCounts.opened ?? 0;
    const clicked = eventCounts.clicked ?? 0;

    // Quota usada hoje: soma de email_send_counters de hoje, sobre nº de contas * limite diário
    const today = new Date().toISOString().slice(0, 10);
    const countersToday = await db.select({ accountKey: emailSendCounters.accountKey, sent: emailSendCounters.sent })
      .from(emailSendCounters)
      .where(eq(emailSendCounters.day, today));
    const usedToday = countersToday.reduce((sum, c) => sum + (c.sent ?? 0), 0);
    const accountCount = Math.max(1, countersToday.length || 1);
    const quotaToday = accountCount * MKT_DAILY_LIMIT;

    return {
      totalSent30d: totalSent,
      campaignSent30d: Number(campaignSentRow?.cnt ?? 0),
      sequenceSent30d: Number(sequenceSentRow?.cnt ?? 0),
      openRate: totalSent > 0 ? opened / totalSent : 0,
      clickRate: totalSent > 0 ? clicked / totalSent : 0,
      unsubscribed30d: Number(unsubRow?.cnt ?? 0),
      quotaUsedToday: usedToday,
      quotaTotalToday: quotaToday,
    };
  }),

  // ── Engajamento por lead (usado na tela de Tarefas) ──────────────────────
  // Single batched query — no N+1: for each taskId, aggregates opens/clicks
  // from email_events joined via message_id with both email_campaign_recipients
  // and email_sequence_sends (via email_sequence_enrollments).
  engagementByTaskIds: protectedProcedure
    .input(z.object({ taskIds: z.array(z.number()).max(500) }))
    .query(async ({ input }) => {
      if (input.taskIds.length === 0) return {};

      const result = await db.execute<{ task_id: number; opens: number; clicks: number; last_event_at: string }>(sql`
        WITH msgs AS (
          SELECT task_id, message_id FROM ${emailCampaignRecipients}
          WHERE task_id IN (${sql.join(input.taskIds.map(id => sql`${id}`), sql`, `)})
            AND message_id IS NOT NULL
          UNION ALL
          SELECT en.task_id, sd.message_id
          FROM ${emailSequenceSends} sd
          INNER JOIN ${emailSequenceEnrollments} en ON en.id = sd.enrollment_id
          WHERE en.task_id IN (${sql.join(input.taskIds.map(id => sql`${id}`), sql`, `)})
            AND sd.message_id IS NOT NULL
        )
        SELECT
          m.task_id,
          COUNT(*) FILTER (WHERE e.event_type = 'opened')::int AS opens,
          COUNT(*) FILTER (WHERE e.event_type = 'clicked')::int AS clicks,
          MAX(e.created_at) AS last_event_at
        FROM msgs m
        INNER JOIN ${emailEvents} e ON e.message_id = m.message_id
        GROUP BY m.task_id
      `);

      const out: Record<number, { opens: number; clicks: number; lastEventAt: string | null }> = {};
      for (const row of result.rows) {
        out[Number(row.task_id)] = {
          opens: Number(row.opens),
          clicks: Number(row.clicks),
          lastEventAt: row.last_event_at ?? null,
        };
      }
      return out;
    }),

  // ── Campanhas/sequências por lead (usado na tela de Tarefas) ────────────
  // Single batched query — no N+1: lista, para cada taskId, as campanhas em
  // que o lead é destinatário e as sequências em que está inscrito, para
  // exibir badges e permitir remoção direto no card da tarefa.
  enrollmentsByTaskIds: protectedProcedure
    .input(z.object({ taskIds: z.array(z.number()).max(500) }))
    .query(async ({ input }) => {
      const out: Record<number, {
        campaigns: { recipientId: number; campaignId: number; name: string; status: string }[];
        sequences: { enrollmentId: number; sequenceId: number; name: string; status: string; currentStep: number }[];
      }> = {};
      if (input.taskIds.length === 0) return out;

      const campaignRows = await db.select({
        recipientId: emailCampaignRecipients.id,
        campaignId: emailCampaignRecipients.campaignId,
        taskId: emailCampaignRecipients.taskId,
        status: emailCampaignRecipients.status,
        name: emailCampaigns.name,
      })
        .from(emailCampaignRecipients)
        .innerJoin(emailCampaigns, eq(emailCampaigns.id, emailCampaignRecipients.campaignId))
        .where(inArray(emailCampaignRecipients.taskId, input.taskIds));

      const sequenceRows = await db.select({
        enrollmentId: emailSequenceEnrollments.id,
        sequenceId: emailSequenceEnrollments.sequenceId,
        taskId: emailSequenceEnrollments.taskId,
        status: emailSequenceEnrollments.status,
        currentStep: emailSequenceEnrollments.currentStep,
        name: emailSequences.name,
      })
        .from(emailSequenceEnrollments)
        .innerJoin(emailSequences, eq(emailSequences.id, emailSequenceEnrollments.sequenceId))
        .where(inArray(emailSequenceEnrollments.taskId, input.taskIds));

      for (const row of campaignRows) {
        if (row.taskId == null) continue;
        const entry = out[row.taskId] ?? (out[row.taskId] = { campaigns: [], sequences: [] });
        entry.campaigns.push({ recipientId: row.recipientId, campaignId: row.campaignId, name: row.name, status: row.status });
      }
      for (const row of sequenceRows) {
        if (row.taskId == null) continue;
        const entry = out[row.taskId] ?? (out[row.taskId] = { campaigns: [], sequences: [] });
        entry.sequences.push({ enrollmentId: row.enrollmentId, sequenceId: row.sequenceId, name: row.name, status: row.status, currentStep: row.currentStep });
      }
      return out;
    }),

  // Remove um destinatário de campanha (admin) — usado para "desfazer" a
  // associação de um lead a uma campanha direto no card da tarefa. Ajusta os
  // contadores desnormalizados de email_campaigns para manter as estatísticas
  // consistentes.
  removeCampaignRecipient: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [recipient] = await db.select().from(emailCampaignRecipients).where(eq(emailCampaignRecipients.id, input.id));
      if (!recipient) throw new TRPCError({ code: 'NOT_FOUND', message: 'Destinatário não encontrado' });

      await db.delete(emailCampaignRecipients).where(eq(emailCampaignRecipients.id, input.id));

      await db.update(emailCampaigns)
        .set({
          totalRecipients: sql`GREATEST(${emailCampaigns.totalRecipients} - 1, 0)`,
          ...(recipient.status === 'sent' && { sentCount: sql`GREATEST(${emailCampaigns.sentCount} - 1, 0)` }),
          ...(recipient.status === 'failed' && { failedCount: sql`GREATEST(${emailCampaigns.failedCount} - 1, 0)` }),
          updatedAt: new Date(),
        })
        .where(eq(emailCampaigns.id, recipient.campaignId));

      return { ok: true };
    }),

  // ── Leads quentes (Fase 3, Pilar 3) ──────────────────────────────────────
  // Total de tarefas com hotLead=true visíveis ao usuário (admin vê todas).
  hotLeadsCount: protectedProcedure.query(async ({ ctx }) => {
    const filter = ctx.user.role === 'admin'
      ? eq(tasks.hotLead, true)
      : and(eq(tasks.hotLead, true), await userTaskFilter(ctx.user.id, ctx.user.name ?? ''));

    const [row] = await db.select({ cnt: count() }).from(tasks).where(filter);
    return { count: Number(row?.cnt ?? 0) };
  }),

  // ── Contatos (agregação de todos os e-mails do sistema) ─────────────────
  contactStats: adminProcedure.query(async () => {
    // Leads confirmados (entram na base de contatos) vs. pendentes de confirmação.
    const [confirmedRow] = await db.select({ cnt: sql<number>`COUNT(DISTINCT lower(trim(${tasks.email})))::int` })
      .from(tasks)
      .where(and(isNotNull(tasks.email), ne(tasks.email, ''), eq(tasks.emailConfirmed, true)));

    const [unconfirmedRow] = await db.select({ cnt: sql<number>`COUNT(DISTINCT lower(trim(${tasks.email})))::int` })
      .from(tasks)
      .where(and(isNotNull(tasks.email), ne(tasks.email, ''), eq(tasks.emailConfirmed, false)));

    const [clientRow] = await db.select({ cnt: sql<number>`COUNT(DISTINCT lower(trim(${clients.email})))::int` })
      .from(clients)
      .where(and(isNotNull(clients.email), ne(clients.email, '')));

    const suppByReason = await db.select({ reason: emailSuppressions.reason, cnt: count() })
      .from(emailSuppressions)
      .groupBy(emailSuppressions.reason);

    const suppMap: Record<string, number> = {};
    let totalSuppressed = 0;
    for (const r of suppByReason) {
      suppMap[r.reason] = Number(r.cnt);
      totalSuppressed += Number(r.cnt);
    }

    return {
      confirmedLeads: Number(confirmedRow?.cnt ?? 0),
      unconfirmedLeads: Number(unconfirmedRow?.cnt ?? 0),
      totalClients: Number(clientRow?.cnt ?? 0),
      totalSuppressed,
      unsubscribed: suppMap['unsubscribe'] ?? 0,
      bounced: suppMap['bounce'] ?? 0,
      complained: suppMap['complaint'] ?? 0,
      manualSuppressed: suppMap['manual'] ?? 0,
    };
  }),

  listContacts: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      source: z.enum(['all', 'leads', 'clients']).default('all'),
      status: z.enum(['all', 'active', 'suppressed']).default('all'),
      suppressionReason: z.string().optional(),
      assignedTo: z.string().optional(),
      tags: z.array(z.string()).optional(),
      limit: z.number().int().min(1).max(200).optional().default(50),
      offset: z.number().int().min(0).optional().default(0),
    }))
    .query(async ({ input }) => {
      const suppRows = await db.select().from(emailSuppressions);
      const suppressionMap = new Map(suppRows.map(s => [s.email.toLowerCase(), s.reason]));

      type ContactRow = {
        email: string;
        name: string;
        source: 'lead' | 'client';
        assignedTo: string | null;
        tags: string[];
        emailConfirmed: boolean;
        taskId: number | null;
        createdAt: Date;
        suppressionReason: string | null;
      };

      const contactMap = new Map<string, ContactRow>();

      if (input.source !== 'clients') {
        // Só leads com e-mail confirmado manualmente pelo atendente entram na base
        // de contatos — e-mails de importação não são confiáveis até serem revisados.
        const conds: any[] = [isNotNull(tasks.email), ne(tasks.email, ''), eq(tasks.emailConfirmed, true)];
        if (input.assignedTo) conds.push(eq(tasks.assignedTo, input.assignedTo));
        if (input.tags && input.tags.length > 0) {
          conds.push(sql`${tasks.tags} && ARRAY[${sql.join(input.tags.map(t => sql`${t}`), sql`, `)}]::text[]`);
        }
        if (input.search) {
          const s = `%${input.search.toLowerCase()}%`;
          conds.push(sql`(lower(${tasks.email}) LIKE ${s} OR lower(${tasks.title}) LIKE ${s})`);
        }

        const rows = await db.select({
          id: tasks.id, email: tasks.email, title: tasks.title,
          assignedTo: tasks.assignedTo, tags: tasks.tags,
          emailConfirmed: tasks.emailConfirmed, createdAt: tasks.createdAt,
        }).from(tasks).where(and(...conds));

        for (const r of rows) {
          if (!r.email) continue;
          const key = r.email.toLowerCase().trim();
          if (contactMap.has(key)) continue;
          contactMap.set(key, {
            email: key, name: firstPart(r.title), source: 'lead',
            assignedTo: r.assignedTo, tags: r.tags ?? [],
            emailConfirmed: r.emailConfirmed, taskId: r.id,
            createdAt: r.createdAt, suppressionReason: suppressionMap.get(key) ?? null,
          });
        }
      }

      if (input.source !== 'leads') {
        const conds: any[] = [isNotNull(clients.email), ne(clients.email, '')];
        if (input.search) {
          const s = `%${input.search.toLowerCase()}%`;
          conds.push(sql`(lower(${clients.email}) LIKE ${s} OR lower(${clients.name}) LIKE ${s})`);
        }

        const rows = await db.select({
          email: clients.email, name: clients.name,
          createdAt: clients.createdAt, unsubscribed: clients.unsubscribed,
        }).from(clients).where(and(...conds));

        for (const r of rows) {
          if (!r.email) continue;
          const key = r.email.toLowerCase().trim();
          if (contactMap.has(key)) continue;
          contactMap.set(key, {
            email: key, name: r.name, source: 'client',
            assignedTo: null, tags: [], emailConfirmed: true, taskId: null,
            createdAt: r.createdAt,
            suppressionReason: r.unsubscribed ? 'unsubscribe' : (suppressionMap.get(key) ?? null),
          });
        }
      }

      let list = Array.from(contactMap.values());
      if (input.status === 'active') list = list.filter(c => !c.suppressionReason);
      else if (input.status === 'suppressed') {
        list = list.filter(c => !!c.suppressionReason);
        if (input.suppressionReason) list = list.filter(c => c.suppressionReason === input.suppressionReason);
      }

      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const total = list.length;
      const page = list.slice(input.offset, input.offset + input.limit);

      return { contacts: page, total };
    }),

  removeSuppression: adminProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      await db.delete(emailSuppressions).where(eq(emailSuppressions.email, input.email.toLowerCase().trim()));
      return { ok: true };
    }),

  // ── Exportar leads (Fase 3, Pilar 4) ─────────────────────────────────────
  // CSV de leads com filtros avançados (tags, conversão, inatividade,
  // engajamento de e-mail e leads quentes). Sem N+1: uma query para as tasks
  // e uma query batched para o engajamento.
  exportLeads: adminProcedure
    .input(z.object({
      tags: z.array(z.string()).optional(),
      converted: z.enum(['yes', 'no']).optional(),
      engagement: z.enum(['opened', 'not_opened', 'clicked', 'not_clicked']).optional(),
      engagementWindowDays: z.number().int().min(1).max(365).optional().default(90),
      inactiveDays: z.number().int().min(1).max(365).optional(),
      hotOnly: z.boolean().optional(),
      assignedTo: z.string().optional(),
      limit: z.number().int().min(1).max(5000).optional().default(5000),
    }))
    .query(async ({ input }) => {
      const conditions = [isNotNull(tasks.email), ne(tasks.email, '')];

      if (input.tags && input.tags.length > 0) {
        conditions.push(sql`${tasks.tags} && ARRAY[${sql.join(input.tags.map(t => sql`${t}`), sql`, `)}]::text[]`);
      }
      if (input.converted === 'yes') conditions.push(isNotNull(tasks.convertedAt));
      if (input.converted === 'no') conditions.push(isNull(tasks.convertedAt));
      if (input.hotOnly) conditions.push(eq(tasks.hotLead, true));
      if (input.assignedTo) conditions.push(sql`lower(${tasks.assignedTo}) = ${input.assignedTo.toLowerCase()}`);
      if (input.inactiveDays) {
        const cutoff = new Date(Date.now() - input.inactiveDays * 24 * 60 * 60 * 1000);
        conditions.push(sql`COALESCE(${tasks.lastContactedAt}, ${tasks.createdAt}) < ${cutoff}`);
      }

      const rows = await db.select({
        id: tasks.id,
        title: tasks.title,
        email: tasks.email,
        tags: tasks.tags,
        assignedTo: tasks.assignedTo,
        lastContactedAt: tasks.lastContactedAt,
        convertedAt: tasks.convertedAt,
      }).from(tasks).where(and(...conditions)).limit(5000);

      const windowStart = new Date(Date.now() - input.engagementWindowDays * 24 * 60 * 60 * 1000);
      const engMap = await exportEngagementBatch(rows.map(r => r.id), windowStart);

      const out: Array<{
        name: string; email: string; phone: string | null; tags: string[];
        assignedTo: string | null; lastContactedAt: Date | null; convertedAt: Date | null;
        opens: number; clicks: number; lastEventAt: string | null;
      }> = [];

      for (const r of rows) {
        if (!r.email) continue;
        const eng = engMap.get(r.id) ?? { opens: 0, clicks: 0, lastEventAt: null };

        if (input.engagement === 'opened' && eng.opens === 0) continue;
        if (input.engagement === 'not_opened' && eng.opens > 0) continue;
        if (input.engagement === 'clicked' && eng.clicks === 0) continue;
        if (input.engagement === 'not_clicked' && eng.clicks > 0) continue;

        out.push({
          name: firstPart(r.title),
          email: r.email,
          phone: phonePart(r.title),
          tags: r.tags ?? [],
          assignedTo: r.assignedTo,
          lastContactedAt: r.lastContactedAt,
          convertedAt: r.convertedAt,
          opens: eng.opens,
          clicks: eng.clicks,
          lastEventAt: eng.lastEventAt,
        });

        if (out.length >= input.limit) break;
      }

      return out;
    }),
});
