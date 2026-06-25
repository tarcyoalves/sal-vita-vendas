/**
 * Resend + Brevo integration for the E-mail Marketing tab (Lembretes CRM).
 *
 * Separate from server/email/resend.ts, which belongs to the Sal Vita
 * Premium e-commerce project and must not be touched here.
 *
 * Multi-account waterfall: Resend accounts are read from env vars
 * RESEND_MKT_API_KEY_1 / RESEND_MKT_FROM_1, _2, _3, ... Brevo accounts from
 * BREVO_API_KEY_1 / BREVO_FROM_1, _2, ... (appended after Resend as overflow).
 * Each account has its own daily counter persisted in email_send_counters.
 */

import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { sql } from '../db';
import { emailSendCounters } from '../db/schema';

export const BRAND = '#0C3680';
const MKT_DAILY_LIMIT = parseInt(process.env.RESEND_MKT_DAILY_LIMIT ?? '90');

export interface AccountLimits { daily: number; monthly: number; }

/** Per-provider send limits (free-plan defaults), env-overridable. */
export function getAccountLimits(provider: 'resend' | 'brevo'): AccountLimits {
  if (provider === 'brevo') {
    return {
      daily: parseInt(process.env.BREVO_DAILY_LIMIT ?? '300'),
      monthly: parseInt(process.env.BREVO_MONTHLY_LIMIT ?? '9000'),
    };
  }
  return {
    daily: parseInt(process.env.RESEND_MKT_DAILY_LIMIT ?? '90'),
    monthly: parseInt(process.env.RESEND_MKT_MONTHLY_LIMIT ?? '3000'),
  };
}

export interface MarketingAccount {
  key: string;       // 'mkt_1', 'mkt_2', ... (Resend) or 'brevo_1', 'brevo_2', ...
  provider: 'resend' | 'brevo';
  apiKey: string;
  from: string;       // e.g. "Sal Vita <contato@news.salvitarn.com.br>"
}

export function getAccounts(): MarketingAccount[] {
  const accounts: MarketingAccount[] = [];
  for (let i = 1; i <= 5; i++) {
    const apiKey = process.env[`RESEND_MKT_API_KEY_${i}`];
    const from = process.env[`RESEND_MKT_FROM_${i}`];
    if (apiKey && from) accounts.push({ key: `mkt_${i}`, provider: 'resend', apiKey, from });
  }
  for (let i = 1; i <= 5; i++) {
    const apiKey = process.env[`BREVO_API_KEY_${i}`];
    const from = process.env[`BREVO_FROM_${i}`];
    if (apiKey && from) accounts.push({ key: `brevo_${i}`, provider: 'brevo', apiKey, from });
  }
  return accounts;
}

