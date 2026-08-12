import { ordersDb as db } from '../db/ordersDb';
import { db as mainDb } from '../db';
import { sql } from 'drizzle-orm';
import {
  reserveSendQuota,
  refundDailyQuota,
  sendBatch,
  OutboundMessage,
} from './marketingQuota';
import { bodyToHtml, layout, renderTemplate } from './marketingEngine';
import { randomUUID } from 'crypto';

export function computeNextSendAt(delayDays: number, fromDate = new Date()): Date {
  const next = new Date(fromDate.getTime());
  next.setDate(next.getDate() + Math.max(delayDays, 0));
  return next;
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  try {
    const s1 = await db.execute(sql`
      SELECT 1 FROM email_suppressions WHERE LOWER(email) = ${cleanEmail} LIMIT 1
    `);
    if (s1.rows.length > 0) return true;

    const s2 = await mainDb.execute(sql`
      SELECT 1 FROM suppression_list WHERE LOWER(email) = ${cleanEmail} LIMIT 1
    `);
    if (s2.rows.length > 0) return true;
  } catch {}
  return false;
}

/** Enrolls an email into a drip sequence with 4 safety checks and instant "Day 0" dispatch. */
export async function enrollInSequence(
  email: string,
  sequenceId: number,
  name?: string,
  replyTo?: string,
  taskId?: number
): Promise<{ ok: boolean; enrollmentId?: number; reason?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { ok: false, reason: 'invalid_email' };
  }

  // 1. Check suppression
  if (await isEmailSuppressed(cleanEmail)) {
    return { ok: false, reason: 'suppressed' };
  }

  // 2. Check sequence active & steps exist
  const seqRes = await db.execute(sql`
    SELECT id, active FROM email_sequences WHERE id = ${sequenceId}
  `);
  const sequence = seqRes.rows[0] as any;
  if (!sequence || !sequence.active) {
    return { ok: false, reason: 'sequence_inactive' };
  }

  const stepsRes = await db.execute(sql`
    SELECT id, step_order, delay_days FROM email_sequence_steps
    WHERE sequence_id = ${sequenceId}
    ORDER BY step_order ASC
    LIMIT 1
  `);
  const step1 = stepsRes.rows[0] as any;
  if (!step1) {
    return { ok: false, reason: 'no_steps' };
  }

  // 3. Deduplication: check active enrollment
  const existingRes = await db.execute(sql`
    SELECT id FROM email_sequence_enrollments
    WHERE sequence_id = ${sequenceId} AND LOWER(email) = ${cleanEmail} AND status = 'active'
    LIMIT 1
  `);
  if (existingRes.rows.length > 0) {
    return { ok: true, enrollmentId: Number((existingRes.rows[0] as any).id), reason: 'already_enrolled' };
  }

  // 4. Create enrollment
  const unsubToken = randomUUID();
  const nextSendAt = step1.delay_days === 0 ? new Date() : computeNextSendAt(step1.delay_days);

  const insRes = await db.execute(sql`
    INSERT INTO email_sequence_enrollments (
      sequence_id, email, name, reply_to, task_id, current_step, status, unsub_token, next_send_at, cycle_started_at
    )
    VALUES (
      ${sequenceId}, ${cleanEmail}, ${name ?? null}, ${replyTo ?? null}, ${taskId ?? null}, 0, 'active', ${unsubToken}, ${nextSendAt}, NOW()
    )
    RETURNING id
  `);

  const enrollmentId = Number((insRes.rows[0] as any).id);

  // If Day 0 step, process immediately
  if (step1.delay_days === 0) {
    try {
      await processSingleEnrollment(enrollmentId);
    } catch (err) {
      console.error(`[enrollInSequence] Instant dispatch error for enrollment ${enrollmentId}:`, err);
    }
  }

  return { ok: true, enrollmentId };
}

