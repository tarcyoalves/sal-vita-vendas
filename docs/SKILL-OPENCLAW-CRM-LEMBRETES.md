---
name: crm-lembretes-salvita
description: >
  Conhecimento operacional COMPLETO do sistema "Sal Vita Lembretes" — o CRM de
  gestão de vendas/atendimento + a plataforma de E-mail Marketing. Use esta skill
  sempre que precisar entender, editar, depurar, fazer deploy ou operar QUALQUER
  parte do CRM de Lembretes e do E-mail Marketing (tarefas, lembretes, atendentes,
  clientes, chat/análise de IA, base de conhecimento, sessões de trabalho, campanhas,
  sequências, automações, contatos de marketing, cotas de Resend/Brevo/Neon/Vercel/
  Groq/Cerebras/Gemini). Escrita para o OpenClaw operar o sistema de forma autônoma
  quando o Claude estiver indisponível (fim de créditos, etc.).
license: Proprietary — uso interno Sal Vita.
---

# Sal Vita Lembretes — Manual Operacional Completo (CRM + E-mail Marketing)

> **Para o agente (OpenClaw):** este documento é o seu **mapa**, não uma cópia do
> código. Ele te diz **onde** está cada coisa e **como** operar o sistema — mas a
> fonte da verdade é sempre o arquivo real no repositório. Leia a Seção 00
> (Protocolo de Precisão) e a Seção "Regras de ouro" antes de tocar em qualquer coisa.

---

## 00. PROTOCOLO DE PRECISÃO — OBRIGATÓRIO (leia antes de tudo)

> Esta seção existe porque uma análise anterior foi gerada **só a partir desta
> documentação, sem abrir o código** — e saiu cheia de erros (afirmou que features
> existentes não existiam, inventou números, sugeriu integração de outro produto).
> **Não repita isso.**

### Regra nº 1 — NUNCA afirme sem ler o código
Antes de dizer "isto existe", "isto falta", "isto está quebrado" ou "isto funciona
assim", **abra o arquivo real e confirme na linha**. Documentação (inclusive esta)
pode estar desatualizada — o código muda **várias vezes por dia** (histórico real:
~5 commits/dia). Só o arquivo no repositório é verdade.

### Regra nº 2 — Sem leitura = é chute, e deve ser rotulado
Se você não abriu o código, **não chame de "análise" nem de "auditoria"**. Chame de
"hipótese a verificar" e diga explicitamente: *"não li o arquivo X, isto é suposição."*
Brainstorm é válido — mas rotulado como brainstorm, nunca vendido como fato.

### Regra nº 3 — Nada de números inventados
Não escreva "+25-40% de conversão", "score > 70", "3x mais" **a menos que venham de
um cálculo real sobre dados reais**. Métrica sem fonte = remova ou marque como
"estimativa sem base, chute".

### Regra nº 4 — Respeite o escopo (Seção 0)
Nunca proponha integrar WhatsApp, Telegram, Mercado Pago, Melhor Envio ou qualquer
coisa do produto **premium** no CRM. Se não existe no CRM, não invente que existe.

### Regra nº 5 — "Saber cada linha" = LER cada linha, sob demanda
Você **não** decora as 43.000 linhas do projeto (é impossível e apodrece rápido).
Você atinge "saber tudo" assim, toda vez que precisar:

```bash
# 1. Tenha o repo local atualizado (clone na 1ª vez, depois só puxe)
git clone https://github.com/tarcyoalves/sal-vita-vendas   # 1ª vez
cd sal-vita-vendas
git checkout main && git pull origin main                  # SEMPRE antes de analisar

# 2. Leia o(s) arquivo(s) exatos da pergunta (use o Mapa da Seção 000).
#    Ex.: pergunta sobre a tela de e-mail marketing:
sed -n '1,120p' client/src/pages/EmailMarketing.tsx        # ou abra inteiro
grep -n "overviewStats\|StatsTab\|Funil" client/src/pages/EmailMarketing.tsx

# 3. Confirme o backend correspondente:
grep -n "overviewStats:" server/routers/emailMarketing.ts
```

### Regra nº 6 — PROIBIDO citar "conforme documento" no lugar de `arquivo:linha`

> Motivo desta regra: mesmo depois de ler o código real numa análise (achou
> `StatsTab`, `FunnelStage`, `overviewStats` corretamente), uma análise **seguinte**,
> no mesmo dia, voltou a citar "conforme documentado", "seu sistema (conforme
> documento)" e comparou contra um doc antigo (`analise-email-marketing-vendas.md`)
> em vez do repositório. Resultado: inventou nomes de tabela que não existem
> (`email_automations` — o real é `automation_rules`; `leads` — o real é `tasks`) e
> repetiu percentuais fantasiados (`+18-25%`, `+50-80%`) depois de já ter lido a
> Regra nº 3 proibindo isso. Ler o código uma vez não imuniza a resposta seguinte.

**A partir de agora, para QUALQUER afirmação sobre o que o sistema tem, faz, ou não
tem:**

1. **Toda frase que descreve o sistema atual carrega uma citação `arquivo:linha`.**
   Sem exceção — mesmo em comparação com produto de terceiro (Mautic, HubSpot, etc.),
   mesmo em resposta rápida, mesmo repetindo algo já dito antes na conversa.
   - ❌ "Seu sistema não tem decay de score (conforme documento)."
   - ❌ "Sua tabela de automações (`email_automations`) só suporta regras simples."
   - ✅ "`hotLead` é `boolean` sem campo de decay (`server/db/schema.ts:89`); a tabela
     real de automação é `automation_rules` (`server/db/schema.ts:440`), com 6
     `triggerType` (`server/routers/emailMarketing.ts:937`): não há decay hoje."
2. **Nunca use um relatório/análise anterior (seu ou de outra sessão) como fonte da
   verdade sobre "o que o sistema tem".** Um doc de análise é uma **conclusão
   passada**, não o código. Ele pode estar errado (o `analise-email-marketing-vendas.md`
   original **estava** errado). Toda vez, releia o arquivo de origem — nunca cite o
   resumo de você mesmo como se fosse a fonte primária.
   - Exceção: **esta skill** (`SKILL-OPENCLAW-CRM-LEMBRETES.md`) pode ser citada como
     mapa/atalho — mas só para "onde procurar", nunca como prova de "o que existe".
     Prova sempre vem do arquivo de código, com linha.
