import { z } from 'zod';
import crypto from 'crypto';
import { eq, and, or, inArray, isNotNull, isNull, ne, gte, desc, asc, count, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { router, staffProcedure, protectedProcedure } from '../trpc';
import { db } from '../db';
import {
  emailTemplateCategories, emailTemplates, emailCampaigns, emailCampaignRecipients, emailSuppressions,
  emailSequences, emailSequenceSteps, emailSequenceEnrollments, emailSequenceSends,
  emailEvents, automationRules, emailSendCounters,
  tasks, clients, sellers, marketingContacts, marketingLists,
} from '../db/schema';
import { pickAccount, sendBatch, layout, renderTemplate, renderSignature, sanitizeCampaignHtml, getUsage, getAllDomainTracking, setDomainTracking, getAccounts, type BatchMessage } from '../email/marketing';
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
  source: z.enum(['leads', 'clients', 'contacts', 'both', 'all']).default('leads'),
  assignedTo: z.string().optional(),
  tags: z.array(z.string()).optional(),
  listId: z.number().optional(),
});

async function buildAudience(opts: { source: 'leads' | 'clients' | 'contacts' | 'both' | 'all'; assignedTo?: string; tags?: string[]; listId?: number }): Promise<AudienceRow[]> {
  const rows: AudienceRow[] = [];

  if (opts.source === 'leads' || opts.source === 'both' || opts.source === 'all') {
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

  if (opts.source === 'clients' || opts.source === 'both' || opts.source === 'all') {
    const clientRows = await db.select({ email: clients.email, name: clients.name })
      .from(clients)
      .where(and(isNotNull(clients.email), ne(clients.email, ''), eq(clients.unsubscribed, false)));
    for (const c of clientRows) {
      if (!c.email) continue;
      rows.push({ email: c.email.toLowerCase().trim(), name: c.name });
    }
  }

  if (opts.source === 'contacts' || opts.source === 'all') {
    const conditions = [eq(marketingContacts.status, 'active')];
    if (opts.tags && opts.tags.length > 0) {
      conditions.push(sql`${marketingContacts.tags} && ARRAY[${sql.join(opts.tags.map(t => sql`${t}`), sql`, `)}]::text[]`);
    }
    if (opts.listId) {
      conditions.push(eq(marketingContacts.listId, opts.listId));
    }
    const contactRows = await db.select({ email: marketingContacts.email, name: marketingContacts.name })
      .from(marketingContacts)
      .where(and(...conditions));
    for (const c of contactRows) {
      rows.push({ email: c.email.toLowerCase().trim(), name: c.name ?? '' });
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
  // ── Template Categories ──────────────────────────────────────────────────
  listTemplateCategories: staffProcedure.query(async () => {
    try {
      return await db.select().from(emailTemplateCategories).orderBy(emailTemplateCategories.sortOrder, emailTemplateCategories.name);
    } catch {
      return [];
    }
  }),

  upsertTemplateCategory: staffProcedure
    .input(z.object({ id: z.number().optional(), name: z.string().min(1).max(100), sortOrder: z.number().optional() }))
    .mutation(async ({ input }) => {
      if (input.id) {
        const [updated] = await db.update(emailTemplateCategories)
          .set({ name: input.name, ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}) })
          .where(eq(emailTemplateCategories.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Categoria não encontrada' });
        return updated;
      }
      const maxOrder = await db.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(emailTemplateCategories);
      const [created] = await db.insert(emailTemplateCategories)
        .values({ name: input.name, sortOrder: input.sortOrder ?? (maxOrder[0]?.max ?? 0) + 1 })
        .returning();
      return created;
    }),

  deleteTemplateCategory: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const allTpls = await db.select({ id: emailTemplates.id, categoryIds: emailTemplates.categoryIds }).from(emailTemplates);
      for (const tpl of allTpls) {
        const ids = (tpl.categoryIds as number[] | null) ?? [];
        if (ids.includes(input.id)) {
          const updated = ids.filter(c => c !== input.id);
          await db.update(emailTemplates).set({ categoryIds: updated.length > 0 ? updated : null }).where(eq(emailTemplates.id, tpl.id));
        }
      }
      await db.delete(emailTemplateCategories).where(eq(emailTemplateCategories.id, input.id));
      return { ok: true };
    }),

  // ── Templates ──────────────────────────────────────────────────────────────
  listTemplates: staffProcedure.query(async () => {
    try {
      return await db.select().from(emailTemplates).orderBy(emailTemplates.name);
    } catch {
      return await db.select({
        id: emailTemplates.id, slug: emailTemplates.slug, name: emailTemplates.name,
        subject: emailTemplates.subject, htmlBody: emailTemplates.htmlBody, attachments: emailTemplates.attachments,
        active: emailTemplates.active, createdAt: emailTemplates.createdAt, updatedAt: emailTemplates.updatedAt,
      }).from(emailTemplates).orderBy(emailTemplates.name);
    }
  }),

  listTemplatesForAttendant: protectedProcedure.query(async ({ ctx }) => {
    const [seller] = await db.select({ emk: sellers.emailMarketingEnabled }).from(sellers).where(eq(sellers.userId, ctx.user.id)).limit(1);
    if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager' && !seller?.emk) return [];
    try {
      return await db.select({ id: emailTemplates.id, name: emailTemplates.name, slug: emailTemplates.slug, subject: emailTemplates.subject, htmlBody: emailTemplates.htmlBody, attachments: emailTemplates.attachments, categoryIds: emailTemplates.categoryIds })
        .from(emailTemplates).where(eq(emailTemplates.active, true)).orderBy(emailTemplates.name);
    } catch {
      return await db.select({ id: emailTemplates.id, name: emailTemplates.name, slug: emailTemplates.slug, subject: emailTemplates.subject, htmlBody: emailTemplates.htmlBody, attachments: emailTemplates.attachments })
        .from(emailTemplates).where(eq(emailTemplates.active, true)).orderBy(emailTemplates.name);
    }
  }),

  upsertTemplate: staffProcedure
    .input(z.object({
      id: z.number().optional(),
      categoryIds: z.array(z.number()).nullable().optional(),
      slug: z.string().min(1).max(100),
      name: z.string().min(1).max(200),
      subject: z.string().min(1).max(300),
      htmlBody: z.string().min(1),
      active: z.boolean().optional().default(true),
      attachments: z.array(z.object({
        filename: z.string().max(255),
        content: z.string(),
      })).optional(),
    }))
    .mutation(async ({ input }) => {
      input.htmlBody = sanitizeCampaignHtml(input.htmlBody);
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

  deleteTemplate: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(emailTemplates).where(eq(emailTemplates.id, input.id));
      return { ok: true };
    }),

  // ── Audience / segmentação ────────────────────────────────────────────────
  audiencePreview: staffProcedure
    .input(audienceInput)
    .query(async ({ input }) => {
      const rows = await buildAudience(input);
      return { count: rows.length, sample: rows.slice(0, 20).map(r => ({ email: r.email, name: r.name })) };
    }),

  // ── Campanhas ──────────────────────────────────────────────────────────────
  listCampaigns: staffProcedure.query(async () => {
    return db.select().from(emailCampaigns).orderBy(desc(emailCampaigns.createdAt));
  }),

  createCampaign: staffProcedure
    .input(z.object({
      name: z.string().min(1).max(200),
      subject: z.string().min(1).max(300),
      htmlBody: z.string().min(1),
      source: z.enum(['leads', 'clients', 'contacts', 'both', 'all']).default('leads'),
      assignedTo: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      input.htmlBody = sanitizeCampaignHtml(input.htmlBody);
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
  sendBroadcast: staffProcedure
    .input(z.object({
      name: z.string().max(200).optional(),
      subject: z.string().min(1).max(300),
      htmlBody: z.string().min(1),
      replyTo: z.string().email().optional(),
      recipients: z.array(z.object({
        email: z.string().email(),
        name: z.string().optional(),
      })).max(2000).optional(),
      audienceSource: z.enum(['leads', 'clients', 'contacts', 'both', 'all']).optional(),
      audienceAssignedTo: z.string().optional(),
      audienceTags: z.array(z.string()).optional(),
      audienceListId: z.number().optional(),
      attachments: z.array(z.object({
        filename: z.string().min(1).max(255),
        content: z.string().min(1), // base64
      })).max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      input.htmlBody = sanitizeCampaignHtml(input.htmlBody);
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
          listId: input.audienceListId,
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

  // ── Disparo Rápido para atendentes ──────────────────────────────────────
  attendantBroadcast: protectedProcedure
    .input(z.object({
      subject: z.string().min(1).max(300),
      htmlBody: z.string().min(1),
      recipients: z.array(z.object({
        email: z.string().email(),
        name: z.string().optional(),
      })).min(1).max(50),
      attachments: z.array(z.object({
        filename: z.string().min(1).max(255),
        content: z.string().min(1),
      })).max(5).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const [seller] = await db.select().from(sellers).where(eq(sellers.userId, ctx.user.id)).limit(1);
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager') {
        if (!seller?.emailMarketingEnabled) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para Email Marketing' });
      }
      if (!seller) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Atendente não encontrado. Peça ao admin para configurar seu cadastro.' });

      input.htmlBody = sanitizeCampaignHtml(input.htmlBody);
      if (input.attachments && input.attachments.length > 0) {
        const totalBase64 = input.attachments.reduce((sum, a) => sum + a.content.length, 0);
        if (totalBase64 > 3_500_000) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Anexos muito grandes (máx. ~3,5 MB).' });
      }

      const suppressed = await db.select({ email: emailSuppressions.email }).from(emailSuppressions);
      const suppressedSet = new Set(suppressed.map(s => s.email.toLowerCase()));
      const seen = new Set<string>();
      const clean: { email: string; name?: string }[] = [];
      for (const r of input.recipients) {
        const email = r.email.toLowerCase().trim();
        if (seen.has(email) || suppressedSet.has(email)) continue;
        seen.add(email);
        clean.push({ email, name: r.name?.trim() || undefined });
      }
      if (clean.length === 0) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum destinatário válido.' });

      const [campaign] = await db.insert(emailCampaigns).values({
        name: `Disparo ${seller.name} — ${new Date().toLocaleDateString('pt-BR')}`,
        subject: input.subject,
        htmlBody: input.htmlBody,
        isBroadcast: true,
        attachments: input.attachments?.length ? input.attachments : null,
        totalRecipients: clean.length,
        createdByUserId: ctx.user.id,
      }).returning();

      await db.insert(emailCampaignRecipients).values(clean.map(r => ({
        campaignId: campaign.id,
        email: r.email,
        name: r.name,
        replyTo: seller.email,
        unsubToken: crypto.randomUUID(),
      })));

      return { campaignId: campaign.id, recipientCount: clean.length };
    }),

  // Used by the Tasks page: add selected tasks (leads) directly to a draft campaign.
  addRecipientsFromTasks: staffProcedure
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

  getCampaign: staffProcedure
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

  deleteCampaign: staffProcedure
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
  processBatch: protectedProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager') {
        const [c] = await db.select({ createdByUserId: emailCampaigns.createdByUserId }).from(emailCampaigns).where(eq(emailCampaigns.id, input.campaignId));
        if (!c || c.createdByUserId !== ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Sem permissão' });
      }
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
  listSuppressions: staffProcedure.query(async () => {
    return db.select().from(emailSuppressions).orderBy(desc(emailSuppressions.createdAt)).limit(500);
  }),

  addSuppression: staffProcedure
    .input(z.object({ email: z.string().email(), reason: z.string().optional().default('manual') }))
    .mutation(async ({ input }) => {
      await db.insert(emailSuppressions)
        .values({ email: input.email.toLowerCase().trim(), reason: input.reason })
        .onConflictDoNothing();
      return { ok: true };
    }),

  // ── Tags ───────────────────────────────────────────────────────────────────
  // Autocomplete: distinct tags currently used across tasks.tags.
  listTags: staffProcedure.query(async () => {
    const result = await db.execute<{ tag: string }>(sql`
      SELECT DISTINCT unnest(${tasks.tags}) AS tag
      FROM ${tasks}
      WHERE array_length(${tasks.tags}, 1) > 0
      ORDER BY 1
    `);
    return result.rows.map(r => r.tag);
  }),

  // ── Sequências ────────────────────────────────────────────────────────────
  listSequences: staffProcedure.query(async () => {
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

  upsertSequence: staffProcedure
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

  deleteSequence: staffProcedure
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
  listSequenceSteps: staffProcedure
    .input(z.object({ sequenceId: z.number() }))
    .query(async ({ input }) => {
      return db.select().from(emailSequenceSteps)
        .where(eq(emailSequenceSteps.sequenceId, input.sequenceId))
        .orderBy(asc(emailSequenceSteps.stepOrder));
    }),

  upsertSequenceStep: staffProcedure
    .input(z.object({
      id: z.number().optional(),
      sequenceId: z.number(),
      stepOrder: z.number().int().min(1),
      delayDays: z.number().int().min(0),
      subject: z.string().min(1).max(300),
      htmlBody: z.string().min(1),
      sendCondition: z.enum(['always', 'if_opened', 'if_not_opened', 'if_clicked', 'if_not_clicked']).optional().default('always'),
      retryIfNotOpened: z.boolean().optional().default(false),
      retryDelayHours: z.number().int().min(1).max(720).optional().default(24),
      maxRetries: z.number().int().min(1).max(5).optional().default(1),
      retrySubject: z.string().max(300).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      input.htmlBody = sanitizeCampaignHtml(input.htmlBody);
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

  deleteSequenceStep: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(emailSequenceSteps).where(eq(emailSequenceSteps.id, input.id));
      return { ok: true };
    }),

  // ── Sequências visíveis para atendentes (leitura simplificada) ─────────
  listSequencesForAttendant: protectedProcedure.query(async ({ ctx }) => {
    const [seller] = await db.select({ emk: sellers.emailMarketingEnabled }).from(sellers).where(eq(sellers.userId, ctx.user.id)).limit(1);
    if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager' && !seller?.emk) return [];
    const rows = await db.select({ id: emailSequences.id, name: emailSequences.name, active: emailSequences.active })
      .from(emailSequences).where(eq(emailSequences.active, true)).orderBy(emailSequences.name);
    return rows;
  }),

  // ── Inscrição manual de leads ────────────────────────────────────────────
  enrollTasksInSequence: protectedProcedure
    .input(z.object({ sequenceId: z.number(), taskIds: z.array(z.number()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin' && ctx.user.role !== 'manager') {
        const [seller] = await db.select({ emk: sellers.emailMarketingEnabled }).from(sellers).where(eq(sellers.userId, ctx.user.id)).limit(1);
        if (!seller?.emk) throw new TRPCError({ code: 'FORBIDDEN', message: 'Você não tem permissão para Email Marketing' });
      }
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
      const skipReasons: string[] = [];

      for (const t of taskRows) {
        if (!t.email) { skippedNoEmail++; skipReasons.push(`${firstPart(t.title)}: sem email`); continue; }
        if (!t.emailConfirmed) { skippedUnconfirmed++; skipReasons.push(`${t.email}: não confirmado`); continue; }
        const result = await enrollInSequence(input.sequenceId, {
          email: t.email,
          name: firstPart(t.title),
          replyTo: t.assignedTo ? sellerMap.get(t.assignedTo.toLowerCase()) : undefined,
          taskId: t.id,
        });
        if (result.enrolled) enrolled++;
        else { skippedDuplicateOrSuppressed++; skipReasons.push(`${t.email}: ${result.reason ?? 'duplicado/suprimido'}`); }
      }

      console.log(`[enrollTasksInSequence] seq=${input.sequenceId}: enrolled=${enrolled}, skipped=${skippedNoEmail + skippedUnconfirmed + skippedDuplicateOrSuppressed}`, skipReasons.length > 0 ? skipReasons : '');
      return { enrolled, skippedNoEmail, skippedUnconfirmed, skippedDuplicateOrSuppressed, skipReasons };
    }),

  // ── Inscrições ────────────────────────────────────────────────────────────
  listEnrollments: staffProcedure
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

  pauseEnrollment: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [updated] = await db.update(emailSequenceEnrollments)
        .set({ status: 'paused', updatedAt: new Date() })
        .where(eq(emailSequenceEnrollments.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Inscrição não encontrada' });
      return updated;
    }),

  resumeEnrollment: staffProcedure
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

  cancelEnrollment: staffProcedure
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
  listAutomationRules: staffProcedure.query(async () => {
    return db.select().from(automationRules).orderBy(desc(automationRules.createdAt));
  }),

  upsertAutomationRule: staffProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(200),
      triggerType: z.enum(['lead_created', 'lead_converted', 'inactive_days', 'tag_added', 'email_confirmed', 'sequence_completed']),
      triggerConfig: z.record(z.any()).optional(),
      actionType: z.enum(['enroll_sequence', 'add_tag']),
      actionConfig: z.record(z.any()),
      requiredTags: z.array(z.string()).optional(),
      excludedTags: z.array(z.string()).optional(),
      cancelOtherSequences: z.boolean().optional().default(false),
      active: z.boolean().optional().default(true),
    }))
    .mutation(async ({ input }) => {
      const data = {
        name: input.name,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig ? JSON.stringify(input.triggerConfig) : null,
        actionType: input.actionType,
        actionConfig: JSON.stringify(input.actionConfig),
        requiredTags: input.requiredTags?.length ? input.requiredTags : null,
        excludedTags: input.excludedTags?.length ? input.excludedTags : null,
        cancelOtherSequences: input.cancelOtherSequences ?? false,
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

  deleteAutomationRule: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(automationRules).where(eq(automationRules.id, input.id));
      return { ok: true };
    }),

  // ── Estatísticas ──────────────────────────────────────────────────────────
  campaignStats: staffProcedure
    .input(z.object({ campaignId: z.number() }))
    .query(async ({ input }) => {
      // Total de destinatários e enviados (base do funil).
      const [recRow] = await db.execute<{ total: number; sent: number }>(sql`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'sent')::int AS sent
        FROM ${emailCampaignRecipients}
        WHERE campaign_id = ${input.campaignId}
      `).then(r => r.rows);

      // Eventos: contagem única (por mensagem) e total (inclui repetições).
      const result = await db.execute<{ event_type: string; total: number; uniq: number }>(sql`
        SELECT
          e.event_type,
          COUNT(*)::int AS total,
          COUNT(DISTINCT e.message_id)::int AS uniq
        FROM ${emailEvents} e
        INNER JOIN ${emailCampaignRecipients} r ON r.message_id = e.message_id
        WHERE r.campaign_id = ${input.campaignId}
        GROUP BY e.event_type
      `);
      const uniq: Record<string, number> = {};
      const total: Record<string, number> = {};
      for (const row of result.rows) {
        uniq[row.event_type] = Number(row.uniq);
        total[row.event_type] = Number(row.total);
      }
      return {
        recipients: Number(recRow?.total ?? 0),
        sent: Number(recRow?.sent ?? 0),
        delivered: uniq.delivered ?? 0,
        opened: uniq.opened ?? 0,        // únicos (pessoas distintas)
        clicked: uniq.clicked ?? 0,      // únicos
        totalOpens: total.opened ?? 0,   // inclui reaberturas
        totalClicks: total.clicked ?? 0,
        bounced: uniq.bounced ?? 0,
        complained: uniq.complained ?? 0,
      };
    }),

  // Drill-down: lista destinatário por destinatário de uma campanha com o
  // status de engajamento (abriu? clicou? bounce?). Lazy-loaded e paginado
  // para economizar Neon — só roda quando o admin abre o detalhe.
  campaignRecipients: staffProcedure
    .input(z.object({
      campaignId: z.number(),
      engagement: z.enum(['all', 'opened', 'not_opened', 'clicked', 'not_clicked', 'bounced']).optional().default('all'),
      limit: z.number().int().min(1).max(500).optional().default(100),
      offset: z.number().int().min(0).optional().default(0),
    }))
    .query(async ({ input }) => {
      // Filtro de engajamento aplicado via HAVING sobre os eventos agregados.
      const having =
        input.engagement === 'opened' ? sql`HAVING COUNT(*) FILTER (WHERE e.event_type = 'opened') > 0`
        : input.engagement === 'not_opened' ? sql`HAVING COUNT(*) FILTER (WHERE e.event_type = 'opened') = 0`
        : input.engagement === 'clicked' ? sql`HAVING COUNT(*) FILTER (WHERE e.event_type = 'clicked') > 0`
        : input.engagement === 'not_clicked' ? sql`HAVING COUNT(*) FILTER (WHERE e.event_type = 'clicked') = 0`
        : input.engagement === 'bounced' ? sql`HAVING COUNT(*) FILTER (WHERE e.event_type = 'bounced') > 0`
        : sql``;

      const rows = await db.execute<{
        id: number; email: string; name: string | null; status: string;
        sent_at: string | null; opens: number; clicks: number; bounced: number;
        first_open: string | null; last_event: string | null;
      }>(sql`
        SELECT
          r.id, r.email, r.name, r.status, r.sent_at,
          COUNT(*) FILTER (WHERE e.event_type = 'opened')::int AS opens,
          COUNT(*) FILTER (WHERE e.event_type = 'clicked')::int AS clicks,
          COUNT(*) FILTER (WHERE e.event_type = 'bounced')::int AS bounced,
          MIN(e.created_at) FILTER (WHERE e.event_type = 'opened') AS first_open,
          MAX(e.created_at) AS last_event
        FROM ${emailCampaignRecipients} r
        LEFT JOIN ${emailEvents} e ON e.message_id = r.message_id
        WHERE r.campaign_id = ${input.campaignId}
        GROUP BY r.id, r.email, r.name, r.status, r.sent_at
        ${having}
        ORDER BY opens DESC, clicks DESC, r.email ASC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);

      return rows.rows.map(r => ({
        id: Number(r.id),
        email: r.email,
        name: r.name,
        status: r.status,
        sentAt: r.sent_at,
        opens: Number(r.opens),
        clicks: Number(r.clicks),
        bounced: Number(r.bounced) > 0,
        firstOpen: r.first_open,
        lastEvent: r.last_event,
      }));
    }),

  sequenceStats: staffProcedure
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

  // Drill-down: lista contato por contato (inscrição) de uma sequência com o
  // status de engajamento agregado de TODOS os passos. Permite ver exatamente
  // quem abriu / não abriu / clicou nos e-mails da sequência. Lazy + paginado.
  sequenceRecipients: staffProcedure
    .input(z.object({
      sequenceId: z.number(),
      engagement: z.enum(['all', 'opened', 'not_opened', 'clicked', 'not_clicked']).optional().default('all'),
      limit: z.number().int().min(1).max(500).optional().default(200),
      offset: z.number().int().min(0).optional().default(0),
    }))
    .query(async ({ input }) => {
      const having =
        input.engagement === 'opened' ? sql`HAVING COUNT(*) FILTER (WHERE e.event_type = 'opened') > 0`
        : input.engagement === 'not_opened' ? sql`HAVING COUNT(*) FILTER (WHERE e.event_type = 'opened') = 0`
        : input.engagement === 'clicked' ? sql`HAVING COUNT(*) FILTER (WHERE e.event_type = 'clicked') > 0`
        : input.engagement === 'not_clicked' ? sql`HAVING COUNT(*) FILTER (WHERE e.event_type = 'clicked') = 0`
        : sql``;

      const rows = await db.execute<{
        id: number; email: string; name: string | null; status: string; current_step: number;
        sent_count: number; opens: number; clicks: number;
        first_open: string | null; last_event: string | null; last_sent: string | null;
      }>(sql`
        SELECT
          en.id, en.email, en.name, en.status, en.current_step,
          COUNT(DISTINCT sd.id) FILTER (WHERE sd.status = 'sent')::int AS sent_count,
          COUNT(*) FILTER (WHERE e.event_type = 'opened')::int AS opens,
          COUNT(*) FILTER (WHERE e.event_type = 'clicked')::int AS clicks,
          MIN(e.created_at) FILTER (WHERE e.event_type = 'opened') AS first_open,
          MAX(e.created_at) AS last_event,
          MAX(sd.sent_at) AS last_sent
        FROM ${emailSequenceEnrollments} en
        LEFT JOIN ${emailSequenceSends} sd ON sd.enrollment_id = en.id
        LEFT JOIN ${emailEvents} e ON e.message_id = sd.message_id
        WHERE en.sequence_id = ${input.sequenceId}
        GROUP BY en.id, en.email, en.name, en.status, en.current_step
        ${having}
        ORDER BY opens DESC, clicks DESC, en.email ASC
        LIMIT ${input.limit} OFFSET ${input.offset}
      `);

      return rows.rows.map(r => ({
        id: Number(r.id),
        email: r.email,
        name: r.name,
        status: r.status,
        currentStep: Number(r.current_step),
        sentCount: Number(r.sent_count),
        opens: Number(r.opens),
        clicks: Number(r.clicks),
        firstOpen: r.first_open,
        lastEvent: r.last_event,
        lastSent: r.last_sent,
      }));
    }),

  usageStats: staffProcedure.query(async () => {
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

  // Resend open/click tracking is DOMAIN-LEVEL, not per-email. This surfaces the
  // current tracking flags per sending domain so the admin can confirm whether
  // open tracking is actually enabled (the root cause of 0% open rates).
  domainTrackingStatus: staffProcedure.query(async () => {
    const domains = await getAllDomainTracking();
    return { domains, allOpenTrackingOn: domains.length > 0 && domains.every(d => d.openTracking) };
  }),

  // Enables open/click tracking for a Resend domain via PATCH /domains/:id —
  // the only programmatic way to turn it on (no per-email switch exists).
  enableDomainTracking: staffProcedure
    .input(z.object({
      accountKey: z.string(),
      domainId: z.string(),
      openTracking: z.boolean().optional(),
      clickTracking: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const account = getAccounts().find(a => a.key === input.accountKey);
      if (!account) throw new TRPCError({ code: 'NOT_FOUND', message: 'Conta de e-mail não encontrada' });
      const result = await setDomainTracking(account, input.domainId, {
        openTracking: input.openTracking ?? true,
        clickTracking: input.clickTracking ?? true,
      });
      if (!result.ok) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Falha ao atualizar rastreamento: ${result.error}` });
      }
      return result;
    }),

  overviewStats: staffProcedure.query(async () => {
    // Funil GERAL e consistente. O segredo: contamos tudo sobre o MESMO
    // conjunto de mensagens (as que têm registro de envio), cruzando com os
    // eventos por message_id. Isso garante enviados ≥ entregues ≥ abriram ≥
    // clicaram — sem o problema anterior de "entregues" > "enviados" causado
    // por janelas de tempo diferentes (sentAt vs created_at do evento).
    const funnelResult = await db.execute<{
      sent: number; campaign_sent: number; sequence_sent: number;
      delivered: number; opened: number; clicked: number;
      total_opens: number; total_clicks: number; bounced: number; complained: number;
    }>(sql`
      WITH sent_msgs AS (
        SELECT message_id, 'campaign' AS kind FROM ${emailCampaignRecipients}
          WHERE status = 'sent' AND message_id IS NOT NULL
        UNION ALL
        SELECT message_id, 'sequence' AS kind FROM ${emailSequenceSends}
          WHERE status = 'sent' AND message_id IS NOT NULL
      )
      SELECT
        COUNT(DISTINCT sm.message_id)::int AS sent,
        COUNT(DISTINCT sm.message_id) FILTER (WHERE sm.kind = 'campaign')::int AS campaign_sent,
        COUNT(DISTINCT sm.message_id) FILTER (WHERE sm.kind = 'sequence')::int AS sequence_sent,
        COUNT(DISTINCT e.message_id) FILTER (WHERE e.event_type = 'delivered')::int AS delivered,
        COUNT(DISTINCT e.message_id) FILTER (WHERE e.event_type = 'opened')::int AS opened,
        COUNT(DISTINCT e.message_id) FILTER (WHERE e.event_type = 'clicked')::int AS clicked,
        COUNT(*) FILTER (WHERE e.event_type = 'opened')::int AS total_opens,
        COUNT(*) FILTER (WHERE e.event_type = 'clicked')::int AS total_clicks,
        COUNT(DISTINCT e.message_id) FILTER (WHERE e.event_type = 'bounced')::int AS bounced,
        COUNT(DISTINCT e.message_id) FILTER (WHERE e.event_type = 'complained')::int AS complained
      FROM sent_msgs sm
      LEFT JOIN ${emailEvents} e ON e.message_id = sm.message_id
    `);
    const f = funnelResult.rows[0] ?? {} as any;

    const totalSent = Number(f.sent ?? 0);
    const delivered = Number(f.delivered ?? 0);
    const openedUnique = Number(f.opened ?? 0);
    const clickedUnique = Number(f.clicked ?? 0);
    const totalOpens = Number(f.total_opens ?? 0);
    const totalClicks = Number(f.total_clicks ?? 0);
    const bounced = Number(f.bounced ?? 0);
    const complained = Number(f.complained ?? 0);

    const [unsubRow] = await db.select({ cnt: count() })
      .from(emailSuppressions)
      .where(eq(emailSuppressions.reason, 'unsubscribe'));

    // Denominador das taxas: e-mails entregues (fallback p/ enviados).
    const deliveredBase = delivered > 0 ? delivered : totalSent;

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
      campaignSent30d: Number(f.campaign_sent ?? 0),
      sequenceSent30d: Number(f.sequence_sent ?? 0),
      // Funil completo (geral)
      delivered30d: delivered,
      openedUnique30d: openedUnique,
      clickedUnique30d: clickedUnique,
      totalOpens30d: totalOpens,
      totalClicks30d: totalClicks,
      bounced30d: bounced,
      complained30d: complained,
      unsubscribed30d: Number(unsubRow?.cnt ?? 0),
      // Taxas (sempre ≤ 100% — base consistente e contagem única)
      deliveryRate: totalSent > 0 ? Math.min(1, delivered / totalSent) : 0,
      openRate: deliveredBase > 0 ? Math.min(1, openedUnique / deliveredBase) : 0,
      clickRate: deliveredBase > 0 ? Math.min(1, clickedUnique / deliveredBase) : 0,
      clickToOpenRate: openedUnique > 0 ? Math.min(1, clickedUnique / openedUnique) : 0,
      bounceRate: totalSent > 0 ? Math.min(1, bounced / totalSent) : 0,
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
  removeCampaignRecipient: staffProcedure
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
  contactStats: staffProcedure.query(async () => {
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

  listContacts: staffProcedure
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

  removeSuppression: staffProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      await db.delete(emailSuppressions).where(eq(emailSuppressions.email, input.email.toLowerCase().trim()));
      return { ok: true };
    }),

  // ── Exportar leads (Fase 3, Pilar 4) ─────────────────────────────────────
  // CSV de leads com filtros avançados (tags, conversão, inatividade,
  // engajamento de e-mail e leads quentes). Sem N+1: uma query para as tasks
  // e uma query batched para o engajamento.
  exportLeads: staffProcedure
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

  // ── Marketing Contacts (standalone CSV-imported leads) ────────────────────

  importMarketingContacts: staffProcedure
    .input(z.object({
      contacts: z.array(z.object({
        email: z.string(),
        name: z.string().optional(),
        phone: z.string().optional(),
        company: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
      })).max(5000),
      tags: z.array(z.string()).default([]),
      listId: z.number().optional(),
      newListName: z.string().max(200).optional(),
    }))
    .mutation(async ({ input }) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const allTags = Array.from(new Set(['Leads Importados', ...input.tags.map(t => t.trim()).filter(Boolean)]));

      // Resolve list: create new or use existing
      let listId: number | null = null;
      if (input.newListName?.trim()) {
        const [created] = await db.insert(marketingLists).values({ name: input.newListName.trim() }).returning();
        listId = created.id;
      } else if (input.listId) {
        listId = input.listId;
      }

      // Normalize and validate incoming contacts, dedup by email
      const seen = new Set<string>();
      const validContacts: { email: string; name?: string; phone?: string; company?: string; city?: string; state?: string }[] = [];
      let skippedInvalid = 0;

      for (const c of input.contacts) {
        const email = c.email?.toLowerCase().trim();
        if (!email || !emailRegex.test(email)) { skippedInvalid++; continue; }
        if (seen.has(email)) continue;
        seen.add(email);
        validContacts.push({
          email,
          name: c.name?.trim() || undefined,
          phone: c.phone?.trim() || undefined,
          company: c.company?.trim() || undefined,
          city: c.city?.trim() || undefined,
          state: c.state?.trim() || undefined,
        });
      }

      if (validContacts.length === 0) {
        return { imported: 0, updated: 0, skippedInvalid, total: input.contacts.length, listId };
      }

      // Fetch existing contacts by email (case-insensitive) in a single query
      const existingRows = await db.select({
        id: marketingContacts.id,
        email: marketingContacts.email,
        name: marketingContacts.name,
        phone: marketingContacts.phone,
        company: marketingContacts.company,
        city: marketingContacts.city,
        state: marketingContacts.state,
        tags: marketingContacts.tags,
        listId: marketingContacts.listId,
      }).from(marketingContacts)
        .where(sql`lower(${marketingContacts.email}) IN (${sql.join(validContacts.map(c => sql`${c.email}`), sql`, `)})`);

      const existingMap = new Map(existingRows.map(r => [r.email.toLowerCase(), r]));

      const toInsert: (typeof marketingContacts.$inferInsert)[] = [];
      const toUpdate: { id: number; data: Partial<typeof marketingContacts.$inferInsert> }[] = [];

      for (const c of validContacts) {
        const existing = existingMap.get(c.email);
        if (existing) {
          // Merge: union tags, fill empty fields, assign to list if not already in one
          const mergedTags = Array.from(new Set([...(existing.tags ?? []), ...allTags]));
          const updates: Record<string, any> = { tags: mergedTags, updatedAt: new Date() };
          if (!existing.name && c.name) updates.name = c.name;
          if (!existing.phone && c.phone) updates.phone = c.phone;
          if (!existing.company && c.company) updates.company = c.company;
          if (!existing.city && c.city) updates.city = c.city;
          if (!existing.state && c.state) updates.state = c.state;
          if (listId && !existing.listId) updates.listId = listId;
          toUpdate.push({ id: existing.id, data: updates });
        } else {
          toInsert.push({
            email: c.email,
            name: c.name ?? null,
            phone: c.phone ?? null,
            company: c.company ?? null,
            city: c.city ?? null,
            state: c.state ?? null,
            listId,
            tags: allTags,
            source: 'csv_import',
            status: 'active',
          });
        }
      }

      // Batch insert new contacts
      if (toInsert.length > 0) {
        for (let i = 0; i < toInsert.length; i += 500) {
          await db.insert(marketingContacts).values(toInsert.slice(i, i + 500));
        }
      }

      // Batch update existing contacts
      if (toUpdate.length > 0) {
        for (const u of toUpdate) {
          await db.update(marketingContacts).set(u.data).where(eq(marketingContacts.id, u.id));
        }
      }

      // Update list contact count
      if (listId) {
        const [cntRow] = await db.select({ cnt: count() }).from(marketingContacts)
          .where(and(eq(marketingContacts.listId, listId), eq(marketingContacts.status, 'active')));
        await db.update(marketingLists).set({ contactCount: Number(cntRow?.cnt ?? 0), updatedAt: new Date() })
          .where(eq(marketingLists.id, listId));
      }

      return {
        imported: toInsert.length,
        updated: toUpdate.length,
        skippedInvalid,
        total: input.contacts.length,
        listId,
      };
    }),

  listMarketingContacts: staffProcedure
    .input(z.object({
      search: z.string().optional(),
      tags: z.array(z.string()).optional(),
      listId: z.number().optional(),
      status: z.enum(['all', 'active', 'unsubscribed']).default('all'),
      limit: z.number().int().min(1).max(200).optional().default(50),
      offset: z.number().int().min(0).optional().default(0),
    }))
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input.status !== 'all') {
        conditions.push(eq(marketingContacts.status, input.status));
      }
      if (input.listId !== undefined) {
        conditions.push(eq(marketingContacts.listId, input.listId));
      }
      if (input.search) {
        const s = `%${input.search.toLowerCase()}%`;
        conditions.push(sql`(lower(${marketingContacts.email}) LIKE ${s} OR lower(COALESCE(${marketingContacts.name}, '')) LIKE ${s} OR lower(COALESCE(${marketingContacts.company}, '')) LIKE ${s})`);
      }
      if (input.tags && input.tags.length > 0) {
        conditions.push(sql`${marketingContacts.tags} && ARRAY[${sql.join(input.tags.map(t => sql`${t}`), sql`, `)}]::text[]`);
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, totalRow] = await Promise.all([
        db.select().from(marketingContacts)
          .where(where)
          .orderBy(desc(marketingContacts.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ cnt: count() }).from(marketingContacts).where(where),
      ]);

      return { contacts: rows, total: Number(totalRow[0]?.cnt ?? 0) };
    }),

  marketingContactStats: staffProcedure.query(async () => {
    const [totalRow] = await db.select({ cnt: count() }).from(marketingContacts);
    const [activeRow] = await db.select({ cnt: count() }).from(marketingContacts).where(eq(marketingContacts.status, 'active'));
    const [unsubRow] = await db.select({ cnt: count() }).from(marketingContacts).where(eq(marketingContacts.status, 'unsubscribed'));

    const byTagResult = await db.execute<{ tag: string; cnt: number }>(sql`
      SELECT t AS tag, COUNT(*)::int AS cnt
      FROM ${marketingContacts}, unnest(${marketingContacts.tags}) AS t
      GROUP BY t
      ORDER BY cnt DESC
      LIMIT 20
    `);

    return {
      total: Number(totalRow?.cnt ?? 0),
      active: Number(activeRow?.cnt ?? 0),
      unsubscribed: Number(unsubRow?.cnt ?? 0),
      byTag: byTagResult.rows.map(r => ({ tag: r.tag, count: Number(r.cnt) })),
    };
  }),

  // Panorama dos contatos importados — agregações para tomada de decisão.
  // Tudo via GROUP BY/COUNT (não traz linhas), barato no plano free da Neon.
  contactsOverview: staffProcedure.query(async () => {
    const aggRes = await db.execute<{
      total: number; active: number; unsubscribed: number;
      with_phone: number; with_company: number; with_location: number; with_name: number;
      recent7: number; recent30: number; with_tags: number;
    }>(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE ${marketingContacts.status} = 'active')::int AS active,
        COUNT(*) FILTER (WHERE ${marketingContacts.status} = 'unsubscribed')::int AS unsubscribed,
        COUNT(*) FILTER (WHERE ${marketingContacts.phone} IS NOT NULL AND ${marketingContacts.phone} <> '')::int AS with_phone,
        COUNT(*) FILTER (WHERE ${marketingContacts.company} IS NOT NULL AND ${marketingContacts.company} <> '')::int AS with_company,
        COUNT(*) FILTER (WHERE ${marketingContacts.city} IS NOT NULL AND ${marketingContacts.city} <> '' AND ${marketingContacts.state} IS NOT NULL AND ${marketingContacts.state} <> '')::int AS with_location,
        COUNT(*) FILTER (WHERE ${marketingContacts.name} IS NOT NULL AND ${marketingContacts.name} <> '')::int AS with_name,
        COUNT(*) FILTER (WHERE array_length(${marketingContacts.tags}, 1) > 0)::int AS with_tags,
        COUNT(*) FILTER (WHERE ${marketingContacts.createdAt} >= NOW() - INTERVAL '7 days')::int AS recent7,
        COUNT(*) FILTER (WHERE ${marketingContacts.createdAt} >= NOW() - INTERVAL '30 days')::int AS recent30
      FROM ${marketingContacts}
    `);
    const a = (aggRes.rows[0] ?? {}) as any;

    const byState = (await db.execute<{ state: string; cnt: number }>(sql`
      SELECT COALESCE(NULLIF(TRIM(UPPER(${marketingContacts.state})), ''), '— sem UF') AS state, COUNT(*)::int AS cnt
      FROM ${marketingContacts}
      GROUP BY 1 ORDER BY cnt DESC LIMIT 12
    `)).rows.map(r => ({ state: r.state, count: Number(r.cnt) }));

    const bySource = (await db.execute<{ source: string; cnt: number }>(sql`
      SELECT ${marketingContacts.source} AS source, COUNT(*)::int AS cnt
      FROM ${marketingContacts} GROUP BY 1 ORDER BY cnt DESC
    `)).rows.map(r => ({ source: r.source, count: Number(r.cnt) }));

    const byTag = (await db.execute<{ tag: string; cnt: number }>(sql`
      SELECT t AS tag, COUNT(*)::int AS cnt
      FROM ${marketingContacts}, unnest(${marketingContacts.tags}) AS t
      GROUP BY t ORDER BY cnt DESC LIMIT 12
    `)).rows.map(r => ({ tag: r.tag, count: Number(r.cnt) }));

    const byList = (await db.execute<{ id: number | null; name: string | null; cnt: number }>(sql`
      SELECT ${marketingContacts.listId} AS id, ml.name AS name, COUNT(*)::int AS cnt
      FROM ${marketingContacts}
      LEFT JOIN ${marketingLists} ml ON ml.id = ${marketingContacts.listId}
      GROUP BY ${marketingContacts.listId}, ml.name
      ORDER BY cnt DESC LIMIT 15
    `)).rows.map(r => ({ listId: r.id, name: r.name ?? '— sem lista', count: Number(r.cnt) }));

    const [listsRow] = await db.select({ cnt: count() }).from(marketingLists);

    return {
      total: Number(a.total ?? 0),
      active: Number(a.active ?? 0),
      unsubscribed: Number(a.unsubscribed ?? 0),
      withName: Number(a.with_name ?? 0),
      withPhone: Number(a.with_phone ?? 0),
      withCompany: Number(a.with_company ?? 0),
      withLocation: Number(a.with_location ?? 0),
      withTags: Number(a.with_tags ?? 0),
      recent7: Number(a.recent7 ?? 0),
      recent30: Number(a.recent30 ?? 0),
      listsCount: Number(listsRow?.cnt ?? 0),
      byState,
      bySource,
      byTag,
      byList,
    };
  }),

  updateMarketingContact: staffProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      tags: z.array(z.string()).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (data.name !== undefined) updates.name = data.name || null;
      if (data.phone !== undefined) updates.phone = data.phone || null;
      if (data.company !== undefined) updates.company = data.company || null;
      if (data.city !== undefined) updates.city = data.city || null;
      if (data.state !== undefined) updates.state = data.state || null;
      if (data.tags !== undefined) updates.tags = data.tags;
      if (data.notes !== undefined) updates.notes = data.notes || null;

      const [updated] = await db.update(marketingContacts)
        .set(updates)
        .where(eq(marketingContacts.id, id))
        .returning();
      if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contato não encontrado' });
      return updated;
    }),

  deleteMarketingContacts: staffProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ input }) => {
      await db.delete(marketingContacts).where(inArray(marketingContacts.id, input.ids));
      return { deleted: input.ids.length };
    }),

  tagMarketingContacts: staffProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1),
      addTags: z.array(z.string()).optional(),
      removeTags: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.addTags && input.addTags.length > 0) {
        const tagsToAdd = input.addTags.map(t => t.trim()).filter(Boolean);
        if (tagsToAdd.length > 0) {
          await db.update(marketingContacts)
            .set({
              tags: sql`(SELECT array_agg(DISTINCT t) FROM unnest(${marketingContacts.tags} || ARRAY[${sql.join(tagsToAdd.map(t => sql`${t}`), sql`, `)}]::text[]) AS t)`,
              updatedAt: new Date(),
            })
            .where(inArray(marketingContacts.id, input.ids));
        }
      }
      if (input.removeTags && input.removeTags.length > 0) {
        const tagsToRemove = input.removeTags.map(t => t.trim()).filter(Boolean);
        if (tagsToRemove.length > 0) {
          await db.update(marketingContacts)
            .set({
              tags: sql`(SELECT COALESCE(array_agg(t), '{}') FROM unnest(${marketingContacts.tags}) AS t WHERE t != ALL(ARRAY[${sql.join(tagsToRemove.map(t => sql`${t}`), sql`, `)}]::text[]))`,
              updatedAt: new Date(),
            })
            .where(inArray(marketingContacts.id, input.ids));
        }
      }
      return { ok: true };
    }),

  listMarketingContactTags: staffProcedure.query(async () => {
    const result = await db.execute<{ tag: string }>(sql`
      SELECT DISTINCT unnest(${marketingContacts.tags}) AS tag
      FROM ${marketingContacts}
      WHERE array_length(${marketingContacts.tags}, 1) > 0
      ORDER BY 1
    `);
    return result.rows.map(r => r.tag);
  }),

  enrollMarketingContactsInSequence: staffProcedure
    .input(z.object({
      sequenceId: z.number(),
      contactIds: z.array(z.number()).min(1),
    }))
    .mutation(async ({ input }) => {
      const [sequence] = await db.select().from(emailSequences).where(eq(emailSequences.id, input.sequenceId));
      if (!sequence) throw new TRPCError({ code: 'NOT_FOUND', message: 'Sequência não encontrada' });

      const contactRows = await db.select({
        id: marketingContacts.id, email: marketingContacts.email, name: marketingContacts.name, status: marketingContacts.status,
      }).from(marketingContacts)
        .where(and(inArray(marketingContacts.id, input.contactIds), eq(marketingContacts.status, 'active')));

      let enrolled = 0;
      let skipped = 0;

      for (const c of contactRows) {
        if (!c.email) { skipped++; continue; }
        const result = await enrollInSequence(input.sequenceId, {
          email: c.email,
          name: c.name,
          taskId: null,
        });
        if (result.enrolled) enrolled++;
        else skipped++;
      }

      // Count contacts that were not active or not found
      skipped += input.contactIds.length - contactRows.length;

      return { enrolled, skipped };
    }),

  unsubscribeMarketingContact: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [contact] = await db.select({ email: marketingContacts.email })
        .from(marketingContacts).where(eq(marketingContacts.id, input.id));
      if (!contact) throw new TRPCError({ code: 'NOT_FOUND', message: 'Contato não encontrado' });

      await db.update(marketingContacts)
        .set({ status: 'unsubscribed', updatedAt: new Date() })
        .where(eq(marketingContacts.id, input.id));

      // Add to global suppressions so the send gate is consistent
      await db.insert(emailSuppressions)
        .values({ email: contact.email.toLowerCase().trim(), reason: 'manual' })
        .onConflictDoNothing();

      return { ok: true };
    }),

  // ── Marketing Lists ────────────────────────────────────────────────────────

  listMarketingLists: staffProcedure.query(async () => {
    return db.select().from(marketingLists).orderBy(desc(marketingLists.updatedAt));
  }),

  upsertMarketingList: staffProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(200),
      description: z.string().max(500).optional(),
    }))
    .mutation(async ({ input }) => {
      if (input.id) {
        const [updated] = await db.update(marketingLists)
          .set({ name: input.name, description: input.description ?? null, updatedAt: new Date() })
          .where(eq(marketingLists.id, input.id))
          .returning();
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lista não encontrada' });
        return updated;
      }
      const [created] = await db.insert(marketingLists)
        .values({ name: input.name, description: input.description ?? null })
        .returning();
      return created;
    }),

  deleteMarketingList: staffProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.update(marketingContacts)
        .set({ listId: null, updatedAt: new Date() })
        .where(eq(marketingContacts.listId, input.id));
      await db.delete(marketingLists).where(eq(marketingLists.id, input.id));
      return { ok: true };
    }),

  dashboardEmailStats: staffProcedure.query(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const today = todayStart.toISOString().slice(0, 10);

    // 1) Sends today per attendant (via reply_to → seller email)
    const sendsToday = await db.execute<{
      reply_to: string | null; cnt: number;
    }>(sql`
      SELECT r.reply_to, COUNT(*)::int AS cnt
      FROM ${emailCampaignRecipients} r
      WHERE r.status = 'sent' AND r.sent_at >= ${todayStart}
      GROUP BY r.reply_to
    `);
    const seqSendsToday = await db.execute<{
      reply_to: string | null; cnt: number;
    }>(sql`
      SELECT en.reply_to, COUNT(*)::int AS cnt
      FROM ${emailSequenceSends} sd
      INNER JOIN ${emailSequenceEnrollments} en ON en.id = sd.enrollment_id
      WHERE sd.status = 'sent' AND sd.sent_at >= ${todayStart}
      GROUP BY en.reply_to
    `);

    const sellerRows = await db.select({ name: sellers.name, email: sellers.email }).from(sellers);
    const emailToName = new Map(sellerRows.map(s => [s.email.toLowerCase(), s.name]));

    const byAttendant = new Map<string, { name: string; campaigns: number; sequences: number }>();
    for (const r of sendsToday.rows) {
      const key = (r.reply_to || '').toLowerCase();
      const name = emailToName.get(key) ?? (r.reply_to || 'Admin');
      const entry = byAttendant.get(key) ?? { name, campaigns: 0, sequences: 0 };
      entry.campaigns += Number(r.cnt);
      byAttendant.set(key, entry);
    }
    for (const r of seqSendsToday.rows) {
      const key = (r.reply_to || '').toLowerCase();
      const name = emailToName.get(key) ?? (r.reply_to || 'Admin');
      const entry = byAttendant.get(key) ?? { name, campaigns: 0, sequences: 0 };
      entry.sequences += Number(r.cnt);
      byAttendant.set(key, entry);
    }

    const attendantSends = Array.from(byAttendant.values())
      .map(a => ({ ...a, total: a.campaigns + a.sequences }))
      .sort((a, b) => b.total - a.total);

    const totalSentToday = attendantSends.reduce((s, a) => s + a.total, 0);

    // 2) Engagement today (opens/clicks received today, regardless of send date)
    const engToday = await db.execute<{
      event_type: string; cnt: number; uniq: number;
    }>(sql`
      SELECT event_type, COUNT(*)::int AS cnt, COUNT(DISTINCT message_id)::int AS uniq
      FROM ${emailEvents}
      WHERE created_at >= ${todayStart}
      GROUP BY event_type
    `);
    const engMap: Record<string, { total: number; unique: number }> = {};
    for (const r of engToday.rows) {
      engMap[r.event_type] = { total: Number(r.cnt), unique: Number(r.uniq) };
    }

    // 3) Top campaigns by open rate (last 30 days, min 5 recipients sent)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const topCampaigns = await db.execute<{
      id: number; name: string; subject: string; sent: number; opened: number; clicked: number; open_rate: number;
    }>(sql`
      SELECT
        c.id, c.name, c.subject,
        c.sent_count AS sent,
        COUNT(DISTINCT e_o.message_id)::int AS opened,
        COUNT(DISTINCT e_c.message_id)::int AS clicked,
        CASE WHEN c.sent_count > 0
          THEN ROUND(COUNT(DISTINCT e_o.message_id)::numeric / c.sent_count * 100, 1)
          ELSE 0
        END AS open_rate
      FROM ${emailCampaigns} c
      LEFT JOIN ${emailCampaignRecipients} r ON r.campaign_id = c.id AND r.status = 'sent'
      LEFT JOIN ${emailEvents} e_o ON e_o.message_id = r.message_id AND e_o.event_type = 'opened'
      LEFT JOIN ${emailEvents} e_c ON e_c.message_id = r.message_id AND e_c.event_type = 'clicked'
      WHERE c.created_at >= ${thirtyDaysAgo} AND c.sent_count >= 5
      GROUP BY c.id, c.name, c.subject, c.sent_count
      ORDER BY open_rate DESC
      LIMIT 5
    `);

    // 4) Quota usage today
    const countersToday = await db.select({ accountKey: emailSendCounters.accountKey, sent: emailSendCounters.sent })
      .from(emailSendCounters)
      .where(eq(emailSendCounters.day, today));
    const usedToday = countersToday.reduce((sum, c) => sum + (c.sent ?? 0), 0);
    const accountCount = Math.max(1, countersToday.length || 1);
    const quotaToday = accountCount * MKT_DAILY_LIMIT;

    // 5) Bounces/complaints today (health signal)
    const bouncesToday = engMap['bounced']?.unique ?? 0;
    const complaintsToday = engMap['complained']?.unique ?? 0;

    // 6) 7-day send trend
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const dailyTrend = await db.execute<{ day: string; cnt: number }>(sql`
      SELECT day, SUM(sent)::int AS cnt
      FROM ${emailSendCounters}
      WHERE day >= ${sevenDaysAgo.toISOString().slice(0, 10)}
      GROUP BY day
      ORDER BY day
    `);

    // 7) Confirmação de e-mail e inscrições em sequência — bloco rápido do dashboard
    const [confirmedTodayRow] = await db.select({ cnt: count() })
      .from(tasks)
      .where(and(isNotNull(tasks.emailConfirmedAt), gte(tasks.emailConfirmedAt, todayStart)));
    const [pendingConfirmationRow] = await db.select({ cnt: count() })
      .from(tasks)
      .where(and(isNotNull(tasks.email), ne(tasks.email, ''), eq(tasks.emailConfirmed, false)));
    const [enrolledTodayRow] = await db.select({ cnt: count() })
      .from(emailSequenceEnrollments)
      .where(gte(emailSequenceEnrollments.enrolledAt, todayStart));
    // Base total com e-mail cadastrado — dá a % confirmada da base inteira,
    // não só o que mudou hoje (pendingConfirmation sozinho não diz se a base
    // está 5% ou 95% confirmada).
    const [totalWithEmailRow] = await db.select({ cnt: count() })
      .from(tasks)
      .where(and(isNotNull(tasks.email), ne(tasks.email, '')));

    return {
      totalSentToday,
      confirmedToday: Number(confirmedTodayRow?.cnt ?? 0),
      pendingConfirmation: Number(pendingConfirmationRow?.cnt ?? 0),
      sequencesEnrolledToday: Number(enrolledTodayRow?.cnt ?? 0),
      totalWithEmail: Number(totalWithEmailRow?.cnt ?? 0),
      attendantSends,
      opensToday: engMap['opened']?.unique ?? 0,
      totalOpensToday: engMap['opened']?.total ?? 0,
      clicksToday: engMap['clicked']?.unique ?? 0,
      totalClicksToday: engMap['clicked']?.total ?? 0,
      bouncesToday,
      complaintsToday,
      quotaUsed: usedToday,
      quotaTotal: quotaToday,
      topCampaigns: topCampaigns.rows.map(c => ({
        id: Number(c.id),
        name: c.name,
        subject: c.subject,
        sent: Number(c.sent),
        opened: Number(c.opened),
        clicked: Number(c.clicked),
        openRate: Number(c.open_rate),
      })),
      dailyTrend: dailyTrend.rows.map(r => ({ day: r.day, sent: Number(r.cnt) })),
    };
  }),

  moveContactsToList: staffProcedure
    .input(z.object({
      contactIds: z.array(z.number()).min(1),
      listId: z.number().nullable(),
    }))
    .mutation(async ({ input }) => {
      const oldListIds = await db.select({ listId: marketingContacts.listId })
        .from(marketingContacts)
        .where(inArray(marketingContacts.id, input.contactIds));
      const affectedListIds = new Set(oldListIds.map(r => r.listId).filter((id): id is number => id !== null));

      await db.update(marketingContacts)
        .set({ listId: input.listId, updatedAt: new Date() })
        .where(inArray(marketingContacts.id, input.contactIds));

      if (input.listId) affectedListIds.add(input.listId);
      for (const lid of affectedListIds) {
        const [cntRow] = await db.select({ cnt: count() }).from(marketingContacts)
          .where(and(eq(marketingContacts.listId, lid), eq(marketingContacts.status, 'active')));
        await db.update(marketingLists).set({ contactCount: Number(cntRow?.cnt ?? 0), updatedAt: new Date() })
          .where(eq(marketingLists.id, lid));
      }

      return { moved: input.contactIds.length };
    }),
});