/** Processes a single sequence enrollment step. */
async function processSingleEnrollment(enrollmentId: number): Promise<boolean> {
  const enrRes = await db.execute(sql`
    SELECT e.id, e.sequence_id, e.email, e.name, e.reply_to, e.current_step, e.unsub_token, e.cycle_started_at, s.repeat, s.repeat_interval_days
    FROM email_sequence_enrollments e
    JOIN email_sequences s ON s.id = e.sequence_id
    WHERE e.id = ${enrollmentId} AND e.status = 'active'
  `);
  const enr = enrRes.rows[0] as any;
  if (!enr) return false;

  // Check suppression
  if (await isEmailSuppressed(enr.email)) {
    await db.execute(sql`
      UPDATE email_sequence_enrollments SET status = 'cancelled', updated_at = NOW() WHERE id = ${enrollmentId}
    `);
    return false;
  }

  const nextStepOrder = enr.current_step + 1;
  const stepRes = await db.execute(sql`
    SELECT * FROM email_sequence_steps
    WHERE sequence_id = ${enr.sequence_id} AND step_order = ${nextStepOrder}
    LIMIT 1
  `);
  const step = stepRes.rows[0] as any;
  if (!step) {
    // No more steps: complete or loop
    if (enr.repeat) {
      const nextSend = computeNextSendAt(enr.repeat_interval_days || 30);
      await db.execute(sql`
        UPDATE email_sequence_enrollments
        SET current_step = 0, cycle_started_at = NOW(), next_send_at = ${nextSend}, updated_at = NOW()
        WHERE id = ${enrollmentId}
      `);
    } else {
      await db.execute(sql`
        UPDATE email_sequence_enrollments SET status = 'completed', updated_at = NOW() WHERE id = ${enrollmentId}
      `);
    }
    return false;
  }

  // Check engagement conditions (if_opened, if_clicked, etc.)
  if (step.send_condition !== 'always' && enr.current_step > 0) {
    const prevSendRes = await db.execute(sql`
      SELECT message_id FROM email_sequence_sends
      WHERE enrollment_id = ${enrollmentId} AND status = 'sent'
      ORDER BY sent_at DESC LIMIT 1
    `);
    const prevMsgId = (prevSendRes.rows[0] as any)?.message_id;

    if (prevMsgId) {
      const evRes = await db.execute(sql`
        SELECT event_type FROM email_events WHERE message_id = ${prevMsgId}
      `);
      const events = new Set((evRes.rows as any[]).map(r => r.event_type));

      if (step.send_condition === 'if_opened' && !events.has('opened')) return false;
      if (step.send_condition === 'if_not_opened' && events.has('opened')) return false;
      if (step.send_condition === 'if_clicked' && !events.has('clicked')) return false;
      if (step.send_condition === 'if_not_clicked' && events.has('clicked')) return false;
    }
  }

  // Reserve quota
  const quota = await reserveSendQuota(1);
  if (!quota) return false; // Quota full for today

  const { account } = quota;

  // Insert idempotency record
  try {
    await db.execute(sql`
      INSERT INTO email_sequence_sends (enrollment_id, step_id, status, account_key, cycle_started_at)
      VALUES (${enrollmentId}, ${step.id}, 'sending', ${account.key}, ${enr.cycle_started_at})
    `);
  } catch (err: any) {
    // Unique constraint hit (already sent) ➔ refund quota and return
    await refundDailyQuota(account.key, 1);
    return false;
  }

  // Render & dispatch
  const subject = renderTemplate(step.subject, { nome: enr.name || 'Cliente' });
  const htmlBody = bodyToHtml(renderTemplate(step.html_body, {
    nome: enr.name || 'Cliente',
    email: enr.email,
    unsubscribe: `${process.env.PUBLIC_APP_URL || 'https://www.premium.salvitarn.com.br'}/api/unsubscribe?t=${enr.unsub_token}`,
  }));

  const message: OutboundMessage = {
    to: enr.email,
    subject,
    html: layout(subject, htmlBody, enr.unsub_token),
    replyTo: enr.reply_to || undefined,
    unsubToken: enr.unsub_token,
  };

  const results = await sendBatch(account, [message]);
  const res = results[0];

  if (res?.ok) {
    // Update send record
    await db.execute(sql`
      UPDATE email_sequence_sends
      SET status = 'sent', message_id = ${res.messageId ?? null}
      WHERE enrollment_id = ${enrollmentId} AND step_id = ${step.id} AND status = 'sending'
    `);

    // Fetch next step to schedule next_send_at
    const futureStepRes = await db.execute(sql`
      SELECT delay_days FROM email_sequence_steps
      WHERE sequence_id = ${enr.sequence_id} AND step_order = ${nextStepOrder + 1}
      LIMIT 1
    `);
    const futureStep = futureStepRes.rows[0] as any;

    if (futureStep) {
      const nextSendAt = computeNextSendAt(futureStep.delay_days);
      await db.execute(sql`
        UPDATE email_sequence_enrollments
        SET current_step = ${nextStepOrder}, next_send_at = ${nextSendAt}, updated_at = NOW()
        WHERE id = ${enrollmentId}
      `);
    } else {
      // Completed sequence or repeat loop
      if (enr.repeat) {
        const nextSendAt = computeNextSendAt(enr.repeat_interval_days || 30);
        await db.execute(sql`
          UPDATE email_sequence_enrollments
          SET current_step = 0, cycle_started_at = NOW(), next_send_at = ${nextSendAt}, updated_at = NOW()
          WHERE id = ${enrollmentId}
        `);
      } else {
        await db.execute(sql`
          UPDATE email_sequence_enrollments
          SET current_step = ${nextStepOrder}, status = 'completed', updated_at = NOW()
          WHERE id = ${enrollmentId}
        `);
      }
    }
    return true;
  } else {
    // Update send record failure
    await db.execute(sql`
      UPDATE email_sequence_sends
      SET status = 'failed', error = ${res?.error ?? 'send_failed'}
      WHERE enrollment_id = ${enrollmentId} AND step_id = ${step.id} AND status = 'sending'
    `);
    await refundDailyQuota(account.key, 1);
    return false;
  }
}

