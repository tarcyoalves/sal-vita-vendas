import { z } from 'zod';
import { router, staffProcedure } from '../trpc';
import { ordersDb as db } from '../db/ordersDb';
import { sql } from 'drizzle-orm';
import { getAccounts, getAccountLimits, getMonthlyCounter, todayBrt } from '../email/marketingQuota';
import { buildAudience, processCampaignBatch } from '../email/marketingEngine';
import { processSequenceEnrollments } from '../email/sequenceEngine';
import { suppressEmailGlobal } from './unsubscribe';
import { randomUUID } from 'crypto';

/**
 * E-mail Marketing do Sal Vita PREMIUM (loja/e-commerce, banco ordersDb).
 *
 * Vive separado de `emailMarketing.ts`, que é o E-mail Marketing do CRM de
 * Lembretes (banco principal). Antes os dois disputavam o mesmo namespace
 * `trpc.emailMarketing.*` e o Premium sobrescreveu o do CRM, derrubando 59
 * procedures em produção. Namespace correto aqui: `trpc.premiumEmailMarketing.*`.
 *
 * Todas as procedures são `staffProcedure` (admin/manager). Estavam como
 * `publicProcedure`, o que expunha disparo de campanha, exclusões e a lista de
 * contatos a qualquer pessoa na internet.
 */
