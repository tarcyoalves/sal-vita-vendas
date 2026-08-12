import sanitizeHtml from 'sanitize-html';
import { ordersDb as db } from '../db/ordersDb';
import { db as mainDb } from '../db';
import { sql } from 'drizzle-orm';
import {
  emailCampaigns,
  emailCampaignRecipients,
  emailSuppressions,
  emailSendCounters,
  emailEvents,
} from '../db/schema';
import {
  reserveSendQuota,
  refundDailyQuota,
  sendBatch,
  OutboundMessage,
} from './marketingQuota';
import { randomUUID } from 'crypto';

export interface AudienceMember {
  email: string;
  name?: string;
  source: 'order' | 'cart' | 'b2b' | 'contact';
}

/** Sanitize campaign HTML to prevent XSS attacks while allowing rich layout tags. */
export function sanitizeCampaignHtml(rawHtml: string): string {
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'p', 'a', 'ul', 'ol',
      'nl', 'li', 'b', 'i', 'strong', 'em', 'strike', 'code', 'hr', 'br', 'div',
      'table', 'thead', 'caption', 'tbody', 'tr', 'th', 'td', 'pre', 'img', 'span',
      'style', 'section', 'header', 'footer'
    ],
    allowedAttributes: {
      '*': ['style', 'class', 'align', 'valign', 'width', 'height', 'bgcolor', 'border', 'cellpadding', 'cellspacing'],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'srcset', 'alt', 'title', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

/** Converts formatted text to HTML paragraphs. */
export function bodyToHtml(body: string): string {
  if (body.includes('<p>') || body.includes('<div>') || body.includes('<table')) {
    return sanitizeCampaignHtml(body);
  }
  const formatted = body
    .split(/\n\s*\n/)
    .map(p => `<p style="margin:0 0 16px;line-height:1.6;color:#334155;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return sanitizeCampaignHtml(formatted);
}

/** Wraps content in a 600px responsive table layout with Sal Vita Premium branding and RFC 8058 footer. */
export function layout(preheader: string, bodyContent: string, unsubToken?: string): string {
  const publicAppUrl = process.env.PUBLIC_APP_URL || 'https://www.premium.salvitarn.com.br';
  const unsubUrl = unsubToken
    ? `${publicAppUrl}/api/unsubscribe?t=${unsubToken}`
    : `${publicAppUrl}/api/unsubscribe`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sal Vita Premium</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&zwnj;&zwnj;&zwnj;&zwnj;</div>
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:24px 12px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);border:1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background:#0C3680;padding:28px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">SAL VITA PREMIUM</h1>
              <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">Sal Marinho 100% Natural de Mossoró/RN</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 28px;color:#334155;font-size:15px;line-height:1.6;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f1f5f9;padding:20px 28px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;color:#64748b;font-size:12px;">
                Sal Vita Premium — Flor de Sal e Sal Marinho de Mossoró/RN<br/>
                Caso não deseje mais receber nossas novidades e ofertas, <a href="${unsubUrl}" style="color:#0C3680;text-decoration:underline;">clique aqui para se descadastrar</a>.
              </p>
              <p style="margin:0;color:#94a3b8;font-size:11px;">
                © ${new Date().getFullYear()} Sal Vita. Todos os direitos reservados.
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

/** Replaces variables like {nome}, {empresa}, {unsubscribe} in template strings. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    const re = new RegExp(`\\{${key}\\}`, 'gi');
    result = result.replace(re, val ?? '');
  }
  return result;
}

/**
 * Builds campaign audience reading from:
 * 1. `site_orders.customer_email` (Buyers)
 * 2. `abandoned_carts.customer_email` (Abandoned Checkouts)
 * 3. `contacts` + `companies` (B2B leads from main database with consent)
 * Deduplicates by email and excludes suppressed/frequency-capped contacts.
 */
export async function buildAudience(): Promise<AudienceMember[]> {
  const membersMap = new Map<string, AudienceMember>();

  // 1. Buyers from site_orders
  try {
    const ordersRes = await db.execute(sql`
      SELECT DISTINCT customer_email, customer_name
      FROM site_orders
      WHERE customer_email IS NOT NULL AND TRIM(customer_email) != ''
    `);
    for (const r of ordersRes.rows as any[]) {
      const email = String(r.customer_email).trim().toLowerCase();
      if (email && email.includes('@')) {
        membersMap.set(email, { email, name: r.customer_name || undefined, source: 'order' });
      }
    }
  } catch (err) {
    console.error('[buildAudience] Error fetching site_orders:', err);
  }

  // 2. Abandoned carts
  try {
    const cartsRes = await db.execute(sql`
      SELECT DISTINCT customer_email, customer_name
      FROM abandoned_carts
      WHERE customer_email IS NOT NULL AND TRIM(customer_email) != '' AND opted_out = FALSE
    `);
    for (const r of cartsRes.rows as any[]) {
      const email = String(r.customer_email).trim().toLowerCase();
      if (email && email.includes('@') && !membersMap.has(email)) {
        membersMap.set(email, { email, name: r.customer_name || undefined, source: 'cart' });
      }
    }
  } catch (err) {
    console.error('[buildAudience] Error fetching abandoned_carts:', err);
  }

  // 3. B2B Contacts (from mainDb)
  try {
    const b2bRes = await mainDb.execute(sql`
      SELECT DISTINCT c.email, c.name
      FROM contacts c
      WHERE c.email IS NOT NULL AND TRIM(c.email) != ''
    `);
    for (const r of b2bRes.rows as any[]) {
      const email = String(r.email).trim().toLowerCase();
      if (email && email.includes('@') && !membersMap.has(email)) {
        membersMap.set(email, { email, name: r.name || undefined, source: 'b2b' });
      }
    }
  } catch (err) {
    console.error('[buildAudience] Error fetching B2B contacts:', err);
  }

  // 4. Marketing Contacts table in ordersDb
  try {
    const mktRes = await db.execute(sql`
      SELECT DISTINCT email, name
      FROM marketing_contacts
      WHERE email IS NOT NULL AND TRIM(email) != '' AND status = 'active'
    `);
    for (const r of mktRes.rows as any[]) {
      const email = String(r.email).trim().toLowerCase();
      if (email && email.includes('@') && !membersMap.has(email)) {
        membersMap.set(email, { email, name: r.name || undefined, source: 'contact' });
      }
    }
  } catch (err) {
    console.error('[buildAudience] Error fetching marketing_contacts:', err);
  }

  // Fetch all suppressions across all databases (Premium, CRM, B2B)
  const suppressedEmails = new Set<string>();

  try {
    const supp1 = await db.execute(sql`SELECT email FROM email_suppressions`);
    for (const r of supp1.rows as any[]) suppressedEmails.add(String(r.email).toLowerCase());
  } catch {}

  try {
    const supp2 = await mainDb.execute(sql`SELECT email FROM suppression_list WHERE email IS NOT NULL`);
    for (const r of supp2.rows as any[]) suppressedEmails.add(String(r.email).toLowerCase());
  } catch {}

  try {
    const supp3 = await mainDb.execute(sql`SELECT email FROM email_suppressions WHERE email IS NOT NULL`);
    for (const r of supp3.rows as any[]) suppressedEmails.add(String(r.email).toLowerCase());
  } catch {}

  // Filter suppressed members
  const audience: AudienceMember[] = [];
  for (const [email, member] of membersMap.entries()) {
    if (!suppressedEmails.has(email)) {
      audience.push(member);
    }
  }

  return audience;
}

/**
 * Claims up to batchSize recipient rows using FOR UPDATE SKIP LOCKED.
 * Also recycles orphaned claims where claimed_at > 15m.
 */
export async function processCampaignBatch(campaignId: number, batchSize = 50): Promise<{ processed: number; sent: number; failed: number }> {
  // 1. Recycle orphan claims
  await db.execute(sql`
    UPDATE email_campaign_recipients
    SET status = 'pending', claimed_at = NULL
    WHERE campaign_id = ${campaignId}
      AND status = 'sending'
      AND claimed_at < NOW() - INTERVAL '15 minutes'
  `);

  // 2. Claim pending recipients atomically
  const claimedRows = await db.execute(sql`
    WITH to_claim AS (
      SELECT id FROM email_campaign_recipients
      WHERE campaign_id = ${campaignId} AND status = 'pending'
      ORDER BY id ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE email_campaign_recipients r
    SET status = 'sending', claimed_at = NOW()
    FROM to_claim
    WHERE r.id = to_claim.id
    RETURNING r.id, r.email, r.name, r.variant, r.unsub_token
  `);

  const recipients = claimedRows.rows as any[];
  if (recipients.length === 0) {
    // Check if campaign is finished
    const remaining = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM email_campaign_recipients
      WHERE campaign_id = ${campaignId} AND status IN ('pending', 'sending')
    `);
    const count = Number((remaining.rows[0] as any)?.cnt ?? 0);
    if (count === 0) {
      await db.execute(sql`
        UPDATE email_campaigns
        SET status = 'sent', updated_at = NOW()
        WHERE id = ${campaignId} AND status IN ('sending', 'scheduled')
      `);
    }
    return { processed: 0, sent: 0, failed: 0 };
  }

  // 3. Fetch campaign content
  const campRes = await db.execute(sql`
    SELECT id, name, subject, subject_b, html_body FROM email_campaigns WHERE id = ${campaignId}
  `);
  const campaign = campRes.rows[0] as any;
  if (!campaign) return { processed: 0, sent: 0, failed: 0 };

  // 4. Reserve sending quota in multi-account cascade
  const reservation = await reserveSendQuota(recipients.length);
  if (!reservation) {
    // Quotas exhausted! Revert claimed recipients to pending
    const ids = recipients.map(r => r.id);
    await db.execute(sql`
      UPDATE email_campaign_recipients
      SET status = 'pending', claimed_at = NULL
      WHERE id = ANY(${ids}::int[])
    `);
    return { processed: 0, sent: 0, failed: 0 };
  }

  const { account, granted } = reservation;
  const dispatchRecipients = recipients.slice(0, granted);
  const leftOver = recipients.slice(granted);

  if (leftOver.length > 0) {
    const leftIds = leftOver.map(r => r.id);
    await db.execute(sql`
      UPDATE email_campaign_recipients
      SET status = 'pending', claimed_at = NULL
      WHERE id = ANY(${leftIds}::int[])
    `);
  }

  // 5. Prepare outbound messages
  const outboundMessages: OutboundMessage[] = dispatchRecipients.map(r => {
    const subject = (r.variant === 'B' && campaign.subject_b) ? campaign.subject_b : campaign.subject;
    const bodyContent = bodyToHtml(renderTemplate(campaign.html_body, {
      nome: r.name || 'Cliente',
      email: r.email,
      unsubscribe: `${process.env.PUBLIC_APP_URL || 'https://www.premium.salvitarn.com.br'}/api/unsubscribe?t=${r.unsub_token}`,
    }));

    return {
      to: r.email,
      subject,
      html: layout(subject, bodyContent, r.unsub_token),
      unsubToken: r.unsub_token,
    };
  });

  // 6. Send batch
  const results = await sendBatch(account, outboundMessages);

  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < dispatchRecipients.length; i++) {
    const rec = dispatchRecipients[i];
    const res = results[i];

    if (res.ok) {
      sentCount++;
      await db.execute(sql`
        UPDATE email_campaign_recipients
        SET status = 'sent', account_key = ${account.key}, message_id = ${res.messageId ?? null}, sent_at = NOW()
        WHERE id = ${rec.id}
      `);
    } else {
      failedCount++;
      await db.execute(sql`
        UPDATE email_campaign_recipients
        SET status = 'failed', account_key = ${account.key}, error = ${res.error ?? 'send_failed'}
        WHERE id = ${rec.id}
      `);
    }
  }

  // Refund unused quota if failures occurred
  if (failedCount > 0) {
    await refundDailyQuota(account.key, failedCount);
  }

  // 7. Update campaign counters
  await db.execute(sql`
    UPDATE email_campaigns
    SET sent_count = sent_count + ${sentCount},
        failed_count = failed_count + ${failedCount},
        updated_at = NOW()
    WHERE id = ${campaignId}
  `);

  return { processed: dispatchRecipients.length, sent: sentCount, failed: failedCount };
}
