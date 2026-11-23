# Lote 2 — correções confirmadas na revisão (mensagens em dobro, e-mail do atendente, opt-out, login, pequenos)

- **Agente:** claude
- **Início:** 2026-11-23 (BRT)
- **Fim:** <preencher ao concluir>
- **Status:** em andamento
- **Branch:** `crm-lote2` (worktree local, criado de origin/main; sem push)

## Objetivo

Corrigir itens confirmados numa revisão: envio em dobro de WhatsApp (botão
"rodar automação", crons de pedido não pago e recompra, `recovery.trackCart`),
injeção de HTML pelo nome no e-mail do atendente, "Não enviar mais" (Vita Zap),
limite de tentativas de login compartilhado no banco e pequenos ajustes de
segurança (token de reset em SHA-256, `/api/unsubscribe`, CIDR, `/api/db-stats`,
`tasks.deleteMany`).

## Arquivos e áreas que vou tocar

- `server/lib/recoveryRuns.ts` (novo), `api/index.ts` (crons de abandono, não pago,
  recompra, `/api/unsubscribe`, `/api/db-stats`; NÃO os handlers de webhook de e-mail)
- `server/routers/recovery.ts` (`runAutomationJob`, `trackCart`)
- `server/routers/emailMarketing.ts` (só `recipients[].name`), `server/email/campaigns.ts`,
  `server/email/marketing.ts` (`renderTemplate`)
- `server/routers/zapContatos.ts`
- `server/routers/auth.ts`, `server/routers/premiumAuth.ts`, `server/trpc.ts` (CIDR),
  `server/db/migrate.ts` / `ordersMigrate.ts` (tabela `auth_attempts`), `server/db/schema.ts`
- `server/routers/tasks.ts` (somente `deleteMany`)
- `tests/`, `api/bundle.js`

**Não vou tocar em:** `Tasks.tsx`, `tasks.ts` (update), `ai.ts`, `llm.ts`,
`SalVitaEmailMarketing.tsx`, `premiumEmailMarketing.ts`, handlers de webhook de e-mail
em `api/index.ts`, `resendWebhook.ts` (outro agente).

## Progresso

- [ ] A1–A3, B4–B5, C, D, E