/** Splits a "Name <email@domain>" string into its parts (Brevo's `sender` field needs them separate). */
function parseFromAddress(from: string): { name?: string; email: string } {
  const match = from.match(/^(.*)<(.+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, '');
    return { name: name || undefined, email: match[2].trim() };
  }
  return { email: from.trim() };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getCounter(accountKey: string): Promise<number> {
  const rows = await sql`
    SELECT sent FROM email_send_counters WHERE account_key = ${accountKey} AND day = ${today()}
  `;
  return (rows as unknown as Array<{ sent: number }>)[0]?.sent ?? 0;
}

async function incrementCounter(accountKey: string, n: number): Promise<void> {
  await sql`
    INSERT INTO email_send_counters (account_key, day, sent)
    VALUES (${accountKey}, ${today()}, ${n})
    ON CONFLICT (account_key, day) DO UPDATE SET sent = email_send_counters.sent + ${n}
  `;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

async function getMonthlyCounter(accountKey: string): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(sent), 0)::int AS total
    FROM email_send_counters
    WHERE account_key = ${accountKey} AND day LIKE ${currentMonth() + '%'}
  `;
  return (rows as unknown as Array<{ total: number }>)[0]?.total ?? 0;
}

/** Picks the first account in the waterfall with remaining daily AND monthly quota. Returns null if all are exhausted. */
export async function pickAccount(): Promise<{ account: MarketingAccount; remaining: number } | null> {
  for (const account of getAccounts()) {
    const limits = getAccountLimits(account.provider);
    const sentToday = await getCounter(account.key);
    const sentMonth = await getMonthlyCounter(account.key);
    const remainingDaily = limits.daily - sentToday;
    const remainingMonthly = limits.monthly - sentMonth;
    const remaining = Math.min(remainingDaily, remainingMonthly);
    if (remaining > 0) return { account, remaining };
  }
  return null;
}

export interface AccountUsage {
  key: string;
  provider: 'resend' | 'brevo';
  fromName?: string;
  fromEmail: string;
  sentToday: number;
  dailyLimit: number;
  sentThisMonth: number;
  monthlyLimit: number;
}

/** Per-account consumption snapshot for the admin usage dashboard. */
export async function getUsage(): Promise<AccountUsage[]> {
  const out: AccountUsage[] = [];
  for (const account of getAccounts()) {
    const limits = getAccountLimits(account.provider);
    const { name, email } = parseFromAddress(account.from);
    out.push({
      key: account.key,
      provider: account.provider,
      fromName: name,
      fromEmail: email,
      sentToday: await getCounter(account.key),
      dailyLimit: limits.daily,
      sentThisMonth: await getMonthlyCounter(account.key),
      monthlyLimit: limits.monthly,
    });
  }
  return out;
}

export interface DomainTrackingInfo {
  accountKey: string;
  fromEmail: string;
  domainId?: string;
  domainName?: string;
  openTracking?: boolean;
  clickTracking?: boolean;
  status?: string;
  error?: string;
}

/**
 * Lists the Resend domains for one marketing account, returning each domain's
 * open/click tracking flags. Brevo accounts are skipped (Brevo tracks by default).
 *
 * IMPORTANT: open/click tracking in Resend is a DOMAIN-LEVEL setting, not a
 * per-email one. Enabling `tracking` in the send payload does nothing — the API
 * silently ignores it. Tracking must be turned on for the sending domain, either
 * in the dashboard (Domains → Configuration) or via setDomainTracking() below.
 */
export async function getDomainTracking(account: MarketingAccount): Promise<DomainTrackingInfo[]> {
  if (account.provider !== 'resend') return [];
  const { email } = parseFromAddress(account.from);
  try {
    const res = await fetch('https://api.resend.com/domains', {
      method: 'GET',
      headers: { Authorization: `Bearer ${account.apiKey}` },
    });
    if (!res.ok) {
      return [{ accountKey: account.key, fromEmail: email, error: `resend_${res.status}` }];
    }
    const body = await res.json() as {
      data?: Array<{
        id: string; name: string; status?: string;
        open_tracking?: boolean; click_tracking?: boolean;
      }>;
    };
    const domains = body.data ?? [];
    if (domains.length === 0) {
      return [{ accountKey: account.key, fromEmail: email, error: 'no_domains' }];
    }
    return domains.map(d => ({
      accountKey: account.key,
      fromEmail: email,
      domainId: d.id,
      domainName: d.name,
      openTracking: d.open_tracking,
      clickTracking: d.click_tracking,
      status: d.status,
    }));
  } catch {
    return [{ accountKey: account.key, fromEmail: email, error: 'network_error' }];
  }
}

/**
 * Enables (or disables) open/click tracking for a specific Resend domain via
 * PATCH /domains/:id. This is the ONLY programmatic way to turn tracking on —
 * there is no per-email switch. Returns the updated flags or an error string.
 *
 * Note: enabling click tracking rewrites links through a tracking subdomain; for
 * best deliverability Resend recommends configuring a custom tracking subdomain
 * (CNAME) in the dashboard, but open tracking works with the default setup.
 */
export async function setDomainTracking(
  account: MarketingAccount,
  domainId: string,
  flags: { openTracking?: boolean; clickTracking?: boolean },
): Promise<{ ok: boolean; openTracking?: boolean; clickTracking?: boolean; error?: string }> {
  if (account.provider !== 'resend') return { ok: false, error: 'not_resend' };
  const payload: Record<string, boolean> = {};
  if (flags.openTracking !== undefined) payload.open_tracking = flags.openTracking;
  if (flags.clickTracking !== undefined) payload.click_tracking = flags.clickTracking;
  try {
    const res = await fetch(`https://api.resend.com/domains/${domainId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      console.error(`[email-marketing] Resend domain update error ${res.status}:`, err);
      return { ok: false, error: `resend_${res.status}` };
    }
    return { ok: true, openTracking: flags.openTracking, clickTracking: flags.clickTracking };
  } catch {
    return { ok: false, error: 'network_error' };
  }
}