3. **Antes de escrever qualquer nome técnico** (tabela, coluna, função, procedure,
   variável de ambiente), confirme com `grep -n "<nome>" server/db/schema.ts` (ou
   arquivo relevante). Se o grep não achar, **o nome está errado — não escreva-o**.
   Rodar o grep custa segundos; escrever um nome inventado destrói a confiança na
   resposta inteira.
4. **Releitura obrigatória mesmo dentro da mesma conversa/dia.** Ter lido
   `EmailMarketing.tsx` há 10 minutos não dispensa reler ao comparar com Mautic,
   escrever specs, ou responder pergunta nova — cada afirmação nova precisa da sua
   própria confirmação, porque cada resposta pode reintroduzir um erro mesmo que a
   resposta anterior tenha acertado.
5. **Se depois de tudo isso alguma afirmação ainda não puder ser confirmada por
   arquivo:linha** (ex.: comparação de mercado, tendência do setor, número de
   impacto), **rotule explicitamente como tal**: *"[não verificável no código —
   conhecimento geral de mercado]"* ou *"[estimativa sem base — não é um cálculo
   real]"*. Nunca deixe implícito que é fato do sistema quando não é.

**Checklist de auto-verificação antes de enviar qualquer análise/comparação:**
- [ ] Toda tabela/coluna/função citada foi confirmada com `grep` nesta sessão?
- [ ] Toda frase "o sistema tem/não tem X" tem `arquivo:linha` ao lado?
- [ ] Nenhuma frase se apoia em "conforme documento", "conforme análise anterior",
      ou em resumo próprio de sessão passada?
- [ ] Todo percentual/número de impacto vem de cálculo real, ou está rotulado como
      chute/estimativa?
- [ ] Nada do produto premium (WhatsApp, Mercado Pago, Melhor Envio) foi sugerido?

Se qualquer item falhar, **não envie a análise ainda** — volte, leia o arquivo,
corrija a frase ou rotule como chute.

Fluxo mental fixo para QUALQUER pedido:
**(a)** `git pull` → **(b)** localizar arquivo no Mapa (Seção 000) → **(c)** LER o
arquivo → **(d)** só então responder, citando `arquivo:linha`.

---

## 000. MAPA DE ARQUIVOS DO CRM (onde ler cada coisa)

Use este mapa para saber **qual arquivo abrir** antes de responder. Tamanhos são
aproximados (mudam) — servem para você dimensionar a leitura. **Arquivos do premium
não estão aqui de propósito** (fora de escopo).

**Backend — routers (`server/routers/`):**
| Arquivo | ~linhas | Responsável por |
|---|---|---|
| `emailMarketing.ts` | ~2100 | TODA a API de e-mail mkt: campanhas, sequências, automações, templates, contatos, supressões, **estatísticas** (`overviewStats`, `usageStats`, `contactStats`) |
| `ai.ts` | ~1330 | Chat IA, análise de atendentes, sugestões, cadeia de fallback, tools |
| `tasks.ts` | ~510 | CRUD de tarefas/leads, conversão, fraude, confirmação de e-mail |
| `workSessions.ts` | ~260 | Ponto/jornada dos atendentes |
| `sellers.ts` | ~210 | Atendentes, papéis, restrição de IP, assinatura |
| `tv.ts` | ~180 | Painel de TV (KPIs, ranking) |
| `auth.ts` | ~220 | Login, senha, reset |
| `tags.ts` ~70 · `reminders.ts` ~50 · `knowledge.ts` ~42 · `clients.ts` ~32 · `index.ts` ~31 | — | menores |

**Backend — e-mail (`server/email/`):**
| Arquivo | ~linhas | Responsável por |
|---|---|---|
| `marketing.ts` | ~835 | Motor multi-conta (Resend waterfall + Brevo), contadores de cota, webhooks, batch |
| `automations.ts` | ~636 | Sequências (`processSequenceEnrollments`), automações inactive_days, **engajamento/lead scoring** (`flagEngagementByMessageId`) |
| `resend.ts` | ~308 | E-mail transacional (recuperação de senha) |

**Backend — núcleo (`server/`):**
| Arquivo | ~linhas | Responsável por |
|---|---|---|
| `db/schema.ts` | ~488 | **Fonte da verdade das tabelas** (Drizzle) |
| `db/migrate.ts` | ~556 | Migrações idempotentes + `SCHEMA_VERSION` |
| `db/index.ts` | ~6 | Conexão Neon do CRM (`DATABASE_URL`) |
| `trpc.ts` | ~95 | Contexto/auth + restrição de IP |
| `auth.ts` | ~69 | Hash de senha (PBKDF2), JWT, cookie |
| `lib/cache.ts` | ~47 | Cache em memória (TTL) |

**Entry point produção:** `api/index.ts` (~1010 linhas) — middleware, webhooks de
e-mail (`/api/resend-webhook`, `/api/brevo-webhook`), cron `/api/cron/email-daily`.

**Frontend — páginas CRM (`client/src/pages/`):**
| Arquivo | ~linhas | Tela |
|---|---|---|
| `EmailMarketing.tsx` | ~5250 | **Aba de e-mail marketing inteira** (Campanhas, Sequências, Automações, Templates, Tags, Contatos, Uso, Estatísticas) |
| `Tasks.tsx` | ~1720 | Tarefas/lembretes do atendente |
| `AdminDashboard.tsx` | ~1180 | Dashboard admin |
| `Attendants.tsx` | ~906 | Gestão de atendentes + restrição de IP |
| `TvDashboard.tsx` | ~513 | Painel de TV |
| `AiSettings.tsx` ~440 · `AttendantProgress.tsx` ~327 · `Representatives.tsx` ~320 · `Home.tsx` ~320 · `CallHistory.tsx` ~218 · `ClientsManagement.tsx` ~212 · `KnowledgeBase.tsx` ~202 · `AiChat.tsx` ~144 · `VendorReminders.tsx` ~102 · `AiAnalysis.tsx` ~17 | — | demais |

