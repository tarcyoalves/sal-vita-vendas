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
import { and, eq, isNull, isNotNull, ne, sql, lte, asc, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  automationRules, emailSequenceSteps, emailSequenceEnrollments, emailSequenceSends,
  emailCampaignRecipients, emailSuppressions, tasks, emailSequences, sellers,
} from '../db/schema';
import {
  computeNextSendAt, pickAccount, sendBatch, layout, enrollmentEngagementBatch,
  conditionMet, renderSignature, renderTemplate as renderMktTemplate, type BatchMessage,
} from './marketing';

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
      cycleStartedAt: enrolledAt,
    }).onConflictDoNothing().returning({ id: emailSequenceEnrollments.id });

    if (inserted.length > 0 && nextSendAt && nextSendAt <= new Date()) {
      // Passo 0 com delayDays = 0 ("Dia 0") — envia imediatamente, em vez de
      // esperar a próxima execução do cron diário, espelhando o envio
      // imediato de campanhas manuais.
      await processSequenceEnrollments({ enrollmentIds: [inserted[0].id] });
    }

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
          eq(tasks.emailConfirmed, true), // só e-mails confirmados manualmente
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
    enrollmentsDue: 0, sent: 0, failed: 0, completed: 0, skipped: 0, quotaExhausted: false,
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

  // Pré-carrega os passos de todas as sequências envolvidas (evita N+1).
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

  // Pré-carrega as sequências (repeat/repeatIntervalDays) para o loop de recorrência.
  const allSequences = await db.select().from(emailSequences)
    .where(inArray(emailSequences.id, sequenceIds));
  const sequenceById = new Map(allSequences.map(s => [s.id, s]));

  const unsubBase = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';

  // Avalia o engajamento prévio de todas as inscrições devidas numa única query.
  const engMap = await enrollmentEngagementBatch(dueEnrollments.map(e => e.id));

  // Skip-loop: para cada inscrição devida, avança por passos cuja condição não
  // bate (registrando 'skipped', sem gastar cota) até achar um passo que deva
  // ser enviado, ou até a inscrição ser concluída/reiniciar o ciclo (sequência
  // recorrente). Cap de 10 iterações por segurança.
  type Enrollment = typeof dueEnrollments[number];
  const sendable: { enrollment: Enrollment; step: typeof allSteps[number] }[] = [];

  for (const original of dueEnrollments) {
    let enrollment: Enrollment = original;
    const steps = stepsBySequence.get(enrollment.sequenceId) ?? [];
    const seq = sequenceById.get(enrollment.sequenceId);

    for (let iter = 0; iter < 10; iter++) {
      const step = steps[enrollment.currentStep];

      if (!step) {
        // Sem próximo passo.
        if (seq?.repeat && seq.repeatIntervalDays) {
          // Sequência recorrente: reinicia o ciclo após repeatIntervalDays.
          const newCycleStart = new Date(now.getTime() + seq.repeatIntervalDays * 24 * 60 * 60 * 1000);
          const nextSendAt = computeNextSendAt(newCycleStart, steps, 0);
          enrollment = {
            ...enrollment,
            currentStep: 0,
            cycleStartedAt: newCycleStart,
            nextSendAt,
            status: 'active',
          };
          await db.update(emailSequenceEnrollments)
            .set({ currentStep: 0, cycleStartedAt: newCycleStart, nextSendAt, status: 'active', updatedAt: new Date() })
            .where(eq(emailSequenceEnrollments.id, enrollment.id));
          continue; // re-avalia a condição do novo passo 0
        }
        // Não é recorrente — marca como concluída e segue.
        await db.update(emailSequenceEnrollments)
          .set({ status: 'completed', nextSendAt: null, updatedAt: new Date() })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));
        result.completed++;
        break;
      }

      const eng = engMap.get(enrollment.id) ?? { opened: false, clicked: false };
      if (conditionMet(step.sendCondition, eng)) {
        sendable.push({ enrollment, step });
        break;
      }

      // Condição não satisfeita — pula este passo sem gastar cota.
      await db.insert(emailSequenceSends).values({
        enrollmentId: enrollment.id,
        stepId: step.id,
        status: 'skipped',
        messageId: null,
      });
      result.skipped++;

      const newCurrentStep = enrollment.currentStep + 1;
      const cycleStart = enrollment.cycleStartedAt ?? enrollment.enrolledAt;
      const nextSendAt = computeNextSendAt(cycleStart, steps, newCurrentStep);
      const newStatus = nextSendAt ? 'active' : 'completed';
      enrollment = { ...enrollment, currentStep: newCurrentStep, nextSendAt, status: newStatus };
      await db.update(emailSequenceEnrollments)
        .set({ currentStep: newCurrentStep, nextSendAt, status: newStatus, updatedAt: new Date() })
        .where(eq(emailSequenceEnrollments.id, enrollment.id));
      // continua o laço — avalia o próximo passo no mesmo run
    }
  }

  // Carrega a assinatura de e-mail de cada atendente (quando habilitada),
  // indexada por e-mail — `enrollment.replyTo` já é o e-mail do atendente
  // dono do lead (resolvido na inscrição via sellerMap).
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

  // Processa em lotes de até 100, respeitando a cota diária compartilhada.
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

    // Monta as mensagens do passo já resolvido pelo skip-loop para cada inscrição do lote.
    const messages: BatchMessage[] = [];
    const batchMeta: { enrollment: Enrollment; step: typeof allSteps[number] }[] = [];

    for (const { enrollment, step } of batch) {
      const unsubUrl = `${unsubBase}/api/unsubscribe?t=${enrollment.unsubToken}`;
      const signatureHtml = enrollment.replyTo ? signatureMap.get(enrollment.replyTo.toLowerCase()) : undefined;
      messages.push({
        to: enrollment.email,
        subject: renderMktTemplate(step.subject, { nome: enrollment.name ?? '' }),
        html: layout(renderMktTemplate(step.htmlBody, { nome: enrollment.name ?? '', unsubscribe: unsubUrl }), unsubUrl, signatureHtml),
        replyTo: enrollment.replyTo ?? undefined,
        unsubToken: enrollment.unsubToken,
      });
      batchMeta.push({ enrollment, step });
    }

    if (messages.length > 0) {
      const results = await sendBatch(picked.account, messages);
      for (let j = 0; j < batchMeta.length; j++) {
        const { enrollment, step } = batchMeta[j];
        const sendResult = results[j];
        const steps = stepsBySequence.get(enrollment.sequenceId) ?? [];
        const newCurrentStep = enrollment.currentStep + 1;
        const cycleStart = enrollment.cycleStartedAt ?? enrollment.enrolledAt;
        const nextSendAt = computeNextSendAt(cycleStart, steps, newCurrentStep);
        const newStatus = nextSendAt ? 'active' : 'completed';

        if (sendResult.ok) {
          result.sent++;
        } else {
          result.failed++;
        }
        if (newStatus === 'completed') result.completed++;

        await db.update(emailSequenceEnrollments)
          .set({ currentStep: newCurrentStep, nextSendAt, status: newStatus, updatedAt: new Date() })
          .where(eq(emailSequenceEnrollments.id, enrollment.id));

        await db.insert(emailSequenceSends).values({
          enrollmentId: enrollment.id,
          stepId: step.id,
          status: sendResult.ok ? 'sent' : 'failed',
          accountKey: picked.account.key,
          messageId: sendResult.messageId,
          error: sendResult.error,
        });
      }
    }

    // Se o lote não esgotou a cota da conta, ainda há mais a enviar? continua;
    // se pickAccount ficar null no próximo loop, paramos com early-exit acima.
    if (i >= sendable.length) break;
  }

  return result;
}
