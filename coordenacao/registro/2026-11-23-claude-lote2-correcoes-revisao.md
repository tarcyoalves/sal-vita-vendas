# Lote 2 — correções confirmadas na revisão (mensagens em dobro, e-mail do atendente, opt-out, login, pequenos)

- **Agente:** claude
- **Início:** 2026-11-23 (BRT)
- **Fim:** 2026-11-23
- **Status:** parcial (commits locais na branch `crm-lote2`; sem push, sem deploy)
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

- [x] A1–A3, B4–B5, C, D, E (ver Resultado)

## Resultado

- A: cron e botão "rodar automação" usam a mesma rotina (`server/lib/recoveryRuns.ts`); crons de pedido não pago e recompra
  fazem claim atômico antes de enviar (e desfazem se nada foi entregue); `trackCart` insere carrinho e cadência numa
  transação com trava por telefone (`server/lib/recoveryTrack.ts`). Nenhum índice único novo.
- B: `renderTemplateHtml` escapa nome/empresa no corpo HTML dos e-mails do CRM; `name` do Disparo Rápido `.max(100)`.
- C: `zapContatos.desmarcarOptOuts` só para staff ou para quem marcou; auditoria em `zap_opt_out_remocoes`.
- D: contador de tentativas no banco (`auth_attempts`) para `auth.login`, `auth.emergencyReset` (falha fechado) e `premiumAuth.login`.
- E: token de reset em SHA-256 (`sha256:` + hex), `/api/unsubscribe` com limitador e UUID, CIDR 0-32, `/api/db-stats` com `CRON_SECRET`, `deleteMany` `.max(2000)` + apagar antes de logar.

## DECISÃO PENDENTE DO DONO (B5)

Hoje o atendente pode disparar (Disparo Rápido) para um e-mail que ELE MESMO confirmou/digitou no mesmo dia
(`tasks.emailConfirmed`). A regra NÃO foi alterada. Foi acrescentado um log estruturado
`{"evt":"broadcast_self_confirmed_same_day","userId":..,"count":..,"of":..}` (só id e contagem) em
`emailMarketing.sendBroadcast` para o dono decidir com dados nos logs da Vercel.

## Schema

- CRM `SCHEMA_VERSION` 2026-11-18a -> 2026-11-23a (tabela `zap_opt_out_remocoes`) -> 2026-11-23b (tabela `auth_attempts`).
- Loja `ORDERS_SCHEMA_VERSION` orders-2026-11-10a -> orders-2026-11-23a (tabela `auth_attempts`).
- `tests/schema-version.lock.json` atualizado. Depois do deploy, procurar `[migrate:build]` no log de build.

## Não verificado / pendente

- Nada foi rodado contra banco real, WhatsApp real nem Resend: tudo com mocks. `db.batch` do neon-http (transação com
  advisory lock) não foi exercitado contra o Neon.
- A extensão Vita Zap (`extensoes/vita-zap/src`) neste checkout ainda não chama `zapContatos.*`; o transporte genérico
  (`crm-rede.ts`) mostra a mensagem do servidor em FORBIDDEN (tipo `proibido`).
- Após o deploy: conferir que `ADMIN_RESET_SECRET` deixou de ser usado em `/api/db-stats` (procurar o aviso no log) e
  migrar o monitoramento para `CRON_SECRET`.

## Armadilhas encontradas

- `premiumAuth.login` agora acorda o banco da loja (antes nenhuma procedure `premiumAuth.*` tocava em banco): ajustado
  em `schemasNecessarios.ts`. `me`/`logout` continuam sem banco.
- Vários testes de código-fonte liam o laço do cron em `api/index.ts`; agora ele está em `server/lib/recoveryRuns.ts`.
- Token de reset: o prefixo `sha256:` é essencial; sem ele, quem lesse a tabela poderia usar o hash como token legado.