export const premiumEmailMarketingRouter = router({
  // ── Dashboard Metrics & Quotas ────────────────────────────────────────────
  getMetrics: staffProcedure.query(async () => {
    const today = todayBrt();
    const currentMonth = today.slice(0, 7);

    // Accounts quota consumption
    const accounts = getAccounts();
    const accountStats = [];

    for (const acc of accounts) {
      const limits = getAccountLimits(acc.provider);
      const todayRes = await db.execute(sql`
        SELECT sent FROM email_send_counters WHERE account_key = ${acc.key} AND day = ${today} LIMIT 1
      `);
      const sentToday = Number((todayRes.rows[0] as any)?.sent ?? 0);
      const sentMonth = await getMonthlyCounter(acc.key);

      accountStats.push({
        key: acc.key,
        provider: acc.provider,
        from: acc.from,
        dailyLimit: limits.daily,
        monthlyLimit: limits.monthly,
        sentToday,
        sentMonth,
        dailyAvailable: Math.max(limits.daily - sentToday, 0),
        monthlyAvailable: Math.max(limits.monthly - sentMonth, 0),
      });
    }

    // Totals
    const campsRes = await db.execute(sql`SELECT COUNT(*) as cnt FROM email_campaigns`);
    const totalCampaigns = Number((campsRes.rows[0] as any)?.cnt ?? 0);

    const sentRes = await db.execute(sql`
      SELECT COALESCE(SUM(sent_count), 0) as total FROM email_campaigns
    `);
    const totalSentCampaignEmails = Number((sentRes.rows[0] as any)?.total ?? 0);

    const enrRes = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM email_sequence_enrollments WHERE status = 'active'
    `);
    const activeEnrollments = Number((enrRes.rows[0] as any)?.cnt ?? 0);

    const suppRes = await db.execute(sql`SELECT COUNT(*) as cnt FROM email_suppressions`);
    const totalSuppressions = Number((suppRes.rows[0] as any)?.cnt ?? 0);

    const contactsRes = await db.execute(sql`SELECT COUNT(*) as cnt FROM marketing_contacts WHERE status = 'active'`);
    const totalContacts = Number((contactsRes.rows[0] as any)?.cnt ?? 0);

    return {
      accounts: accountStats,
      totalCampaigns,
      totalSentCampaignEmails,
      activeEnrollments,
      totalSuppressions,
      totalContacts,
    };
  }),

  // ── Audience Building Preview ──────────────────────────────────────────────
  previewAudience: staffProcedure.query(async () => {
    const audience = await buildAudience();
    const sourcesCount = { order: 0, cart: 0, b2b: 0, contact: 0 };
    for (const m of audience) {
      sourcesCount[m.source] = (sourcesCount[m.source] || 0) + 1;
    }
    return {
      total: audience.length,
      breakdown: sourcesCount,
      sample: audience.slice(0, 10),
    };
  }),

  // ── Campaigns ─────────────────────────────────────────────────────────────
  getCampaigns: staffProcedure.query(async () => {
    const res = await db.execute(sql`
      SELECT * FROM email_campaigns ORDER BY created_at DESC
    `);
    return res.rows as any[];
  }),

  createCampaign: staffProcedure
    .input(z.object({
      name: z.string().min(1),
      subject: z.string().min(1),
      subjectB: z.string().optional(),
      htmlBody: z.string().min(1),
      isBroadcast: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      const insRes = await db.execute(sql`
        INSERT INTO email_campaigns (name, subject, subject_b, html_body, status, is_broadcast, created_at, updated_at)
        VALUES (${input.name}, ${input.subject}, ${input.subjectB ?? null}, ${input.htmlBody}, 'draft', ${input.isBroadcast}, NOW(), NOW())
        RETURNING id
      `);

      const campaignId = Number((insRes.rows[0] as any).id);

      // Build audience and populate email_campaign_recipients
      const audience = await buildAudience();
      let recipientCount = 0;

      for (let i = 0; i < audience.length; i++) {
        const m = audience[i];
        const unsubToken = randomUUID();
        const variant = input.subjectB ? (i % 2 === 0 ? 'A' : 'B') : null;

        await db.execute(sql`
          INSERT INTO email_campaign_recipients (campaign_id, email, name, variant, status, unsub_token, created_at)
          VALUES (${campaignId}, ${m.email}, ${m.name ?? null}, ${variant}, 'pending', ${unsubToken}, NOW())
        `);
        recipientCount++;
      }

      await db.execute(sql`
        UPDATE email_campaigns
        SET total_recipients = ${recipientCount}, updated_at = NOW()
        WHERE id = ${campaignId}
      `);

      return { ok: true, campaignId, totalRecipients: recipientCount };
    }),

  dispatchCampaign: staffProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input }) => {
      await db.execute(sql`
        UPDATE email_campaigns SET status = 'sending', updated_at = NOW() WHERE id = ${input.campaignId}
      `);
      const result = await processCampaignBatch(input.campaignId, 100);
      return result;
    }),

  pauseCampaign: staffProcedure
    .input(z.object({ campaignId: z.number(), pause: z.boolean() }))
    .mutation(async ({ input }) => {
      const status = input.pause ? 'paused' : 'sending';
      await db.execute(sql`
        UPDATE email_campaigns SET status = ${status}, updated_at = NOW() WHERE id = ${input.campaignId}
      `);
      return { ok: true, status };
    }),

  deleteCampaign: staffProcedure
    .input(z.object({ campaignId: z.number() }))
    .mutation(async ({ input }) => {
      await db.execute(sql`DELETE FROM email_campaign_recipients WHERE campaign_id = ${input.campaignId}`);
      await db.execute(sql`DELETE FROM email_campaigns WHERE id = ${input.campaignId}`);
      return { ok: true };
    }),

  // ── Sequences (Drip) ──────────────────────────────────────────────────────
  getSequences: staffProcedure.query(async () => {
    const seqsRes = await db.execute(sql`SELECT * FROM email_sequences ORDER BY id DESC`);
    const sequences = seqsRes.rows as any[];

    const result = [];
    for (const seq of sequences) {
      const stepsRes = await db.execute(sql`
        SELECT * FROM email_sequence_steps WHERE sequence_id = ${seq.id} ORDER BY step_order ASC
      `);
      const enrRes = await db.execute(sql`
        SELECT COUNT(*) as active FROM email_sequence_enrollments WHERE sequence_id = ${seq.id} AND status = 'active'
      `);
      result.push({
        ...seq,
        steps: stepsRes.rows as any[],
        activeEnrollments: Number((enrRes.rows[0] as any)?.active ?? 0),
      });
    }
    return result;
  }),

  createSequence: staffProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      repeat: z.boolean().default(false),
      repeatIntervalDays: z.number().optional(),
      steps: z.array(z.object({
        stepOrder: z.number(),
        delayDays: z.number(),
        subject: z.string().min(1),
        htmlBody: z.string().min(1),
        sendCondition: z.string().default('always'),
      })).min(1),
    }))
    .mutation(async ({ input }) => {
      const seqIns = await db.execute(sql`
        INSERT INTO email_sequences (name, description, active, repeat, repeat_interval_days, created_at, updated_at)
        VALUES (${input.name}, ${input.description ?? null}, true, ${input.repeat}, ${input.repeatIntervalDays ?? null}, NOW(), NOW())
        RETURNING id
      `);
      const sequenceId = Number((seqIns.rows[0] as any).id);

      for (const step of input.steps) {
        await db.execute(sql`
          INSERT INTO email_sequence_steps (sequence_id, step_order, delay_days, subject, html_body, send_condition, created_at)
          VALUES (${sequenceId}, ${step.stepOrder}, ${step.delayDays}, ${step.subject}, ${step.htmlBody}, ${step.sendCondition}, NOW())
        `);
      }

      return { ok: true, sequenceId };
    }),

  toggleSequence: staffProcedure
    .input(z.object({ sequenceId: z.number(), active: z.boolean() }))
    .mutation(async ({ input }) => {
      await db.execute(sql`
        UPDATE email_sequences SET active = ${input.active}, updated_at = NOW() WHERE id = ${input.sequenceId}
      `);
      return { ok: true };
    }),

  deleteSequence: staffProcedure
    .input(z.object({ sequenceId: z.number() }))
    .mutation(async ({ input }) => {
      await db.execute(sql`DELETE FROM email_sequence_steps WHERE sequence_id = ${input.sequenceId}`);
      await db.execute(sql`DELETE FROM email_sequence_enrollments WHERE sequence_id = ${input.sequenceId}`);
      await db.execute(sql`DELETE FROM email_sequences WHERE id = ${input.sequenceId}`);
      return { ok: true };
    }),

  runSequencesCronNow: staffProcedure.mutation(async () => {
    const result = await processSequenceEnrollments(100);
    return result;
  }),

  // ── Automation Rules Engine ───────────────────────────────────────────────
  getAutomationRules: staffProcedure.query(async () => {
    const res = await db.execute(sql`SELECT * FROM automation_rules ORDER BY id DESC`);
    return res.rows as any[];
  }),

  createAutomationRule: staffProcedure
    .input(z.object({
      name: z.string().min(1),
      triggerType: z.string().min(1),
      triggerConfig: z.string().optional(),
      actionType: z.string().min(1),
      actionConfig: z.string().min(1),
      cancelOtherSequences: z.boolean().default(false),
    }))
    .mutation(async ({ input }) => {
      await db.execute(sql`
        INSERT INTO automation_rules (name, trigger_type, trigger_config, action_type, action_config, cancel_other_sequences, active, created_at, updated_at)
        VALUES (${input.name}, ${input.triggerType}, ${input.triggerConfig ?? null}, ${input.actionType}, ${input.actionConfig}, ${input.cancelOtherSequences}, true, NOW(), NOW())
      `);
      return { ok: true };
    }),

  deleteAutomationRule: staffProcedure
    .input(z.object({ ruleId: z.number() }))
    .mutation(async ({ input }) => {
      await db.execute(sql`DELETE FROM automation_rules WHERE id = ${input.ruleId}`);
      return { ok: true };
    }),

  // ── Templates ─────────────────────────────────────────────────────────────
  getTemplates: staffProcedure.query(async () => {
    const res = await db.execute(sql`SELECT * FROM email_templates WHERE active = TRUE ORDER BY name ASC`);
    return res.rows as any[];
  }),

  createTemplate: staffProcedure
    .input(z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      subject: z.string().min(1),
      htmlBody: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      await db.execute(sql`
        INSERT INTO email_templates (slug, name, subject, html_body, active, created_at, updated_at)
        VALUES (${input.slug}, ${input.name}, ${input.subject}, ${input.htmlBody}, true, NOW(), NOW())
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name,
          subject = EXCLUDED.subject,
          html_body = EXCLUDED.html_body,
          updated_at = NOW()
      `);
      return { ok: true };
    }),

  deleteTemplate: staffProcedure
    .input(z.object({ templateId: z.number() }))
    .mutation(async ({ input }) => {
      await db.execute(sql`DELETE FROM email_templates WHERE id = ${input.templateId}`);
      return { ok: true };
    }),

  // ── Contacts & Suppressions ───────────────────────────────────────────────
  getContacts: staffProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const q = input?.search ? `%${input.search.toLowerCase()}%` : null;
      if (q) {
        const res = await db.execute(sql`
          SELECT * FROM marketing_contacts
          WHERE LOWER(email) LIKE ${q} OR LOWER(name) LIKE ${q} OR LOWER(city) LIKE ${q}
          ORDER BY created_at DESC LIMIT 200
        `);
        return res.rows as any[];
      }
      const res = await db.execute(sql`SELECT * FROM marketing_contacts ORDER BY created_at DESC LIMIT 200`);
      return res.rows as any[];
    }),

  addContact: staffProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().optional(),
      phone: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.execute(sql`
        INSERT INTO marketing_contacts (email, name, phone, city, state, source, status, created_at, updated_at)
        VALUES (${input.email.toLowerCase()}, ${input.name ?? null}, ${input.phone ?? null}, ${input.city ?? null}, ${input.state ?? null}, 'manual', 'active', NOW(), NOW())
      `);
      return { ok: true };
    }),

  getSuppressions: staffProcedure.query(async () => {
    const res = await db.execute(sql`SELECT * FROM email_suppressions ORDER BY created_at DESC LIMIT 200`);
    return res.rows as any[];
  }),

  addSuppression: staffProcedure
    .input(z.object({ email: z.string().email(), reason: z.string().default('manual') }))
    .mutation(async ({ input }) => {
      await suppressEmailGlobal(input.email, input.reason);
      return { ok: true };
    }),

  removeSuppression: staffProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const cleanEmail = input.email.toLowerCase();
      await db.execute(sql`DELETE FROM email_suppressions WHERE LOWER(email) = ${cleanEmail}`);
      return { ok: true };
    }),
});
