# Plano de Implementação — Aba de E-mail Marketing (Lembretes CRM)

> **Escopo:** Este plano vale **SOMENTE para o Lembretes Vita CRM** (`lembretes.salvitarn.com.br`).
> **NÃO** mexer no projeto Sal Vita Premium / e-commerce (`server/email/resend.ts`, `siteOrders`,
> `abandonedCarts`, etc.) — aquele módulo é separado e tem seu próprio fluxo de e-mail transacional.
>
> **Para o modelo executor (Sonnet):** siga as fases na ordem. Cada fase é commitável
> e deixa o sistema funcionando (zero downtime). Não estourar cotas grátis (Neon 512MB,
> Vercel Hobby, Resend 100/dia por conta). Tudo via Drizzle ORM + tRPC — nunca SQL raw no
> app, nunca `fetch` direto pra rotas próprias. Commits em inglês.

---

## 0. Decisões de arquitetura (já tomadas — não re-debater)

### 0.1 Estratégia Resend multi-conta
- **NÃO** vincular conta Resend a atendente. Conta Resend = infraestrutura de envio, não identidade.
- Cada conta Resend verifica **um subdomínio próprio** do `salvitarn.com.br` para não colidir
  SPF/DKIM/Return-Path. Ex.: conta 1 → `news.salvitarn.com.br`, conta 2 → `news2.salvitarn.com.br`.
- **`From`** = subdomínio de marketing fixo (reputação estável).
- **`Reply-To`** = e-mail do atendente dono da tarefa/cliente (respostas caem na pessoa certa).
- **Seleção de conta = waterfall por cota**, nunca aleatório:
  enche conta 1 até `RESEND_MKT_DAILY_LIMIT` (~90), transborda pra conta 2, etc.
- Contador diário persistido no **banco** (não em memória — serverless reseta em cold start).
- API keys ficam em **env vars** (não no banco, por segurança), padrão N-agnóstico:
  `RESEND_MKT_API_KEY_1`, `RESEND_MKT_FROM_1`, ... `_2`, `_3`.

### 0.2 Público (audiência)
- Origem dos e-mails: **coluna `tasks.email`** (leads — onde está o volume real, ~1875 tarefas)
  **+** `clients.email` (clientes ativos), deduplicados, **menos** `email_suppressions`.
- Toda query de envio **DEVE** filtrar suprimidos (LGPD).

### 0.3 Motor de envio (limitação Vercel Hobby)
- Vercel Hobby: cron no máximo **1x/dia**. Não dá pra disparar campanha grande via cron frequente.
- **Solução dupla:**
  1. **Polling manual (MVP):** admin abre a campanha → front chama `emailMarketing.processBatch`
     em loop até esvaziar a fila. Cada chamada envia 1 lote (batch Resend até 100), respeitando
     cota por conta + rate-limit. Mostra progresso. (Aba precisa ficar aberta.)
  2. **Cron diário (Fase 3):** `vercel.json` cron 1x/dia drena pendências automaticamente.
- Resend **Batch API** (`POST /emails/batch`) aceita até 100 e-mails **personalizados distintos**
  por request (cada um com seu `to`/`subject`/`html`/`reply_to`). Respeitar ~2 req/s.

---

## 1. FASE 1 — MVP (schema + envio manual + página básica)

### 1.1 Schema — `server/db/schema.ts`

Adicionar ao **final** do arquivo (antes dos `export type` finais, seguindo o padrão existente):

