# Handoff Completo — Sal Vita Lembretes (julho/2026)

> **Gerado em 28/06/2026, atualizado em 13/07/2026.** Leia este arquivo inteiro antes de
> alterar qualquer coisa no projeto. Ele contém TUDO que você precisa saber para dar
> continuidade ao desenvolvimento. Veja a **Seção 21** para o que mudou desde a versão
> original — não redescubra o que já foi feito.

---

## 1. O que é este projeto

**Sal Vita Lembretes** é um SaaS interno (CRM) de gestão de tarefas, lembretes e follow-up de vendas da empresa **Sal Vita** (sal marinho de Mossoró/RN).

- **Atendentes** gerenciam leads/clientes, criam tarefas de acompanhamento, recebem lembretes de contato e registram sessões de trabalho.
- **Admin (Tarcyo)** supervisiona tudo com dashboard, análise IA, gestão de equipe, e-mail marketing e configurações.

> **IMPORTANTE:** Este é um CRM de tarefas/lembretes, NÃO um sistema de vendas. Existe um projeto SEPARADO chamado "Sal Vita Premium" (landing page + e-commerce) que roda no domínio `premium.salvitarn.com.br`. Os dois projetos vivem no MESMO repositório mas em rotas/domínios diferentes. **Nunca misture a lógica dos dois.**

---

## 2. URLs e acessos em produção

| Endereço | O que é |
|----------|---------|
| `https://lembretes.salvitarn.com.br` | Sistema CRM (login + gestão de atendentes) |
| `https://premium.salvitarn.com.br` | Landing page e-commerce (NÃO é o CRM) |
| `https://premium.salvitarn.com.br/sal-vita-admin` | Painel admin do e-commerce Premium |
| Vercel project | `sal-vita-vendas` — team `tarcyoalves-projects` |
| GitHub repo | `github.com/tarcyoalves/sal-vita-vendas` |
| Banco de dados | **Neon PostgreSQL** — projeto `polished-silence-82035475`, região `sa-east-1` |

### Login admin

```
Email: tarcyo.alves@gmail.com
Senha: (definida pelo Tarcyo — não é mais admin123)
```

O seed automático em DB vazio cria `admin123`, mas o Tarcyo já trocou a senha.

### Deploy

```bash
git push origin main
# Vercel detecta automaticamente e faz deploy (~1-2 min)
```

**NUNCA force-push em main.** Sempre crie commits novos.

---

## 3. Stack completa

| Camada | Tecnologia |
|--------|------------|
| Frontend | React 19 + TypeScript + Vite |
| Roteamento | **Wouter** (NUNCA react-router-dom) |
| API client | **tRPC** + TanStack Query (NUNCA `fetch` direto para rotas próprias) |
| Estilo | Tailwind CSS + shadcn/ui (Radix) |
| Backend | Express.js serverless (Vercel Functions) |
| Banco | PostgreSQL **Neon** (serverless) + **Drizzle ORM** (NUNCA SQL raw) |
| Auth | JWT em cookie HttpOnly (30 dias) — PBKDF2-SHA512 310.000 iterações |
| IA | Groq (principal) → Cerebras (fallback 2) → Google Gemini (fallback 3) |
| E-mail transacional | Resend (1 conta, remetente `noreply@premium.salvitarn.com.br`) |
| E-mail marketing | Resend (até 5 contas) + Brevo (até 5 contas) em cascata |
| PWA | vite-plugin-pwa (iOS + Android) |
| Sanitização | DOMPurify (cliente) + sanitize-html (servidor) |

---

## 4. Estrutura de pastas

