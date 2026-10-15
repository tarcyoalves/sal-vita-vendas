# Segurança: PII em logs, segredo de webhook por cabeçalho, CSP, revisão de api/index.ts

- **Agente:** claude
- **Início:** 2026-10-15 BRT
- **Status:** em andamento (worktree isolado, sem push)
- **Branch:** `worktree-agent-a436dea8590a7e71a`

## Objetivo

Fechar pendências de segurança: (A) mascarar PII em console.*; (B) webhook do Brevo aceitar
segredo por cabeçalho (query vira fallback temporário); (C) endurecer cabeçalhos/CSP no
`vercel.json`; (D) revisão de rotas sem auth, cookies, CORS, uploads.

## Arquivos e áreas

- `server/lib/logSafe.ts` (novo), `tests/log-safe.test.ts` (novo)
- `server/lib/webhookSecret.ts` (novo) + teste
- `vercel.json` (só `headers`)
- Linhas de `console.*` em `api/index.ts`, `server/email/*`, `server/routers/{tasks,shipping,recovery,faturamento,unsubscribe,resendWebhook,prospectingRadar,emailMarketing}.ts`, `server/lib/orderConfirmation.ts`
- Rota `/api/brevo-webhook` em `api/index.ts`

**Sobreposição conhecida:** `api/index.ts`, `shipping.ts` e `orderConfirmation.ts` também estão na
reivindicação `claude-etiqueta-automatica`. Aqui só mudam linhas de log (`safeErr(...)`) e um import
no topo; o merge deve ser trivial, mas quem integrar confira.

**Não vou tocar:** `package.json`, `server/db/migrate.ts`, lógica de pagamento/etiqueta.
