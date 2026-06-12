/**
 * E-mail Marketing Fase 2 — Automações.
 *
 * Funções puras chamadas tanto pelas mutations de `tasks` (lead_created,
 * lead_converted) quanto pelo cron diário (inactive_days). Todas são
 * defensivas: erros são logados e nunca propagados, pois o fluxo principal
 * (criar/atualizar uma task) nunca deve quebrar por causa de automações de
 * e-mail.
 */

import crypto from 'crypto';
import { and, eq, isNull, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  automationRules, emailSequenceSteps, emailSequenceEnrollments,
  emailSuppressions, tasks,
} from '../db/schema';
import { computeNextSendAt } from './marketing';

export type TriggerType = 'lead_created' | 'lead_converted' | 'inactive_days';

interface TriggerTask {
  id: number;
  email: string | null | undefined;
  title: string;
  assignedTo?: string | null;
}

// Tasks are titled "NOME - EMPRESA - telefone - email - cidade - UF" — use the
// first segment as the recipient's display name (same convention as emailMarketing.ts).
function firstPart(title: string): string {
  return (title.split(' - ')[0] || title).trim();
}

/**
 * Inscreve um e-mail numa sequência. Idempotente via UNIQUE(sequence_id, email)
 * — usa ON CONFLICT DO NOTHING. Calcula `nextSendAt` a partir do passo 1
 * (currentStep = 0 → próximo passo é o índice 0 = passo 1).
 */
export async function enrollInSequence(
  sequenceId: number,
  opts: { email: string; name?: string | null; replyTo?: string | null; taskId?: number | null },
): Promise<{ enrolled: boolean }> {
  try {
    const email = opts.email.toLowerCase().trim();
    if (!email) return { enrolled: false };

    // Don't enroll suppressed/unsubscribed addresses.
    const [suppressed] = await db.select({ email: emailSuppressions.email })
      .from(emailSuppressions).where(eq(emailSuppressions.email, email)).limit(1);
    if (suppressed) return { enrolled: false };

    const steps = await db.select({ delayDays: emailSequenceSteps.delayDays })
      .from(emailSequenceSteps)
      .where(eq(emailSequenceSteps.sequenceId, sequenceId))
      .orderBy(emailSequenceSteps.stepOrder);
    if (steps.length === 0) return { enrolled: false };

    const enrolledAt = new Date();
    const nextSendAt = computeNextSendAt(enrolledAt, steps, 0);

    const inserted = await db.insert(emailSequenceEnrollments).values({
      sequenceId,
      email,
      name: opts.name ?? null,
      replyTo: opts.replyTo ?? null,
      taskId: opts.taskId ?? null,
      currentStep: 0,
      status: 'active',
      unsubToken: crypto.randomUUID(),
      enrolledAt,
      nextSendAt,
    }).onConflictDoNothing().returning({ id: emailSequenceEnrollments.id });

    return { enrolled: inserted.length > 0 };
  } catch (err) {
    console.error('[automations] enrollInSequence failed:', err);
    return { enrolled: false };
  }
}

/** Adds `tag` to tasks.tags without duplicating it (no-op if already present). */
export async function addTagToTask(taskId: number, tag: string): Promise<void> {
  try {
    const cleanTag = tag.trim();
    if (!cleanTag) return;
    await db.update(tasks)
      .set({
        tags: sql`(
          SELECT array_agg(DISTINCT t) FROM unnest(${tasks.tags} || ARRAY[${cleanTag}]::text[]) AS t
        )`,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  } catch (err) {
    console.error('[automations] addTagToTask failed:', err);
  }
}

/**
 * Runs automation rules for `triggerType` (lead_created | lead_converted) for
 * the given task. Looks up active rules of that trigger type and dispatches
 * the configured action (enroll_sequence | add_tag). Never throws.
 */
export async function runTriggerNow(triggerType: 'lead_created' | 'lead_converted', task: TriggerTask): Promise<void> {
  try {
    if (!task.email) return; // sequences/tags require an e-mail address

    const rules = await db.select().from(automationRules)
      .where(and(eq(automationRules.triggerType, triggerType), eq(automationRules.active, true)));
    if (rules.length === 0) return;

    const email = task.email.toLowerCase().trim();
    const name = firstPart(task.title);

    for (const rule of rules) {
      try {
        const actionConfig = JSON.parse(rule.actionConfig || '{}') as { sequenceId?: number; tag?: string };
        if (rule.actionType === 'enroll_sequence' && actionConfig.sequenceId) {
          await enrollInSequence(actionConfig.sequenceId, {
            email, name, taskId: task.id,
          });
        } else if (rule.actionType === 'add_tag' && actionConfig.tag) {
          await addTagToTask(task.id, actionConfig.tag);
        }
      } catch (err) {
        console.error(`[automations] rule ${rule.id} (${rule.name}) failed:`, err);
      }
    }
  } catch (err) {
    console.error('[automations] runTriggerNow failed:', err);
  }
}

/**
 * Cron-only: evaluates active `inactive_days` automation rules and enrolls
 * eligible leads (email present, not converted, COALESCE(lastContactedAt,
 * createdAt) older than `days`, not suppressed) into the configured sequence.
 * Idempotent via UNIQUE(sequence_id, email) — re-running is safe.
 */
export async function evaluateInactiveDaysRules(): Promise<{ rulesEvaluated: number; enrolled: number }> {
  let enrolled = 0;
  let rulesEvaluated = 0;
  try {
    const rules = await db.select().from(automationRules)
      .where(and(eq(automationRules.triggerType, 'inactive_days'), eq(automationRules.active, true)));

    for (const rule of rules) {
      rulesEvaluated++;
      try {
        const triggerConfig = JSON.parse(rule.triggerConfig || '{}') as { days?: number };
        const actionConfig = JSON.parse(rule.actionConfig || '{}') as { sequenceId?: number; tag?: string };
        const days = triggerConfig.days;
        if (!days || days <= 0) continue;
        if (rule.actionType !== 'enroll_sequence' || !actionConfig.sequenceId) continue;

        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const eligible = await db.select({
          id: tasks.id, email: tasks.email, title: tasks.title,
        }).from(tasks).where(and(
          isNotNull(tasks.email),
          ne(tasks.email, ''),
          isNull(tasks.convertedAt),
          sql`COALESCE(${tasks.lastContactedAt}, ${tasks.createdAt}) < ${cutoff}`,
        )).limit(300);

        for (const t of eligible) {
          if (!t.email) continue;
          const result = await enrollInSequence(actionConfig.sequenceId, {
            email: t.email,
            name: firstPart(t.title),
            taskId: t.id,
          });
          if (result.enrolled) enrolled++;
        }
      } catch (err) {
        console.error(`[automations] inactive_days rule ${rule.id} (${rule.name}) failed:`, err);
      }
    }
  } catch (err) {
    console.error('[automations] evaluateInactiveDaysRules failed:', err);
  }
  return { rulesEvaluated, enrolled };
}
