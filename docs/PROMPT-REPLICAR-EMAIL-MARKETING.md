# Prompt: replicar o sistema de E-mail Marketing em outro projeto

> **Como usar:** cole TUDO abaixo da linha `=== INÍCIO DO PROMPT ===` no Gemini
> (ou em qualquer IA de código). Antes de colar, preencha o bloco
> `CONTEXTO DO MEU PROJETO` com os dados do projeto de destino.

---

=== INÍCIO DO PROMPT ===

Você vai implementar um sistema completo de E-mail Marketing transacional +
campanhas + sequências automatizadas. A especificação abaixo é derivada de um
sistema **em produção real**, com todas as armadilhas já descobertas e
resolvidas. Siga-a à risca: cada decisão marcada com ⚠️ existe porque a
alternativa ingênua **quebrou em produção**.

---

## CONTEXTO DO MEU PROJETO

> **PREENCHA ANTES DE ENVIAR:**
>
> - Stack do backend: `_____` (ex: Node + Express serverless na Vercel)
> - Stack do frontend: `_____` (ex: React + TypeScript + Vite)
> - Banco de dados: `_____` (ex: PostgreSQL Neon)
> - ORM: `_____` (ex: Drizzle / Prisma / TypeORM)
> - Camada de API: `_____` (ex: tRPC / REST / GraphQL)
> - Provedor de e-mail: `_____` (ex: Resend / Brevo / SendGrid)
> - Domínio público da app: `_____` (ex: https://app.meudominio.com.br)
> - Nome da marca: `_____`
> - Cor principal da marca (hex): `_____`
> - De onde vêm os destinatários: `_____` (ex: tabela `leads`, `clientes`, CSV)

Se algum item não foi preenchido, **pergunte antes de codar** — não invente.

---

## 1. VISÃO GERAL DA ARQUITETURA

O sistema tem **cinco subsistemas** que se integram:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CAMPANHAS         disparo em massa, pontual              │
│    (one-shot)        → lista de destinatários congelada     │
├─────────────────────────────────────────────────────────────┤
│ 2. SEQUÊNCIAS        régua de e-mails ao longo de dias      │
│    (drip)            → passo 1 (dia 0), passo 2 (dia 3)...  │
├─────────────────────────────────────────────────────────────┤
│ 3. AUTOMAÇÕES        gatilho → ação                         │
│    (rules engine)    → "lead criado" ⇒ inscreve na seq. X   │
├─────────────────────────────────────────────────────────────┤
│ 4. RASTREAMENTO      webhook do provedor → eventos          │
│    (events)          → aberto / clicado / bounce / spam     │
├─────────────────────────────────────────────────────────────┤
│ 5. CONFORMIDADE      supressão, descadastro, frequência     │
│    (compliance)      → LGPD/CAN-SPAM, nunca opcional        │
└─────────────────────────────────────────────────────────────┘
```

**Princípio central:** todo envio passa por **um único motor de lote**
(`processCampaignBatch` / `processSequenceEnrollments`). Frontend e cron chamam
a MESMA função. ⚠️ Nunca duplique a lógica de envio entre "envio pela tela" e
"envio pelo cron" — elas divergem e você passa a ter dois bugs diferentes.

---

## 2. SCHEMA DO BANCO (13 tabelas)

Traduza os tipos para o seu ORM. Comentários com ⚠️ são obrigatórios.

### 2.1 Templates

```sql
CREATE TABLE email_template_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE email_templates (
  id           SERIAL PRIMARY KEY,
  category_ids JSONB,              -- array de ids: [1,3]
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  subject      TEXT NOT NULL,
  html_body    TEXT NOT NULL,
  attachments  JSONB,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP NOT NULL DEFAULT now(),
  updated_at   TIMESTAMP NOT NULL DEFAULT now()
);
```

### 2.2 Campanhas

```sql
CREATE TABLE email_campaigns (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  subject          TEXT NOT NULL,
  subject_b        TEXT,             -- teste A/B de assunto (nullable)
  html_body        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft',
                   -- draft|scheduled|sending|paused|sent
  scheduled_at     TIMESTAMP,        -- futuro ⇒ status 'scheduled'
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count       INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  created_by_user_id INTEGER NOT NULL,
  is_broadcast     BOOLEAN NOT NULL DEFAULT FALSE,
  attachments      JSONB,            -- base64; LIMPO após envio (não inchar DB)
  created_at       TIMESTAMP NOT NULL DEFAULT now(),
  updated_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE email_campaign_recipients (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL,
  email       TEXT NOT NULL,
  name        TEXT,
  reply_to    TEXT,              -- e-mail do vendedor dono do lead
  task_id     INTEGER,           -- FK lógica p/ o lead de origem
  variant     TEXT,              -- 'A' | 'B' | NULL (teste A/B)
  status      TEXT NOT NULL DEFAULT 'pending',
              -- pending|sending|sent|failed|skipped
  account_key TEXT,              -- qual conta do provedor enviou
  message_id  TEXT,              -- id do provedor — CHAVE p/ casar eventos
  unsub_token TEXT NOT NULL,     -- UUID único por destinatário
  error       TEXT,
  sent_at     TIMESTAMP,
  claimed_at  TIMESTAMP,         -- ⚠️ quando virou 'sending' (reciclar órfãos)
  created_at  TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX email_recipients_campaign_idx
  ON email_campaign_recipients(campaign_id, status);
CREATE INDEX email_campaigns_scheduled_idx
  ON email_campaigns (scheduled_at) WHERE status = 'scheduled';
```

### 2.3 Sequências (drip)

```sql
CREATE TABLE email_sequences (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL,
  description          TEXT,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  repeat               BOOLEAN NOT NULL DEFAULT FALSE,  -- sequência em loop
  repeat_interval_days INTEGER,                          -- gap antes de reiniciar
  created_at           TIMESTAMP NOT NULL DEFAULT now(),
  updated_at           TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE email_sequence_steps (
  id                  SERIAL PRIMARY KEY,
  sequence_id         INTEGER NOT NULL,
  step_order          INTEGER NOT NULL,   -- 1, 2, 3...
  delay_days          INTEGER NOT NULL,   -- dias APÓS a inscrição
  subject             TEXT NOT NULL,
  html_body           TEXT NOT NULL,
  send_condition      TEXT NOT NULL DEFAULT 'always',
      -- always|if_opened|if_not_opened|if_clicked|if_not_clicked
  retry_if_not_opened BOOLEAN NOT NULL DEFAULT FALSE,
  retry_delay_hours   INTEGER NOT NULL DEFAULT 24,
  max_retries         INTEGER NOT NULL DEFAULT 1,
  retry_subject       TEXT,               -- assunto alternativo no reenvio
  created_at          TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE email_sequence_enrollments (
  id               SERIAL PRIMARY KEY,
  sequence_id      INTEGER NOT NULL,
  email            TEXT NOT NULL,
  name             TEXT,
  reply_to         TEXT,
  task_id          INTEGER,
  current_step     INTEGER NOT NULL DEFAULT 0,  -- último passo ENVIADO
  status           TEXT NOT NULL DEFAULT 'active',
                   -- active|paused|completed|cancelled
  unsub_token      TEXT NOT NULL,
  enrolled_at      TIMESTAMP NOT NULL DEFAULT now(),
  next_send_at     TIMESTAMP,                   -- ⚠️ o "relógio" da sequência
  cycle_started_at TIMESTAMP,                   -- ⚠️ base do ciclo (loop)
  updated_at       TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE email_sequence_sends (
  id               SERIAL PRIMARY KEY,
  enrollment_id    INTEGER NOT NULL,
  step_id          INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'sent',  -- sending|sent|failed|skipped
  account_key      TEXT,
  message_id       TEXT,
  error            TEXT,
  retry_number     INTEGER NOT NULL DEFAULT 0,
  cycle_started_at TIMESTAMP,   -- ⚠️ parte da chave de idempotência
  sent_at          TIMESTAMP NOT NULL DEFAULT now()
);

-- ⚠️ CRÍTICO: idempotência. Sem isto, um retry do cron reenvia o mesmo passo.
-- cycle_started_at faz parte da chave para que sequências em LOOP possam
-- reenviar o mesmo passo em ciclos diferentes sem colidir.
CREATE UNIQUE INDEX email_seq_sends_unique_idx
  ON email_sequence_sends(enrollment_id, step_id, retry_number, cycle_started_at);
```

### 2.4 Automações

```sql
CREATE TABLE automation_rules (
  id                      SERIAL PRIMARY KEY,
  name                    TEXT NOT NULL,
  trigger_type            TEXT NOT NULL,
      -- lead_created|lead_converted|inactive_days|tag_added
      -- |email_confirmed|sequence_completed
  trigger_config          TEXT,           -- JSON: {"days":30}
  action_type             TEXT NOT NULL,
      -- enroll_sequence|add_tag|cancel_sequences
  action_config           TEXT NOT NULL,  -- JSON: {"sequenceId":3}
  required_tags           TEXT[],         -- lead PRECISA ter TODAS
  excluded_tags           TEXT[],         -- lead NÃO pode ter NENHUMA
  cancel_other_sequences  BOOLEAN NOT NULL DEFAULT FALSE,
  active                  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMP NOT NULL DEFAULT now(),
  updated_at              TIMESTAMP NOT NULL DEFAULT now()
);
```

### 2.5 Conformidade e rastreamento

```sql
-- ⚠️ A tabela mais importante do sistema. Consultada ANTES de todo envio.
CREATE TABLE email_suppressions (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  reason     TEXT NOT NULL DEFAULT 'unsubscribe',
             -- unsubscribe|bounce|complaint|manual
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE email_events (
  id              SERIAL PRIMARY KEY,
  message_id      TEXT NOT NULL,   -- casa com recipients.message_id
  recipient_email TEXT NOT NULL,
  event_type      TEXT NOT NULL,
      -- delivered|opened|clicked|bounced|complained
  created_at      TIMESTAMP NOT NULL DEFAULT now()
);

-- Cota diária por conta do provedor
CREATE TABLE email_send_counters (
  id          SERIAL PRIMARY KEY,
  account_key TEXT NOT NULL,
  day         TEXT NOT NULL,   -- 'YYYY-MM-DD'
  sent        INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX email_counter_key_day_idx
  ON email_send_counters(account_key, day);
```

### 2.6 Base de contatos própria

```sql
CREATE TABLE marketing_lists (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  contact_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT now(),
  updated_at    TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE marketing_contacts (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT,
  phone      TEXT,
  company    TEXT,
  city       TEXT,
  state      TEXT,
  list_id    INTEGER,
  tags       TEXT[] NOT NULL DEFAULT '{}',
  source     TEXT NOT NULL DEFAULT 'csv_import',  -- csv_import|manual
  status     TEXT NOT NULL DEFAULT 'active',      -- active|unsubscribed
  notes      TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
```

---

## 3. MULTI-CONTA EM CASCATA (waterfall)

**Problema:** planos gratuitos limitam a ~100 e-mails/dia. Uma conta só não
atende.

**Solução:** N contas lidas de variáveis de ambiente, consumidas em cascata.

```ts
export interface MarketingAccount {
  key: string;                        // 'mkt_1', 'brevo_1'
  provider: 'resend' | 'brevo';
  apiKey: string;
  from: string;                       // "Marca <contato@news.dominio.com.br>"
}

export function getAccounts(): MarketingAccount[] {
  const accounts: MarketingAccount[] = [];
  // Provedor primário
  for (let i = 1; i <= 5; i++) {
    const apiKey = process.env[`RESEND_MKT_API_KEY_${i}`];
    const from   = process.env[`RESEND_MKT_FROM_${i}`];
    if (apiKey && from) accounts.push({ key: `mkt_${i}`, provider: 'resend', apiKey, from });
  }
  // Provedor de transbordo (overflow)
  for (let i = 1; i <= 5; i++) {
    const apiKey = process.env[`BREVO_API_KEY_${i}`];
    const from   = process.env[`BREVO_FROM_${i}`];
    if (apiKey && from) accounts.push({ key: `brevo_${i}`, provider: 'brevo', apiKey, from });
  }
  return accounts;
}

export function getAccountLimits(provider: 'resend' | 'brevo') {
  if (provider === 'brevo') return {
    daily:   parseInt(process.env.BREVO_DAILY_LIMIT   ?? '300'),
    monthly: parseInt(process.env.BREVO_MONTHLY_LIMIT ?? '9000'),
  };
  return {
    daily:   parseInt(process.env.RESEND_MKT_DAILY_LIMIT   ?? '90'),
    monthly: parseInt(process.env.RESEND_MKT_MONTHLY_LIMIT ?? '3000'),
  };
}
```

### 3.1 ⚠️ Reserva atômica de cota (o bug mais sutil do sistema)

**O erro ingênuo:**
```ts
// ❌ ERRADO — TOCTOU (time-of-check to time-of-use)
const sent = await getCounter(key);
if (sent < limit) {
  await sendEmails(batch);         // duas execuções simultâneas leem `sent`
  await incrementCounter(batch.length);  // igual e AMBAS enviam ⇒ estoura
}
```

**O certo — reservar ANTES de enviar, com lock de linha:**

```ts
async function reserveDailyQuota(
  accountKey: string, want: number, dailyLimit: number,
): Promise<number> {
  if (want <= 0) return 0;
  const day = today();

  // Garante que a linha existe para o UPDATE ter o que travar
  await sql`
    INSERT INTO email_send_counters (account_key, day, sent)
    VALUES (${accountKey}, ${day}, 0)
    ON CONFLICT (account_key, day) DO NOTHING
  `;

  // Read+update com FOR UPDATE: dois chamadores SERIALIZAM aqui, e a soma
  // das concessões nunca ultrapassa o espaço restante.
  const rows = await sql`
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
  `;
  const r = rows[0];
  return r ? Number(r.new_sent) - Number(r.old_sent) : 0;
}

/** Devolve slots reservados e NÃO usados. */
export async function refundDailyQuota(accountKey: string, n: number) {
  if (n <= 0) return;
  await sql`
    UPDATE email_send_counters
    SET sent = GREATEST(sent - ${n}::int, 0)
    WHERE account_key = ${accountKey} AND day = ${today()}
  `;
}

/** Percorre a cascata até uma conta conceder cota. */
export async function reserveSendQuota(want: number) {
  for (const account of getAccounts()) {
    const limits = getAccountLimits(account.provider);
    const monthlyRoom = limits.monthly - await getMonthlyCounter(account.key);
    if (monthlyRoom <= 0) continue;
    const granted = await reserveDailyQuota(
      account.key, Math.min(want, monthlyRoom), limits.daily,
    );
    if (granted > 0) return { account, granted };
  }
  return null;   // todas esgotadas
}
```

⚠️ **Regra de estorno:** só devolva cota em rejeição **definitiva** do provedor
(HTTP 4xx). Em timeout/erro de rede (`network_error`) **não estorne** — o e-mail
pode ter saído. Melhor subutilizar a cota do que estourá-la.

⚠️ **Fuso horário:** o "dia" do contador precisa ser o dia do SEU fuso, não UTC.
Use uma função `spDateStr()` que devolve `YYYY-MM-DD` no fuso local. Se usar
`new Date().toISOString().slice(0,10)`, todo envio entre 21h e 00h (BRT) conta
no dia seguinte e o relatório diário fica errado.

---

## 4. MOTOR DE ENVIO EM LOTE (o coração)

⚠️ Serverless tem timeout (60s na Vercel). Enviar 3000 e-mails numa request
**não funciona**. O motor envia **um lote de ≤100 e retorna**; frontend e cron
chamam em loop.

```ts
export async function processCampaignBatch(campaignId: number) {
  const [campaign] = await db.select().from(emailCampaigns)
    .where(eq(emailCampaigns.id, campaignId));
  if (!campaign) return { done: true, sentNow: 0, failedNow: 0, remaining: 0, notFound: true };

  // ── PASSO 1: reciclar reservas órfãs ──────────────────────────────────────
  // ⚠️ Linhas que uma execução anterior virou 'sending' mas nunca finalizou
  // (função morreu no meio). 15 min é MUITO além de qualquer janela serverless,
  // então uma linha 'sending' mais velha que isso está abandonada.
  await db.update(emailCampaignRecipients)
    .set({ status: 'pending', claimedAt: null })
    .where(and(
      eq(emailCampaignRecipients.campaignId, campaignId),
      eq(emailCampaignRecipients.status, 'sending'),
      lt(emailCampaignRecipients.claimedAt, new Date(Date.now() - 15 * 60 * 1000)),
    ));

  // ── PASSO 2: contar pendentes ─────────────────────────────────────────────
  // ⚠️ Conta 'pending' E 'sending': senão a campanha é marcada 'sent' enquanto
  // outra execução ainda tem linhas em voo.
  const [pendingRow] = await db.select({ cnt: count() })
    .from(emailCampaignRecipients)
    .where(and(
      eq(emailCampaignRecipients.campaignId, campaignId),
      inArray(emailCampaignRecipients.status, ['pending', 'sending']),
    ));
  const pendingCount = Number(pendingRow?.cnt ?? 0);
  if (pendingCount === 0) {
    await db.update(emailCampaigns).set({ status: 'sent' })
      .where(eq(emailCampaigns.id, campaignId));
    return { done: true, sentNow: 0, failedNow: 0, remaining: 0 };
  }

  // ── PASSO 3: reservar cota ANTES de enviar ────────────────────────────────
  const reserved = await reserveSendQuota(Math.min(100, pendingCount));
  if (!reserved) return {
    done: false, sentNow: 0, failedNow: 0,
    remaining: pendingCount, reason: 'daily_limit_all',
  };
  const { account, granted } = reserved;

  // ── PASSO 4: CLAIM ATÔMICO ────────────────────────────────────────────────
  // ⚠️ O mecanismo mais importante. FOR UPDATE SKIP LOCKED garante que duas
  // execuções concorrentes (duplo clique, retry, duas abas, cron + front)
  // NUNCA peguem as mesmas linhas. Cada uma envia só o que reservou aqui.
  const claimed = await db.execute(sql`
    UPDATE email_campaign_recipients
    SET status = 'sending', claimed_at = now()
    WHERE id IN (
      SELECT id FROM email_campaign_recipients
      WHERE campaign_id = ${campaignId} AND status = 'pending'
      ORDER BY id
      LIMIT ${granted}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, email, name, reply_to AS "replyTo",
              task_id AS "taskId", unsub_token AS "unsubToken", variant
  `);
  const recipients = claimed.rows;

  if (recipients.length === 0) {
    await refundDailyQuota(account.key, granted);  // devolve o que não usou
    return { done: false, sentNow: 0, failedNow: 0, remaining: pendingCount };
  }

  // ── PASSO 5: recheca supressões ───────────────────────────────────────────
  // ⚠️ Alguém pode ter descadastrado DEPOIS da campanha ser criada.
  const suppressed = await db.select({ email: emailSuppressions.email })
    .from(emailSuppressions);
  const suppressedSet = new Set(suppressed.map(s => s.email.toLowerCase()));
  const toSend = recipients.filter(r => !suppressedSet.has(r.email.toLowerCase()));
  const toSkip = recipients.filter(r => suppressedSet.has(r.email.toLowerCase()));
  for (const r of toSkip) {
    await db.update(emailCampaignRecipients)
      .set({ status: 'skipped', error: 'suppressed' })
      .where(eq(emailCampaignRecipients.id, r.id));
  }

  // ── PASSO 6: montar e enviar ──────────────────────────────────────────────
  let sentNow = 0, failedNow = 0, confirmedFailures = 0;
  if (toSend.length > 0) {
    const signatureMap = await buildSignatureMap();
    const messages = toSend.map(r => {
      const unsubUrl = `${PUBLIC_APP_URL}/api/unsubscribe?t=${r.unsubToken}`;
      // A/B: variante B usa subject_b quando existir
      const subjectTemplate = (r.variant === 'B' && campaign.subjectB)
        ? campaign.subjectB : campaign.subject;
      return {
        to: r.email,
        subject: renderTemplate(subjectTemplate, { nome: r.name ?? '' }),
        html: layout(
          renderTemplate(campaign.htmlBody, { nome: r.name ?? '', unsubscribe: unsubUrl }),
          unsubUrl,
          r.replyTo ? signatureMap.get(r.replyTo.toLowerCase()) : undefined,
        ),
        replyTo: r.replyTo ?? undefined,
        unsubToken: r.unsubToken,
      };
    });

    const results = await sendBatch(account, messages);
    for (let i = 0; i < toSend.length; i++) {
      const r = toSend[i], res = results[i];
      if (res.ok) {
        sentNow++;
        await db.update(emailCampaignRecipients).set({
          status: 'sent', accountKey: account.key,
          messageId: res.messageId, sentAt: new Date(),
        }).where(eq(emailCampaignRecipients.id, r.id));
      } else {
        failedNow++;
        // ⚠️ só rejeição definitiva libera o slot reservado
        if (res.error !== 'network_error') confirmedFailures++;
        await db.update(emailCampaignRecipients).set({
          status: 'failed', accountKey: account.key, error: res.error,
        }).where(eq(emailCampaignRecipients.id, r.id));
      }
    }
  }

  // ── PASSO 7: estornar cota não usada ──────────────────────────────────────
  await refundDailyQuota(
    account.key,
    Math.max(0, granted - toSend.length) + confirmedFailures,
  );

  await db.update(emailCampaigns).set({
    sentCount:   sql`sent_count + ${sentNow}`,
    failedCount: sql`failed_count + ${failedNow}`,
    status: 'sending', updatedAt: new Date(),
  }).where(eq(emailCampaigns.id, campaignId));

  const remaining = Math.max(0, pendingCount - sentNow - failedNow - toSkip.length);
  if (remaining === 0) {
    // limpa anexos p/ não inchar o banco
    await db.update(emailCampaigns)
      .set({ status: 'sent', attachments: null })
      .where(eq(emailCampaigns.id, campaignId));
  }
  return { done: remaining === 0, sentNow, failedNow, remaining, account: account.key };
}
```

**No frontend**, chame em loop até `done`:

```ts
async function sendCampaign(campaignId: number) {
  let done = false;
  while (!done) {
    const res = await api.processBatch({ campaignId });
    setProgress(p => ({ sent: p.sent + res.sentNow, remaining: res.remaining }));
    if (res.reason === 'daily_limit_all') {
      toast.warning('Cota diária esgotada. O restante sai amanhã automaticamente.');
      break;
    }
    done = res.done;
  }
}
```

---

## 5. MOTOR DE SEQUÊNCIAS (drip)

Conceito: a inscrição (`enrollment`) carrega um **relógio** (`next_send_at`).
O cron busca inscrições vencidas, envia o passo devido, avança `current_step` e
recalcula `next_send_at`.

```ts
export function computeNextSendAt(
  enrolledAt: Date, steps: { delayDays: number }[], currentStep: number,
): Date | null {
  const nextStep = steps[currentStep];   // 0-based: o PRÓXIMO a enviar
  if (!nextStep) return null;            // sequência terminou
  return new Date(enrolledAt.getTime() + nextStep.delayDays * 86400000);
}
```

### 5.1 Inscrição

```ts
export async function enrollInSequence(sequenceId: number, opts: {
  email: string; name?: string | null; replyTo?: string | null; taskId?: number | null;
}) {
  const email = opts.email.toLowerCase().trim();
  if (!email) return { enrolled: false, reason: 'empty_email' };

  // 1. supressão
  const [sup] = await db.select().from(emailSuppressions)
    .where(eq(emailSuppressions.email, email)).limit(1);
  if (sup) return { enrolled: false, reason: 'suppressed' };

  // 2. controle de frequência
  if (await isEmailOverCapped(email)) return { enrolled: false, reason: 'frequency_cap' };

  // 3. sequência precisa ter passos
  const steps = await db.select({ delayDays: emailSequenceSteps.delayDays })
    .from(emailSequenceSteps).where(eq(emailSequenceSteps.sequenceId, sequenceId))
    .orderBy(emailSequenceSteps.stepOrder);
  if (steps.length === 0) return { enrolled: false, reason: 'no_steps' };

  // 4. dedupe — mesmo (sequência, e-mail, lead) já ativo
  const [existing] = await db.select({ id: emailSequenceEnrollments.id })
    .from(emailSequenceEnrollments).where(and(
      eq(emailSequenceEnrollments.sequenceId, sequenceId),
      eq(emailSequenceEnrollments.email, email),
      eq(emailSequenceEnrollments.status, 'active'),
      ...(opts.taskId ? [eq(emailSequenceEnrollments.taskId, opts.taskId)] : []),
    )).limit(1);
  if (existing) return { enrolled: false, reason: 'duplicate' };

  const enrolledAt = new Date();
  const nextSendAt = computeNextSendAt(enrolledAt, steps, 0);
  const [inserted] = await db.insert(emailSequenceEnrollments).values({
    sequenceId, email, name: opts.name ?? null, replyTo: opts.replyTo ?? null,
    taskId: opts.taskId ?? null, currentStep: 0, status: 'active',
    unsubToken: crypto.randomUUID(), enrolledAt, nextSendAt,
    cycleStartedAt: enrolledAt,
  }).returning({ id: emailSequenceEnrollments.id });

  // Passo "Dia 0" (delayDays=0) sai NA HORA, não espera o cron
  if (nextSendAt && nextSendAt <= new Date()) {
    await processSequenceEnrollments({ enrollmentIds: [inserted.id] });
  }
  return { enrolled: true };
}
```

⚠️ **Nunca deixe uma automação derrubar o fluxo principal.** Envolva tudo em
try/catch e apenas logue. Criar um lead não pode falhar porque o e-mail caiu.

### 5.2 Condições de passo

```ts
export function conditionMet(condition: string, eng: { opened: boolean; clicked: boolean }) {
  switch (condition) {
    case 'if_opened':      return eng.opened;
    case 'if_not_opened':  return !eng.opened;
    case 'if_clicked':     return eng.clicked;
    case 'if_not_clicked': return !eng.clicked;
    default:               return true;   // 'always'
  }
}
```

⚠️ O engajamento vem de um **JOIN em lote** (nunca N+1):

```sql
SELECT sd.enrollment_id,
       bool_or(e.event_type = 'opened')  AS opened,
       bool_or(e.event_type = 'clicked') AS clicked
FROM email_sequence_sends sd
INNER JOIN email_events e ON e.message_id = sd.message_id
WHERE sd.enrollment_id = ANY($1)
GROUP BY sd.enrollment_id
```

### 5.3 ⚠️ Sequências em loop (a armadilha do ciclo)

Se `repeat = true`, ao terminar o último passo a inscrição **volta ao passo 0**
com uma nova `cycle_started_at`.

**O bug que isso resolve:** sem `cycle_started_at`, ao reiniciar o ciclo todos os
passos aparecem como "já enviados" (existe registro em `email_sequence_sends`) e
a sequência **trava para sempre** após o primeiro ciclo.

**A regra:** ao montar o mapa de "já enviei este passo?", **ignore envios
anteriores ao início do ciclo atual**:

```ts
for (const s of existingSends) {
  const cycleStart = cycleStartByEnrollment.get(s.enrollmentId);
  if (cycleStart !== undefined && s.sentAt.getTime() < cycleStart) continue; // ciclo antigo
  // ... conta como enviado
}
```

E `cycle_started_at` entra na **chave única** de `email_sequence_sends`.

### 5.4 Reciclagem de claims abandonados

```ts
// Linhas 'sending' que uma execução inseriu mas nunca finalizou (crash entre o
// claim e o resultado). 1h é muito além da janela serverless.
// ⚠️ Trade-off consciente: se o crash ocorreu no intervalo de milissegundos
// APÓS o provedor aceitar o e-mail, ele pode ser reenviado uma vez. Preferimos
// isso a deixar a inscrição travada naquele passo para sempre.
await db.delete(emailSequenceSends).where(and(
  inArray(emailSequenceSends.enrollmentId, enrollmentIds),
  eq(emailSequenceSends.status, 'sending'),
  lt(emailSequenceSends.sentAt, new Date(Date.now() - 3600_000)),
));
```

---

## 6. AUTOMAÇÕES (gatilho → ação)

```
GATILHOS                      AÇÕES
├─ lead_created               ├─ enroll_sequence  {"sequenceId": 3}
├─ lead_converted             ├─ add_tag          {"tag": "cliente"}
├─ email_confirmed            └─ cancel_sequences
├─ tag_added
├─ sequence_completed
└─ inactive_days  (via cron)  {"days": 30}
```

**Filtro por tags** — toda regra pode exigir/excluir tags:

```ts
function matchesTagFilters(
  taskTags: string[], requiredTags?: string[] | null, excludedTags?: string[] | null,
): boolean {
  if (requiredTags?.length && !requiredTags.every(t => taskTags.includes(t))) return false;
  if (excludedTags?.length && excludedTags.some(t => taskTags.includes(t)))   return false;
  return true;
}
```

⚠️ `lead_created` / `lead_converted` etc. são chamados **de dentro das mutations
do domínio** (criar lead, converter lead), sempre com try/catch defensivo.
`inactive_days` só pode rodar no cron (precisa varrer a base).

---

## 7. RENDERIZAÇÃO DE E-MAIL

### 7.1 Variáveis

```ts
export function renderTemplate(text: string, vars: {
  nome?: string; empresa?: string; unsubscribe?: string;
}): string {
  return text
    .replace(/\{nome\}/g, vars.nome || '')
    .replace(/\{empresa\}/g, vars.empresa || '')
    .replace(/\{unsubscribe\}/g, vars.unsubscribe || '#');
}
```

### 7.2 ⚠️ Texto puro → HTML

O admin cola texto puro. Sem tratar, as quebras de linha somem e tudo chega num
bloco só. Detecte e reconstrua — **escapando HTML** e auto-linkando URLs:

```ts
export function bodyToHtml(text: string): string {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';
  // Se já é HTML estruturado (template real), deixa passar intacto
  if (/<(p|div|table|h[1-6])[\s>]/i.test(trimmed)) return trimmed;
  return trimmed.split(/\n{2,}/).map(block => {
    const lines = block.split(/\n/).map(l => linkify(escape(l)));
    return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333;">${lines.join('<br />')}</p>`;
  }).join('');
}
```

### 7.3 Layout (shell da marca)

⚠️ Regras de e-mail HTML que **não são negociáveis**:

- Container **600px centralizado** (não 100% — estica a tela toda no desktop)
- Layout com `<table>`, não flex/grid (Outlook não suporta)
- **Estilos inline** — `<style>` no `<head>` é removido por vários clientes
- Cabeçalho em **texto**, não imagem (imagens são bloqueadas por padrão)
- Sempre gere a alternativa **text/plain** (melhora entregabilidade)

```ts
export function layout(body: string, unsubUrl: string, signatureHtml?: string): string {
  const htmlBody = bodyToHtml(body);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#ECEAE4;font-family:system-ui,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:24px 12px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:600px;max-width:100%;background:#fff;border-radius:10px;overflow:hidden;">
        <tr><td style="background:{COR_MARCA};padding:16px 40px;">
          <span style="font-size:22px;color:#fff;font-weight:bold;">{NOME_MARCA}</span>
        </td></tr>
        <tr><td style="padding:32px 40px 24px;">${htmlBody}</td></tr>
        ${signatureHtml ? `<tr><td style="padding:16px 40px 24px;">${signatureHtml}</td></tr>` : ''}
        <tr><td style="background:#F7F6F2;padding:16px 40px;text-align:center;">
          <a href="${unsubUrl}" style="color:#888;font-size:11px;">Descadastrar</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
```

### 7.4 Alternativa text/plain

```ts
export function renderPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|table|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}
```

### 7.5 ⚠️ Sanitização (obrigatório — é XSS)

HTML vindo do admin **vai para a caixa de outra pessoa**. Sanitize com allowlist:

```ts
import sanitizeHtml from 'sanitize-html';

export function sanitizeCampaignHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['a','b','strong','i','em','u','br','span','div','p',
                  'table','tbody','tr','td','font','img','h1','h2','h3','ul','ol','li'],
    allowedAttributes: {
      a: ['href','target','rel','style'],
      img: ['src','alt','width','height','style'],
      table: ['cellpadding','cellspacing','border','width','style'],
      td: ['style','colspan','rowspan','width','align','valign'],
      '*': ['style'],
    },
    allowedSchemes: ['http','https','mailto','tel'],   // ⚠️ bloqueia javascript:
    transformTags: { a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }) },
  }).trim();
}
```

---

## 8. CONFORMIDADE (LGPD / CAN-SPAM) — NÃO É OPCIONAL

### 8.1 Cabeçalhos de descadastro (RFC 8058)

Em **todo** e-mail enviado:

```ts
headers: {
  'List-Unsubscribe': `<${PUBLIC_APP_URL}/api/unsubscribe?t=${unsubToken}>`,
  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
}
```

⚠️ Gmail e Outlook **exigem** isso para remetentes de volume. Sem ele, você cai
em spam.

### 8.2 Endpoint de descadastro

⚠️ Precisa aceitar **GET e POST** — o one-click do RFC 8058 manda POST.

```ts
async function handleUnsubscribe(req, res) {
  const token = String(req.query.t ?? '').trim();
  if (!token) return res.status(400).send(page('Link inválido.'));

  // Resolve o e-mail pelo token, em ordem: campanha → sequência
  let email: string | null = null;
  const [rec] = await db.select({ email: emailCampaignRecipients.email })
    .from(emailCampaignRecipients)
    .where(eq(emailCampaignRecipients.unsubToken, token)).limit(1);
  if (rec) email = rec.email;
  if (!email) {
    const [enr] = await db.select({ email: emailSequenceEnrollments.email })
      .from(emailSequenceEnrollments)
      .where(eq(emailSequenceEnrollments.unsubToken, token)).limit(1);
    if (enr) email = enr.email;
  }
  if (!email) return res.status(404).send(page('Link inválido ou expirado.'));

  const normalized = email.toLowerCase().trim();

  // ⚠️ UM opt-out silencia TODOS os canais onde o endereço vive
  await db.insert(emailSuppressions)
    .values({ email: normalized, reason: 'unsubscribe' }).onConflictDoNothing();
  await cancelAllEnrollments(normalized);                    // cancela sequências
  await db.update(clients).set({ unsubscribed: true })
    .where(sql`lower(email) = ${normalized}`);
  await db.update(marketingContacts).set({ status: 'unsubscribed' })
    .where(sql`lower(email) = ${normalized}`);

  res.send(page('Você foi descadastrado com sucesso.'));
}

app.get('/api/unsubscribe', handleUnsubscribe);
app.post('/api/unsubscribe', express.urlencoded({ extended: false }), handleUnsubscribe);
```

⚠️ **Token opaco (UUID) por destinatário** — nunca `?email=alguem@x.com`, senão
qualquer um descadastra qualquer um.

### 8.3 Controle de frequência

Não precisa de tabela nova — o histórico já está em `sent_at`:

```ts
export async function overCappedEmails(emails: string[]): Promise<Set<string>> {
  const cap = await getFrequencyCap();      // { enabled, maxEmails, windowDays }
  if (!cap.enabled || emails.length === 0) return new Set();
  const normalized = [...new Set(emails.map(e => e.toLowerCase().trim()))];
  const cutoff = new Date(Date.now() - cap.windowDays * 86400000);

  const rows = await sql`
    WITH sends AS (
      SELECT lower(email) AS email FROM email_campaign_recipients
      WHERE status = 'sent' AND sent_at >= ${cutoff} AND lower(email) = ANY(${normalized})
      UNION ALL
      SELECT lower(en.email) FROM email_sequence_sends s
      INNER JOIN email_sequence_enrollments en ON en.id = s.enrollment_id
      WHERE s.status = 'sent' AND s.sent_at >= ${cutoff} AND lower(en.email) = ANY(${normalized})
    )
    SELECT email FROM sends GROUP BY email HAVING COUNT(*) >= ${cap.maxEmails}
  `;
  return new Set(rows.map(r => r.email));
}
```

⚠️ Aplique nas **duas** fontes de envio: montagem de público de campanha E
inscrição em sequência. Se aplicar só numa, a outra fura o teto.

---

## 9. RASTREAMENTO (webhook)

### 9.1 ⚠️ Verificação de assinatura (Svix/HMAC)

```ts
export function verifyResendWebhook(
  rawBody: string,
  headers: { 'svix-id'?: string; 'svix-timestamp'?: string; 'svix-signature'?: string },
): boolean {
  const { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': sig } = headers;
  if (!id || !ts || !sig) return false;

  const secrets: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const s = process.env[`RESEND_MKT_WEBHOOK_SECRET_${i}`];
    if (s) secrets.push(s);
  }
  if (secrets.length === 0) return false;   // ⚠️ FAIL-CLOSED, nunca aceite sem segredo

  const signedContent = `${id}.${ts}.${rawBody}`;
  // header: "v1,<base64> v1,<base64> ..."
  const provided = sig.split(' ').map(p => p.split(',')[1]).filter(Boolean);

  for (const secret of secrets) {
    const key = secret.startsWith('whsec_') ? secret.slice(6) : secret;
    const expected = crypto.createHmac('sha256', Buffer.from(key, 'base64'))
      .update(signedContent).digest('base64');
    for (const s of provided) {
      // ⚠️ comparação time-safe (evita timing attack)
      if (expected.length === s.length &&
          crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return true;
    }
  }
  return false;
}
```

⚠️ Use **`express.raw()`**, não `express.json()`, nesta rota — a assinatura é
calculada sobre o corpo **bruto**. `express.json()` reserializa e a assinatura
nunca bate.

### 9.2 Handler

```ts
app.post('/api/resend-webhook',
  rateLimit({ windowMs: 60_000, max: 120 }),
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    if (!verifyResendWebhook(rawBody, req.headers as any)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    const payload = JSON.parse(rawBody);
    const eventType = payload.type ?? '';
    const messageId = String(payload.data?.email_id ?? '');
    const to = payload.data?.to;
    const recipientEmail = (Array.isArray(to) ? to[0] : to ?? '').toLowerCase().trim();
    if (!recipientEmail) return res.status(200).json({ ok: true });

    switch (eventType) {
      case 'email.bounced':
      case 'email.complained': {
        // ⚠️ suprime AUTOMATICAMENTE — continuar mandando destrói sua reputação
        const reason = eventType === 'email.bounced' ? 'bounce' : 'complaint';
        await db.insert(emailSuppressions)
          .values({ email: recipientEmail, reason }).onConflictDoNothing();
        break;
      }
      case 'email.delivered':
      case 'email.opened':
      case 'email.clicked': {
        if (!messageId) break;
        const shortType = eventType.replace('email.', '');
        await db.insert(emailEvents)
          .values({ messageId, recipientEmail, eventType: shortType })
          .onConflictDoNothing();
        if (shortType === 'opened' || shortType === 'clicked') {
          await flagEngagementByMessageId(messageId, shortType);  // lead scoring
        }
        break;
      }
    }
    res.status(200).json({ ok: true });
  });
```

⚠️ **Sempre responda 200**, mesmo em erro interno (exceto assinatura inválida).
Provedores desativam webhooks que retornam erro repetidamente.

### 9.3 ⚠️ ARMADILHA GRAVE: rastreamento é por DOMÍNIO, não por e-mail

No Resend **não existe** parâmetro de tracking por e-mail. Qualquer campo
`tracking` no payload é **ignorado silenciosamente**. O controle é no domínio:

| O que | Como habilitar | Gate |
|---|---|---|
| **Abertura** | `open_tracking: true` no domínio | funciona direto (pixel) |
| **Clique** | `click_tracking: true` **+ subdomínio de rastreio (CNAME) verificado** | ⚠️ sem o CNAME, **não conta nada** |

E mais uma pegadinha: `GET /domains` (lista) **não devolve** de forma confiável
`open_tracking` / `click_tracking` / `tracking_subdomain`. Você precisa buscar o
**detalhe de cada domínio** (`GET /domains/:id`):

```ts
// ❌ ERRADO — a lista omite os flags e seu painel mostra "desligado"
//    mesmo com a abertura funcionando de verdade
const { data } = await fetch('https://api.resend.com/domains').then(r => r.json());

// ✅ CERTO — lista para pegar os IDs, depois um GET por domínio
const { data: domains } = await fetch('https://api.resend.com/domains', {
  headers: { Authorization: `Bearer ${apiKey}` },
}).then(r => r.json());

return Promise.all(domains.map(async (d) => {
  const detail = await fetch(`https://api.resend.com/domains/${d.id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  }).then(r => r.json());
  return {
    domainId: d.id, domainName: d.name,
    openTracking:  detail.open_tracking,
    clickTracking: detail.click_tracking,
    trackingSubdomain: detail.tracking_subdomain ?? null,
    status: detail.status,
  };
}));
```

⚠️ Construa um painel de **diagnóstico** (só leitura) mostrando esses flags.
**Não** faça um botão "Ativar" — ligar clique de verdade exige criar um CNAME no
DNS, o que um botão não faz. Um botão que não muda nada gera mais confusão que
ajuda.

---

## 10. CRON DIÁRIO (resiliência)

⚠️ **O motivo de existir:** se o admin fecha a aba no meio de uma campanha, o
loop do frontend morre e o envio para. O cron termina o serviço.

```ts
app.get('/api/cron/email-daily', async (req, res) => {
  // ⚠️ autenticação obrigatória — este endpoint gasta cota e envia e-mail
  const secret = process.env.CRON_SECRET;
  const provided = req.headers['authorization']?.replace('Bearer ', '');
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Unauthorized' });

  // ⚠️ ORÇAMENTO DE TEMPO: a função tem teto de 60s. Reserve 45s e pare no
  // limite — o resto fica para o loop da aba ou o próximo dia.
  const deadline = Date.now() + 45_000;

  // 1. Automações inactive_days → novas inscrições
  await safely(() => evaluateInactiveDaysRules());

  // 2. Sequências PRIMEIRO (compromisso já assumido com o lead; consomem a
  //    cota antes das campanhas — a cascata é respeitada naturalmente)
  await safely(() => processSequenceEnrollments());

  // 3. Campanhas DEPOIS: promove agendadas vencidas e termina as 'sending'
  await safely(() => processDueCampaigns(deadline));

  // 4. Limpeza: eventos com mais de 90 dias
  await safely(() => db.delete(emailEvents)
    .where(lt(emailEvents.createdAt, new Date(Date.now() - 90 * 86400000))));

  res.json({ ok: true });
});
```

⚠️ Cada sub-rotina em try/catch **isolado** — a falha de uma não pode derrubar
as outras.

Promoção de agendadas:

```ts
await db.update(emailCampaigns).set({ status: 'sending' })
  .where(and(
    eq(emailCampaigns.status, 'scheduled'),
    isNotNull(emailCampaigns.scheduledAt),
    lte(emailCampaigns.scheduledAt, new Date()),
  ));
```

⚠️ Campanhas em `draft` **nunca** são enviadas pelo cron — só as que o admin
mandou explicitamente.

Config na Vercel (`vercel.json`):
```json
{ "crons": [{ "path": "/api/cron/email-daily", "schedule": "0 11 * * *" }] }
```
⚠️ Cron da Vercel roda em **UTC**. `0 11 * * *` = 08:00 BRT. Plano Hobby permite
**uma execução diária** por cron.

---

## 11. MONTAGEM DE PÚBLICO (audience)

```ts
async function buildAudience(opts: {
  source: 'leads' | 'clients' | 'contacts' | 'both' | 'all';
  assignedTo?: string; tags?: string[]; listId?: number;
}): Promise<AudienceRow[]> {
  const rows: AudienceRow[] = [];

  if (['leads','both','all'].includes(opts.source)) {
    // ⚠️ Só e-mails CONFIRMADOS entram. E-mail extraído de texto/importação
    // sem confirmação humana gera bounce, e bounce destrói reputação.
    const conditions = [isNotNull(tasks.email), ne(tasks.email, ''),
                        eq(tasks.emailConfirmed, true)];
    if (opts.assignedTo) conditions.push(eq(tasks.assignedTo, opts.assignedTo));
    if (opts.tags?.length) {
      // Operador de sobreposição de arrays do Postgres: tem QUALQUER uma das tags
      conditions.push(sql`${tasks.tags} && ARRAY[${sql.join(opts.tags.map(t => sql`${t}`), sql`, `)}]::text[]`);
    }
    // ... push nas rows com replyTo = e-mail do vendedor dono
  }
  // ... clients, marketing_contacts

  // ⚠️ ORDEM OBRIGATÓRIA dos três filtros finais:
  const deduped = dedupeByEmail(rows);              // 1. dedupe
  const notSuppressed = removeSuppressed(deduped);  // 2. supressão
  const overCap = await overCappedEmails(notSuppressed.map(r => r.email));
  return notSuppressed.filter(r => !overCap.has(r.email));  // 3. frequência
}
```

---

## 12. TESTE A/B DE ASSUNTO

1. Campanha ganha `subject_b` (nullable).
2. Na criação dos destinatários, alterna por índice:
   ```ts
   variant: subjectB ? (idx % 2 === 0 ? 'A' : 'B') : null
   ```
3. No envio, escolhe por destinatário:
   ```ts
   const subjectTemplate = (r.variant === 'B' && campaign.subjectB)
     ? campaign.subjectB : campaign.subject;
   ```
4. Nas estatísticas, compare abertura por variante:
   ```sql
   SELECT r.variant,
          COUNT(*) FILTER (WHERE r.status = 'sent') AS sent,
          COUNT(DISTINCT e.message_id) FILTER (WHERE e.event_type = 'opened') AS opened
   FROM email_campaign_recipients r
   LEFT JOIN email_events e ON e.message_id = r.message_id
   WHERE r.campaign_id = $1 AND r.variant IS NOT NULL
   GROUP BY r.variant
   ```

---

## 13. INTERFACE (organização das abas)

```
GRUPO           ABAS
├─ Enviar       └─ Campanhas
├─ Automatizar  ├─ Sequências  ├─ Automações  └─ Templates
├─ Audiência    ├─ Contatos    └─ Tags
└─ Resultados   ├─ Estatísticas └─ Consumo
```

**Aba Consumo** (essencial): por conta, mostre `enviados hoje / limite diário` e
`enviados no mês / limite mensal`. Sem isso o admin descobre que a cota acabou
só quando a campanha trava.

**Painel de diagnóstico de rastreamento**: por domínio, mostre abertura ✓/✗,
clique ✓/✗, status de verificação e o subdomínio de rastreio. Quando o clique
estiver desligado, **explique** que depende de um CNAME verificado.

⚠️ Quebre a UI em componentes por caso de uso desde o começo. No sistema
original o arquivo da tela chegou a **5.759 linhas** e virou um problema real de
manutenção.

---

## 14. VARIÁVEIS DE AMBIENTE

```bash
# Contas do provedor primário (até 5)
RESEND_MKT_API_KEY_1=re_xxx
RESEND_MKT_FROM_1="Marca <contato@news.dominio.com.br>"
RESEND_MKT_API_KEY_2=re_yyy
RESEND_MKT_FROM_2="Marca <contato2@news.dominio.com.br>"

# Segredos dos webhooks (um por conta)
RESEND_MKT_WEBHOOK_SECRET_1=whsec_xxx
RESEND_MKT_WEBHOOK_SECRET_2=whsec_yyy

# Provedor de transbordo (opcional)
BREVO_API_KEY_1=xkeysib-xxx
BREVO_FROM_1="Marca <contato@dominio.com.br>"
BREVO_WEBHOOK_SECRET=xxx

# Limites (sobrescrevem os defaults)
RESEND_MKT_DAILY_LIMIT=90
RESEND_MKT_MONTHLY_LIMIT=3000
BREVO_DAILY_LIMIT=300
BREVO_MONTHLY_LIMIT=9000

# Base pública (links de descadastro)
PUBLIC_APP_URL=https://app.meudominio.com.br

# Autenticação do cron
CRON_SECRET=<string longa aleatória>
```

---

## 15. CHECKLIST DE ENTREGA

Implemente nesta ordem. Não pule etapas — cada uma depende da anterior.

**Fase 1 — Fundação**
- [ ] 13 tabelas + índices (com o índice único de idempotência)
- [ ] `getAccounts()` + `getAccountLimits()` lendo env
- [ ] `reserveDailyQuota()` com `FOR UPDATE` + `refundDailyQuota()`
- [ ] `sendBatch()` por provedor, com `text/plain` e headers de descadastro

**Fase 2 — Campanhas**
- [ ] `buildAudience()` com dedupe → supressão → frequência
- [ ] `processCampaignBatch()` com claim `FOR UPDATE SKIP LOCKED`
- [ ] Loop no frontend com barra de progresso
- [ ] `layout()` + `bodyToHtml()` + `renderTemplate()` + sanitização

**Fase 3 — Conformidade** *(não deixe para depois)*
- [ ] Endpoint `/api/unsubscribe` GET **e** POST
- [ ] Token opaco por destinatário
- [ ] Propagação do opt-out para todas as tabelas
- [ ] Webhook com verificação de assinatura (fail-closed) e `express.raw()`
- [ ] Supressão automática em bounce/complaint

**Fase 4 — Sequências**
- [ ] `computeNextSendAt()` + `enrollInSequence()` com as 4 checagens
- [ ] `processSequenceEnrollments()` com engajamento em lote
- [ ] Condições de passo (`if_opened` etc.)
- [ ] Loop com `cycle_started_at` na chave de idempotência

**Fase 5 — Automações e cron**
- [ ] Motor de regras gatilho → ação com filtro de tags
- [ ] Cron diário: sequências → campanhas → limpeza, com orçamento de tempo
- [ ] `CRON_SECRET`

**Fase 6 — Análise**
- [ ] Estatísticas de campanha (entregue/aberto/clicado/bounce)
- [ ] Aba de consumo por conta
- [ ] Painel de diagnóstico de rastreamento de domínio
- [ ] Teste A/B de assunto

---

## 16. RESUMO DAS ARMADILHAS (⚠️ leia antes de começar)

| # | Armadilha | Consequência se ignorar |
|---|---|---|
| 1 | Cota lida antes de enviar (TOCTOU) | Estoura o limite diário, conta suspensa |
| 2 | Sem `FOR UPDATE SKIP LOCKED` no claim | E-mail duplicado por duplo clique / duas abas |
| 3 | Sem `claimed_at` + reciclagem | Destinatários travam em `sending` para sempre |
| 4 | Contar só `pending` (não `sending`) | Campanha marcada "enviada" com envios em voo |
| 5 | Estornar cota em timeout | Envio duplicado (o e-mail pode ter saído) |
| 6 | Sem `cycle_started_at` | Sequência em loop trava após o 1º ciclo |
| 7 | Sem índice único em sends | Retry do cron reenvia o mesmo passo |
| 8 | `express.json()` no webhook | Assinatura nunca valida |
| 9 | Webhook aceitando sem segredo | Qualquer um injeta eventos falsos |
| 10 | Achar que tracking é por e-mail | Métricas zeradas sem explicação |
| 11 | Ler `GET /domains` (lista) | Painel diz "desligado" com tracking ativo |
| 12 | Sem `List-Unsubscribe` | Cai em spam no Gmail/Outlook |
| 13 | Descadastro só por GET | One-click do RFC 8058 falha |
| 14 | `?email=` no link em vez de token | Qualquer um descadastra qualquer um |
| 15 | Opt-out em uma tabela só | Pessoa descadastrada continua recebendo |
| 16 | Sem sanitização do HTML | XSS na caixa de outra pessoa |
| 17 | Enviar tudo numa request | Timeout serverless, envio pela metade |
| 18 | Cron sem orçamento de tempo | Função morre no meio, estado inconsistente |
| 19 | Automação sem try/catch | Criar lead falha porque o e-mail caiu |
| 20 | Contador em UTC | Relatório diário errado entre 21h e 00h |
| 21 | E-mail não confirmado no público | Bounce em massa, reputação destruída |
| 22 | Engajamento com N+1 | Timeout com poucas centenas de inscrições |

---

## 17. COMO TRABALHAR

1. Confirme comigo o bloco `CONTEXTO DO MEU PROJETO` antes de escrever código.
2. Implemente **fase por fase**, na ordem do checklist. Ao terminar cada fase,
   pare e me mostre o que fez.
3. Adapte os nomes ao meu domínio (se meu sistema tem `contatos` em vez de
   `leads`, use `contatos`), mas **preserve a estrutura e as garantias**.
4. Todo trecho marcado ⚠️ é obrigatório. Se decidir fazer diferente, **explique
   o porquê antes**.
5. Se algo na minha stack impedir alguma técnica (ex.: meu banco não é
   PostgreSQL e não tem `FOR UPDATE SKIP LOCKED`), **avise e proponha o
   equivalente** — não implemente silenciosamente uma versão sem a garantia.

=== FIM DO PROMPT ===