> Nota: `EmailMarketing.tsx` tem ~5250 linhas. Para responder sobre uma sub-aba
> específica, use `grep -n` para achar o componente (ex.: `StatsTab`, `CampaignsTab`)
> e leia só aquele trecho — não precisa ler o arquivo todo de uma vez.

---

## 0001. INVENTÁRIO VERIFICADO — o que JÁ EXISTE na aba de e-mail marketing

> Confirmado lendo o código em 2026-07 (`EmailMarketing.tsx`, `emailMarketing.ts`,
> `automations.ts`). **Sempre reconfirme com `git pull` + leitura** — pode ter mudado.
> Serve para você **não re-alucinar** que features existentes "faltam".

- **Abas existentes** (`EmailMarketing.tsx`, `<TabsTrigger>`): Campanhas, Sequências,
  Automações, Templates, Tags, Contatos, **Uso (cotas)**, **Estatísticas**.
- **Funil de engajamento JÁ é visual** — componente `StatsTab` consome
  `emailMarketing.overviewStats`; desenha barras enviado → entregue → abriu → clicou
  + taxas (deliveryRate/openRate/clickRate) + descadastro. **⚠️ Para no "clicou": NÃO
  inclui conversão em venda nem receita** (gap real). Barras em CSS, **sem Recharts**
  (sem série temporal).
- **Teste A/B de assunto JÁ tem UI** (switch + campo assunto B em `EmailMarketing.tsx`),
  mas está **marcado "Em breve"** e **não há backend** (nenhum campo `ab_test`/`subject_b`
  no schema). Ou seja: existe como stub, não funciona.
- **No clique o lead JÁ é escalado** (`flagEngagementByMessageId`, `automations.ts`):
  seta `hotLead=true`, `priority='high'`, puxa `reminderDate` para agora, adiciona tag
  `🔥 quente`. **Não é "o sistema não faz nada".**
- **`hotLead` é BOOLEAN** (`schema.ts`), não um score numérico. Não existe
  `hotLeadScore`.
- **`email_events` NÃO guarda a URL do clique** (só `message_id`, `recipient_email`,
  `event_type`). Logo, hoje é impossível pontuar clique por tipo de link
  (proposta vs rodapé) sem antes capturar a URL do payload do webhook.
- **Atribuição campanha→venda é POSSÍVEL mas não há tela**: `emailCampaignRecipients`
  tem `taskId`; `tasks` tem `convertedAt` e `orderValue`. Dá para cruzar, mas nenhum
  dashboard mostra receita por campanha ainda.

### Gaps reais (confirmados, não chute) — candidatos a melhoria
1. Funil não chega em conversão/receita (dado existe: `tasks.convertedAt/orderValue`).
2. Sem série temporal (Recharts já é usado noutra tela do projeto — dá para reusar).
3. `hotLead` binário — sem score ponderado para priorizar entre muitos "quentes".
4. Clique sem URL — bloqueia regras por tipo de link.
5. Sem visão de performance de e-mail por atendente.
6. A/B parado no stub.

---

## 0. ESCOPO — leia primeiro (CRÍTICO)

Esta skill cobre **UM único produto**: o **CRM de Lembretes + E-mail Marketing**.

O repositório `sal-vita-vendas` contém **dois produtos separados** que compartilham
código mas **NUNCA devem ser misturados**:

| Produto | O que é | Domínio | Banco Neon | Está no escopo? |
|---------|---------|---------|-----------|-----------------|
| **CRM Lembretes + E-mail Marketing** | Gestão interna: atendentes, tarefas, lembretes, clientes, IA, campanhas de e-mail | `lembretes.salvitarn.com.br` | **LEMBRETES VITA** (`DATABASE_URL`) | ✅ **SIM — só isto** |
| **Premium (e-commerce de sal integral)** | Loja: pedidos, pagamento PIX/cartão, frete, carrinho abandonado, WhatsApp | `premium.salvitarn.com.br` | banco separado (`ORDERS_DATABASE_URL`) | ❌ **NÃO — nunca toque** |

### ⛔ Fora do escopo — NÃO edite, NÃO leia para tarefas do CRM, NÃO misture:
- Banco `ORDERS_DATABASE_URL` / `server/db/ordersDb.ts` (e-commerce).
- Tabelas de e-commerce: `site_orders`, `abandoned_carts`, `automation_runs`,
  `coupons`, `msg_templates`.
- Routers `server/routers/shipping.ts` e `server/routers/recovery.ts`.
- Integrações do premium: **Mercado Pago** (`MERCADO_PAGO_*`), **Melhor Envio**
  (`MELHOR_ENVIO_*`), **WhatsApp/Evolution** (`WA_*`), **Facebook Pixel/CAPI** (`FB_*`).
- Páginas do premium: `SalVitaLanding.tsx`, `SalVitaAdmin.tsx`, `SalVitaRecovery.tsx`,
  `Orders.tsx`, `TrackOrder.tsx`, `Faturamento.tsx` (faturamento é do premium).
- Host `premium.salvitarn.com.br` / rotas `/sal-vita`, `/meu-pedido`, `/api/mp-webhook`.

Se uma tarefa parecer exigir tocar nesses itens, **pare e confirme com o usuário** —
provavelmente é o produto errado.

---

## 1. Regras de ouro (guardrails)

1. **Deploy = `git push origin main`.** A Vercel faz deploy automático (~1-2 min).
   **Nunca** faça force-push em `main`.
2. **Commits em inglês**, mensagens descritivas (Conventional Commits: `feat:`,
   `fix:`, `chore:`, `docs:`).
3. **Roteamento no frontend:** use `import { useLocation } from 'wouter'`. **Nunca**
   `react-router-dom` (está nas deps por legado do premium, mas o CRM usa Wouter).
4. **Chamadas de API:** sempre via **tRPC** (`trpc.[router].[procedure]`). Nunca
   `fetch` direto para rotas próprias.
5. **Banco:** sempre **Drizzle ORM**. Nunca SQL cru no código de produção (exceção:
   `server/db/migrate.ts`, que usa SQL idempotente proposital).