```typescript
// ── E-mail Marketing (Lembretes CRM) ──────────────────────────────────────────

export const emailTemplates = pgTable('email_templates', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),       // pode conter {nome}, {empresa}
  htmlBody: text('html_body').notNull(),     // pode conter {nome}, {empresa}, {unsubscribe}
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailCampaigns = pgTable('email_campaigns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  htmlBody: text('html_body').notNull(),
  status: text('status').notNull().default('draft'), // draft|sending|paused|sent
  totalRecipients: integer('total_recipients').default(0).notNull(),
  sentCount: integer('sent_count').default(0).notNull(),
  failedCount: integer('failed_count').default(0).notNull(),
  createdByUserId: integer('created_by_user_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const emailCampaignRecipients = pgTable('email_campaign_recipients', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').notNull(),
  email: text('email').notNull(),
  name: text('name'),
  replyTo: text('reply_to'),                 // e-mail do atendente dono
  taskId: integer('task_id'),                // origem (nullable)
  status: text('status').notNull().default('pending'), // pending|sent|failed|skipped
  accountKey: text('account_key'),           // qual conta Resend enviou
  messageId: text('message_id'),             // id retornado pelo Resend
  unsubToken: text('unsub_token').notNull(), // token único p/ descadastro
  error: text('error'),
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const emailSuppressions = pgTable('email_suppressions', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  reason: text('reason').notNull().default('unsubscribe'), // unsubscribe|bounce|complaint|manual
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const emailSendCounters = pgTable('email_send_counters', {
  id: serial('id').primaryKey(),
  accountKey: text('account_key').notNull(),
  day: text('day').notNull(),                // 'YYYY-MM-DD' UTC
  sent: integer('sent').default(0).notNull(),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type EmailCampaign = typeof emailCampaigns.$inferSelect;
export type EmailCampaignRecipient = typeof emailCampaignRecipients.$inferSelect;
```

Adicionar coluna estruturada em `tasks` (na definição da tabela `tasks`, depois de `orderId`):

```typescript
  email: text('email'),   // e-mail estruturado do lead (extraído de notes no backfill)
```

Adicionar em `clients`:

```typescript
  unsubscribed: boolean('unsubscribed').default(false).notNull(),
```

### 1.2 Migração — `server/db/migrate.ts`

Na seção "Incremental migrations (always run, idempotent)" adicionar:

```sql
-- E-mail estruturado em tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS unsubscribed BOOLEAN NOT NULL DEFAULT false;

-- Backfill: extrai 1º e-mail das notas das tarefas que ainda não têm email
UPDATE tasks
SET email = lower(substring(notes from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'))
WHERE email IS NULL
  AND notes ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
```

E adicionar os `CREATE TABLE IF NOT EXISTS` para as 5 tabelas novas (`email_templates`,
`email_campaigns`, `email_campaign_recipients`, `email_suppressions`, `email_send_counters`),
espelhando exatamente os tipos do schema acima. Índices:

```sql
CREATE INDEX IF NOT EXISTS email_recipients_campaign_idx ON email_campaign_recipients(campaign_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS email_counter_key_day_idx ON email_send_counters(account_key, day);
CREATE INDEX IF NOT EXISTS tasks_email_idx ON tasks(email);
```

> **Importante:** o backfill `UPDATE` roda toda vez (idempotente — só pega `email IS NULL`).
> Em 1875 linhas é barato. Não vai estourar transfer do Neon.

### 1.3 Módulo de envio — `server/email/marketing.ts` (NOVO arquivo)

Separado do `resend.ts` do Premium. Responsabilidades:
- `getAccounts()`: lê env vars `RESEND_MKT_API_KEY_N` / `RESEND_MKT_FROM_N` (N=1..) → array de contas.
- `pickAccount()`: waterfall — primeira conta cujo contador do dia (`email_send_counters`) < limite.
  Se todas estouraram → retorna `null` (campanha fica pendente até amanhã ou outra conta).
- `incrementCounter(accountKey, n)`: UPSERT atômico em `email_send_counters`
  (`INSERT ... ON CONFLICT (account_key, day) DO UPDATE SET sent = sent + n`).
- `sendBatch(account, messages[])`: chama `POST https://api.resend.com/emails/batch`
  com `Authorization: Bearer <key>`, body = array `{ from, to, subject, html, reply_to, headers }`.
  Inclui header `List-Unsubscribe: <https://lembretes.salvitarn.com.br/api/unsubscribe?t=TOKEN>`
  e `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- Timeout 8s com AbortController (igual `resend.ts`). Nunca lança — retorna `{ok, ...}`.
- `layout()` / footer: reutilizar visual do `resend.ts` (cor `#0C3680`, "Sal Vita"),
  **mas o footer DEVE ter link real de descadastro** `{unsubscribe}` (LGPD), não "envie PARAR no WhatsApp".

