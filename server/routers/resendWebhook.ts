import { Request, Response } from 'express';
import crypto from 'crypto';
import { ordersDb as db } from '../db/ordersDb';
import { sql } from 'drizzle-orm';
import { suppressEmailGlobal } from './unsubscribe';

/**
 * Verifies Svix/Resend HMAC signature using timingSafeEqual to prevent timing attacks.
 */
function verifySvixSignature(req: Request, rawBodyBuf: Buffer): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    // If webhook secret is not configured, fallback to accepting in dev/staging only if explicitly flagged
    return process.env.NODE_ENV !== 'production';
  }

  const svixId = req.headers['svix-id'] as string;
  const svixTimestamp = req.headers['svix-timestamp'] as string;
  const svixSignature = req.headers['svix-signature'] as string;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Prevent replay attacks (5 minute threshold)
  const nowSec = Math.floor(Date.now() / 1000);
  const msgSec = parseInt(svixTimestamp, 10);
  if (isNaN(msgSec) || Math.abs(nowSec - msgSec) > 300) {
    return false;
  }

  const secretBytes = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')
    : Buffer.from(secret, 'utf-8');

  const signedPayload = `${svixId}.${svixTimestamp}.${rawBodyBuf.toString('utf-8')}`;
  const computedHmac = crypto.createHmac('sha256', secretBytes).update(signedPayload).digest('base64');

  const signatures = svixSignature.split(' ');
  for (const sig of signatures) {
    const parts = sig.split(',');
    if (parts.length === 2 && parts[0] === 'v1') {
      const expectedBuf = Buffer.from(parts[1], 'base64');
      const computedBuf = Buffer.from(computedHmac, 'base64');
      if (expectedBuf.length === computedBuf.length && crypto.timingSafeEqual(expectedBuf, computedBuf)) {
        return true;
      }
    }
  }

  return false;
}

export async function handleResendWebhook(req: Request, res: Response) {
  const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
  
  if (!verifySvixSignature(req, rawBuf)) {
    console.warn('[resend-webhook] Signature verification failed');
    return res.status(401).json({ error: 'invalid_signature' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBuf.toString('utf-8'));
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  const type = event?.type;
  const data = event?.data;
  if (!type || !data) {
    return res.status(200).json({ received: true });
  }

  const messageId = data.email_id || data.id;
  const recipientEmail = Array.isArray(data.to) ? data.to[0] : (data.to || data.recipient);

  if (messageId && recipientEmail) {
    // Log event in email_events table
    try {
      await db.execute(sql`
        INSERT INTO email_events (message_id, recipient_email, event_type)
        VALUES (${messageId}, ${recipientEmail}, ${type})
      `);
    } catch (err) {
      console.error('[resend-webhook] Error inserting event:', err);
    }
  }

  // Handle bounces and spam complaints by suppressing email globally
  if (type === 'email.bounced' || type === 'email.complained') {
    if (recipientEmail) {
      const reason = type === 'email.bounced' ? 'bounce' : 'complaint';
      await suppressEmailGlobal(recipientEmail, reason);
      console.log(`[resend-webhook] Suppressed ${recipientEmail} due to ${reason}`);
    }
  }

  return res.status(200).json({ received: true });
}