```
/
├── api/index.ts            ← Entry point do servidor (bundlado → api/bundle.js)
├── client/
│   ├── index.html          ← Meta PWA + fontes Google (Pacifico, Inter)
│   ├── public/             ← Ícones PWA (icon-192.png, icon-512.png), logo SVG
│   └── src/
│       ├── App.tsx          ← Rotas Wouter + lógica de host (premium vs lembretes)
│       ├── _core/hooks/     ← useAuth, useReminderNotifications
│       ├── components/
│       │   ├── AppShell.tsx  ← Layout: sidebar + header mobile + bottom nav
│       │   ├── FloatingChat.tsx ← Chat IA flutuante
│       │   ├── RichTextEditor.tsx ← Editor HTML para e-mail marketing
│       │   ├── SalVitaChat.tsx ← Chat do e-commerce Premium
│       │   └── ui/           ← Componentes shadcn/ui (NÃO editar diretamente)
│       ├── contexts/        ← ThemeContext
│       └── pages/           ← Uma página por rota
├── server/
│   ├── auth.ts             ← hashPassword, verifyPassword, signToken, verifyToken
│   ├── db/
│   │   ├── schema.ts       ← Tabelas Drizzle (FONTE DA VERDADE do banco)
│   │   ├── index.ts        ← Conexão Neon (NEON_DATABASE_URL ?? DATABASE_URL)
│   │   └── migrate.ts      ← ensureTablesExist() — cria tabelas se não existirem
│   ├── email/
│   │   ├── resend.ts       ← E-mail transacional (Sal Vita Premium — NÃO mexer aqui para CRM)
│   │   └── marketing.ts    ← E-mail Marketing (CRM) — cascata Resend + Brevo
│   ├── lib/cache.ts        ← Cache em memória com TTL (cached, cacheInvalidate)
│   ├── routers/            ← Todos os routers tRPC
│   │   ├── index.ts        ← Registro de todos os routers
│   │   ├── auth.ts         ← Login, logout, trocar senha, me
│   │   ├── tasks.ts        ← CRUD de tarefas/leads (o coração do sistema)
│   │   ├── clients.ts      ← Gestão de clientes
│   │   ├── reminders.ts    ← Lembretes de contato
│   │   ├── sellers.ts      ← CRUD de atendentes + restrição de IP
│   │   ├── ai.ts           ← Chat IA + Análise de atendentes (Groq/Cerebras/Gemini)
│   │   ├── knowledge.ts    ← Base de conhecimento
│   │   ├── workSessions.ts ← Sessões de trabalho (ponto)
│   │   ├── tv.ts           ← Painel TV (DESATIVADO para economizar Neon)
│   │   ├── shipping.ts     ← Frete (Premium e-commerce)
│   │   ├── recovery.ts     ← Carrinho abandonado (Premium e-commerce)
│   │   ├── emailMarketing.ts ← Campanhas, sequências, templates, automações
│   │   └── tags.ts         ← Tags admin-curated
│   └── trpc.ts             ← createContext (JWT → ctx.user), middleware IP restriction
├── shared/const.ts         ← Constantes compartilhadas (COOKIE_NAME, etc.)
├── docs/
│   └── COTAS-E-LIMITES.md  ← Limites detalhados de todos os planos free
├── vercel.json             ← Build, rotas, headers de segurança, cron
├── drizzle.config.ts       ← Config do Drizzle Kit
├── CLAUDE.md               ← Guia do projeto para IA (resumido)
└── HANDOFF.md              ← ESTE arquivo (guia completo)
```

---

## 5. Rotas do frontend

| Rota | Página | Quem acessa |
|------|--------|-------------|
| `/` | Home (login) | Público |
| `/admin/dashboard` | AdminDashboard | Admin |
| `/tasks` | Tasks | Atendentes |
| `/attendants` ou `/atendentes` | Attendants | Admin |
| `/admin/clients` | ClientsManagement | Admin |
| `/vendor/reminders` | VendorReminders | Admin |
| `/admin/ai-analysis` | AiAnalysis | Admin |
| `/admin/email-marketing` | EmailMarketing | Admin |
| `/ai-chat` | AiChat | Todos |
| `/ai-settings` | AiSettings | Admin |
| `/knowledge-base` | KnowledgeBase | Todos |
| `/meu-progresso` | AttendantProgress | Atendentes |
| `/history` | CallHistory | Admin |
| `/sal-vita` | SalVitaLanding | Público (landing Premium) |
| `/sal-vita-admin` | SalVitaAdmin | Admin (painel Premium) |
| `/sal-vita-recovery` | SalVitaRecovery | Público (recuperação carrinho) |
| `/meu-pedido` | TrackOrder | Público (rastreio de pedido) |
| `/tv` | TvDashboard | **DESATIVADO** (comentado no App.tsx) |

### Lógica de dois domínios (IMPORTANTE)

`App.tsx` detecta o `window.location.hostname`:
- Host `premium.salvitarn.com.br` → renderiza **só** páginas do Premium (landing, admin, recovery, rastreio)
- Qualquer outro host → sistema CRM completo de lembretes

`vercel.json` redireciona todo o domínio premium para `/sal-vita` (exceto rotas específicas como `/sal-vita-admin`, `/meu-pedido`, `/api/*`).

---

## 6. Routers tRPC (backend)

Registrados em `server/routers/index.ts`:

