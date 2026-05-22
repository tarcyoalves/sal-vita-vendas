# Handoff — Sal Vita Lembretes (maio/2026)

> Gerado em 22/05/2026. Leia antes de continuar qualquer chat de IA neste projeto.

---

## Situação atual

O sistema estava fora do ar (`504 Gateway Timeout`) por falhas de conexão no banco Supabase. A solução foi migrar para um novo banco **Neon PostgreSQL** adicionando a variável `NEON_DATABASE_URL` no Vercel.

Todos os commits foram feitos em `main`. O último deploy está em andamento no Vercel (commit `8f2c733`).

---

## O que foi feito (resumo cronológico)

### 1. Diagnóstico do problema original
- O banco **Supabase** (`DATABASE_URL`) estava retornando `504` intermitente em produção.
- A causa raiz era instabilidade na conexão ao endpoint Supabase (timeouts de TCP).

### 2. Troca de banco: Supabase → Neon
- Criado novo projeto Neon (`polished-silence-82035475`, região `sa-east-1`).
- A variável `NEON_DATABASE_URL` foi adicionada no painel Vercel (Settings → Environment Variables).
- **`DATABASE_URL` foi mantida intacta** — `NEON_DATABASE_URL` funciona como override.
- Todos os pontos de conexão do código já usam o padrão:
  ```typescript
  const dbUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL!;
  ```

### 3. Arquivos modificados

| Arquivo | O que mudou |
|---------|-------------|
| `server/db/index.ts` | Usa `NEON_DATABASE_URL ?? DATABASE_URL`; pré-aquece pool no cold start |
| `server/db/migrate.ts` | Usa `NEON_DATABASE_URL ?? DATABASE_URL`; `connect_timeout: 20`; probe corrigido (ver abaixo) |
| `api/index.ts` | `autoMigrateIfNeeded()` usa `NEON_DATABASE_URL ?? DATABASE_URL` como destino; `withTimeout` estendido para 30 s |

### 4. Bug crítico corrigido (commit `8f2c733`)

**Problema:** O Vercel Lambda congela após enviar a resposta HTTP. A função `ensureTablesExist()` roda em background e pode ser congelada no meio da execução — criando apenas a tabela `users` e não criando `sellers`, `tasks`, `clients`, `reminders`.

Na próxima inicialização a sonda antiga verificava **só** a tabela `users`:
```sql
WHERE table_schema = 'public' AND table_name = 'users'
```
Encontrava `users`, logava "✅ Tables already exist — skipping DDL" e **pulava o restante das tabelas para sempre**.

**Correção:** A sonda agora verifica **todas as 5 tabelas críticas** e só pula o DDL se todas existirem:
```sql
WHERE table_schema = 'public'
  AND table_name IN ('users', 'sellers', 'tasks', 'clients', 'reminders')
```
```typescript
if ((check[0]?.cnt ?? 0) >= 5) { /* skip */ }
```
Como todo DDL usa `CREATE TABLE IF NOT EXISTS`, re-executar é sempre seguro.

---

## Estado do banco Neon agora

- **Endpoint:** `ep-floral-heart-acvnu3w7-pooler.sa-east-1.aws.neon.tech`
- **Banco:** `neondb`
- **Projeto Neon:** `polished-silence-82035475`
- **Tabelas presentes após deploy atual:** provavelmente só `users` (criada antes do fix)
- **Após o próximo cold start** (com o novo deploy `8f2c733`): a sonda vai detectar que faltam tabelas e vai criar todas automaticamente.

### Usuário admin (seed automático em DB vazio)
```
Email: tarcyo.alves@gmail.com
Senha: admin123
```
O seed roda automaticamente dentro de `ensureTablesExist()` se `users` estiver vazia.

---

## Variáveis de ambiente no Vercel