Limite por conta: `const MKT_DAILY_LIMIT = parseInt(process.env.RESEND_MKT_DAILY_LIMIT ?? '90')`.

### 1.4 Router — `server/routers/emailMarketing.ts` (NOVO)

Todas as procedures **adminProcedure** (só admin gerencia marketing), exceto `unsubscribe` (público).

```
emailMarketing = router({
  // ── Templates ──
  listTemplates: adminProcedure.query(...)            // todos
  upsertTemplate: adminProcedure.input({id?, slug, name, subject, htmlBody, active}).mutation(...)
  deleteTemplate: adminProcedure.input({id}).mutation(...)

  // ── Audiência / segmentação ──
  audiencePreview: adminProcedure.input({              // conta destinatários de um segmento
    source: enum['leads','clients','both'],
    onlyConverted?: bool, onlyNotConverted?: bool,
    assignedTo?: string,                               // filtra por atendente
    search?: string,
  }).query(...)  // retorna { count, sample: first 20 }
  // SEMPRE: distinct email, NOT NULL, NOT IN (suppressions), clients.unsubscribed = false

  // ── Campanhas ──
  listCampaigns: adminProcedure.query(...)
  createCampaign: adminProcedure.input({name, subject, htmlBody, templateId?}).mutation(...)
  // materializa destinatários: roda a query da audiência, dedup, gera unsubToken (crypto.randomUUID)
  // por destinatário, insere em email_campaign_recipients (status='pending'),
  // seta reply_to = email do atendente (via assignedTo→sellers.email), atualiza totalRecipients.
  addRecipientsFromTasks: adminProcedure.input({campaignId, taskIds:number[]}).mutation(...)
  // <<< usado pela tela de Tarefas: pega email das tasks, dedup contra já existentes, insere.

  getCampaign: adminProcedure.input({id}).query(...)   // campanha + stats agregadas
  deleteCampaign: adminProcedure.input({id}).mutation(...)

  // ── Motor de envio (polling) ──
  processBatch: adminProcedure.input({campaignId}).mutation(...)
  // 1. pickAccount() — se null: retorna {done:false, reason:'daily_limit_all'}
  // 2. pega até min(100, limiteRestanteDaConta) recipients status='pending' da campanha
  // 3. se 0 pendentes: marca campanha status='sent', retorna {done:true}
  // 4. monta mensagens (personaliza {nome}/{empresa}/{unsubscribe}), sendBatch()
  // 5. atualiza cada recipient (sent/failed + messageId), incrementCounter, atualiza campaign counts
  // 6. retorna {done:false, sentNow, remaining, account}
  // Front chama em loop com pequeno delay (respeita rate-limit) até done:true.

  // ── Suprimidos / unsubscribe ──
  listSuppressions: adminProcedure.query(...)
  addSuppression: adminProcedure.input({email, reason?}).mutation(...)
  unsubscribe: publicProcedure.input({token}).mutation(...) // ver 1.6
})
```

Registrar em `server/routers/index.ts`: `emailMarketing: emailMarketingRouter`.

> **Atenção rate-limit/timeout Vercel:** cada `processBatch` faz **1** batch (≤100) e retorna.
> Não fazer loop server-side (estoura 10s da function). O loop é no **front**.

### 1.5 Endpoint público de unsubscribe — `api/index.ts`

Como precisa ser link clicável (GET) e idealmente sem auth, adicionar rota Express **antes** do
handler tRPC, ou usar `publicProcedure`. Recomendado: rota GET dedicada que renderiza HTML simples:

```
GET /api/unsubscribe?t=<token>
→ busca recipient por unsubToken → INSERT email em email_suppressions (ON CONFLICT DO NOTHING)
→ se houver client com esse email: UPDATE clients SET unsubscribed=true
→ responde HTML "Você foi descadastrado. ✅" (página simples, marca Sal Vita)
```