| Router | Namespace tRPC | Descrição |
|--------|---------------|-----------|
| authRouter | `trpc.auth.*` | Login, logout, me, changePassword, resetPassword |
| tasksRouter | `trpc.tasks.*` | CRUD de tarefas/leads, importação CSV, conversão |
| clientsRouter | `trpc.clients.*` | CRUD de clientes |
| remindersRouter | `trpc.reminders.*` | Lembretes de contato |
| sellersRouter | `trpc.sellers.*` | CRUD de atendentes, roles, restrição de IP |
| aiRouter | `trpc.ai.*` | Chat IA, análise de atendentes |
| knowledgeRouter | `trpc.knowledge.*` | Base de conhecimento |
| workSessionsRouter | `trpc.workSessions.*` | Sessões de trabalho (ponto) |
| tvRouter | `trpc.tv.*` | Painel TV (desativado no frontend) |
| shippingRouter | `trpc.shipping.*` | Cálculo de frete (Premium) |
| recoveryRouter | `trpc.recovery.*` | Carrinho abandonado (Premium) |
| emailMarketingRouter | `trpc.emailMarketing.*` | Campanhas, sequências, templates, automações |
| tagsRouter | `trpc.tags.*` | Tags curadas pelo admin |
| faturamentoRouter | `trpc.faturamento.*` | Faturamento/comissão dos atendentes (pedidos, produtos, aprovação). **CRM**, não Premium — banco `db` normal |
| b2bRouter | `trpc.b2b.*` | Prospecção B2B (leads inbound, 3 estágios manuais). Usa `ordersDb` (banco do Premium), não o banco do CRM — ver `PLANO-FINAL-EXECUCAO-B2B.md` |

---

## 7. Banco de dados — Schema completo

Fonte da verdade: `server/db/schema.ts`

### Tabelas principais (CRM)

| Tabela | Descrição |
|--------|-----------|
| `users` | Usuários do sistema (admin/user). Tem `ipRestrictionEnabled` e `allowedIps` para restrição por IP, e `lastLoginIp`/`lastLoginAt` (capturado a cada login, mesmo se bloqueado depois pela restrição — dá ao admin o IP real pra configurar) |
| `sellers` | Atendentes. `userId` referencia `users`. Tem campos de assinatura de e-mail |
| `tasks` | Leads/tarefas de follow-up. O coração do CRM. Tem tags, lead scoring (`hotLead`), valor de venda (`orderValue`), confirmação de e-mail |
| `clients` | Clientes (cadastro separado de tasks). Tem `unsubscribed` para opt-out de marketing |
| `reminders` | Lembretes de contato |
| `chat_messages` | Histórico do chat IA |
| `knowledge_documents` | Base de conhecimento |
| `work_sessions` | Sessões de trabalho (ponto eletrônico) |
| `tags` | Tags admin-curated (catálogo) |
| `app_settings` | Key/value para configurações globais |
| `task_deletion_logs` | Log de exclusão de leads (anti-reimportação) |
| `password_reset_tokens` | Tokens de reset de senha |

### Tabelas de E-mail Marketing (CRM)

| Tabela | Descrição |
|--------|-----------|
| `email_template_categories` | Categorias de templates |
| `email_templates` | Templates de e-mail HTML |
| `email_campaigns` | Campanhas (draft→sending→sent). Suporta broadcast (disparo rápido) |
| `email_campaign_recipients` | Destinatários de cada campanha |
| `email_suppressions` | Lista de supressão (unsubscribe, bounce, complaint) |
| `email_send_counters` | Contadores diários por conta (cascata) |
| `email_sequences` | Sequências automáticas (drip campaigns). Suporta repetição (loop) |
| `email_sequence_steps` | Passos de cada sequência (delay, condição, retry) |
| `email_sequence_enrollments` | Inscrições de leads em sequências |
| `email_sequence_sends` | Log de envios de cada passo |
| `email_events` | Eventos de e-mail (aberto, clicado, bounce, etc.) |
| `automation_rules` | Regras de automação (trigger → action) |
| `marketing_lists` | Listas de contatos importados via CSV |
| `marketing_contacts` | Contatos standalone (não vinculados a tasks) |

### Tabelas de Faturamento/Comissão (CRM)

Migrado de localStorage para o banco em 02/07/2026 (a API pública do store
`client/src/lib/faturamento/store.ts` não mudou — nenhuma tela precisou ser
reescrita). Tabelas em `server/db/schema.ts`, router em `server/routers/faturamento.ts`:

| Tabela | Descrição |
|--------|-----------|
| `fat_products` | Catálogo de produtos com comissão/isenção de frete configuráveis |
| `fat_orders` | Pedidos de venda (o "pedido" que aparece na tela de Faturamento). Tem `taskId` linkando à tarefa/lead de origem — pode ficar `NULL` em pedidos antigos importados (ver Seção 21) |
| `fat_commissions` | % de comissão por atendente |
| `fat_order_deletion_logs` | Auditoria de exclusão de pedidos |

