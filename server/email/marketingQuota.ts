import { ordersDb as db } from '../db/ordersDb';
import { sql } from 'drizzle-orm';
import { emailSendCounters } from '../db/schema';

export interface MarketingAccount {
  key: string;
  provider: 'resend' | 'brevo';
  apiKey: string;
  from: string;
}

export function getAccounts(): MarketingAccount[] {
  const accounts: MarketingAccount[] = [];

  // Primary: Resend accounts (1..5)
  for (let i = 1; i <= 5; i++) {
    const apiKey = process.env[`RESEND_MKT_API_KEY_${i}`] ?? (i === 1 ? process.env.RESEND_API_KEY : undefined);
    const from = process.env[`RESEND_MKT_FROM_${i}`] ?? (i === 1 ? 'Sal Vita Premium <contato@premium.salvitarn.com.br>' : undefined);
    if (apiKey && from) {
      accounts.push({ key: `resend_${i}`, provider: 'resend', apiKey, from });
    }
  }

  // Overflow: Brevo accounts (1..5)
  for (let i = 1; i <= 5; i++) {
    const apiKey = process.env[`BREVO_API_KEY_${i}`];
    const from = process.env[`BREVO_FROM_${i}`] ?? 'Sal Vita Premium <contato@premium.salvitarn.com.br>';
    if (apiKey && from) {
      accounts.push({ key: `brevo_${i}`, provider: 'brevo', apiKey, from });
    }
  }

  // Fallback: If no account matched above, default to single RESEND_API_KEY
  if (accounts.length === 0 && process.env.RESEND_API_KEY) {
    accounts.push({
      key: 'resend_1',
      provider: 'resend',
      apiKey: process.env.RESEND_API_KEY,
      from: 'Sal Vita Premium <contato@premium.salvitarn.com.br>',
    });
  }

  return accounts;
}

export function getAccountLimits(provider: 'resend' | 'brevo') {
  if (provider === 'brevo') {
    return {
      daily: parseInt(process.env.BREVO_DAILY_LIMIT ?? '300', 10),
      monthly: parseInt(process.env.BREVO_MONTHLY_LIMIT ?? '9000', 10),
    };
  }
  return {
    daily: parseInt(process.env.RESEND_MKT_DAILY_LIMIT ?? '90', 10),
    monthly: parseInt(process.env.RESEND_MKT_MONTHLY_LIMIT ?? '3000', 10),
  };
}

/** Local BRT Date string ('YYYY-MM-DD') for accurate quota day calculation (UTC-3). */
export function todayBrt(): string {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 3600 * 1000);
  return brt.toISOString().slice(0, 10);
}

export async function getMonthlyCounter(accountKey: string): Promise<number> {
  const currentMonthStr = todayBrt().slice(0, 7); // 'YYYY-MM'
  const res = await db.execute(sql`
    SELECT COALESCE(SUM(sent), 0) AS total
    FROM email_send_counters
    WHERE account_key = ${accountKey} AND day LIKE ${`${currentMonthStr}%`}
  `);
  return Number((res.rows[0] as any)?.total ?? 0);
}

export async function reserveDailyQuota(
  accountKey: string,
  want: number,
  dailyLimit: number
): Promise<number> {
  if (want <= 0) return 0;
  const day = todayBrt();

  // Ensure row exists
  await db.execute(sql`
    INSERT INTO email_send_counters (account_key, day, sent)
    VALUES (${accountKey}, ${day}, 0)
    ON CONFLICT (account_key, day) DO NOTHING
  `);

  // Atomic reservation using lock/update logic
  const rows = await db.execute(sql`
    WITH locked AS (
      SELECT sent AS old_sent FROM email_send_counters
      WHERE account_key = ${accountKey} AND day = ${day}
      FOR UPDATE
    )
    UPDATE email_send_counters c
    SET sent = c.sent + LEAST(${want}::int, GREATEST(${dailyLimit}::int - c.sent, 0))
    FROM locked
    WHERE c.account_key = ${accountKey} AND c.day = ${day}
    RETURNING c.sent AS new_sent, locked.old_sent AS old_sent
  `);
  const r = rows.rows[0] as any;
  return r ? Number(r.new_sent) - Number(r.old_sent) : 0;
}

export async function refundDailyQuota(accountKey: string, n: number) {
  if (n <= 0) return;
  const day = todayBrt();
  await db.execute(sql`
    UPDATE email_send_counters
    SET sent = GREATEST(sent - ${n}::int, 0)
    WHERE account_key = ${accountKey} AND day = ${day}
  `);
}

export async function reserveSendQuota(want: number) {
  for (const account of getAccounts()) {
    const limits = getAccountLimits(account.provider);
    const monthlyRoom = limits.monthly - (await getMonthlyCounter(account.key));
    if (monthlyRoom <= 0) continue;

    const granted = await reserveDailyQuota(
      account.key,
      Math.min(want, monthlyRoom),
      limits.daily
    );
    if (granted > 0) return { account, granted };
  }
  return null; // All accounts daily/monthly quota exhausted
}

export interface OutboundMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  unsubToken?: string;
}

export interface SendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/** Low-level batch dispatch handling Resend and Brevo APIs with RFC 8058 Unsubscribe Headers. */
export async function sendBatch(
  account: MarketingAccount,
  messages: OutboundMessage[]
): Promise<SendResult[]> {
  const publicAppUrl = process.env.PUBLIC_APP_URL || 'https://www.premium.salvitarn.com.br';
  const results: SendResult[] = [];

  for (const msg of messages) {
    try {
      const unsubUrl = msg.unsubToken
        ? `${publicAppUrl}/api/unsubscribe?t=${msg.unsubToken}`
        : `${publicAppUrl}/api/unsubscribe`;

      const headers: Record<string, string> = {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };

      if (account.provider === 'resend') {
        const payload: Record<string, any> = {
          from: account.from,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          headers,
        };
        if (msg.replyTo) payload.reply_to = msg.replyTo;

        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${account.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          results.push({ ok: true, messageId: data.id });
        } else {
          const errText = await res.text();
          console.warn(`[email-mkt] Resend error (${res.status}): ${errText}`);
          results.push({ ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 100)}` });
        }
      } else if (account.provider === 'brevo') {
        const payload: Record<string, any> = {
          sender: { email: account.from.includes('<') ? account.from.split('<')[1].replace('>', '').trim() : account.from },
          to: [{ email: msg.to }],
          subject: msg.subject,
          htmlContent: msg.html,
          headers,
        };
        if (msg.replyTo) payload.replyTo = { email: msg.replyTo };

        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': account.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const data = (await res.json()) as any;
          results.push({ ok: true, messageId: data.messageId ?? data.id });
        } else {
          const errText = await res.text();
          console.warn(`[email-mkt] Brevo error (${res.status}): ${errText}`);
          results.push({ ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 100)}` });
        }
      }
    } catch (err: any) {
      console.warn(`[email-mkt] Network/send error to ${msg.to}: ${err.message}`);
      results.push({ ok: false, error: 'network_error' });
    }
  }

  return results;
}
