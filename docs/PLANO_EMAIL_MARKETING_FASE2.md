# Plano de Implementação — E-mail Marketing Fase 2/3 (Sequências, Automações, Tags, Estatísticas)

> **Pré-requisito:** Fase 1 já está em produção (`docs/PLANO_EMAIL_MARKETING.md`) — templates,
> campanhas avulsas (envio manual em loop), suprimidos, multi-conta Resend (`RESEND_MKT_API_KEY_N`),
> domínio `salvitarn.com.br` verificado no Resend.
>
> **Escopo:** continua **só** o Lembretes CRM (`lembretes.salvitarn.com.br`). Não tocar em
> `server/email/resend.ts`, `siteOrders`, `abandonedCarts`, `automationRuns` (esses são do
> Premium/e-commerce e têm seu próprio fluxo).
>
> **Inspiração:** telas do systeme.io mostradas pelo usuário —
> 1 "Campanha" lá = uma **sequência de e-mails com atraso** (drip) disparada por uma
> **regra de automação** (gatilho → tag + inscrição na sequência), com estatísticas de
> abertura/clique por e-mail.
>
> **Objetivo de negócio:** o atendente faz "contatos recorrentes para oferecer o sal" —
> a sequência de e-mail deve **rodar em paralelo** ao lembrete manual (ligação/WhatsApp),
> nutrindo o lead automaticamente entre os contatos humanos, e dar ao atendente um sinal
> de "esse lead está engajado" (abriu/clicou) para priorizar a ligação do dia.

---

## 0. Decisões de arquitetura (não re-debater)

### 0.1 Modelo de Sequência (= "Campanha" do systeme.io)
- `email_sequences` = a sequência (ex: "Boas-vindas Lead Novo", "Reativação 30 dias",
  "Pós-venda / Recompra").
- `email_sequence_steps` = passos ordenados, cada um com `delay_days` **contado a partir
  da inscrição** (não do passo anterior — mais simples de calcular `next_send_at`).
- `email_sequence_enrollments` = 1 lead/cliente inscrito numa sequência. Guarda
  `current_step`, `next_send_at`, `status` (active|paused|completed|cancelled).
- `email_sequence_sends` = log de cada e-mail efetivamente enviado de um passo
  (espelha `email_campaign_recipients`, usado para stats via `messageId`).

### 0.2 Automações (= "Regras de automação" do systeme.io)
- `automation_rules`: `trigger_type` + `trigger_config` (JSON) → `action_type` +
  `action_config` (JSON).
- Gatilhos suportados na Fase 2 (escolhidos por serem **eventos que já existem** no
  sistema, sem inventar novo tracking):
  1. `lead_created` — quando uma task nova é criada com `email` preenchido.
  2. `lead_converted` — quando `tasks.convertedAt` passa de null para uma data
     (toggleConverted).
  3. `inactive_days` — `lastContactedAt` (ou `createdAt` se nunca contatado) mais
     antigo que N dias **e** `convertedAt IS NULL` **e** ainda não tem inscrição
     ativa na sequência alvo. Avaliado 1x/dia no cron.
- Ações suportadas: `enroll_sequence` (`{sequenceId}`), `add_tag` (`{tag}`).
- Gatilhos 1-3 disparam **na hora** (dentro da mutation de `tasks.create` /
  `toggleConverted`), exceto `inactive_days` que só roda no cron diário.

### 0.3 Tags
- Coluna `tasks.tags text[]` (array Postgres), default `{}`. GIN index para filtro.
- Reaproveita a mesma coluna para segmentar campanhas/sequências (filtro adicional
  em `buildAudience`).
- UI: chips com autocomplete das tags já existentes (distinct sobre `tasks.tags`).

### 0.4 Estatísticas (abertura/clique/bounce)
- Webhook do Resend (`POST /api/resend-webhook`, raw body, validação Svix) grava em
  `email_events` (`event_type`, `message_id`, `recipient_email`).
- `email.bounced` / `email.complained` → grava em `email_suppressions`
  automaticamente (igual já previsto na Fase 1).
- Stats agregadas: join de `email_events.message_id` com
  `email_campaign_recipients.message_id` (campanhas) e `email_sequence_sends.message_id`
  (sequências).
- **Retenção**: cron diário deleta `email_events` com mais de 90 dias (Neon free —
  não acumular para sempre).