### Tabelas do Premium (e-commerce)

| Tabela | Descrição |
|--------|-----------|
| `site_orders` | Pedidos do e-commerce. Tem UTM tracking, cupom, rastreio |
| `abandoned_carts` | Carrinhos abandonados |
| `automation_runs` | Execuções de automação de carrinho (com IA) |
| `coupons` | Cupons de desconto |
| `msg_templates` | Templates de mensagem (carrinho, pagamento) |
| `companies`, `contacts`, `public_sources`, `consent_records`, `audit_logs` | Prospecção B2B (`trpc.b2b.*`) — ver `server/db/b2bMigrate.ts` e `PLANO-FINAL-EXECUCAO-B2B.md` |

### Migrações

Automáticas via `ensureTablesExist()` no cold start do servidor. O sistema usa um
`SCHEMA_VERSION` (constante no topo de `server/db/migrate.ts`) salvo em `app_settings`
para pular DDL quando já está atualizado. **Não hardcode o valor aqui** — ele muda a
cada migração nova; confira sempre o arquivo. Se você adicionar uma coluna/tabela e
esquecer de dar bump nesse valor, a migração nunca roda em produção.

Para dev local: `npm run db:push` (Drizzle Kit push).

---

## 8. Variáveis de ambiente

Todas configuradas no painel **Vercel → Settings → Environment Variables**.

### Obrigatórias

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | Connection string Neon PostgreSQL (ou `NEON_DATABASE_URL` como override) |
| `JWT_SECRET` | Segredo JWT (string longa aleatória) |
| `ADMIN_RESET_SECRET` | Chave para recuperação de emergência de senha admin |

### IA (todas as chaves são de plano free)

| Variável | Descrição |
|----------|-----------|
| `GROQ_API_KEY` | Groq — provedor IA principal |
| `CEREBRAS_API_KEY` | Cerebras — fallback 2 (opcional) |
| `GEMINI_API_KEY` | Google Gemini — fallback 3 |

### E-mail transacional (Premium)

| Variável | Descrição |
|----------|-----------|
| `RESEND_API_KEY` | Conta Resend transacional (Premium) |
| `RESEND_DAILY_LIMIT` | Freio diário transacional (padrão: 80) |

### E-mail Marketing (CRM — cascata)

| Variável | Descrição |
|----------|-----------|
| `RESEND_MKT_API_KEY_1..5` | Chaves de até 5 contas Resend de marketing |
| `RESEND_MKT_FROM_1..5` | Remetentes de cada conta (ex: `Sal Vita <contato@news.salvitarn.com.br>`) |
| `RESEND_MKT_DAILY_LIMIT` | Freio diário por conta de marketing (padrão: 90) |
| `RESEND_MKT_WEBHOOK_SECRET_1..5` | Validação dos webhooks (aberturas/cliques) |
| `BREVO_API_KEY_1..5` | Chaves de até 5 contas Brevo (adicionadas após Resend na cascata) |
| `BREVO_FROM_1..5` | Remetentes Brevo |
| `BREVO_DAILY_LIMIT` | Freio diário por conta Brevo (padrão: 300) |

### Outros

| Variável | Descrição |
|----------|-----------|
| `ALLOWED_ORIGINS` | Origens CORS extras, separadas por vírgula |
| `NODE_ENV` | `production` |

> **Para dev local:** crie `.env` na raiz com essas variáveis. Nunca commite o `.env`.

---

## 9. Limites dos planos gratuitos (CRÍTICO)

O sistema roda 100% em planos gratuitos. **NÃO exceder os limites.**

### Neon PostgreSQL (banco)

- **Plano:** Free Tier
- **Compute:** 100 CU-horas/mês (compute units)
- **Armazenamento:** 0.5 GB
- **Network transfer:** 5 GB/mês
- **Renovação:** dia 1 de cada mês (período = mês corrente)
- **Auto-suspend:** banco "dorme" após inatividade → 1ª requisição fica lenta
- **Connection string:** sempre usar a URL com `-pooler` no nome do host
- **TV Dashboard desativado:** para economizar network transfer, o painel TV foi comentado no `App.tsx`
- **Schema version cache:** pula DDL quando a versão já está no banco (economiza queries no cold start)

### Vercel (hosting)

