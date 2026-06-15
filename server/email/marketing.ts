/**
 * Resend + Brevo integration for the E-mail Marketing tab (Lembretes CRM).
 *
 * Separate from server/email/resend.ts, which belongs to the Sal Vita
 * Premium e-commerce project and must not be touched here.
 *
 * Multi-account waterfall: Resend accounts are read from env vars
 * RESEND_MKT_API_KEY_1 / RESEND_MKT_FROM_1, _2, _3, ... Brevo accounts from
 * BREVO_API_KEY_1 / BREVO_FROM_1, _2, ... (Brevo accounts are appended after
 * the Resend ones, so they act as overflow once Resend is exhausted). Each
 * account has its own daily counter persisted in email_send_counters (DB —
 * survives cold starts). When an account hits RESEND_MKT_DAILY_LIMIT, the
 * next one in the waterfall is used.
 */

import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { sql } from '../db';
import { emailSendCounters } from '../db/schema';

export const BRAND = '#0C3680';
const MKT_DAILY_LIMIT = parseInt(process.env.RESEND_MKT_DAILY_LIMIT ?? '90');

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

/** Picks the first account in the waterfall with remaining quota today. Returns null if all are exhausted. */
export async function pickAccount(): Promise<{ account: MarketingAccount; remaining: number } | null> {
  for (const account of getAccounts()) {
    const sent = await getCounter(account.key);
    const remaining = MKT_DAILY_LIMIT - sent;
    if (remaining > 0) return { account, remaining };
  }
  return null;
}

export interface BatchMessage {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  unsubToken: string;
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

async function sendBatchResend(account: MarketingAccount, messages: BatchMessage[]): Promise<BatchResult[]> {
  const unsubBase = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';

  const payload = messages.map(m => ({
    from: account.from,
    to: [m.to],
    subject: m.subject,
    html: m.html,
    text: renderPlainText(m.html),
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
    const ids = body.messageIds ?? (body.messageId ? [body.messageId] : []);
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

/** Replaces {nome}, {empresa}, {unsubscribe} placeholders in a template string. */
export function renderTemplate(text: string, vars: { nome?: string; empresa?: string; unsubscribe?: string }): string {
  return text
    .replace(/\{nome\}/g, vars.nome || '')
    .replace(/\{empresa\}/g, vars.empresa || '')
    .replace(/\{unsubscribe\}/g, vars.unsubscribe || '#');
}

/**
 * Sanitizes admin-provided signature HTML before it's stored/sent in e-mails.
 * Only a small set of safe inline tags/attrs are allowed — strips
 * <script>, event handlers (on*), javascript: URLs, <style>, etc.
 */
export function sanitizeSignatureHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['a', 'b', 'strong', 'i', 'em', 'u', 'br', 'span', 'div', 'p', 'table', 'tbody', 'tr', 'td', 'font', 'img'],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'style'],
      img: ['src', 'alt', 'width', 'height', 'style'],
      font: ['color', 'size', 'face'],
      td: ['style', 'colspan', 'rowspan', 'width', 'align', 'valign'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  }).trim();
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
  const sigBlock = signatureHtml
    ? `<tr>
            <td style="padding:0 32px 24px;border-top:1px solid #eee;">
              <div style="padding-top:16px;font-size:13px;color:#444;line-height:1.6;">${signatureHtml}</div>
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
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 8px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
          <tr>
            <td style="background:${BRAND};padding:24px 32px;text-align:center;">
              <span style="font-family:'Pacifico',system-ui,Arial,sans-serif;font-size:28px;color:#ffffff;letter-spacing:1px;">
                &#127754; Sal Vita
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          ${sigBlock}
          <tr>
            <td style="background:#f4f4f4;padding:20px 32px;border-top:1px solid #e0e0e0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#888;">
                <strong>Sal Vita &mdash; Sal Marinho Premium de Mossoró/RN</strong>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#aaa;">
                Você está recebendo este e-mail porque é cliente ou contato da Sal Vita.<br />
                <a href="${unsubUrl}" style="color:#aaa;text-decoration:underline;">Não quero mais receber e-mails</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