### 0.5 Motor diário (1 único cron, respeita Vercel Hobby = 1x/dia)
- `vercel.json` → 1 cron: `GET /api/cron/email-daily` às `11:00 UTC` (08:00 BRT).
- Protegido por `CRON_SECRET` (Vercel injeta `Authorization: Bearer <CRON_SECRET>`
  automaticamente nos crons quando essa env var existe — validar no handler).
- Dentro de **uma execução** (orçamento de tempo ~50s, `maxDuration: 60`):
  1. Avalia `automation_rules` do tipo `inactive_days` → cria enrollments novos.
  2. Busca `email_sequence_enrollments` com `status='active' AND next_send_at <= now()`,
     ordenado por `next_send_at`, **limit 300**.
  3. Para cada um, monta a mensagem do passo `current_step + 1`, agrupa em lotes de
     até 100 e envia via `sendBatch` (waterfall de contas — **compartilha a mesma
     cota diária com as campanhas avulsas**, não é um budget separado).
  4. Atualiza `current_step`, `next_send_at` (= `enrolled_at + steps[next].delay_days`,
     ou `null` + `status='completed'` se não houver próximo passo), grava
     `email_sequence_sends`.
  5. Se `pickAccount()` retornar `null` (cota do dia esgotada) ou o tempo se esgotar,
     para e deixa o resto para o próximo dia (`next_send_at` não muda).
  6. Por fim, `DELETE FROM email_events WHERE created_at < now() - interval '90 days'`.
- **Importante**: como o cron compartilha cota com as campanhas manuais, evitar
  disparar uma campanha grande no mesmo dia em que sequências estão ativas — a UI
  deve mostrar "cota usada hoje: X/90" (soma de todas as contas) em todas as telas
  de envio.

---

## 1. Schema — `server/db/schema.ts`

Adicionar ao final do arquivo (depois das tabelas da Fase 1):

```typescript
// ── E-mail Marketing Fase 2 — Sequências, Automações, Tags, Eventos ─────────

export const emailSequences = pgTable('email_sequences', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailSequenceSteps = pgTable('email_sequence_steps', {
  id: serial('id').primaryKey(),
  sequenceId: integer('sequence_id').notNull(),
  stepOrder: integer('step_order').notNull(),      // 1, 2, 3...
  delayDays: integer('delay_days').notNull(),       // dias após a inscrição
  subject: text('subject').notNull(),
  htmlBody: text('html_body').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const emailSequenceEnrollments = pgTable('email_sequence_enrollments', {
  id: serial('id').primaryKey(),
  sequenceId: integer('sequence_id').notNull(),
  email: text('email').notNull(),
  name: text('name'),
  replyTo: text('reply_to'),
  taskId: integer('task_id'),
  currentStep: integer('current_step').default(0).notNull(), // último passo enviado (0 = nenhum)
  status: text('status').notNull().default('active'),         // active|paused|completed|cancelled
  unsubToken: text('unsub_token').notNull(),
  enrolledAt: timestamp('enrolled_at').defaultNow().notNull(),
  nextSendAt: timestamp('next_send_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailSequenceSends = pgTable('email_sequence_sends', {
  id: serial('id').primaryKey(),
  enrollmentId: integer('enrollment_id').notNull(),
  stepId: integer('step_id').notNull(),
  status: text('status').notNull().default('sent'), // sent|failed
  accountKey: text('account_key'),
  messageId: text('message_id'),
  error: text('error'),
  sentAt: timestamp('sent_at').defaultNow().notNull(),
});

export const emailEvents = pgTable('email_events', {
  id: serial('id').primaryKey(),
  messageId: text('message_id').notNull(),
  recipientEmail: text('recipient_email').notNull(),
  eventType: text('event_type').notNull(), // delivered|opened|clicked|bounced|complained
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const automationRules = pgTable('automation_rules', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  triggerType: text('trigger_type').notNull(),   // lead_created|lead_converted|inactive_days
  triggerConfig: text('trigger_config'),          // JSON, ex: {"days":30}
  actionType: text('action_type').notNull(),     // enroll_sequence|add_tag
  actionConfig: text('action_config').notNull(), // JSON, ex: {"sequenceId":3} ou {"tag":"cliente"}
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type EmailSequence = typeof emailSequences.$inferSelect;
export type EmailSequenceStep = typeof emailSequenceSteps.$inferSelect;
export type EmailSequenceEnrollment = typeof emailSequenceEnrollments.$inferSelect;
export type AutomationRule = typeof automationRules.$inferSelect;
```

