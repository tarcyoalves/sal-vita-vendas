/**
 * Resend integration for the E-mail Marketing tab (Lembretes CRM).
 *
 * Separate from server/email/resend.ts, which belongs to the Sal Vita
 * Premium e-commerce project and must not be touched here.
 *
 * Multi-account waterfall: accounts are read from env vars
 * RESEND_MKT_API_KEY_1 / RESEND_MKT_FROM_1, _2, _3, ... Each account has its
 * own daily counter persisted in email_send_counters (DB — survives cold
 * starts). When account N hits RESEND_MKT_DAILY_LIMIT, account N+1 is used.
 */

import { sql } from '../db';
import { emailSendCounters } from '../db/schema';

export const BRAND = '#0C3680';
const MKT_DAILY_LIMIT = parseInt(process.env.RESEND_MKT_DAILY_LIMIT ?? '90');

export interface MarketingAccount {
  key: string;       // 'mkt_1', 'mkt_2', ...
  apiKey: string;
  from: string;       // e.g. "Sal Vita <contato@news.salvitarn.com.br>"
}

export function getAccounts(): MarketingAccount[] {
  const accounts: MarketingAccount[] = [];
  for (let i = 1; i <= 5; i++) {
    const apiKey = process.env[`RESEND_MKT_API_KEY_${i}`];
    const from = process.env[`RESEND_MKT_FROM_${i}`];
    if (apiKey && from) accounts.push({ key: `mkt_${i}`, apiKey, from });
  }
  return accounts;
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

export interface BatchResult {
  to: string;
  ok: boolean;
  messageId?: string;
  error?: string;
}

/** Sends up to 100 personalized messages via Resend's Batch API and updates the account's daily counter. */
export async function sendBatch(account: MarketingAccount, messages: BatchMessage[]): Promise<BatchResult[]> {
  if (messages.length === 0) return [];

  const unsubBase = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';

  const payload = messages.map(m => ({
    from: account.from,
    to: [m.to],
    subject: m.subject,
    html: m.html,
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

/** Replaces {nome}, {empresa}, {unsubscribe} placeholders in a template string. */
export function renderTemplate(text: string, vars: { nome?: string; empresa?: string; unsubscribe?: string }): string {
  return text
    .replace(/\{nome\}/g, vars.nome || '')
    .replace(/\{empresa\}/g, vars.empresa || '')
    .replace(/\{unsubscribe\}/g, vars.unsubscribe || '#');
}

/** Branded HTML layout with a real, LGPD-compliant unsubscribe link in the footer. */
export function layout(body: string, unsubUrl: string): string {
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