6. **Senhas:** PBKDF2-HMAC-SHA512, **310.000 iterações** (`server/auth.ts`). Não altere.
7. **Entry point do backend em produção:** `api/index.ts` (bundlado → `api/bundle.js`).
   **Não** é `server/index.ts` (esse é só para dev local).
8. **Variáveis do frontend:** só as com prefixo `VITE_` chegam ao cliente.
9. **Antes de qualquer deploy:** rode a verificação (seção 15). Nunca faça push com
   TypeScript quebrado.
10. **Nunca** exponha segredos (chaves, tokens) em commits, logs ou no cliente.

---

## 2. Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Roteamento | **Wouter** |
| API | **tRPC v11** + TanStack Query + superjson |
| Estilo | Tailwind CSS + shadcn/ui (Radix) |
| Backend | Express.js serverless (Vercel Functions) |
| Banco | **Neon PostgreSQL** (serverless HTTP driver) + **Drizzle ORM** |
| Auth | JWT em cookie HttpOnly (`sal-vita-session`, 7 dias) |
| IA | Groq → Cerebras → Gemini (fallback em cadeia) |
| E-mail | Resend (cascata multi-conta) + Brevo (overflow) |
| PWA | vite-plugin-pwa |

Node target: **node20**. Build backend: **esbuild** (bundle único `api/bundle.js`).

---

## 3. Estrutura de pastas (só o relevante ao CRM)

```
/
├── api/index.ts              ← ENTRY POINT produção (Express) → bundlado em api/bundle.js
│                                Contém: middleware, webhooks de e-mail, CRON email-daily
├── client/src/
│   ├── App.tsx               ← Rotas wouter + detecção de host
│   ├── _core/hooks/          ← useAuth, useReminderNotifications
│   ├── lib/trpc.ts           ← Cliente tRPC
│   ├── components/
│   │   ├── AppShell.tsx      ← Layout (sidebar + header mobile + bottom nav)
│   │   └── ui/               ← shadcn/ui (não editar diretamente)
│   └── pages/                ← Uma página por rota (lista na seção 13)
├── server/
│   ├── auth.ts               ← hashPassword, verifyPassword, signToken, verifyToken
│   ├── trpc.ts               ← createContext (lê JWT do cookie) + IP restriction
│   ├── db/
│   │   ├── schema.ts         ← FONTE DA VERDADE das tabelas (Drizzle)
│   │   ├── index.ts          ← Conexão Neon (db = DATABASE_URL) ← CRM usa ESTE
│   │   └── migrate.ts        ← ensureTablesExist() — cria/altera tabelas no startup
│   ├── routers/              ← auth, reminders, tasks, sellers, clients, ai,
│   │                            knowledge, workSessions, tv, emailMarketing, tags
│   ├── email/
│   │   ├── marketing.ts      ← Motor multi-conta (Resend waterfall + Brevo), webhooks
│   │   ├── automations.ts    ← Sequências, automações inactive_days, engagement
│   │   └── resend.ts         ← E-mail transacional (recuperação de senha)
│   └── lib/cache.ts          ← Cache em memória (TTL) usado por vários routers
├── docs/COTAS-E-LIMITES.md   ← Cotas dos planos grátis (resumo humano)
├── vercel.json               ← Build command + rotas + headers + cron
└── drizzle.config.ts         ← Config Drizzle Kit (db:push local)
```

**Routers do CRM** (registrados em `server/routers/index.ts`):
`auth, reminders, tasks, sellers, clients, ai, knowledge, workSessions, tv,
emailMarketing, tags`. (Ignore `shipping` e `recovery` — são do premium.)

---

## 4. Banco de dados — Neon "LEMBRETES VITA"

- **Projeto Neon:** `LEMBRETES VITA`
- **Project ID:** `br-empty-field-ac9uad4z`
- **Branch primária (compute):** `ep-quiet-band-ac6n9iy4` (ACTIVE)
- **Variável de conexão:** `DATABASE_URL` (também aceita `NEON_DATABASE_URL` no
  `migrate.ts`).
- **Driver:** `@neondatabase/serverless` (HTTP) + `drizzle-orm/neon-http`
  (`server/db/index.ts`).
- ⚠️ **Sempre use a connection string com pooling** (`...-pooler.neon.tech...`) no
  `DATABASE_URL` — evita estourar o limite de conexões simultâneas do plano grátis.
- O compute **dorme** (auto-suspend) após inatividade → a 1ª request depois fica
  lenta (cold start). Normal no plano grátis.

### Migrações
- **Automáticas no startup** via `ensureTablesExist()` (`server/db/migrate.ts`),
  chamada quando a função serverless sobe.
- Estratégia: um marcador `SCHEMA_VERSION` (ex.: `'2026-06-27a'`) na tabela
  `schema_meta`. Se bater, o startup pula ~58 DDLs (fast path). Se não bater, roda
  todos os `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`
  (idempotentes) e regrava o marcador.
- **Para adicionar/alterar tabela:**
  1. Edite `server/db/schema.ts` (Drizzle — fonte da verdade).
  2. Adicione o `CREATE TABLE IF NOT EXISTS` e/ou `ALTER TABLE ADD COLUMN IF NOT
     EXISTS` correspondente em `server/db/migrate.ts`.
  3. **Bump `SCHEMA_VERSION`** (senão o fast path pula sua migração e ela nunca roda
     em produção).
  4. Local: `npm run db:push` (Drizzle Kit) para validar contra o banco de dev.
- **Nunca** rode `drizzle-kit push` apontando para produção sem intenção clara — o
  fluxo de produção é o `ensureTablesExist()`.
- **Limpeza automática** (plano grátis): `chat_messages` são apagadas < CURRENT_DATE;
  `work_sessions` concluídas > 90 dias são purgadas.

---

## 5. Tabelas do CRM (schema.ts) — catálogo completo

Todas em `server/db/schema.ts`. **Estas são as do CRM** (as 5 de e-commerce —
`site_orders`, `abandoned_carts`, `automation_runs`, `coupons`, `msg_templates` —
existem no arquivo mas **NÃO pertencem a este produto**, ignore-as):