Adicionar coluna em `tasks` (perto de `email`):

```typescript
  tags: text('tags').array().default([]).notNull(),
```

---

## 2. Migração — `server/db/migrate.ts`

Na seção de migrações incrementais:

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS email_sequences ( ... );          -- espelha schema
CREATE TABLE IF NOT EXISTS email_sequence_steps ( ... );
CREATE TABLE IF NOT EXISTS email_sequence_enrollments ( ... );
CREATE TABLE IF NOT EXISTS email_sequence_sends ( ... );
CREATE TABLE IF NOT EXISTS email_events ( ... );
CREATE TABLE IF NOT EXISTS automation_rules ( ... );

CREATE INDEX IF NOT EXISTS tasks_tags_idx ON tasks USING GIN (tags);
CREATE INDEX IF NOT EXISTS email_seq_steps_seq_idx ON email_sequence_steps(sequence_id, step_order);
CREATE INDEX IF NOT EXISTS email_seq_enroll_due_idx ON email_sequence_enrollments(status, next_send_at);
CREATE UNIQUE INDEX IF NOT EXISTS email_seq_enroll_unique_idx ON email_sequence_enrollments(sequence_id, email);
CREATE INDEX IF NOT EXISTS email_seq_sends_enrollment_idx ON email_sequence_sends(enrollment_id);
CREATE INDEX IF NOT EXISTS email_events_message_idx ON email_events(message_id);
CREATE INDEX IF NOT EXISTS email_events_created_idx ON email_events(created_at);
```

> `email_seq_enroll_unique_idx` evita inscrever o mesmo e-mail duas vezes na mesma
> sequência (automação `inactive_days` é idempotente).

---

## 3. `server/email/marketing.ts` — extensões

- **`renderPlainText(html)`**: strip de tags HTML simples (regex) para gerar `text`
  alternativo no payload do Resend — melhora entregabilidade (mitigação já prevista
  na Fase 1, ainda não feita).
- **`verifyResendWebhook(rawBody, headers, secrets[])`**: valida assinatura Svix
  (`svix-id`, `svix-timestamp`, `svix-signature`) contra `RESEND_MKT_WEBHOOK_SECRET_1..N`
  — tenta cada secret até um bater (cada conta Resend tem seu próprio secret de webhook).
- **`computeNextSendAt(enrolledAt, steps, currentStep)`**: dado o array de passos
  ordenado e o índice atual, retorna `enrolledAt + steps[currentStep].delayDays` (em
  ms) ou `null` se não houver próximo passo.

---

## 4. `server/email/automations.ts` (novo módulo)

Funções puras chamadas tanto pelas mutations de `tasks` quanto pelo cron:

- `runTriggerNow(triggerType, task)` — para `lead_created` e `lead_converted`:
  busca `automation_rules` ativas com esse `triggerType`, executa a ação
  (`enrollInSequence` ou `addTag`) para a task recém-criada/convertida. Chamado de
  dentro de `tasksRouter.create` (depois do insert) e `toggleConverted` (quando
  `converted=true`), em `try/catch` silencioso (nunca deve quebrar o fluxo principal).
- `enrollInSequence(sequenceId, {email, name, replyTo, taskId})` — insere em
  `email_sequence_enrollments` com `ON CONFLICT (sequence_id, email) DO NOTHING`,
  `nextSendAt = now() + steps[0].delayDays` (passo 1).
- `addTagToTask(taskId, tag)` — `UPDATE tasks SET tags = array_append distinct...`
  (usar `sql` template do Drizzle, sem duplicar tag).
- `evaluateInactiveDaysRules()` — chamado só pelo cron: para cada regra
  `inactive_days` ativa, busca tasks elegíveis (`email IS NOT NULL`,
  `convertedAt IS NULL`, `COALESCE(lastContactedAt, createdAt) < now() - days`,
  sem suppression) e chama `enrollInSequence`.

---

## 5. Router — `server/routers/emailMarketing.ts` (extensões)

Adicionar ao router existente (mesmo arquivo, `adminProcedure` salvo onde indicado):

```
// ── Tags ──
listTags: adminProcedure.query(...)
  // SELECT DISTINCT unnest(tags) FROM tasks ORDER BY 1 — autocomplete

