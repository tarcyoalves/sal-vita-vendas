/**
 * Motor de envio de CAMPANHAS (batch) — lógica compartilhada entre o router
 * (polling do frontend via `processBatch`) e o cron diário (envio resiliente
 * quando a aba do admin está fechada). Extraído de
 * `server/routers/emailMarketing.ts` para que o front e o cron usem EXATAMENTE
 * a mesma implementação (claim atômico + reserva de cota), sem duplicar.
 */

import { and, eq, count, inArray, lt, lte, or, isNotNull, sql as dsql } from 'drizzle-orm';
import { db } from '../db';
import { emailCampaigns, emailCampaignRecipients, emailSuppressions, sellers } from '../db/schema';
import {
  reserveSendQuota, refundDailyQuota, sendBatch, layout, renderTemplate, renderSignature,
  type BatchMessage,
} from './marketing';

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';

// Loads each seller's rendered e-mail signature (when enabled) keyed by their
// e-mail (lowercase) — matches `replyTo`. Briefly cached because a warm
// serverless instance would otherwise re-fetch all signature HTML on every
// batch of the same campaign run (and the cron loops many batches).
let signatureMapCache: { map: Map<string, string>; expiresAt: number } | null = null;
const SIGNATURE_MAP_TTL_MS = 5 * 60 * 1000;

export async function buildSignatureMap(): Promise<Map<string, string>> {
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

export interface CampaignBatchResult {
  done: boolean;
  sentNow: number;
  failedNow: number;
  remaining: number;
  account?: string;
  reason?: 'daily_limit_all';
  notFound?: boolean;
}

/**
 * Envia UM lote (≤100, limitado pela cota diária restante da conta ativa) de
 * uma campanha e retorna. Chamado em loop pelo frontend (via router) e pelo
 * cron diário. Cada chamada fica bem abaixo do timeout serverless da Vercel.
 *
 * Reusa os mecanismos já existentes: claim atômico ('pending'→'sending' com
 * FOR UPDATE SKIP LOCKED + reciclagem de órfãs >15min) e reserva atômica de
 * cota (reserveSendQuota/refundDailyQuota).
 */
export async function processCampaignBatch(campaignId: number): Promise<CampaignBatchResult> {
  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId));
  if (!campaign) {
    return { done: true, sentNow: 0, failedNow: 0, remaining: 0, notFound: true };
  }

  // Reclaim orphaned reservations: rows a prior invocation flipped to
  // 'sending' but never finalized (e.g. the function died mid-send). 15 min
  // is far beyond any serverless execution window, so an older 'sending' row
  // is certainly abandoned and safe to release back to the pool.
  await db.update(emailCampaignRecipients)
    .set({ status: 'pending', claimedAt: null })
    .where(and(
      eq(emailCampaignRecipients.campaignId, campaignId),
      eq(emailCampaignRecipients.status, 'sending'),
      lt(emailCampaignRecipients.claimedAt, new Date(Date.now() - 15 * 60 * 1000)),
    ));

  // "Unsent" = still pending OR being sent right now by a concurrent
  // invocation. Counting both keeps the campaign from being marked 'sent'
  // while another invocation still has rows in flight.
  const [pendingRow] = await db.select({ cnt: count() })
    .from(emailCampaignRecipients)
    .where(and(
      eq(emailCampaignRecipients.campaignId, campaignId),
      inArray(emailCampaignRecipients.status, ['pending', 'sending']),
    ));
  const pendingCount = Number(pendingRow?.cnt ?? 0);

  if (pendingCount === 0) {
    await db.update(emailCampaigns).set({ status: 'sent', updatedAt: new Date() }).where(eq(emailCampaigns.id, campaignId));
    return { done: true, sentNow: 0, failedNow: 0, remaining: 0 };
  }

  // Reserve daily quota BEFORE sending (atomic) so two concurrent invocations
  // can't both spend the same remaining quota and blow the daily cap. The
  // reservation walks the account cascade for us.
  const want = Math.min(100, pendingCount);
  const reserved = await reserveSendQuota(want);
  if (!reserved) {
    return { done: false, sentNow: 0, failedNow: 0, remaining: pendingCount, reason: 'daily_limit_all' };
  }
  const { account, granted } = reserved;

  const batchSize = granted;

  // Atomic claim: flip up to batchSize 'pending' rows to 'sending' and get
  // them back via RETURNING. `FOR UPDATE SKIP LOCKED` guarantees two
  // concurrent invocations (double click, retry, two tabs, cron + front) never
  // grab the same rows — each one only sends what it actually claimed here.
  const claimed = await db.execute<{
    id: number; email: string; name: string | null; replyTo: string | null;
    taskId: number | null; unsubToken: string;
  }>(dsql`
    UPDATE email_campaign_recipients
    SET status = 'sending', claimed_at = now()
    WHERE id IN (
      SELECT id FROM email_campaign_recipients
      WHERE campaign_id = ${campaignId} AND status = 'pending'
      ORDER BY id
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, email, name, reply_to AS "replyTo", task_id AS "taskId", unsub_token AS "unsubToken"
  `);
  const recipients = claimed.rows;

  if (recipients.length === 0) {
    // Another invocation currently holds every pending row. Nothing to send
    // here — return the reserved quota and keep the caller polling.
    await refundDailyQuota(account.key, granted);
    return { done: false, sentNow: 0, failedNow: 0, remaining: pendingCount };
  }

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

  let sentNow = 0, failedNow = 0, confirmedFailures = 0;
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

    const results = await sendBatch(account, messages);
    for (let i = 0; i < toSend.length; i++) {
      const r = toSend[i];
      const res = results[i];
      if (res.ok) {
        sentNow++;
        await db.update(emailCampaignRecipients)
          .set({ status: 'sent', accountKey: account.key, messageId: res.messageId, sentAt: new Date() })
          .where(eq(emailCampaignRecipients.id, r.id));
      } else {
        failedNow++;
        // Only definitive provider rejections free their reserved slot;
        // timeouts/unknown ('network_error') keep it (the mail may have gone).
        if (res.error !== 'network_error') confirmedFailures++;
        await db.update(emailCampaignRecipients)
          .set({ status: 'failed', accountKey: account.key, error: res.error })
          .where(eq(emailCampaignRecipients.id, r.id));
      }
    }
  }

  // Return the quota reserved but not actually spent: slots for rows we never
  // sent (fewer claimed than granted, or suppressed) plus confirmed provider
  // rejections.
  const unusedReservation = Math.max(0, granted - toSend.length);
  await refundDailyQuota(account.key, unusedReservation + confirmedFailures);

  await db.update(emailCampaigns).set({
    sentCount: dsql`${emailCampaigns.sentCount} + ${sentNow}`,
    failedCount: dsql`${emailCampaigns.failedCount} + ${failedNow}`,
    status: 'sending',
    updatedAt: new Date(),
  }).where(eq(emailCampaigns.id, campaignId));

  const remaining = Math.max(0, pendingCount - sentNow - failedNow - toSkip.length);
  if (remaining === 0) {
    // Clear stored attachments once finished to keep the DB lean.
    await db.update(emailCampaigns).set({ status: 'sent', attachments: null, updatedAt: new Date() }).where(eq(emailCampaigns.id, campaignId));
  }

  return { done: remaining === 0, sentNow, failedNow, remaining, account: account.key };
}