/** Tracking status across all Resend marketing accounts (for the admin dashboard). */
export async function getAllDomainTracking(): Promise<DomainTrackingInfo[]> {
  const out: DomainTrackingInfo[] = [];
  for (const account of getAccounts()) {
    if (account.provider !== 'resend') continue;
    out.push(...await getDomainTracking(account));
  }
  return out;
}

const REQUIRED_WEBHOOK_EVENTS = [
  'email.sent', 'email.delivered', 'email.opened',
  'email.clicked', 'email.bounced', 'email.complained',
];

export interface WebhookInfo {
  id: string;
  endpointUrl: string;
  events: string[];
  active?: boolean;
}

export async function listResendWebhooks(account: MarketingAccount): Promise<WebhookInfo[]> {
  if (account.provider !== 'resend') return [];
  try {
    const res = await fetch('https://api.resend.com/webhooks', {
      headers: { Authorization: `Bearer ${account.apiKey}` },
    });
    if (!res.ok) {
      console.warn(`[tracking] GET /webhooks failed: ${res.status}`);
      return [];
    }
    const raw = await res.json();
    console.log(`[tracking] webhooks response:`, JSON.stringify(raw).slice(0, 500));
    const items = Array.isArray(raw) ? raw : (raw as any)?.data ?? [];
    return items.map((w: any) => ({
      id: String(w.id ?? ''),
      endpointUrl: String(w.url ?? w.endpoint_url ?? w.endpoint ?? ''),
      events: Array.isArray(w.events) ? w.events : [],
      active: w.active,
    }));
  } catch (err) {
    console.warn('[tracking] listWebhooks error:', err);
    return [];
  }
}

export async function ensureWebhookEvents(account: MarketingAccount, _webhookUrl: string): Promise<{ fixed: boolean; error?: string }> {
  if (account.provider !== 'resend') return { fixed: false };
  const webhooks = await listResendWebhooks(account);
  if (webhooks.length === 0) return { fixed: false, error: 'no_webhooks' };

  const match = webhooks.find(w => w.endpointUrl && w.endpointUrl.includes('resend-webhook'));
  if (!match) {
    console.warn(`[tracking] no webhook matching 'resend-webhook'. Found: ${webhooks.map(w => w.endpointUrl).join(', ')}`);
    return { fixed: false, error: `no_match. endpoints: ${webhooks.map(w => w.endpointUrl).join(', ')}` };
  }

  const missing = REQUIRED_WEBHOOK_EVENTS.filter(e => !match.events.includes(e));
  console.log(`[tracking] webhook ${match.id}: events=${JSON.stringify(match.events)}, missing=${JSON.stringify(missing)}`);
  if (missing.length === 0) return { fixed: false };

  try {
    const res = await fetch(`https://api.resend.com/webhooks/${match.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.apiKey}` },
      body: JSON.stringify({ url: match.endpointUrl, events: REQUIRED_WEBHOOK_EVENTS }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      return { fixed: false, error: `resend_${res.status}: ${err}` };
    }
    return { fixed: true };
  } catch {
    return { fixed: false, error: 'network_error' };
  }
}

export interface EmailAttachment {
  filename: string;
  content: string; // base64-encoded file content
}

export interface BatchMessage {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  unsubToken: string;
  attachments?: EmailAttachment[];
}