- **Plano:** Hobby (grátis)
- **Banda:** ~100 GB/mês
- **Funções serverless:** limites de duração (60s max configurado no vercel.json) e invocações/mês
- **ATENÇÃO:** uso comercial/interno de empresa deveria estar no plano Pro (termos de uso)

### Groq (IA principal)

- **Plano:** Free
- **Limites:** rate limit por requisições/minuto e tokens/minuto (varia)
- **Proteção no código:** cooldown de 2.5s entre mensagens de chat, cache de análise (15 min), fallback automático para Cerebras/Gemini quando retorna 429

### Cerebras (IA fallback 2)

- **Plano:** Free
- **Uso:** fallback quando Groq retorna rate limit

### Google Gemini (IA fallback 3)

- **Plano:** Free
- **Limites:** cota por requisições/minuto e por dia (varia com o modelo)

### Resend (e-mail)

- **Plano:** Free por conta
- **Limite:** 100 e-mails/dia e 3.000/mês por conta
- **Transacional:** 1 conta, freio de 80/dia
- **Marketing:** até 5 contas × 90/dia = 450/dia máximo
- **Contadores:** persistidos no banco (`email_send_counters`) — sobrevivem a cold start

### Brevo (e-mail overflow)

- **Plano:** Free por conta
- **Limite:** 300 e-mails/dia por conta
- **Marketing:** até 5 contas extras adicionadas após as contas Resend na cascata

> **Documento detalhado:** `docs/COTAS-E-LIMITES.md`

---

## 10. Segurança implementada

### Autenticação
- JWT em cookie **HttpOnly** (não acessível por JavaScript)
- PBKDF2-SHA512 com **310.000 iterações** (`server/auth.ts`) — **NÃO alterar**
- `mustChangePassword` obriga troca de senha no 1º login

### XSS Protection
- **Content-Security-Policy** no `vercel.json` (script-src, style-src, img-src, etc.)
- **DOMPurify** em todo `dangerouslySetInnerHTML` no cliente
- **sanitize-html** para sanitizar HTML de assinatura de e-mail no servidor
- Headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`
- HSTS com preload

### Restrição de IP por atendente
- Admin pode restringir acesso de cada atendente a IPs específicos
- Suporta IPs individuais e **notação CIDR** (ex: `192.168.1.0/24`)
- Verificação feita no `createContext()` do tRPC (antes de qualquer procedure)
- Admin é **sempre isento** da restrição de IP
- Campos: `users.ipRestrictionEnabled` (boolean) e `users.allowedIps` (text[])
- UI: botão "Restringir IP" no card de cada atendente, com "Usar último IP de login
  de {nome}" (usa `users.lastLoginIp`, capturado no `auth.login`) — **não** existe
  mais um botão "usar meu IP atual", porque nessa tela quem chama é sempre o admin,
  então "meu IP" sempre pegava o IP errado (o do admin, não o do atendente)
- ⚠️ **Fail-open conhecido:** se `ipRestrictionEnabled = true` mas `allowedIps` vier
  vazio, a checagem é pulada e qualquer IP passa. O front (`setIpRestriction`)
  valida isso antes de salvar, mas se algum registro antigo ficou nesse estado,
  a restrição não bloqueia nada — o badge "IP Restrito" na lista só acende quando
  `ipRestrictionEnabled && allowedIps.length > 0`, então o badge é o jeito rápido
  de detectar isso.

### Outros
- Rate limiting no chat IA (cooldown 2.5s)
- Limite de 5.000 tarefas na análise IA (protege banco)
- Validação de formato de IP no backend (regex)
- Máximo 20 IPs por atendente

---

## 11. Papéis de usuário

- **`admin`** → acessa tudo: dashboard, atendentes, clientes, análise IA, e-mail marketing, configurações, painel Premium
- **`user`** → acessa: tarefas, lembretes, progresso próprio, chat IA, base de conhecimento

Admin pode trocar o papel de qualquer atendente via `sellers.updateRole`.

---

## 12. Sistema de E-mail Marketing

### Arquitetura

1. **Templates** → HTML reutilizáveis com variáveis (`{nome}`, `{empresa}`, etc.)
2. **Campanhas** → envio único para lista de leads selecionados (ou broadcast para lista manual)
3. **Sequências** → drip campaigns automáticas (passo 1 → delay → passo 2 → ...)
   - Suportam **repetição** (loop): ao terminar, reiniciam após N dias
   - Passos com condição de envio e retry se não aberto
4. **Automações** → regras de trigger (lead criado, convertido, inativo N dias) → ação (inscrever em sequência, adicionar tag)
5. **Listas de marketing** → contatos importados via CSV (standalone, não vinculados a tasks)

### Cascata de envio

```
Resend conta 1 (90/dia) → Resend conta 2 → ... → Resend conta 5
    → Brevo conta 1 (300/dia) → Brevo conta 2 → ... → Brevo conta 5