// ── Sequências ──
listSequences: adminProcedure.query(...)
  // + contagem de inscritos ativos por sequência (subquery/join)
upsertSequence: adminProcedure.input({id?, name, description?, active}).mutation(...)
deleteSequence: adminProcedure.input({id}).mutation(...)
  // bloquear delete se houver enrollments ativos (ou cancelar em cascata)

listSequenceSteps: adminProcedure.input({sequenceId}).query(...)
upsertSequenceStep: adminProcedure.input({id?, sequenceId, stepOrder, delayDays, subject, htmlBody}).mutation(...)
deleteSequenceStep: adminProcedure.input({id}).mutation(...)

// inscrição manual (igual addRecipientsFromTasks da Fase 1, mas pra sequência)
enrollTasksInSequence: adminProcedure.input({sequenceId, taskIds:number[]}).mutation(...)
  // dedup contra email_sequence_enrollments (sequenceId,email), ignora sem email/suprimidos

listEnrollments: adminProcedure.input({sequenceId, status?}).query(...)
  // tabela paginada: email, nome, currentStep/total, nextSendAt, status
pauseEnrollment / resumeEnrollment / cancelEnrollment: adminProcedure.input({id}).mutation(...)

// ── Automações ──
listAutomationRules: adminProcedure.query(...)
upsertAutomationRule: adminProcedure.input({id?, name, triggerType, triggerConfig, actionType, actionConfig, active}).mutation(...)
deleteAutomationRule: adminProcedure.input({id}).mutation(...)

// ── Estatísticas ──
campaignStats: adminProcedure.input({campaignId}).query(...)
  // conta email_events por tipo, join via message_id em email_campaign_recipients
sequenceStats: adminProcedure.input({sequenceId}).query(...)
  // por passo: enviados, opened, clicked (join email_sequence_sends + email_events)
overviewStats: adminProcedure.query(...)
  // últimos 30 dias: total enviados (campanhas + sequências), taxa abertura/clique/descadastro,
  // cota usada hoje (soma email_send_counters de hoje / MKT_DAILY_LIMIT * nº contas)

// ── Engajamento por lead (usado na tela de Tarefas) ──
engagementByTaskIds: protectedProcedure.input({taskIds: number[]}).query(...)
  // retorna {taskId: {opens, clicks, lastEventAt}} — join email_sequence_sends/
  // email_campaign_recipients (por taskId) + email_events (por messageId)
```

`buildAudience` (Fase 1) ganha filtro opcional `tags?: string[]` (`tasks.tags && ARRAY[...]`
— operador `&&` overlap do Postgres array).

---

## 6. `api/index.ts` — novas rotas

### 6.1 `POST /api/resend-webhook` (público, raw body — registrar **antes** de `express.json()`)
- Lê `svix-id/timestamp/signature` headers + raw body.
- `verifyResendWebhook(...)`; se inválido → 401.
- `switch (payload.type)`:
  - `email.bounced` | `email.complained` → insere `email_suppressions` (email do
    `payload.data.to[0]`) + `UPDATE clients SET unsubscribed=true WHERE email=...`.
  - `email.delivered` | `email.opened` | `email.clicked` → insere `email_events`
    (`messageId = payload.data.email_id`, `eventType`, `recipientEmail`).
- Sempre responde `200` rápido (Resend faz retry em erro).

### 6.2 `GET /api/cron/email-daily` (protegido por `CRON_SECRET`)
- Valida header `Authorization: Bearer ${process.env.CRON_SECRET}`; 401 se não bater
  (e se `CRON_SECRET` não estiver configurado, **recusa** — nunca correr sem proteção).
- Executa o motor descrito em **0.5** (automações `inactive_days` → enrollments due
  → envio em lotes → limpeza de `email_events` antigos).
- Loga resumo (`console.log`) para conferir em **Vercel → Logs**.

---

## 7. `vercel.json`

```jsonc
{
  // ...existente...
  "functions": {
    "api/index.ts": { "maxDuration": 60 }
  },
  "crons": [
    { "path": "/api/cron/email-daily", "schedule": "0 11 * * *" }
  ]
}
```

Nova env var: `CRON_SECRET` (string aleatória, gerar e colocar na Vercel — a própria
Vercel também aceita configurar automaticamente, mas é mais seguro definir manualmente
e validar no handler).

Webhook secrets: `RESEND_MKT_WEBHOOK_SECRET_1` (configurar no Resend → conta →
Webhooks → endpoint `https://lembretes.salvitarn.com.br/api/resend-webhook`, eventos:
`email.delivered`, `email.opened`, `email.clicked`, `email.bounced`, `email.complained`).