**Núcleo CRM:**
- `users` — id, name, email, passwordHash, role(`admin`|`user`), mustChangePassword,
  **ipRestrictionEnabled, allowedIps[]** (restrição de IP por usuário).
- `sellers` — atendentes: userId, name, email, phone, department, dailyGoal,
  workHoursGoal, status, **emailSignatureHtml/ImageUrl/Enabled, emailMarketingEnabled**.
- `clients` — name, email, phone, company, city, state, status, unsubscribed.
- `tasks` — **entidade central** (lembretes/leads): userId, clientId, title,
  description, notes, email, tags[], reminderDate, reminderEnabled, status, priority,
  assignedTo, lastContactedAt, convertedAt, contactCount, orderValue, orderId,
  **hotLead, lastEngagementAt** (lead scoring do e-mail mkt), cnpj, phone,
  **emailConfirmed/At/By** (só e-mails confirmados entram em disparo).
- `reminders` — lembretes standalone (userId, clientName, clientPhone, notes,
  scheduledDate, status).
- `chatMessages` — histórico do Chat IA (apagado diariamente).
- `knowledgeDocuments` — base de conhecimento (title, content, category, fileUrl).
- `workSessions` — ponto/jornada: startedAt, endedAt, pausedAt, totalPausedMs, status
  (`active`|`paused`|`ended`), dailyGoalHours.
- `tags` — catálogo curado de tags (name, color).
- `appSettings` — key/value global (ex.: `tv_panel_enabled`).
- `taskDeletionLogs` — auditoria de exclusões feitas por atendentes (+ cnpj/phone
  para detectar reimportação).
- `passwordResetTokens` — tokens de recuperação de senha por e-mail.

**E-mail Marketing:**
- `emailTemplates` / `emailTemplateCategories` — modelos e categorias.
- `emailCampaigns` — campanhas (name, subject, htmlBody, status, totais, is_broadcast,
  attachments).
- `emailCampaignRecipients` — destinatários por campanha (status, account_key,
  message_id, unsub_token, sent_at).
- `emailSuppressions` — lista de descadastro/supressão (unique por email).
- `emailSendCounters` — **contador de cota persistido** (account_key, day, sent) —
  sobrevive a cold start; é o coração do controle de cota de e-mail.
- `emailSequences` / `emailSequenceSteps` — sequências (drip) e seus passos
  (delayDays, sendCondition, retry_if_not_opened, retry_delay_hours, max_retries).
- `emailSequenceEnrollments` — inscrições (email, taskId, currentStep, status,
  next_send_at, cycle_started_at).
- `emailSequenceSends` — log de cada envio de passo (retry_number).
- `emailEvents` — eventos de webhook (delivered/opened/clicked/bounced/complained),
  dedup por (message_id, event_type).
- `automationRules` — regras (trigger_type, action, required_tags, excluded_tags,
  cancel_other_sequences).
- `marketingLists` / `marketingContacts` — leads importados via CSV (standalone do
  fluxo de tarefas): email, name, phone, company, city, state, list_id, tags[],
  source, status.

---

## 6. Variáveis de ambiente (Vercel → Settings → Environment Variables)

**Só as do CRM.** (`MERCADO_PAGO_*`, `MELHOR_ENVIO_*`, `WA_*`, `FB_*`,
`ORDERS_DATABASE_URL` são do premium — não configure aqui pensando no CRM.)

| Variável | Obrigatória | Para quê |
|----------|-------------|----------|
| `DATABASE_URL` | ✅ | Neon LEMBRETES VITA (use string `-pooler`) |
| `JWT_SECRET` | ✅ | Assina o JWT do cookie de sessão |
| `ADMIN_RESET_SECRET` | ✅ | Recuperação de emergência da senha admin |
| `NODE_ENV` | ✅ | `production` |
| `PUBLIC_APP_URL` | rec. | URL base (links de unsubscribe, etc.) |
| `ALLOWED_ORIGINS` | opc. | Origens CORS extras (separadas por vírgula) |
| **IA** | | |
| `GROQ_API_KEY` | ✅ (IA) | Groq — provedor primário |
| `CEREBRAS_API_KEY` | rec. | Cerebras — fallback 2 |
| `GEMINI_API_KEY` | rec. | Google Gemini — fallback 3 |
| `GROQ_API_KEY_PREMIUM` | opc. | 2ª chave Groq (tier separado, se usada) |
| **E-mail transacional (recuperação de senha)** | | |
| `RESEND_API_KEY` | rec. | Conta Resend transacional |
| `RESEND_DAILY_LIMIT` | opc. (80) | Freio diário transacional |
| **E-mail Marketing (cascata)** | | |
| `RESEND_MKT_API_KEY_1..5` | ✅ (mkt) | Até 5 contas Resend em cascata |
| `RESEND_MKT_FROM_1..5` | ✅ (mkt) | Remetente de cada conta Resend mkt |
| `RESEND_MKT_DAILY_LIMIT` | opc. (90) | Freio diário por conta Resend mkt |
| `RESEND_MKT_MONTHLY_LIMIT` | opc. (3000) | Freio mensal por conta Resend mkt |
| `RESEND_MKT_WEBHOOK_SECRET_1..5` | rec. | Valida webhooks Resend (aberturas/cliques) |
| `BREVO_API_KEY_1..N` | opc. | Contas Brevo (overflow após Resend) |
| `BREVO_FROM_1..N` | opc. | Remetente de cada conta Brevo |
| `BREVO_DAILY_LIMIT` | opc. (300) | Freio diário por conta Brevo |
| `BREVO_MONTHLY_LIMIT` | opc. (9000) | Freio mensal por conta Brevo |
| `BREVO_WEBHOOK_SECRET` | rec. | Valida webhook Brevo |
| **Cron** | | |
| `CRON_SECRET` | ✅ | Autentica o cron `/api/cron/email-daily` (Bearer) |

Para dev local: crie `.env` na raiz com pelo menos `DATABASE_URL`, `JWT_SECRET`,
`GROQ_API_KEY`, `GEMINI_API_KEY`.

---

## 7. Autenticação e restrição de IP