| Variável | Descrição | Status |
|----------|-----------|--------|
| `NEON_DATABASE_URL` | Nova string Neon (override) | **Adicionada pelo usuário** |
| `DATABASE_URL` | Antiga string Supabase | Mantida (fallback) |
| `JWT_SECRET` | Segredo JWT | Pré-existente |
| `ADMIN_RESET_SECRET` | Recuperação de senha admin | Pré-existente |
| `GEMINI_API_KEY` | Google Gemini (IA) | Pré-existente |
| `GROQ_API_KEY` | Groq (IA alternativa) | Pré-existente |
| `ALLOWED_ORIGINS` | Origens CORS extras | Pré-existente |
| `NODE_ENV` | `production` | Pré-existente |

> **Nunca** hardcode secrets no código. Todas as chaves ficam **só** no painel Vercel.

---

## O que ainda pode precisar de atenção

### 1. Dados dos atendentes (sellers)
Como o banco Neon é novo, os registros de sellers/atendentes precisam ser re-cadastrados pelo admin, ou migrados manualmente do Supabase antigo via endpoint:

```
POST https://lembretes.salvitarn.com.br/api/migrate-from-neon
```

O endpoint lê `CRM_DATABASE_URL` (banco de origem) e copia os dados para o banco atual. Se `CRM_DATABASE_URL` não estiver configurada no Vercel, a migração automática não acontece e os dados precisam ser inseridos manualmente.

### 2. Verificar se o login funciona
Após o próximo cold start com `8f2c733`:
1. Acessar `https://lembretes.salvitarn.com.br`
2. Fazer login com `tarcyo.alves@gmail.com` / `admin123`
3. Verificar se o dashboard abre normalmente
4. Verificar se a tela de Atendentes carrega

### 3. Se sellers ainda não aparecerem
Checar os logs do Vercel em **Settings → Functions → Logs** e procurar por:
- `⚠️ Only X/5 core tables found — running DDL` — indica que o fix rodou
- `✅ Tables already exist — skipping DDL` — indica que todas as 5 tabelas existem
- `❌ Migration error` — indica falha na criação das tabelas

---

## Arquitetura resumida

```
[Browser / PWA]
      │ HTTPS
      ▼
[Vercel CDN]
  ├── /           → client/dist/index.html  (React SPA)
  └── /api/*      → api/bundle.js           (Express serverless)
                         │
                         ▼
               [Neon PostgreSQL — sa-east-1]
               ep-floral-heart-acvnu3w7-pooler
```

### Stack
- **Frontend:** React 19 + TypeScript + Vite + Wouter (não react-router-dom)
- **API client:** tRPC + TanStack Query
- **Backend:** Express.js serverless via Vercel Functions
- **Banco:** PostgreSQL Neon + Drizzle ORM
- **Auth:** JWT em cookie HttpOnly (30 dias)
- **IA:** Google Gemini + Groq

### Regras obrigatórias
1. Roteamento: `wouter` — nunca `react-router-dom`
2. API calls: sempre via tRPC — nunca `fetch` direto
3. Banco: sempre Drizzle ORM — nunca SQL raw
4. Entry point backend em produção: `api/index.ts`
5. Commits em inglês, sempre em `main`
6. Deploy: `git push origin main` → Vercel faz deploy automático

---

## Commits desta sessão

| Hash | Descrição |
|------|-----------|
| `8f2c733` | fix: probe all 5 core tables before skipping DDL ← **último** |
| `004c1fb` | fix: increase migration connect_timeout and proceed to DDL on probe failure |
| `4659655` | feat: support NEON_DATABASE_URL to switch CRM DB from Supabase to Neon |
| `829023f` | fix: increase source DB connect timeout to 10 s for Neon auto-suspend |
| `f35d868` | fix: isolate auto-migrate from main pool to prevent cold-start 500s |
| `909b966` | perf: fast-path cold-start migration and reduce auto-migrate timeouts |

---

## Como continuar num novo chat

1. Leia este arquivo (`HANDOFF.md`) e o `CLAUDE.md` do projeto.
2. O próximo passo imediato é **verificar se o login funciona** após o deploy de `8f2c733`.
3. Se funcionar: sistema restaurado. Recadastrar atendentes se necessário.
4. Se não funcionar: checar logs Vercel (Functions → Logs) e compartilhar a mensagem de erro.

> Branch de desenvolvimento ativa: `claude/debug-reminder-saas-hkFb5`
> Produção: `main` → deploy automático Vercel
