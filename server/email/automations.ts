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
import { and, eq, isNull, isNotNull, ne, sql, lte, lt, asc, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  automationRules, emailSequenceSteps, emailSequenceEnrollments, emailSequenceSends,
  emailCampaignRecipients, emailSuppressions, emailEvents, tasks, emailSequences, sellers,
} from '../db/schema';
import {
  computeNextSendAt, pickAccount, sendBatch, layout, enrollmentEngagementBatch,
  conditionMet, renderSignature, renderTemplate as renderMktTemplate, type BatchMessage,
} from './marketing';

export type TriggerType = 'lead_created' | 'lead_converted' | 'inactive_days' | 'tag_added' | 'email_confirmed' | 'sequence_completed';

interface TriggerTask {
  id: number;
  email: string | null | undefined;
  title: string;
  tags?: string[] | null;
  assignedTo?: string | null;
}

// Tasks are titled "NOME - EMPRESA - telefone - email - cidade - UF" — use the
// first segment as the recipient's display name (same convention as emailMarketing.ts).
function firstPart(title: string): string {
  return (title.split(' - ')[0] || title).trim();
}

/**
 * Inscreve um e-mail numa sequência. Permite o mesmo e-mail na mesma sequência
 * se vier de tarefas diferentes (atendentes distintos trabalhando o mesmo lead).
 * Duplicata = mesmo (sequenceId, email, taskId) com status ativo.
 */