(POST one-click do `List-Unsubscribe-Post` aponta pra mesma rota aceitando POST.)

### 1.6 Frontend — página `client/src/pages/EmailMarketing.tsx` (NOVO)

Rota em `App.tsx` (admin): `<Route path="/admin/email-marketing"><AppShell><EmailMarketing /></AppShell></Route>`.
Adicionar no menu/sidebar (`AppShell.tsx`) item admin "📧 E-mail Marketing".

Abas internas (tabs):
1. **Campanhas** — lista (nome, status, enviados/total, data). Botão "Nova campanha".
   - Modal nova campanha: nome, assunto, corpo (textarea HTML ou escolher template),
     **segmento** (origem leads/clientes/ambos, filtro por atendente, só não-convertidos etc.)
     com **preview de contagem** ao vivo (`audiencePreview`).
   - Tela da campanha: stats + botão **"▶ Enviar agora"** que dispara o loop de `processBatch`
     mostrando barra de progresso (`sentNow`/`total`), respeitando `done`. Botão "Pausar".
2. **Templates** — CRUD de `emailTemplates` com preview (render do `htmlBody`).
3. **Descadastrados** — lista `email_suppressions` + adicionar manual.

Tudo via `trpc.emailMarketing.*`. Sem `fetch` direto.

### 1.7 Integração na tela de Tarefas — `client/src/pages/Tasks.tsx`

> Aqui mora o pedido "aplicar/incluir em campanhas direto na tarefa sem sair da tela".

a) **Campo e-mail no form de criar/editar tarefa:** adicionar input `email` (já existe `notes`;
   adicionar campo dedicado). Passar `email` no input do `tasks.create`/`tasks.update`
   (adicionar `email: z.string().email().optional().or(z.literal(''))` nos schemas do router).
   Na exibição, preferir `task.email` e cair pra `extractEmail(notes)` como fallback.

b) **Ação por tarefa:** no bloco de ações expandido (onde já tem WhatsApp/E-mail/Lembrete),
   adicionar botão **"➕ Campanha"** → abre modal que lista campanhas em `draft` →
   chama `emailMarketing.addRecipientsFromTasks({campaignId, taskIds:[task.id]})`.

c) **Seleção em massa:** já existe "Selecionar tudo (1875)". Quando houver seleção,
   mostrar botão **"➕ Adicionar N à campanha"** no topo → mesmo modal → envia todos os `taskIds`
   selecionados. (Backend dedup + ignora sem e-mail + ignora suprimidos.)

### 1.8 Env vars novas (Vercel + `.env` local) — **o usuário cadastra, não o código**

| Variável | Exemplo | Notas |
|----------|---------|-------|
| `RESEND_MKT_API_KEY_1` | `re_xxx` | conta 1 |
| `RESEND_MKT_FROM_1` | `Sal Vita <contato@news.salvitarn.com.br>` | subdomínio verificado conta 1 |
| `RESEND_MKT_API_KEY_2` | `re_yyy` | conta 2 (opcional) |
| `RESEND_MKT_FROM_2` | `Sal Vita <contato@news2.salvitarn.com.br>` | subdomínio verificado conta 2 |
| `RESEND_MKT_DAILY_LIMIT` | `90` | margem sob o cap de 100 |

> Código deve **degradar com elegância**: se nenhuma `RESEND_MKT_API_KEY_*` existir,
> a página funciona (criar campanhas/templates) mas "Enviar" retorna aviso "sem conta configurada".

---

## 2. FASE 2 — Personalização, eventos e qualidade

- **Webhooks Resend** (`POST /api/resend-webhook`): registrar rota com **raw body** (antes do
  `express.json()`), validar assinatura **Svix** (`svix-id`/`svix-timestamp`/`svix-signature`).
  Eventos `email.bounced`/`email.complained` → auto-`email_suppressions`.
  `email.opened`/`email.clicked` → opcional tabela `email_events` p/ métricas.
  (Cada conta Resend tem seu `RESEND_MKT_WEBHOOK_SECRET_N`.)