/** Processes all due sequence enrollments for the cron loop. */
export async function processSequenceEnrollments(limit = 100): Promise<{ processed: number; sent: number }> {
  const dueRes = await db.execute(sql`
    SELECT id FROM email_sequence_enrollments
    WHERE status = 'active' AND (next_send_at <= NOW() OR next_send_at IS NULL)
    ORDER BY next_send_at ASC NULLS FIRST
    LIMIT ${limit}
  `);

  let sent = 0;
  for (const r of dueRes.rows as any[]) {
    const ok = await processSingleEnrollment(Number(r.id));
    if (ok) sent++;
  }

  return { processed: dueRes.rows.length, sent };
}

/** Event-driven rule engine (triggers automation actions). */
export async function triggerAutomationRules(triggerType: string, payload: { email: string; name?: string; tags?: string[]; taskId?: number }) {
  if (!payload.email) return;

  const rulesRes = await db.execute(sql`
    SELECT * FROM automation_rules WHERE trigger_type = ${triggerType} AND active = TRUE
  `);

  for (const rule of rulesRes.rows as any[]) {
    // Filter tags if specified
    if (rule.required_tags && rule.required_tags.length > 0) {
      const payloadTags = new Set(payload.tags || []);
      const hasAll = rule.required_tags.every((t: string) => payloadTags.has(t));
      if (!hasAll) continue;
    }

    if (rule.excluded_tags && rule.excluded_tags.length > 0) {
      const payloadTags = new Set(payload.tags || []);
      const hasAny = rule.excluded_tags.some((t: string) => payloadTags.has(t));
      if (hasAny) continue;
    }

    // Cancel other sequences if configured
    if (rule.cancel_other_sequences) {
      await db.execute(sql`
        UPDATE email_sequence_enrollments
        SET status = 'cancelled', updated_at = NOW()
        WHERE LOWER(email) = ${payload.email.toLowerCase()} AND status = 'active'
      `);
    }

    // Execute action
    if (rule.action_type === 'enroll_sequence') {
      const sequenceId = parseInt(rule.action_config, 10);
      if (!isNaN(sequenceId)) {
        await enrollInSequence(payload.email, sequenceId, payload.name, undefined, payload.taskId);
      }
    } else if (rule.action_type === 'cancel_sequences') {
      await db.execute(sql`
        UPDATE email_sequence_enrollments
        SET status = 'cancelled', updated_at = NOW()
        WHERE LOWER(email) = ${payload.email.toLowerCase()} AND status = 'active'
      `);
    }
  }
}