/** Strips HTML tags/entities down to plain text — used as the `text` alternative in sendBatch (improves deliverability). */
export function renderPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|table|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Validates a Resend webhook's Svix signature against one or more webhook secrets
 * (RESEND_MKT_WEBHOOK_SECRET_1..5, one per multi-account Resend project). Tries each
 * secret until one matches. Returns false if no secret is configured or none match.
 */
export function verifyResendWebhook(
  rawBody: string,
  headers: { 'svix-id'?: string; 'svix-timestamp'?: string; 'svix-signature'?: string },
  secrets?: string[],
): boolean {
  const svixId = headers['svix-id'];
  const svixTimestamp = headers['svix-timestamp'];
  const svixSignature = headers['svix-signature'];
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const candidateSecrets = secrets ?? (() => {
    const list: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const s = process.env[`RESEND_MKT_WEBHOOK_SECRET_${i}`];
      if (s) list.push(s);
    }
    return list;
  })();
  if (candidateSecrets.length === 0) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  // svix-signature header format: "v1,<base64sig> v1,<base64sig2> ..."
  const providedSigs = svixSignature
    .split(' ')
    .map(part => part.split(',')[1])
    .filter(Boolean) as string[];
  if (providedSigs.length === 0) return false;

  for (const secret of candidateSecrets) {
    try {
      const secretKey = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
      const secretBytes = Buffer.from(secretKey, 'base64');
      const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
      for (const sig of providedSigs) {
        try {
          if (expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) {
            return true;
          }
        } catch {
          // length mismatch or invalid base64 — try next
        }
      }
    } catch {
      // invalid secret format — try next
    }
  }
  return false;
}

/**
 * Computes the next send timestamp for a sequence enrollment, based on `enrolledAt`
 * and the delay (in days) of the step at index `currentStep` (0-based: the NEXT
 * step to send). Returns null when there is no such step (sequence completed).
 */
export function computeNextSendAt(enrolledAt: Date, steps: { delayDays: number }[], currentStep: number): Date | null {
  const nextStep = steps[currentStep];
  if (!nextStep) return null;
  return new Date(enrolledAt.getTime() + nextStep.delayDays * 24 * 60 * 60 * 1000);
}

/**
 * Batched (no N+1) lookup of engagement (opened/clicked) per sequence enrollment,
 * based on the `email_sequence_sends` → `email_events` join via `message_id`.
 * Enrollments with no events at all simply don't appear in the result — callers
 * should treat a missing entry as `{ opened: false, clicked: false }`.
 */
export async function enrollmentEngagementBatch(
  enrollmentIds: number[],
): Promise<Map<number, { opened: boolean; clicked: boolean }>> {
  const out = new Map<number, { opened: boolean; clicked: boolean }>();
  if (enrollmentIds.length === 0) return out;

  const rows = await sql`
    SELECT sd.enrollment_id,
      bool_or(e.event_type = 'opened')  AS opened,
      bool_or(e.event_type = 'clicked') AS clicked
    FROM email_sequence_sends sd
    INNER JOIN email_events e ON e.message_id = sd.message_id
    WHERE sd.enrollment_id = ANY(${enrollmentIds})
    GROUP BY sd.enrollment_id
  ` as unknown as Array<{ enrollment_id: number; opened: boolean; clicked: boolean }>;

  for (const row of rows) {
    out.set(Number(row.enrollment_id), { opened: !!row.opened, clicked: !!row.clicked });
  }
  return out;
}

/**
 * Pure helper (no DB access) — evaluates a sequence step's `sendCondition`
 * against an enrollment's prior engagement.
 */
export function conditionMet(
  condition: string,
  eng: { opened: boolean; clicked: boolean },
): boolean {
  switch (condition) {
    case 'if_opened':      return eng.opened;
    case 'if_not_opened':  return !eng.opened;
    case 'if_clicked':     return eng.clicked;
    case 'if_not_clicked': return !eng.clicked;
    case 'always':
    default:               return true;
  }
}

export interface BatchResult {
  to: string;
  ok: boolean;
  messageId?: string;
  error?: string;
}