export interface CronCampaignResult {
  promoted: number;
  campaignsProcessed: number;
  sent: number;
  failed: number;
  quotaExhausted: boolean;
  timeBudgetHit: boolean;
}

/**
 * Cron-only: (1) promove campanhas agendadas cujo `scheduledAt` já venceu para
 * 'sending', e (2) processa em lote todas as campanhas 'sending' com
 * destinatários pendentes — usando a MESMA `processCampaignBatch` do envio pelo
 * front — até esgotar a cota do dia OU o orçamento de tempo (`deadline`, epoch
 * ms), deixando o restante para o loop da aba/próximo dia. Isso evita estourar
 * o timeout serverless de 60s da Vercel.
 *
 * A cascata de cota é respeitada naturalmente: as sequências rodam ANTES no
 * cron e consomem a cota primeiro via reserveSendQuota; as campanhas pegam o
 * que sobrar.
 */
export async function processDueCampaigns(deadline: number): Promise<CronCampaignResult> {
  const result: CronCampaignResult = {
    promoted: 0, campaignsProcessed: 0, sent: 0, failed: 0, quotaExhausted: false, timeBudgetHit: false,
  };
  const now = new Date();

  // 1. Promote scheduled campaigns whose time has come.
  try {
    const promoted = await db.update(emailCampaigns)
      .set({ status: 'sending', updatedAt: now })
      .where(and(
        eq(emailCampaigns.status, 'scheduled'),
        isNotNull(emailCampaigns.scheduledAt),
        lte(emailCampaigns.scheduledAt, now),
      ))
      .returning({ id: emailCampaigns.id });
    result.promoted = promoted.length;
  } catch (err) {
    console.error('[processDueCampaigns] promote error:', err);
  }

  // 2. Campaigns in flight ('sending') that still have pending/in-flight
  // recipients. Draft campaigns are NEVER auto-sent here — the admin sends
  // those explicitly. This is exactly the resilience guarantee: a 'sending'
  // campaign left half-done because the admin closed the tab gets finished by
  // the cron.
  let dueCampaigns: { id: number }[] = [];
  try {
    dueCampaigns = await db.selectDistinct({ id: emailCampaigns.id })
      .from(emailCampaigns)
      .innerJoin(emailCampaignRecipients, eq(emailCampaignRecipients.campaignId, emailCampaigns.id))
      .where(and(
        eq(emailCampaigns.status, 'sending'),
        or(
          eq(emailCampaignRecipients.status, 'pending'),
          eq(emailCampaignRecipients.status, 'sending'),
        ),
      ));
  } catch (err) {
    console.error('[processDueCampaigns] list error:', err);
    return result;
  }

  for (const c of dueCampaigns) {
    if (Date.now() > deadline) { result.timeBudgetHit = true; break; }
    let done = false;
    while (!done) {
      if (Date.now() > deadline) { result.timeBudgetHit = true; break; }
      let res: CampaignBatchResult;
      try {
        res = await processCampaignBatch(c.id);
      } catch (err) {
        console.error(`[processDueCampaigns] campaign ${c.id} batch error:`, err);
        break;
      }
      result.sent += res.sentNow;
      result.failed += res.failedNow;
      done = res.done;
      if (res.reason === 'daily_limit_all') {
        result.quotaExhausted = true;
        // Cota diária esgotada em TODAS as contas — nada mais sai hoje.
        return result;
      }
    }
    result.campaignsProcessed++;
  }

  return result;
}