```

Quando uma conta atinge o limite diário, passa para a próxima. Contadores persistidos em `email_send_counters`.

### Cron job

`vercel.json` configura: `0 11 * * *` → `POST /api/cron/email-daily`
Roda todo dia às 11:00 UTC (8:00 BRT) para processar sequências automáticas.

### Confirmação de e-mail

Apenas leads com `emailConfirmed = true` entram em disparos. E-mails importados começam como não-confirmados. Digitar/editar o e-mail manualmente confirma automaticamente.

### Assinatura de e-mail

Cada atendente pode ter uma assinatura HTML personalizada (`sellers.emailSignatureHtml`). Admin habilita/desabilita por atendente (`emailSignatureEnabled`, `emailMarketingEnabled`).

---

## 13. Funcionalidades existentes

### CRM (Lembretes)
- Dashboard admin com métricas e gráficos
- CRUD de tarefas/leads com tags, prioridade, status, notas
- Importação de leads via CSV (com detecção de duplicatas por CNPJ/telefone)
- Conversão de lead em cliente (marca `convertedAt`, registra valor da venda)
- Log de exclusão de leads (anti-reimportação: `task_deletion_logs`)
- Lembretes de contato com notificações PWA
- Sessões de trabalho (ponto eletrônico com meta diária)
- Chat IA (Groq/Cerebras/Gemini com fallback em cadeia)
- Análise IA de desempenho de atendentes
- Base de conhecimento (documentos)
- Gestão de atendentes (CRUD, roles, restrição de IP)
- Histórico de contatos
- Tags curadas pelo admin
- Lead scoring (hotLead via cliques em e-mail)
- **Faturamento/Comissão** (`/admin/faturamento`, componentes em
  `client/src/components/faturamento/`): atendente cria pedido de venda a partir
  de uma tarefa (auto-vincula `taskId`), admin aprova, gera cópia em PDF, calcula
  comissão. Pedido pode ficar sem tarefa vinculada (import antigo) — atendente e
  admin têm um picker de busca (`LinkTaskDialog.tsx`) pra corrigir isso na mão,
  sem depender de adivinhação automática

### B2B (prospecção — usa o banco do Premium, não o do CRM)
- Não é uma rota própria: é a seção "Leads B2B" (`section === 'b2b'`) dentro do
  painel admin do Premium (`SalVitaAdmin.tsx`), acessível em `/sal-vita-b2b`.
  Componente real: `B2bLeadsPanel` em `client/src/pages/B2bLeads.tsx`
- Funil simples de leads inbound (`qualified`/`contacted`/`lost`), sem
  scoring/automação — ver `PLANO-FINAL-EXECUCAO-B2B.md` e
  `PLANO-PROSPECCAO-B2B.md` pro plano completo
- Tabelas em `ordersDb` (`companies, contacts, public_sources, consent_records,
  audit_logs`), não no banco do CRM — não confunda com `tasks`

### Premium (E-commerce)
- Landing page com cálculo de frete (via Melhor Envio)
- Carrinho com checkout e integração Mercado Pago
- Recuperação de carrinho abandonado (com IA)
- Rastreamento de pedido (`/meu-pedido`)
- Cupons de desconto
- Templates de mensagem
- UTM tracking + Facebook CAPI attribution
- Reorder reminder (45 dias)
- Chat flutuante na landing page

---

## 14. Como fazer alterações

### Adicionar nova rota/página

1. Criar `client/src/pages/NovaPagina.tsx`
2. Importar em `App.tsx` e adicionar dentro do `<Switch>`:
   ```tsx
   <Route path="/nova-rota">
     <AppShell><NovaPagina /></AppShell>
   </Route>
   ```

### Adicionar nova funcionalidade no backend

1. Criar ou editar router em `server/routers/novo.ts`
2. Importar e registrar em `server/routers/index.ts`:
   ```ts
   import { novoRouter } from './novo';
   // dentro de router({ ... novo: novoRouter, ... })
   ```
3. No frontend: `trpc.novo.procedimento.useQuery()` ou `.useMutation()`

### Adicionar nova tabela no banco

1. Definir tabela em `server/db/schema.ts` (Drizzle)
2. Adicionar `CREATE TABLE IF NOT EXISTS` em `server/db/migrate.ts`
3. Incrementar `SCHEMA_VERSION` em `migrate.ts`
4. Para dev local: `npm run db:push`

### Adicionar nova coluna a tabela existente

1. Atualizar a definição em `server/db/schema.ts`
2. Adicionar `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` em `migrate.ts`
3. Incrementar `SCHEMA_VERSION`

---

## 15. Regras obrigatórias ao editar código

1. **Roteamento:** `import { useLocation } from 'wouter'` — **NUNCA** `react-router-dom`
2. **API calls:** sempre via tRPC (`trpc.[router].[procedure]`) — **NUNCA** `fetch` direto para rotas próprias
3. **Banco:** sempre Drizzle ORM — **NUNCA** SQL raw (exceto em `migrate.ts`)
4. **Segurança de senha:** PBKDF2-SHA512 310.000 iterações em `server/auth.ts` — **NÃO alterar**
5. **Variáveis do frontend:** só variáveis com prefixo `VITE_` ficam disponíveis no cliente
6. **Entry point do backend em produção:** `api/index.ts` (NÃO `server/index.ts`)
7. **Commits em inglês**, mensagens descritivas
8. **DOMPurify** em todo `dangerouslySetInnerHTML` — XSS protection
9. **Minimizar uso do Neon:** evitar queries desnecessárias, usar cache quando possível
10. **Nunca force-push em main**
11. **Nunca commitar secrets** (.env, chaves, senhas)

---

## 16. Como rodar localmente

```bash
# 1. Clonar e instalar
git clone https://github.com/tarcyoalves/sal-vita-vendas
cd sal-vita-vendas
npm install