export async function enrollInSequence(
  sequenceId: number,
  opts: { email: string; name?: string | null; replyTo?: string | null; taskId?: number | null },
): Promise<{ enrolled: boolean; reason?: string }> {
  try {
    const email = opts.email.toLowerCase().trim();
    if (!email) return { enrolled: false, reason: 'empty_email' };

    const [suppressed] = await db.select({ email: emailSuppressions.email })
      .from(emailSuppressions).where(eq(emailSuppressions.email, email)).limit(1);
    if (suppressed) {
      console.log(`[enrollInSequence] SKIPPED ${email}: suppressed`);
      return { enrolled: false, reason: 'suppressed' };
    }

    const steps = await db.select({ delayDays: emailSequenceSteps.delayDays })
      .from(emailSequenceSteps)
      .where(eq(emailSequenceSteps.sequenceId, sequenceId))
      .orderBy(emailSequenceSteps.stepOrder);
    if (steps.length === 0) {
      console.log(`[enrollInSequence] SKIPPED ${email}: sequence ${sequenceId} has 0 steps`);
      return { enrolled: false, reason: 'no_steps' };
    }

    // Check for existing active enrollment for same sequence + email + task
    const dupConditions = [
      eq(emailSequenceEnrollments.sequenceId, sequenceId),
      eq(emailSequenceEnrollments.email, email),
      eq(emailSequenceEnrollments.status, 'active'),
    ];
    if (opts.taskId) {
      dupConditions.push(eq(emailSequenceEnrollments.taskId, opts.taskId));
    }
    const [existing] = await db.select({ id: emailSequenceEnrollments.id })
      .from(emailSequenceEnrollments)
      .where(and(...dupConditions))
      .limit(1);
    if (existing) {
      console.log(`[enrollInSequence] SKIPPED ${email}: duplicate (already active in sequence ${sequenceId} for task ${opts.taskId})`);
      return { enrolled: false, reason: 'duplicate' };
    }

    const enrolledAt = new Date();
    const nextSendAt = computeNextSendAt(enrolledAt, steps, 0);

    const [inserted] = await db.insert(emailSequenceEnrollments).values({
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
      cycleStartedAt: enrolledAt,
    }).returning({ id: emailSequenceEnrollments.id });

    if (nextSendAt && nextSendAt <= new Date()) {
      await processSequenceEnrollments({ enrollmentIds: [inserted.id] });
    }

    console.log(`[enrollInSequence] OK ${email}: enrolled in sequence ${sequenceId}`);
    return { enrolled: true };
  } catch (err) {
    console.error('[automations] enrollInSequence failed:', err);
    return { enrolled: false, reason: 'error' };
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
export async function runTriggerNow(
  triggerType: Exclude<TriggerType, 'inactive_days'>,
  task: TriggerTask,
  extra?: { addedTag?: string; completedSequenceId?: number },
): Promise<void> {
  try {
    if (!task.email) return;

    const rules = await db.select().from(automationRules)
      .where(and(eq(automationRules.triggerType, triggerType), eq(automationRules.active, true)));
    if (rules.length === 0) return;

    const email = task.email.toLowerCase().trim();
    const name = firstPart(task.title);
    const taskTags = task.tags ?? [];

    for (const rule of rules) {
      try {
        if (!matchesTagFilters(taskTags, rule.requiredTags, rule.excludedTags)) continue;

        const triggerConfig = JSON.parse(rule.triggerConfig || '{}') as { tag?: string; sequenceId?: number };

        if (triggerType === 'tag_added') {
          if (!triggerConfig.tag || triggerConfig.tag !== extra?.addedTag) continue;
        }
        if (triggerType === 'sequence_completed') {
          if (triggerConfig.sequenceId && triggerConfig.sequenceId !== extra?.completedSequenceId) continue;
        }

        const actionConfig = JSON.parse(rule.actionConfig || '{}') as { sequenceId?: number; tag?: string };
        if (rule.actionType === 'enroll_sequence' && actionConfig.sequenceId) {
          if (rule.cancelOtherSequences) {
            await cancelActiveEnrollments(email, actionConfig.sequenceId);
          }
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

function matchesTagFilters(taskTags: string[], requiredTags?: string[] | null, excludedTags?: string[] | null): boolean {
  if (requiredTags?.length) {
    if (!requiredTags.every(t => taskTags.includes(t))) return false;
  }
  if (excludedTags?.length) {
    if (excludedTags.some(t => taskTags.includes(t))) return false;
  }
  return true;
}

export async function cancelAllEnrollments(email: string): Promise<void> {
  try {
    await db.update(emailSequenceEnrollments)
      .set({ status: 'cancelled', nextSendAt: null })
      .where(and(
        eq(emailSequenceEnrollments.email, email.toLowerCase().trim()),
        eq(emailSequenceEnrollments.status, 'active'),
      ));
  } catch (err) {
    console.error('[automations] cancelAllEnrollments failed:', err);
  }
}

async function cancelActiveEnrollments(email: string, exceptSequenceId: number): Promise<void> {
  try {
    await db.update(emailSequenceEnrollments)
      .set({ status: 'cancelled', nextSendAt: null })
      .where(and(
        eq(emailSequenceEnrollments.email, email),
        eq(emailSequenceEnrollments.status, 'active'),
        ne(emailSequenceEnrollments.sequenceId, exceptSequenceId),
      ));
  } catch (err) {
    console.error('[automations] cancelActiveEnrollments failed:', err);
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
          id: tasks.id, email: tasks.email, title: tasks.title, tags: tasks.tags,
        }).from(tasks).where(and(
          isNotNull(tasks.email),
          ne(tasks.email, ''),
          eq(tasks.emailConfirmed, true),
          isNull(tasks.convertedAt),
          sql`COALESCE(${tasks.lastContactedAt}, ${tasks.createdAt}) < ${cutoff}`,
        )).limit(300);

        for (const t of eligible) {
          if (!t.email) continue;
          if (!matchesTagFilters(t.tags ?? [], rule.requiredTags, rule.excludedTags)) continue;
          if (rule.cancelOtherSequences) {
            await cancelActiveEnrollments(t.email, actionConfig.sequenceId!);
          }
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

/**
 * E-mail Marketing Fase 3 — lead scoring.
 *
 * Resolves the `taskId` linked to a `messageId` (campaign recipient OR
 * sequence send → enrollment, same UNION used by `engagementByTaskIds`, but
 * in reverse: from message_id to task_id) and updates `tasks.lastEngagementAt`.
 * Clicks are a strong signal of interest: mark the task `hotLead`, raise its
 * `priority` to `high`, tag it with `🔥 quente`, and bring its `reminderDate`
 * to now if it's null or already past. Opens only update `lastEngagementAt`
 * (opens are noisy due to Apple Mail Privacy Protection).
 *
 * Never throws — fire-and-forget after the webhook already responded 200.
 */
export async function flagEngagementByMessageId(
  messageId: string,
  eventType: 'opened' | 'clicked',
): Promise<void> {
  try {
    if (!messageId) return;

    // Resolve taskId: campaign recipients first, then sequence sends → enrollments.
    const [campaignRow] = await db.select({ taskId: emailCampaignRecipients.taskId })
      .from(emailCampaignRecipients)
      .where(and(eq(emailCampaignRecipients.messageId, messageId), isNotNull(emailCampaignRecipients.taskId)))
      .limit(1);

    let taskId = campaignRow?.taskId ?? null;

    if (!taskId) {
      const [sequenceRow] = await db.select({ taskId: emailSequenceEnrollments.taskId })
        .from(emailSequenceSends)
        .innerJoin(emailSequenceEnrollments, eq(emailSequenceEnrollments.id, emailSequenceSends.enrollmentId))
        .where(and(eq(emailSequenceSends.messageId, messageId), isNotNull(emailSequenceEnrollments.taskId)))
        .limit(1);
      taskId = sequenceRow?.taskId ?? null;
    }

    if (!taskId) return; // standalone e-mail, not linked to a task

    const now = new Date();

    if (eventType === 'clicked') {
      await db.update(tasks)
        .set({
          hotLead: true,
          priority: 'high',
          lastEngagementAt: now,
          reminderDate: sql`CASE WHEN ${tasks.reminderDate} IS NULL OR ${tasks.reminderDate} <= ${now} THEN ${now} ELSE ${tasks.reminderDate} END`,
          updatedAt: now,
        })
        .where(eq(tasks.id, taskId));
      await addTagToTask(taskId, '🔥 quente');
    } else {
      await db.update(tasks)
        .set({ lastEngagementAt: now, updatedAt: now })
        .where(eq(tasks.id, taskId));
    }
  } catch (err) {
    console.error('[automations] flagEngagementByMessageId failed:', err);
  }
}

export interface ProcessSequenceEnrollmentsResult {
  enrollmentsDue: number;
  sent: number;
  failed: number;
  completed: number;
  skipped: number;
  retried: number;
  quotaExhausted: boolean;
}

/**
 * Processa inscrições de sequência devidas (status='active' e nextSendAt <= now):
 * roda o skip-loop de condições de envio e, para os passos elegíveis, envia em
 * lote via pool de contas Resend, atualizando currentStep/nextSendAt/status e
 * registrando em email_sequence_sends.
 *
 * Usado (a) pelo cron diário, sem filtro — processa tudo que estiver devido —
 * e (b) por `enrollInSequence`, passando `enrollmentIds: [novaInscrição]`
 * quando o passo 0 tem delayDays = 0, para enviar o "Dia 0" imediatamente em
 * vez de esperar a próxima execução do cron.
 */
export async function processSequenceEnrollments(opts?: { enrollmentIds?: number[] }): Promise<ProcessSequenceEnrollmentsResult> {
  const result: ProcessSequenceEnrollmentsResult = {
    enrollmentsDue: 0, sent: 0, failed: 0, completed: 0, skipped: 0, retried: 0, quotaExhausted: false,
  };

  const now = new Date();
  const conditions = [
    eq(emailSequenceEnrollments.status, 'active'),
    isNotNull(emailSequenceEnrollments.nextSendAt),
    lte(emailSequenceEnrollments.nextSendAt, now),
  ];
  if (opts?.enrollmentIds) {
    if (opts.enrollmentIds.length === 0) return result;
    conditions.push(inArray(emailSequenceEnrollments.id, opts.enrollmentIds));
  }

  const dueEnrollments = await db.select().from(emailSequenceEnrollments)
    .where(and(...conditions))
    .orderBy(asc(emailSequenceEnrollments.nextSendAt))
    .limit(opts?.enrollmentIds ? opts.enrollmentIds.length : 300);
  result.enrollmentsDue = dueEnrollments.length;
  if (dueEnrollments.length === 0) return result;

  const sequenceIds = [...new Set(dueEnrollments.map(e => e.sequenceId))];
  const allSteps = await db.select().from(emailSequenceSteps)
    .where(inArray(emailSequenceSteps.sequenceId, sequenceIds))
    .orderBy(asc(emailSequenceSteps.stepOrder));
  const stepsBySequence = new Map<number, typeof allSteps>();
  for (const step of allSteps) {
    const list = stepsBySequence.get(step.sequenceId) ?? [];
    list.push(step);
    stepsBySequence.set(step.sequenceId, list);
  }

  const allSequences = await db.select().from(emailSequences)
    .where(inArray(emailSequences.id, sequenceIds));
  const sequenceById = new Map(allSequences.map(s => [s.id, s]));

  const unsubBase = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';

  const engMap = await enrollmentEngagementBatch(dueEnrollments.map(e => e.id));

  // Pre-load existing sends per enrollment+step for retry detection (single query).
  const enrollmentIds = dueEnrollments.map(e => e.id);

  // Reclaim abandoned claims: 'sending' rows a prior run inserted but never
  // finalized (hard crash between the claim and the send-result update). 1h is
  // far beyond any serverless execution window, so an older 'sending' row is
  // certainly abandoned; deleting it lets the step be re-attempted instead of
  // being blocked forever by the unique index. Trade-off: if the crash struck
  // in the sub-second gap AFTER the provider accepted the e-mail, this can
  // re-send once — deliberately chosen over permanently stranding the
  // enrollment at that step.
  await db.delete(emailSequenceSends).where(and(
    inArray(emailSequenceSends.enrollmentId, enrollmentIds),
    eq(emailSequenceSends.status, 'sending'),
    lt(emailSequenceSends.sentAt, new Date(Date.now() - 60 * 60 * 1000)),
  ));

  // Base time of each enrollment's CURRENT cycle. For recurring sequences
  // (repeat=true) this is bumped every time the loop restarts; sends from
  // earlier cycles (sentAt < cycleStart) must be ignored below, otherwise every
  // step of cycle 2+ looks "already sent" and the sequence stalls after the
  // first cycle.
  const cycleStartByEnrollment = new Map<number, number>();
  for (const e of dueEnrollments) {
    cycleStartByEnrollment.set(e.id, (e.cycleStartedAt ?? e.enrolledAt).getTime());
  }

  const existingSends = await db.select({
    enrollmentId: emailSequenceSends.enrollmentId,
    stepId: emailSequenceSends.stepId,
    status: emailSequenceSends.status,
    retryNumber: emailSequenceSends.retryNumber,
    messageId: emailSequenceSends.messageId,
    sentAt: emailSequenceSends.sentAt,
  }).from(emailSequenceSends)
    .where(and(
      inArray(emailSequenceSends.enrollmentId, enrollmentIds),
      eq(emailSequenceSends.status, 'sent'),
    ));

  // Build map: enrollmentId → stepId → { maxRetryNumber, messageIds[] }.
  // Only sends belonging to the enrollment's current cycle are considered.
  const sendsByEnrollmentStep = new Map<string, { maxRetryNumber: number; messageIds: string[] }>();
  for (const s of existingSends) {
    const cycleStart = cycleStartByEnrollment.get(s.enrollmentId);
    if (cycleStart !== undefined && s.sentAt.getTime() < cycleStart) continue; // prior cycle — ignore
    const key = `${s.enrollmentId}:${s.stepId}`;
    const entry = sendsByEnrollmentStep.get(key) ?? { maxRetryNumber: -1, messageIds: [] };
    entry.maxRetryNumber = Math.max(entry.maxRetryNumber, s.retryNumber);
    if (s.messageId) entry.messageIds.push(s.messageId);
    sendsByEnrollmentStep.set(key, entry);
  }

  // Check which message_ids have 'opened' events (single query for all retry candidates).
  const allRetryMessageIds = [...new Set(existingSends.filter(s => s.messageId).map(s => s.messageId!))];
  const openedMessageIds = new Set<string>();
  if (allRetryMessageIds.length > 0) {
    const openRows = await db.select({ messageId: emailEvents.messageId })
      .from(emailEvents)
      .where(and(
        inArray(emailEvents.messageId, allRetryMessageIds),
        eq(emailEvents.eventType, 'opened'),
      ));
    for (const r of openRows) openedMessageIds.add(r.messageId);
  }

  type Enrollment = typeof dueEnrollments[number];
  type StepInfo = typeof allSteps[number];
  const sendable: { enrollment: Enrollment; step: StepInfo; retryNumber: number; subjectOverride?: string }[] = [];

  for (const original of dueEnrollments) {
    let enrollment: Enrollment = original;
    const steps = stepsBySequence.get(enrollment.sequenceId) ?? [];
    const seq = sequenceById.get(enrollment.sequenceId);

    for (let iter = 0; iter < 10; iter++) {
      const step = steps[enrollment.currentStep];

      if (!step) {
        if (seq?.repeat && seq.repeatIntervalDays) {
          const newCycleStart = new Date(now.getTime() + seq.repeatIntervalDays * 24 * 60 * 60 * 1000);
          const nextSendAt = computeNextSendAt(newCycleStart, steps, 0);
          enrollment = { ...enrollment, currentStep: 0, cycleStartedAt: newCycleStart, nextSendAt, status: 'active' };
          await db.update(emailSequenceEnrollments)
            .set({ currentStep: 0, cycleStartedAt: newCycleStart, nextSendAt, status: 'active', updatedAt: new Date() })
            .where(eq(emailSequenceEnrollments.id, enrollment.id));
          continue;
        }
        await db.update(emailSequenceEnrollments)
          .set({ status: 'completed', nextSendAt: null, updatedAt: new Date() })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
        result.completed++;
        if (enrollment.taskId && enrollment.email) {
          try {
            const [taskData] = await db.select({ id: tasks.id, email: tasks.email, title: tasks.title, tags: tasks.tags, assignedTo: tasks.assignedTo })
              .from(tasks).where(eq(tasks.id, enrollment.taskId)).limit(1);
            if (taskData?.email) {
              await runTriggerNow('sequence_completed', taskData, { completedSequenceId: enrollment.sequenceId });
            }
          } catch (err) {
            console.error('[automations] sequence_completed trigger failed:', err);
          }
        }
        break;
      }

      // Check if this step was already sent (retry scenario).
      const sendKey = `${enrollment.id}:${step.id}`;
      const priorSends = sendsByEnrollmentStep.get(sendKey);

      if (priorSends && priorSends.maxRetryNumber >= 0) {
        // Step was already sent at least once. Evaluate retry logic.
        if (step.retryIfNotOpened) {
          const wasOpened = priorSends.messageIds.some(mid => openedMessageIds.has(mid));
          if (!wasOpened && priorSends.maxRetryNumber < step.maxRetries) {
            // Not opened + retries remaining → resend with incremented retry number.
            const retryNum = priorSends.maxRetryNumber + 1;
            sendable.push({
              enrollment, step, retryNumber: retryNum,
              subjectOverride: step.retrySubject || undefined,
            });
            break;
          }
        }
        // Opened, or max retries reached, or retry not enabled → advance to next step.
        const newCurrentStep = enrollment.currentStep + 1;
        const cycleStart = enrollment.cycleStartedAt ?? enrollment.enrolledAt;
        const nextSendAt = computeNextSendAt(cycleStart, steps, newCurrentStep);
        const newStatus = nextSendAt ? 'active' : 'completed';
        enrollment = { ...enrollment, currentStep: newCurrentStep, nextSendAt, status: newStatus };
        await db.update(emailSequenceEnrollments)
          .set({ currentStep: newCurrentStep, nextSendAt, status: newStatus, updatedAt: new Date() })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
        if (newStatus === 'completed') { result.completed++; break; }
        continue;
      }

      // First send of this step — evaluate send condition.
      const eng = engMap.get(enrollment.id) ?? { opened: false, clicked: false };
      if (conditionMet(step.sendCondition, eng)) {
        sendable.push({ enrollment, step, retryNumber: 0 });
        break;
      }

      // Condition not met — skip this step.
      await db.insert(emailSequenceSends).values({
        enrollmentId: enrollment.id,
        stepId: step.id,
        status: 'skipped',
        messageId: null,
        retryNumber: 0,
        cycleStartedAt: enrollment.cycleStartedAt ?? enrollment.enrolledAt,
      }).onConflictDoNothing();
      result.skipped++;

      const newCurrentStep = enrollment.currentStep + 1;
      const cycleStart = enrollment.cycleStartedAt ?? enrollment.enrolledAt;
      const nextSendAt = computeNextSendAt(cycleStart, steps, newCurrentStep);
      const newStatus = nextSendAt ? 'active' : 'completed';
      enrollment = { ...enrollment, currentStep: newCurrentStep, nextSendAt, status: newStatus };
      await db.update(emailSequenceEnrollments)
        .set({ currentStep: newCurrentStep, nextSendAt, status: newStatus, updatedAt: new Date() })
        .where(eq(emailSequenceEnrollments.id, enrollment.id));
    }
  }

  const signatureMap = new Map<string, string>();
  if (sendable.length > 0) {
    const sellerRows = await db.select({
      name: sellers.name, email: sellers.email, phone: sellers.phone, department: sellers.department,
      sig: sellers.emailSignatureHtml, sigOn: sellers.emailSignatureEnabled,
    }).from(sellers);
    for (const s of sellerRows) {
      if (!s.sigOn || !s.sig) continue;
      signatureMap.set(s.email.toLowerCase(), renderSignature(s.sig, s));
    }
  }

  let i = 0;
  while (i < sendable.length) {
    const picked = await pickAccount();
    if (!picked) {
      result.quotaExhausted = true;
      break;
    }

    const batchSize = Math.min(100, picked.remaining, sendable.length - i);
    const batch = sendable.slice(i, i + batchSize);
    i += batchSize;

    // Claim BEFORE sending: insert one 'sending' row per item. The unique index
    // (enrollment, step, retry, cycle) + onConflictDoNothing means a concurrent
    // cron — or a re-run after a timeout that already sent this step — conflicts
    // and is filtered out here, so each step's e-mail goes out at most once.
    // Only rows we actually claimed (returned) are sent.
    const claimRows = await db.insert(emailSequenceSends)
      .values(batch.map(it => ({
        enrollmentId: it.enrollment.id,
        stepId: it.step.id,
        status: 'sending',
        accountKey: picked.account.key,
        messageId: null,
        retryNumber: it.retryNumber,
        cycleStartedAt: it.enrollment.cycleStartedAt ?? it.enrollment.enrolledAt,
      })))
      .onConflictDoNothing()
      .returning({
        id: emailSequenceSends.id,
        enrollmentId: emailSequenceSends.enrollmentId,
        stepId: emailSequenceSends.stepId,
        retryNumber: emailSequenceSends.retryNumber,
      });
    const claimIdByKey = new Map<string, number>();
    for (const r of claimRows) {
      claimIdByKey.set(`${r.enrollmentId}:${r.stepId}:${r.retryNumber}`, r.id);
    }

    const messages: BatchMessage[] = [];
    const batchMeta: { item: typeof sendable[number]; sendId: number }[] = [];

    for (const item of batch) {
      const sendId = claimIdByKey.get(`${item.enrollment.id}:${item.step.id}:${item.retryNumber}`);
      if (sendId === undefined) continue; // already claimed by another run — skip
      const { enrollment, step, subjectOverride } = item;
      const unsubUrl = `${unsubBase}/api/unsubscribe?t=${enrollment.unsubToken}`;
      const signatureHtml = enrollment.replyTo ? signatureMap.get(enrollment.replyTo.toLowerCase()) : undefined;
      const subject = subjectOverride
        ? renderMktTemplate(subjectOverride, { nome: enrollment.name ?? '' })
        : renderMktTemplate(step.subject, { nome: enrollment.name ?? '' });
      messages.push({
        to: enrollment.email,
        subject,
        html: layout(renderMktTemplate(step.htmlBody, { nome: enrollment.name ?? '', unsubscribe: unsubUrl }), unsubUrl, signatureHtml),
        replyTo: enrollment.replyTo ?? undefined,
        unsubToken: enrollment.unsubToken,
      });
      batchMeta.push({ item, sendId });
    }

    if (messages.length > 0) {
      const results = await sendBatch(picked.account, messages);
      for (let j = 0; j < batchMeta.length; j++) {
        const { item, sendId } = batchMeta[j];
        const { enrollment, step, retryNumber } = item;
        const sendResult = results[j];
        const steps = stepsBySequence.get(enrollment.sequenceId) ?? [];

        if (sendResult.ok) {
          result.sent++;
          if (retryNumber > 0) result.retried++;
        } else {
          result.failed++;
        }

        // Finalize the claim row inserted above (was 'sending').
        await db.update(emailSequenceSends)
          .set({
            status: sendResult.ok ? 'sent' : 'failed',
            accountKey: picked.account.key,
            messageId: sendResult.messageId,
            error: sendResult.error,
          })
          .where(eq(emailSequenceSends.id, sendId));

        // Decide next state: if retry is enabled and we haven't exhausted retries,
        // keep currentStep the same and schedule retry check. Otherwise advance.
        const shouldScheduleRetry = sendResult.ok && step.retryIfNotOpened && retryNumber < step.maxRetries;

        if (shouldScheduleRetry) {
          const retryAt = new Date(now.getTime() + step.retryDelayHours * 60 * 60 * 1000);
          await db.update(emailSequenceEnrollments)
            .set({ nextSendAt: retryAt, updatedAt: new Date() })
            .where(eq(emailSequenceEnrollments.id, enrollment.id));
        } else {
          const newCurrentStep = enrollment.currentStep + 1;
          const cycleStart = enrollment.cycleStartedAt ?? enrollment.enrolledAt;
          const nextSendAt = computeNextSendAt(cycleStart, steps, newCurrentStep);
          const newStatus = nextSendAt ? 'active' : 'completed';
          if (newStatus === 'completed') result.completed++;
          await db.update(emailSequenceEnrollments)
            .set({ currentStep: newCurrentStep, nextSendAt, status: newStatus, updatedAt: new Date() })
            .where(eq(emailSequenceEnrollments.id, enrollment.id));
        }
      }
    }

    if (i >= sendable.length) break;
  }

  return result;
}
