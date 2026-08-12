import { Request, Response } from 'express';
import { ordersDb as db } from '../db/ordersDb';
import { db as mainDb } from '../db';
import { sql } from 'drizzle-orm';

/**
 * Propagates email suppression across ALL database instances (Premium, CRM, B2B)
 * to satisfy Option (b) LGPD compliance without cross-database JOINs at send time.
 */
export async function suppressEmailGlobal(email: string, reason = 'unsubscribe') {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) return;

  // 1. Premium suppression list (ordersDb)
  try {
    await db.execute(sql`
      INSERT INTO email_suppressions (email, reason)
      VALUES (${cleanEmail}, ${reason})
      ON CONFLICT (email) DO NOTHING
    `);
  } catch (err) {
    console.error('[suppressGlobal] Error in Premium email_suppressions:', err);
  }

  // 2. CRM suppression list (mainDb)
  try {
    await mainDb.execute(sql`
      INSERT INTO email_suppressions (email, reason)
      VALUES (${cleanEmail}, ${reason})
      ON CONFLICT (email) DO NOTHING
    `);
  } catch {}

  // 3. B2B suppression list (mainDb)
  try {
    await mainDb.execute(sql`
      INSERT INTO suppression_list (email, reason)
      VALUES (${cleanEmail}, ${reason})
      ON CONFLICT DO NOTHING
    `);
  } catch {}

  // 4. Update clients table in CRM
  try {
    await mainDb.execute(sql`
      UPDATE clients SET unsubscribed = TRUE WHERE LOWER(email) = ${cleanEmail}
    `);
  } catch {}

  // 5. Update abandoned_carts table in Premium
  try {
    await db.execute(sql`
      UPDATE abandoned_carts SET opted_out = TRUE WHERE LOWER(customer_email) = ${cleanEmail}
    `);
  } catch {}

  // 6. Cancel active sequence enrollments in Premium
  try {
    await db.execute(sql`
      UPDATE email_sequence_enrollments
      SET status = 'cancelled', updated_at = NOW()
      WHERE LOWER(email) = ${cleanEmail} AND status = 'active'
    `);
  } catch {}

  // 7. Update marketing_contacts in Premium
  try {
    await db.execute(sql`
      UPDATE marketing_contacts
      SET status = 'unsubscribed', updated_at = NOW()
      WHERE LOWER(email) = ${cleanEmail}
    `);
  } catch {}
}

export async function handleUnsubscribe(req: Request, res: Response) {
  const token = String(req.query.t || req.body?.t || req.query.token || '').trim();
  const rawEmail = String(req.query.email || req.body?.email || '').trim().toLowerCase();

  let targetEmail = rawEmail;

  if (token) {
    // Resolve email from campaign recipients or sequence enrollments
    try {
      const rec = await db.execute(sql`
        SELECT email FROM email_campaign_recipients WHERE unsub_token = ${token} LIMIT 1
      `);
      if (rec.rows.length > 0) {
        targetEmail = String((rec.rows[0] as any).email).toLowerCase();
      } else {
        const enr = await db.execute(sql`
          SELECT email FROM email_sequence_enrollments WHERE unsub_token = ${token} LIMIT 1
        `);
        if (enr.rows.length > 0) {
          targetEmail = String((enr.rows[0] as any).email).toLowerCase();
        }
      }
    } catch (err) {
      console.error('[unsubscribe] Token lookup error:', err);
    }
  }

  if (targetEmail) {
    await suppressEmailGlobal(targetEmail, 'unsubscribe');
  }

  // RFC 8058 One-Click Unsubscribe (POST)
  if (req.method === 'POST') {
    return res.status(200).send('Unsubscribed successfully');
  }

  // GET Request (Render clean confirmation UI)
  const brandColor = '#0C3680';
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Descadastro Confirmado | Sal Vita Premium</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; color: #1e293b; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; }
    .card { background: white; max-width: 480px; width: 100%; padding: 40px 32px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); text-align: center; border: 1px solid #e2e8f0; }
    .icon { width: 64px; height: 64px; background: #dbeafe; color: ${brandColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; font-size: 28px; }
    h1 { font-size: 22px; font-weight: 700; margin: 0 0 12px; color: ${brandColor}; }
    p { font-size: 15px; color: #64748b; line-height: 1.6; margin: 0 0 24px; }
    .badge { display: inline-block; background: #f1f5f9; color: #475569; padding: 6px 16px; border-radius: 9999px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .btn { display: inline-block; background: ${brandColor}; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Descadastro Confirmado</h1>
    ${targetEmail ? `<div class="badge">${targetEmail}</div>` : ''}
    <p>Seu e-mail foi removido de todas as nossas listas de transmissão e sequências automatizadas da Sal Vita Premium com sucesso.</p>
    <a href="https://www.premium.salvitarn.com.br" class="btn">Voltar para a Sal Vita Premium</a>
  </div>
</body>
</html>`;

  return res.status(200).send(html);
}