- **Login** (`auth.login`): valida senha (PBKDF2-SHA512 310k) com comparação
  timing-safe + `DUMMY_HASH` contra enumeração de usuário. Emite JWT 7 dias em cookie
  HttpOnly `sal-vita-session` (`Secure` em produção, `SameSite=Lax`).
- **Contexto** (`server/trpc.ts` → `createContext`): lê o cookie, verifica o JWT,
  carrega o usuário (cache 30s por `user:{id}`), expõe `ctx.user` e `ctx.clientIp`.
- **Procedures:**
  - `publicProcedure` — sem auth.
  - `protectedProcedure` — exige `ctx.user` (senão `UNAUTHORIZED`).
  - `adminProcedure` — exige `role === 'admin'` (senão `FORBIDDEN`).
- **Restrição de IP por usuário:** se `ipRestrictionEnabled && allowedIps.length > 0
  && role !== 'admin'`, o contexto checa o IP do cliente contra a lista (`ipMatchesEntry`
  suporta IPs exatos e ranges CIDR `x.x.x.x/24`). Admin **nunca** é restringido.
  - ⚠️ **Fail-open conhecido:** se `ipRestrictionEnabled = true` mas `allowedIps = []`,
    a checagem é pulada (qualquer IP passa). A UI de Atendentes deve impedir salvar
    "ativado sem IP".
- **`app.set('trust proxy', 1)`** em `api/index.ts`: assume exatamente 1 hop de proxy
  (Vercel). O subdomínio `lembretes.` aponta direto para a Vercel, sem CDN extra —
  então `req.ip` é o IP real do cliente.
- **Recuperação de senha:** fluxo por e-mail (`passwordResetTokens` + `resend.ts`
  transacional) e reset de emergência do admin (`ADMIN_RESET_SECRET`).

---

## 8. Catálogo de procedures tRPC (o que existe e onde)

Use como `trpc.<router>.<procedure>`. Nível de acesso entre parênteses quando útil.

**auth:** `me, login, logout, changePassword, forceChangePassword, adminResetPassword,
+ fluxo de recuperação por e-mail` — sessão, senha, reset.

**tasks:** `list, getById, create, update, confirmEmail, toggleConverted, delete,
deleteMany, checkCancelledMatches, deletionLogs, markDeletionReviewed, fraudAlerts,
reminders` — CRUD de tarefas/leads, confirmação de e-mail, conversão, auditoria de
exclusão, alertas de fraude (notas vazias/duplicadas).

**sellers:** `list, create, delete, update, updateRole, listWithRole, myProfile,
getIpRestriction, setIpRestriction, myIp` — atendentes, papéis, restrição de IP,
assinatura de e-mail.

**clients:** `list, create, delete`.

**reminders:** `list, create, complete, delete`.

**knowledge:** `list, create, delete` — base de conhecimento (RAG simples por busca).

**tags:** `list, create, update, delete` — catálogo de tags.

**workSessions:** `current, start, pause, resume, end, history, allActiveToday` —
ponto/jornada. `allActiveToday` (admin) alimenta o painel de presença.

**tv:** `getPanelStatus, setPanelStatus, dashboard` — painel de TV (KPIs, ranking,
leads quentes, alertas). `dashboard` tem cache de 120s.

**ai:** `bulkReschedule, listModels, testConnection, chat, analyzeAttendants,
suggestSalesApproach, generateEmailCopy, history, clearHistory` — ver seção 9.

**emailMarketing:** ver seção 10 (é o maior router). Grupos:
- Templates/categorias: `listTemplates(ForAttendant), upsertTemplate, deleteTemplate,
  listTemplateCategories, upsertTemplateCategory, deleteTemplateCategory`.
- Campanhas: `listCampaigns, createCampaign, sendBroadcast, attendantBroadcast,
  addRecipientsFromTasks, getCampaign, deleteCampaign, processBatch, campaignStats,
  campaignRecipients, removeCampaignRecipient`.
- Sequências: `listSequences(ForAttendant), upsertSequence, deleteSequence,
  listSequenceSteps, upsertSequenceStep, deleteSequenceStep, enrollTasksInSequence,
  listEnrollments, pause/resume/cancelEnrollment, sequenceStats, sequenceRecipients`.
- Automações: `listAutomationRules, upsertAutomationRule, deleteAutomationRule`.
- Supressões: `listSuppressions, addSuppression, removeSuppression`.
- Contatos/listas de marketing: `importMarketingContacts, listMarketingContacts,
  marketingContactStats, contactsOverview, updateMarketingContact,
  deleteMarketingContacts, tag/enroll/unsubscribeMarketingContacts,
  listMarketingLists, upsert/deleteMarketingList, moveContactsToList`.
- Estatísticas/engajamento: `usageStats, overviewStats, domainTrackingStatus,
  enableDomainTracking, engagementByTaskIds, enrollmentsByTaskIds, hotLeadsCount,
  contactStats, exportLeads, audiencePreview, listTags`.

---

## 9. IA — cadeia, cotas e proteções (`server/routers/ai.ts`)

**Provedores (OpenAI-compatible), cadeia de fallback:**
`Groq → Cerebras → Gemini`. Cada cota grátis é independente, então encadear
multiplica o orçamento diário antes de dar erro ao usuário.

```
BASE_URLS:  groq=api.groq.com/openai/v1 · cerebras=api.cerebras.ai/v1 ·
            gemini=generativelanguage.googleapis.com/v1beta/openai
DEFAULT_MODELS: groq=llama-3.3-70b-versatile · cerebras=gpt-oss-120b ·
                gemini=gemini-2.5-flash
```

- **`getFallbackChain(primary)`** monta a lista de provedores que têm env key
  configurada, na ordem groq→cerebras→gemini, pulando o primário.
- **`callWithFallback`**: roda no primário; em erro **429/rate-limit** (`isRateLimit`)
  cai para o próximo. ⚠️ Hoje só cai em 429 — 5xx/timeout/rede sobem sem fallback
  (melhoria conhecida: trocar por `isRetryable`).