- **Métricas na campanha:** taxa de entrega/abertura/clique/descadastro a partir de `email_events`.
- **Variáveis no template:** `{nome}`, `{empresa}`, `{cidade}` extraídos do lead/cliente.
- **Texto alternativo (plain-text):** gerar versão texto junto do HTML (melhora entregabilidade).
- **Agendamento simples:** campo `scheduledAt` + cron diário começa a drenar nessa data.

## 3. FASE 3 — Automação e retenção

- **Cron diário** (`vercel.json`, 1x/dia) que drena campanhas pendentes sem aba aberta.
- **Automações por gatilho** (reaproveita padrão `automationRuns` do Premium, mas tabela própria):
  - Lead sem conversão há X dias → e-mail de reativação.
  - Cliente convertido há ~45 dias → e-mail de recompra (cross-sell).
- **Warm-up de domínio:** começar com volume baixo (ex. 30/dia) e subir gradualmente.
- **DMARC**: além de SPF/DKIM, publicar registro DMARC `p=none` → depois `quarantine`.

---

## 4. Templates iniciais sugeridos (B2B sal marinho)

1. **Boas-vindas / apresentação** — para lead novo que ainda não respondeu.
2. **Reativação de lead frio** — "faz tempo que não conversamos".
3. **Tabela de preços / catálogo** — envio sob demanda.
4. **Recompra (cliente ativo)** — lembrete pós-venda (~45 dias).
5. **Cross-sell** — outros produtos da linha.
6. **Campanha sazonal/promoção** — datas comerciais.
7. **Pesquisa de satisfação** — pós-conversão.
8. **Reengajamento final** — "ainda quer receber nossos contatos?" (limpa lista inativa).

---

## 5. Checklist de execução para o Sonnet (ordem)

**Fase 1 (MVP):**
- [ ] 1. Schema: 5 tabelas novas + `tasks.email` + `clients.unsubscribed` + types.
- [ ] 2. `migrate.ts`: CREATE TABLEs + ALTER COLUMNs + backfill regex + índices.
- [ ] 3. `server/email/marketing.ts`: contas, waterfall, contador DB, `sendBatch`, layout c/ unsubscribe.
- [ ] 4. `server/routers/emailMarketing.ts` + registrar em `routers/index.ts`.
- [ ] 5. Rota pública `/api/unsubscribe` em `api/index.ts`.
- [ ] 6. `tasks.create`/`tasks.update`: aceitar `email`.
- [ ] 7. `EmailMarketing.tsx` + rota em `App.tsx` + item no `AppShell.tsx`.
- [ ] 8. Integração `Tasks.tsx`: campo e-mail + botão "➕ Campanha" (linha + seleção em massa).
- [ ] 9. `npx tsc --noEmit -p .` limpo.
- [ ] 10. Commit + push na branch designada.

**Validação antes do commit:**
- `npx tsc --noEmit -p .` sem erros novos.
- Conferir que NENHUM arquivo do Premium foi tocado (`server/email/resend.ts`, `siteOrders`, etc.).
- Conferir filtro de suprimidos em TODA query de audiência/envio.
- Conferir que `processBatch` envia 1 lote e retorna (sem loop server-side).

---

## 6. Riscos & mitigações

| Risco | Mitigação |
|-------|-----------|
| Entregabilidade (cair em spam) | From fixo por subdomínio, SPF+DKIM+DMARC, warm-up, plain-text alt |
| Estourar 100/dia Resend | Contador DB por conta + waterfall + limite 90 com margem |
| Cold start zera contador | Contador no **banco**, não em memória |
| Vercel function timeout (10s) | 1 batch por `processBatch`, loop no front |
| LGPD | Suppressions + unsubscribe 1-clique + List-Unsubscribe header + footer com identidade |
| Neon transfer/storage | Backfill só em `email IS NULL`; sem armazenar corpo de e-mail por destinatário |
| Aba fechada interrompe envio | Fase 3 adiciona cron diário pra drenar pendências |