/** Sends up to 100 personalized messages via the account's provider (Resend or Brevo) and updates the daily counter. */
export async function sendBatch(account: MarketingAccount, messages: BatchMessage[]): Promise<BatchResult[]> {
  if (messages.length === 0) return [];
  if (account.provider === 'brevo') return sendBatchBrevo(account, messages);
  return sendBatchResend(account, messages);
}

async function sendSingleResend(
  account: MarketingAccount,
  m: BatchMessage,
  unsubBase: string,
): Promise<BatchResult> {
  const emailPayload = {
    from: account.from,
    to: [m.to],
    subject: m.subject,
    html: m.html,
    text: renderPlainText(m.html),
    // NOTE: Resend has NO per-email tracking parameter — open/click tracking is
    // configured at the DOMAIN level (dashboard → Domains → Configuration, or
    // PATCH /domains/:id via setDomainTracking below). Any `tracking` field here
    // is silently ignored by the API. See setDomainTracking().
    ...(m.replyTo ? { reply_to: [m.replyTo] } : {}),
    ...(m.attachments && m.attachments.length > 0
      ? { attachments: m.attachments.map(a => ({ filename: a.filename, content: a.content })) }
      : {}),
    headers: {
      'List-Unsubscribe': `<${unsubBase}/api/unsubscribe?t=${m.unsubToken}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.apiKey}` },
      body: JSON.stringify(emailPayload),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      console.error(`[email-marketing] Resend single error ${res.status}:`, err);
      return { to: m.to, ok: false, error: `resend_${res.status}` };
    }
    const body = await res.json() as { id?: string };
    return { to: m.to, ok: true, messageId: body.id };
  } catch (err) {
    return { to: m.to, ok: false, error: 'network_error' };
  }
}

async function sendBatchResend(account: MarketingAccount, messages: BatchMessage[]): Promise<BatchResult[]> {
  const unsubBase = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';
  const hasAttachments = messages.some(m => m.attachments && m.attachments.length > 0);

  if (hasAttachments) {
    const results: BatchResult[] = [];
    for (const m of messages) {
      results.push(await sendSingleResend(account, m, unsubBase));
    }
    await incrementCounter(account.key, results.filter(r => r.ok).length);
    return results;
  }

  const payload = messages.map(m => ({
    from: account.from,
    to: [m.to],
    subject: m.subject,
    html: m.html,
    text: renderPlainText(m.html),
    // Open/click tracking is domain-level only in Resend (see sendSingleResend
    // note and setDomainTracking) — no per-email tracking field exists.
    ...(m.replyTo ? { reply_to: [m.replyTo] } : {}),
    headers: {
      'List-Unsubscribe': `<${unsubBase}/api/unsubscribe?t=${m.unsubToken}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }));

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8_000);
    const res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${account.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      console.error(`[email-marketing] Resend batch error ${res.status}:`, err);
      return messages.map(m => ({ to: m.to, ok: false, error: `resend_${res.status}` }));
    }

    const body = await res.json() as { data?: Array<{ id: string }> };
    const results: BatchResult[] = messages.map((m, i) => ({
      to: m.to,
      ok: true,
      messageId: body.data?.[i]?.id,
    }));
    await incrementCounter(account.key, results.filter(r => r.ok).length);
    return results;
  } catch (err) {
    console.error('[email-marketing] sendBatch failed:', err);
    return messages.map(m => ({ to: m.to, ok: false, error: 'network_error' }));
  }
}

// Brevo's transactional API caps `messageVersions` at 99 per call.
const BREVO_MAX_VERSIONS = 99;

/** Sends personalized messages via Brevo's /v3/smtp/email `messageVersions`, chunked to BREVO_MAX_VERSIONS. */
async function sendBatchBrevo(account: MarketingAccount, messages: BatchMessage[]): Promise<BatchResult[]> {
  if (messages.length > BREVO_MAX_VERSIONS) {
    const results: BatchResult[] = [];
    for (let i = 0; i < messages.length; i += BREVO_MAX_VERSIONS) {
      results.push(...await sendBatchBrevo(account, messages.slice(i, i + BREVO_MAX_VERSIONS)));
    }
    return results;
  }

  const unsubBase = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';
  const sender = parseFromAddress(account.from);

  const messageVersions = messages.map(m => ({
    to: [{ email: m.to }],
    subject: m.subject,
    htmlContent: m.html,
    textContent: renderPlainText(m.html),
    ...(m.replyTo ? { replyTo: { email: m.replyTo } } : {}),
    headers: {
      'List-Unsubscribe': `<${unsubBase}/api/unsubscribe?t=${m.unsubToken}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }));

  // Brevo attachments: `name` + base64 `content`. Same for all recipients of
  // this broadcast, so taken from the first message (all share the same set).
  const brevoAttachment = messages[0].attachments && messages[0].attachments.length > 0
    ? messages[0].attachments.map(a => ({ name: a.filename, content: a.content }))
    : undefined;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'api-key': account.apiKey,
      },
      body: JSON.stringify({
        sender,
        // Top-level subject/htmlContent/to are required by the API but get
        // overridden per-recipient by messageVersions below.
        subject: messages[0].subject,
        htmlContent: messages[0].html,
        to: [{ email: messages[0].to }],
        ...(brevoAttachment ? { attachment: brevoAttachment } : {}),
        messageVersions,
      }),
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      console.error(`[email-marketing] Brevo batch error ${res.status}:`, err);
      return messages.map(m => ({ to: m.to, ok: false, error: `brevo_${res.status}` }));
    }

    const body = await res.json() as { messageId?: string; messageIds?: string[] };
    const rawIds = body.messageIds ?? (body.messageId ? [body.messageId] : []);
    const ids = rawIds.map(id => id?.replace(/^<|>$/g, ''));
    const results: BatchResult[] = messages.map((m, i) => ({
      to: m.to,
      ok: true,
      messageId: ids[i],
    }));
    await incrementCounter(account.key, results.filter(r => r.ok).length);
    return results;
  } catch (err) {
    console.error('[email-marketing] Brevo sendBatch failed:', err);
    return messages.map(m => ({ to: m.to, ok: false, error: 'network_error' }));
  }
}