- **Proteções de cota:**
  - Cooldown de chat: **2,5s** por usuário (`CHAT_COOLDOWN_MS`).
  - Cache da análise de atendentes: **15 min** (`ANALYZE_CACHE_TTL_MS`).
  - Análise processa no máx. ~5.000 tarefas.
  - `max_tokens`: ~8.000 (análise), ~1.000/700 (chat).
- **Tools (function calling)** para o chat admin: `list_tasks, read_notes,
  find_suspicious_notes, list_sessions, search_knowledge, reschedule_tasks`
  (reschedule sempre exige `dry_run=true` primeiro + confirmação explícita).
- **Tools do atendente** (escopo automático no próprio usuário): `my_priorities,
  find_my_client, search_knowledge`.
- **Config de chaves:** produção usa **env vars** (não `localStorage`). A tela
  AiSettings é diagnóstico (`testConnection`, `listModels`).

**Regra prática:** mantenha `GROQ_API_KEY` **e** pelo menos `GEMINI_API_KEY` ativas —
o fallback só ajuda com mais de uma chave.

---

## 10. Motor de E-mail Marketing (o núcleo do produto)

Arquivos: `server/email/marketing.ts` (envio/contas/webhooks), `server/email/
automations.ts` (sequências/automações), `server/routers/emailMarketing.ts` (API).

### 10.1 Cascata multi-conta (waterfall)
- `getAccounts()` lê as contas de env vars, **nesta ordem**:
  1. **Resend:** `RESEND_MKT_API_KEY_1` + `RESEND_MKT_FROM_1`, …_2, …_3, …_4, …_5.
  2. **Brevo (overflow, no fim):** `BREVO_API_KEY_1` + `BREVO_FROM_1`, …_2, …
- `pickAccount()` escolhe a **primeira** conta com cota **diária E mensal** restante.
  Se todas estourarem → retorna `null` → envio para com aviso *"Limite diário das
  contas de e-mail atingido"*.
- **Limites por conta (default, sobrescrevível por env):**
  - Resend mkt: **90/dia**, **3.000/mês** (`RESEND_MKT_DAILY_LIMIT`/`_MONTHLY_LIMIT`).
  - Brevo: **300/dia**, **9.000/mês** (`BREVO_DAILY_LIMIT`/`_MONTHLY_LIMIT`).
- **Contador persistido** na tabela `email_send_counters` (por `account_key` + `day`)
  → sobrevive a cold start. `getCounter`/`incrementCounter`/`getMonthlyCounter`.
- **Batch:** Resend envia em lote via `sendBatchResend`; Brevo via `sendBatchBrevo`
  usando `messageVersions`, **chunk de 99** (`BREVO_MAX_VERSIONS`). Máx. ~100 e-mails
  por chamada.

### 10.2 Sequências, automações, engajamento (`automations.ts`)
- `processSequenceEnrollments()` — processa inscrições com `next_send_at <= now()`:
  skip-loop de passos + envio em lote; marca `completed`/`skipped`; respeita cota.
- `evaluateInactiveDaysRules()` — automações do tipo `inactive_days`: inscreve leads
  parados há N dias em sequências.
- `flagEngagementByMessageId()` — quando chega webhook de abertura/clique, marca
  `hotLead = true` + `lastEngagementAt` na tarefa (lead scoring).
- `computeNextSendAt`, `conditionMet` — agendamento e condições de envio dos passos.

### 10.3 Webhooks (em `api/index.ts`)
- `POST /api/resend-webhook` — valida assinatura via `verifyResendWebhook` (tenta
  `RESEND_MKT_WEBHOOK_SECRET_1..5`). Grava em `email_events` (dedup).
- `POST /api/brevo-webhook` — valida `BREVO_WEBHOOK_SECRET` (query `?secret=` ou
  header `x-webhook-secret`). Grava em `email_events`.
- Eventos: delivered, opened, clicked, bounced, complained.
- Todos com rate-limit dedicado.

### 10.4 Cron diário — `GET /api/cron/email-daily`
- Agendado em `vercel.json`: `"schedule": "0 11 * * *"` → **11:00 UTC = 08:00 BRT**.
- Autenticação: header `Authorization: Bearer <CRON_SECRET>`.
- Passos: (1) `evaluateInactiveDaysRules` → novos enrollments; (2)
  `processSequenceEnrollments` → envia passos devidos; (3) cleanup de `email_events`.
- Retorna um `summary` com contadores (sent, failed, completed, skipped,
  quotaExhausted, eventsDeleted).
- ⚠️ Budget Vercel Hobby: mantenha cada execução curta (crons limitam volume por run).

### 10.5 E-mail transacional (`server/email/resend.ts`)
- Conta única `RESEND_API_KEY`, remetente `noreply@premium.salvitarn.com.br`.
- Usado no CRM para **recuperação de senha** (`auth`). Freio soft **80/dia**
  (`RESEND_DAILY_LIMIT`), contador **em memória** (zera em cold start — freio, não
  garantia).
- Nunca lança / nunca bloqueia o chamador (best-effort).

---

## 11. Cotas dos planos grátis — o que estoura e o que fazer

(Resumo operacional; detalhes humanos em `docs/COTAS-E-LIMITES.md`.)

| Plataforma | Limite grátis | Proteção no código | Ação do admin |
|-----------|---------------|--------------------|----------------|
| **Resend mkt** | 100/dia · 3k/mês por conta (freio 90) | contador em `email_send_counters` + cascata | parcelar campanhas > ~90; cadastrar `_2.._5`; conferir DNS/SPF/DKIM |
| **Brevo** | ~300/dia · 9k/mês por conta | mesmo contador + overflow | adicionar `BREVO_API_KEY_N` para mais volume |
| **Resend transacional** | 100/dia · 3k/mês (freio 80) | contador em memória | não disparar em massa por esse caminho |
| **Groq/Cerebras/Gemini** | rate limit/min + /dia | cooldown 2,5s, cache 15min, fallback | manter ≥2 chaves; não reanalisar < 15min |
| **Neon** | conexões + compute limitados, auto-suspend | limpeza automática (chat/sessions) | usar string `-pooler`; monitorar compute |
| **Vercel** | ~100 GB banda/mês, teto serverless | crons limitam volume por run | uso comercial → avaliar plano Pro |