# 2. Criar .env na raiz
DATABASE_URL=postgresql://...  # String Neon com -pooler
JWT_SECRET=uma-string-longa-aleatória
ADMIN_RESET_SECRET=outra-string-aleatória
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...
# Opcional: CEREBRAS_API_KEY, RESEND_*, BREVO_*

# 3. Criar tabelas no banco
npm run db:push

# 4. Rodar frontend + backend juntos
npm run dev:full
# Frontend: http://localhost:5173
# Backend:  http://localhost:3000
```

Scripts úteis:
- `npm run dev` — só frontend
- `npm run server` — só backend
- `npm run dev:full` — ambos (concurrently)
- `npm run check` — TypeScript type check
- `npm run db:push` — push schema para o banco
- `npm run db:seed` — seed de dados
- `npm run db:update-admin` — atualizar admin

---

## 17. Build e deploy

O build command está em `vercel.json`:

```bash
npm install && \
node node_modules/vite/bin/vite.js build client -c vite.config.ts && \
node_modules/.bin/esbuild api/index.ts --bundle --platform=node --target=node20 \
  --outfile=api/bundle.js --external:pg-native --external:fsevents
```

O `api/bundle.js` é gerado pelo build e está no `.gitignore`... mas por vezes precisa ser commitado para deploy funcionar. Se o deploy reclamar, commite o `api/bundle.js`.

---

## 18. PWA (iOS e Android)

- **iOS:** Safari → "Compartilhar" → "Adicionar à Tela de Início"
- **Android:** Chrome exibe banner automático
- Safe area iOS: `env(safe-area-inset-top)` no header, `env(safe-area-inset-bottom)` no bottom nav
- `viewport-fit=cover` em `index.html` é obrigatório para tela cheia

---

## 19. Logo e cores da marca

### Logo
- **Sidebar (fundo escuro):** `<img src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp">` — webp com elementos brancos
- **Header mobile:** mesmo webp dentro de botão com `className="bg-slate-800 rounded-xl"`
- **Modais e login:** SVG inline com oval azul `#0C3680`, ondas, texto "Sal Vita" em Pacifico
- O WordPress bloqueia hotlinks — o webp funciona no browser mas não via `curl`

### Cores
- Azul principal: `#0C3680`
- Azul Tailwind equivalente: `blue-900` / `blue-800`
- Sidebar: `bg-slate-800` / `bg-slate-900`
- Marca nos e-mails: constante `BRAND = '#0C3680'` em `server/email/marketing.ts`

---

## 20. Dicas para o próximo chat de IA