---

## 8. Frontend — `client/src/pages/EmailMarketing.tsx`

Adicionar abas (mantendo as 3 existentes):

```
Campanhas | Sequências | Automações | Templates | Tags | Descadastrados | Estatísticas
```

### 8.1 Aba **Sequências** (núcleo da Fase 2)
- Lista de sequências: nome, status (ativa/pausada), nº de inscritos ativos, nº de
  passos. Botão "Nova sequência".
- Tela da sequência:
  - Cabeçalho: nome, descrição, toggle ativo/inativo.
  - **Linha do tempo de passos**: cards "Dia 0", "Dia 3", "Dia 7"... cada um com
    assunto + preview do HTML + editar/excluir/reordenar. Botão "+ Adicionar passo".
  - Aba "Inscritos": tabela paginada (e-mail, nome, passo atual/total, próximo envio,
    status), com ações pausar/retomar/cancelar.
  - Botão "Inscrever leads manualmente" → modal igual ao de campanhas (segmento +
    preview de contagem, com filtro por **tags**).
  - Mini stats por passo (enviados / abertos / clicados).

### 8.2 Aba **Automações**
- Tabela de regras: nome, gatilho (texto legível, ex: "Lead criado", "Sem contato há
  30 dias"), ação (texto legível, ex: "Inscrever em 'Reativação 30 dias'"), ativo.
- Modal criar/editar: dropdown gatilho → campos condicionais (`days` para
  `inactive_days`); dropdown ação → campos condicionais (`sequenceId` via select de
  sequências existentes, ou `tag` via input).

### 8.3 Aba **Tags**
- Lista simples: tag, contagem de leads, botão "ver leads" (deep-link pra Tasks com
  filtro `?tag=`).

### 8.4 Aba **Estatísticas**
- Cards: enviados (30d), taxa de abertura, taxa de clique, taxa de descadastro, **cota
  Resend usada hoje (X/90 por conta)**.
- Tabela por campanha/sequência com as mesmas métricas.

### 8.5 Aba **Templates** (ajuste pequeno)
- Botão "Usar como passo de sequência" → abre modal "escolher sequência + delayDays"
  → chama `upsertSequenceStep` com o `subject`/`htmlBody` do template.

---

## 9. Frontend — `client/src/pages/Tasks.tsx`

a) **Campo de tags** no form de criar/editar tarefa: input tipo chips com
   autocomplete (`emailMarketing.listTags`). Envia `tags: string[]` no
   `tasks.create`/`tasks.update`.

b) **Filtro por tag** na barra de filtros existente (ao lado de status/atendente).

c) **Badge de engajamento** no card da tarefa: busca
   `emailMarketing.engagementByTaskIds` para as tasks visíveis (batch único) e mostra
   um selo pequeno, ex: `👁 3x` / `🔗 clicou` quando `opens > 0` ou `clicks > 0` —
   sinal visual de "lead quente, ligar primeiro".

d) **Ação "Inscrever em sequência"** no bloco de ações expandido (ao lado do já
   existente "➕ Campanha"): abre modal listando sequências ativas →
   `enrollTasksInSequence`. Disponível também na seleção em massa.

---

## 10. Sequências e automações iniciais sugeridas (conteúdo)

Reaproveitar os 8 templates já planejados na Fase 1, organizados em 3 sequências:

1. **"Boas-vindas Lead Novo"** (gatilho: `lead_created`)
   - Dia 0: Boas-vindas / apresentação Sal Vita
   - Dia 3: Diferenciais do produto (84+ minerais, artesanal Mossoró/RN)
   - Dia 7: Depoimentos / prova social
   - Dia 14: Tabela de preços / catálogo

2. **"Reativação Lead Frio"** (gatilho: `inactive_days`, `days=30`)
   - Dia 0: "Faz tempo que não conversamos" + reforço de benefícios
   - Dia 7: Campanha sazonal/promoção (se houver)
   - Dia 14: "Reengajamento final — ainda quer receber nossos contatos?"
     (quem não abrir nenhum dos 3 é candidato a limpeza manual da lista)