**O que mais derruba o e-mail marketing:** campanha grande num único dia; muitas
sequências/automações ativas ao mesmo tempo (todas consomem a mesma cota diária);
reenviar no mesmo dia. **Solução:** parcelar (o sistema retoma no dia seguinte) e/ou
adicionar contas.

---

## 12. Receitas de edição comuns

**Adicionar rota/página no CRM:**
1. Crie `client/src/pages/NovaPagina.tsx`.
2. Em `client/src/App.tsx`, adicione
   `<Route path="/nova-rota"><AppShell><NovaPagina /></AppShell></Route>`.
3. Se for de menu, adicione o item em `AppShell.tsx`.

**Adicionar procedure no backend:**
1. Edite o router relevante em `server/routers/<nome>.ts` (use `protectedProcedure`
   ou `adminProcedure` conforme o acesso; valide input com `zod`).
2. Se for router novo, registre em `server/routers/index.ts`.
3. No frontend: `trpc.<router>.<procedure>.useQuery()` / `.useMutation()`.

**Adicionar tabela/coluna:** ver seção 4 (schema.ts → migrate.ts → bump
`SCHEMA_VERSION` → `npm run db:push` local).

**Mexer em e-mail marketing:** contas/cotas → `marketing.ts`; sequências/automações →
`automations.ts`; API/telas → `emailMarketing.ts` + `client/src/pages/EmailMarketing.tsx`.

---

## 13. Rotas e páginas do CRM (`App.tsx`)

| Rota | Página | Acesso |
|------|--------|--------|
| `/` | Home (login) | Público |
| `/admin/dashboard` | AdminDashboard | Admin |
| `/admin/ai-analysis` | AiAnalysis | Admin |
| `/admin/clients` | ClientsManagement | Admin |
| `/admin/email-marketing` | EmailMarketing | Admin |
| `/vendor/reminders` | VendorReminders | Admin |
| `/history` | CallHistory | Admin |
| `/attendants` (`/atendentes`) | Attendants | Admin |
| `/representatives` | Representatives | Admin |
| `/tasks` | Tasks | Atendentes |
| `/meu-progresso` | AttendantProgress | Atendentes |
| `/ai-chat` | AiChat | Todos |
| `/ai-settings` | AiSettings | Admin |
| `/knowledge-base` | KnowledgeBase | Todos |
| `/tv` | TvDashboard | Painel TV (atualmente comentado em App.tsx) |

Detecção de host em `App.tsx`: se `hostname` ∈ `premium.salvitarn.com.br` →
renderiza **só** a landing do premium. Qualquer outro host → CRM completo. **Para o
CRM, o host é `lembretes.salvitarn.com.br`.**

---

## 14. Armadilha de fuso horário (Brasília)

O ambiente serverless roda em **UTC**. Cálculos de "hoje" ingênuos
(`new Date().setHours(0,0,0,0)` ou `.toISOString().slice(0,10)`) resetam contadores
diários no horário errado (21:00 BRT em vez de 00:00). Ao mexer em qualquer lógica de
"hoje"/contador diário/janela de datas no servidor, use utilitários que fixam o fuso
`America/Sao_Paulo` (helpers `spDateStr/spMidnight/spEndOfDay/spDaysAgo` — se não
existirem no branch em que você está, eles vivem em `server/lib/tz.ts` no `main`;
replique o padrão com `Intl.DateTimeFormat` + timezone explícito). Datas do **cliente**
já vêm no fuso local do navegador e geralmente estão corretas.

---

## 15. Verificação antes de deploy (obrigatório)

Rode e confirme que passam (ignore erros pré-existentes já conhecidos, se houver):

```bash
# 1. Typecheck
npx tsc --noEmit

# 2. Build do frontend
node node_modules/vite/bin/vite.js build client -c vite.config.ts

# 3. Bundle do backend (o que a Vercel executa)
node_modules/.bin/esbuild api/index.ts --bundle --platform=node --target=node20 \
  --outfile=api/bundle.js --external:pg-native --external:fsevents
```

Só então:
```bash
git add -A
git commit -m "fix: descrição clara da mudança"
git push origin main   # Vercel deploya automático
```

---

## 16. Runbook de emergência (Claude sem créditos / precisa mexer rápido)

1. **Sistema fora do ar após deploy:** verifique logs na Vercel (Deployments → Functions).
   Erro comum: variável de ambiente faltando (`JWT_SECRET`, `DATABASE_URL`). Corrija em
   Settings → Environment Variables e **Redeploy**.
2. **Banco lento na 1ª request:** cold start do Neon (auto-suspend). Normal; aguarde.
3. **"Limite diário das contas de e-mail atingido":** cotas Resend/Brevo estouraram.
   Espere o dia virar (retoma sozinho) ou adicione conta (`RESEND_MKT_*_N` / `BREVO_*_N`)
   na Vercel e redeploy.
4. **IA retornando erro:** confira `GROQ_API_KEY`/`GEMINI_API_KEY`. Sem chave válida,
   nenhum provedor responde.
5. **Atendente bloqueado por IP:** Atendentes → Restringir IP → desmarque "Ativar
   restrição" (ou adicione o IP real) → Salvar.
6. **Reset de senha admin travado:** use `ADMIN_RESET_SECRET` (fluxo de emergência).
7. **Migração nova não aplicou em produção:** você esqueceu de **bump `SCHEMA_VERSION`**
   em `migrate.ts`. Bump e redeploy.
8. **Rollback:** na Vercel, Deployments → escolha um deploy anterior estável →
   "Promote to Production". Ou reverta o commit em `main` e push.

---

## 17. Checklist mental antes de "pronto"

- [ ] Escopo é CRM Lembretes / E-mail Marketing (não premium)?
- [ ] Usei Wouter + tRPC + Drizzle (nada de react-router/fetch/SQL cru)?
- [ ] Se mexi no schema: atualizei `migrate.ts` **e** bumpei `SCHEMA_VERSION`?
- [ ] Se mexi em "hoje"/cota diária: tratei fuso Brasília?
- [ ] `tsc --noEmit` + build frontend + esbuild backend passaram?
- [ ] Commit em inglês, sem segredos, push só em `main`?