1. **Leia `CLAUDE.md` e este `HANDOFF.md`** antes de qualquer coisa.
2. **Consulte `docs/COTAS-E-LIMITES.md`** se for mexer com e-mails ou IA.
3. **Sempre teste localmente** antes de fazer push para main.
4. **Commits em inglês,** descritivos (`feat:`, `fix:`, `refactor:`).
5. **Entregue merged em main** — o Tarcyo espera tudo já deployado.
6. **Economize o banco Neon:** use cache, evite queries desnecessárias, não reanalise antes de 15 min.
7. **O painel TV está desativado** para economizar network transfer — não reativar sem pedir ao Tarcyo.
8. **Nunca misture Premium e CRM** — são contextos diferentes no mesmo repo.
9. **sanitize-html** já está instalado para o backend; **DOMPurify** para o frontend.
10. **O cron de e-mail roda às 11:00 UTC** (8:00 BRT) — `vercel.json` → `crons`.
11. **Confira `git branch --show-current` antes de todo commit.** Erro real cometido
    nesta sessão: trabalhar num branch de feature separado, commitar lá, e achar que
    "deploy" tinha saído — mas deploy só acontece com push em `main`, e o commit
    nunca chegou lá. Se você usa um branch próprio, depois de validar
    (`tsc --noEmit` + build), faça `git checkout main && git pull && git cherry-pick
    <commit>` (ou merge) e só então `git push origin main`.
12. **`server/routers/tasks.ts` — `status` de tarefa é sempre `'pending'` na
    prática.** O enum aceita `'completed'`/`'cancelled'`, mas nenhuma tela do
    frontend jamais seta isso. Não construa filtro/UI assumindo variação de status
    de tarefa sem antes confirmar com `grep` se algum fluxo real usa esses valores.

---

## 21. Log de trabalho recente (o que mudou desde 28/06/2026)

Sessões depois da versão original deste handoff. Lido isto pra não redescobrir/
refazer o que já foi feito ou corrigido.

- **IP restriction — bug real corrigido:** botão "Usar meu IP atual" na tela de
  Atendentes sempre pegava o IP do **admin** (quem chama a tela), nunca o do
  atendente sendo editado — logo nunca funcionou como pretendido. Fix: agora
  `users.lastLoginIp`/`lastLoginAt` são gravados a cada `auth.login` (mesmo se o
  login for depois bloqueado pela própria restrição), e o botão virou "Usar
  último IP de login de {nome}". Também endureceu `setIpRestriction` contra o
  estado "ativado mas sem IP na lista" (fail-open silencioso).
- **Fuso horário — bug de produção corrigido:** cálculos de "hoje"/contadores
  diários no servidor usavam UTC ingênuo (`new Date().setHours(0,0,0,0)` etc.),
  fazendo contadores (e-mails enviados hoje, sessões de trabalho, etc.) resetarem
  às 21:00 BRT em vez de meia-noite. Corrigido em `tv.ts`, `workSessions.ts`,
  `ai.ts`, `email/resend.ts`, `email/marketing.ts`, `routers/emailMarketing.ts`.
  O helper vive em `server/lib/tz.ts` (`spDateStr`, `spMidnight`, `spEndOfDay`,
  `spDaysAgo` — todos via `Intl.DateTimeFormat` com timezone `America/Sao_Paulo`
  explícito). Use-o pra qualquer cálculo novo de "hoje"/janela de datas no
  servidor — nunca `new Date().setHours()` puro.
- **Faturamento — vínculo pedido↔tarefa:** pedidos antigos (importados antes da
  tarefa ser obrigatória na criação) podem ficar sem `taskId`. Existe um picker
  de busca (`LinkTaskDialog.tsx`, usado tanto pelo admin quanto pelo atendente
  em `OrderDetailDialog.tsx`/`AttendantBilling.tsx`) pra vincular manualmente.
  Duas armadilhas já caídas nessa feature, não repita:
  1. Filtro "só por CNPJ" sem fallback pra lista completa deixa a lista vazia
     sempre que o CNPJ não bate — sempre caia pra lista completa (já escopada
     ao atendente certo) quando o filtro específico não achar nada.
  2. Não crie UI diferente para admin vs atendente na mesma ação sem motivo —
     gera confusão ("funciona pra um, não pro outro"). Usar o mesmo componente
     compartilhado.
- **Skill para o OpenClaw:** `docs/SKILL-OPENCLAW-CRM-LEMBRETES.md` — documento
  extenso escrito para um agente (OpenClaw) diferente do Claude cuidar do
  sistema em caso de emergência. Tem um "protocolo de precisão" rígido (nunca
  afirmar sem `grep`/leitura real, nunca citar arquivo sem confirmar que existe,
  etc.) porque esse agente alucinou fatos sobre o sistema repetidamente antes da
  skill existir. Não precisa seguir esse protocolo aqui (você já lê o código
  antes de falar), mas é uma referência útil sobre pegadinhas reais do projeto.

### Contato do dono

- **Nome:** Tarcyo Alves
- **E-mail:** tarcyo.alves@gmail.com
- **Empresa:** Sal Vita (sal marinho de Mossoró/RN)