export function sanitizeCampaignHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '')
    .replace(/\bhref\s*=\s*["']?\s*javascript\s*:/gi, 'href="')
    .replace(/\bsrc\s*=\s*["']?\s*javascript\s*:/gi, 'src="');
}

/** Replaces {nome}, {empresa}, {unsubscribe} placeholders in a template string. */
export function renderTemplate(text: string, vars: { nome?: string; empresa?: string; unsubscribe?: string }): string {
  return text
    .replace(/\{nome\}/g, vars.nome || '')
    .replace(/\{empresa\}/g, vars.empresa || '')
    .replace(/\{unsubscribe\}/g, vars.unsubscribe || '#');
}

/**
 * Converts an admin-written message body into safe email HTML.
 *
 * Admins usually paste plain text (with blank lines between paragraphs and
 * single line breaks inside them). Because the body is dropped straight into
 * an HTML layout, those line breaks would collapse and everything arrives as
 * one block. This detects plain text and rebuilds it as <p>/<br>, escaping
 * HTML and auto-linking URLs. If the body already contains block-level HTML
 * (a real HTML template), it is left untouched.
 */
export function bodyToHtml(text: string): string {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';

  // Already HTML (template with block-level structure)? Leave as-is.
  if (/<(br|p|div|table|ul|ol|h[1-6])[\s>\/]/i.test(trimmed)) return trimmed;

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const linkify = (s: string) =>
    s
      .replace(/(https?:\/\/[^\s<]+)/g, url =>
        `<a href="${url}" style="color:${BRAND};text-decoration:underline;">${url}</a>`)
      .replace(/(^|[\s(])(www\.[^\s<]+)/g, (_m, pre, host) =>
        `${pre}<a href="http://${host}" style="color:${BRAND};text-decoration:underline;">${host}</a>`);

  return trimmed
    .split(/\n{2,}/)
    .map(block => {
      const lines = block.split(/\n/).map(line => linkify(escape(line)));
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333;">${lines.join('<br />')}</p>`;
    })
    .join('');
}

/**
 * Sanitizes admin-provided signature HTML before it's stored/sent in e-mails.
 * Only a small set of safe inline tags/attrs are allowed — strips
 * <script>, event handlers (on*), javascript: URLs, <style>, etc.
 */
export function sanitizeSignatureHtml(html: string): string {
  const cleaned = sanitizeHtml(html, {
    allowedTags: ['a', 'b', 'strong', 'i', 'em', 'u', 'br', 'span', 'div', 'p', 'table', 'tbody', 'tr', 'td', 'font', 'img'],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'style'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      font: ['color', 'size', 'face'],
      table: ['cellpadding', 'cellspacing', 'border', 'width', 'style'],
      td: ['style', 'colspan', 'rowspan', 'width', 'align', 'valign'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  }).trim();
  return cleaned;
}

/**
 * Replaces `{atendente_*}` tokens in a signature HTML with the seller's data.
 * If a token resolves to an empty value, the whole line (segment between
 * <br> tags) containing it is dropped — avoids dangling labels like "Tel: ".
 */
export function renderSignature(html: string, seller: { name: string; email: string; phone?: string | null; department?: string | null }): string {
  const tokens: Record<string, string> = {
    '{atendente_nome}': seller.name || '',
    '{atendente_telefone}': seller.phone || '',
    '{atendente_email}': seller.email || '',
    '{atendente_cargo}': seller.department || '',
  };

  const segments = html.split(/(<br\s*\/?>)/i);
  const out = segments.map(segment => {
    if (/^<br\s*\/?>$/i.test(segment)) return segment;
    let hasEmptyToken = false;
    let replaced = segment;
    for (const [token, value] of Object.entries(tokens)) {
      if (replaced.includes(token)) {
        if (!value) hasEmptyToken = true;
        replaced = replaced.split(token).join(value);
      }
    }
    return hasEmptyToken ? '' : replaced;
  });

  return out.join('')
    .replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
    .replace(/^(\s*<br\s*\/?>\s*)+/i, '')
    .replace(/(\s*<br\s*\/?>\s*)+$/i, '');
}

/** Branded HTML layout with a real, LGPD-compliant unsubscribe link in the footer. */
export function layout(body: string, unsubUrl: string, signatureHtml?: string): string {
  let sigHtml = signatureHtml ?? '';
  if (sigHtml) {
    sigHtml = sigHtml
      .replace(/<table\b([^>]*)>/gi, (_m, attrs: string) => {
        const clean = attrs
          .replace(/\bwidth\s*=\s*["']?[^"'\s>]+["']?/gi, '');
        return `<table${clean}>`;
      })
      .replace(/<img\b([^>]*)>/gi, (_m, attrs: string) => {
        const clean = attrs
          .replace(/\bwidth\s*=\s*["']?[^"'\s>]+["']?/gi, '')
          .replace(/\bheight\s*=\s*["']?[^"'\s>]+["']?/gi, '')
          .replace(/\bstyle\s*=\s*["'][^"']*["']/gi, '');
        return `<img${clean} width="380" style="width:380px;max-width:100%;height:auto;display:block;">`;
      });
  }
  const sigBlock = sigHtml
    ? `<tr>
            <td style="padding:16px 40px 24px;border-top:1px solid #eee;">
              ${sigHtml}
            </td>
          </tr>`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sal Vita</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"
               style="width:100%;background:#ffffff;">
          <tr>
            <td style="padding:32px 40px 24px;">
              ${bodyToHtml(body)}
            </td>
          </tr>
          ${sigBlock}
          <tr>
            <td style="background:#f9f9f9;padding:20px 40px;border-top:1px solid #e0e0e0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;">
                <strong>Sal Vita &mdash; Sal Marinho Premium de Mossoró/RN</strong>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#aaa;">
                Você está recebendo este e-mail porque é cliente ou contato da Sal Vita.<br />
                <a href="${unsubUrl}" style="color:#aaa;text-decoration:underline;">Não quero mais receber e-mails</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#aaa;">Sal Vita &middot; Mossor&oacute;/RN &middot; Brasil</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