3. **"Pós-venda / Recompra"** (gatilho: `lead_converted`)
   - Dia 1: Como usar o produto / dicas de armazenamento
   - Dia 30: Cross-sell (outros produtos da linha)
   - Dia 45: "Hora de repor?" — lembrete de recompra

Regras de automação correspondentes (3 linhas em `automation_rules`, criadas via UI
depois que o código estiver pronto — não fazem parte do código, são dados).

---

## 11. Checklist de execução para o Sonnet (ordem)

- [ ] 1. Schema: 6 tabelas novas + `tasks.tags` + types em `server/db/schema.ts`.
- [ ] 2. `migrate.ts`: CREATE TABLEs + ALTER COLUMN + índices (incl. GIN em `tasks.tags`).
- [ ] 3. `server/email/marketing.ts`: `renderPlainText`, `verifyResendWebhook`,
      `computeNextSendAt`; incluir `text` alternativo no `sendBatch`.
- [ ] 4. `server/email/automations.ts` (novo): `runTriggerNow`, `enrollInSequence`,
      `addTagToTask`, `evaluateInactiveDaysRules`.
- [ ] 5. `server/routers/tasks.ts`: chamar `runTriggerNow('lead_created', ...)` após
      `create` e `runTriggerNow('lead_converted', ...)` em `toggleConverted` quando
      `converted=true`. Aceitar `tags` em `create`/`update`.
- [ ] 6. `server/routers/emailMarketing.ts`: todas as procedures da seção 5
      (sequências, passos, enrollments, automações, tags, stats, engagement).
      `buildAudience` ganha filtro `tags`.
- [ ] 7. `api/index.ts`: rota `POST /api/resend-webhook` (raw body, antes do
      `express.json()`) + rota `GET /api/cron/email-daily` (valida `CRON_SECRET`).
- [ ] 8. `vercel.json`: `functions.maxDuration=60` + `crons` (1 entrada, 1x/dia).
- [ ] 9. Frontend `EmailMarketing.tsx`: abas Sequências, Automações, Tags,
      Estatísticas (seção 8).
- [ ] 10. Frontend `Tasks.tsx`: campo/filtro de tags, badge de engajamento, ação
      "Inscrever em sequência" (seção 9).
- [ ] 11. `npx tsc --noEmit -p .` limpo.
- [ ] 12. Commit + push na branch designada.

**Validação antes do commit:**
- Conferir que nenhum arquivo do Premium foi tocado.
- `runTriggerNow`/automações **nunca** lançam exceção que quebre `tasks.create`/
  `toggleConverted` (try/catch silencioso + log).
- Cron sem `CRON_SECRET` configurado → recusa (não roda "aberto").
- Webhook sem assinatura válida → 401, não grava nada.
- Enrollment respeita `UNIQUE(sequence_id, email)` (sem duplicar inscrição).
- Stats/engajamento não fazem N+1 query por task (1 query batched).

---

## 12. Riscos & mitigações (planos free)

| Risco | Mitigação |
|-------|-----------|
| Cron 1x/dia (Vercel Hobby) não dá pra "tempo real" | Aceitável: nutrição por e-mail é assíncrona por natureza; lembretes manuais continuam imediatos |
| `maxDuration` 60s no cron | `LIMIT 300` enrollments por execução + early-exit se `pickAccount()` null; resto fica pro dia seguinte (`next_send_at` não muda) |
| Sequências competem com campanhas pela cota de 90/dia | Mostrar "cota usada hoje" em todas as telas de envio; cron roda de manhã (08h BRT), campanhas manuais geralmente disparadas à tarde — dar preferência ao cron rodar primeiro |
| `email_events` cresce sem limite (Neon 512MB) | Cron deleta eventos com +90 dias a cada execução; não gravar `delivered` para todo e-mail (opcional: só opened/clicked/bounced/complained) |
| Webhook do Resend sem validação = spam de inserts | Validação Svix obrigatória; sem secret configurado → 401 |
| Tag array (`tasks.tags`) sem índice = filtro lento em 1875 linhas | GIN index (`USING GIN`) — necessário para operador `&&` |
| Automação `inactive_days` reinscreve o mesmo lead todo dia | `UNIQUE(sequence_id, email)` + `ON CONFLICT DO NOTHING` torna idempotente |
| Cron sem proteção pode ser chamado por qualquer um e gastar a cota Resend | `CRON_SECRET` obrigatório no handler |
