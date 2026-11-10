# Esteira de pedidos da loja Premium — lote 3

- **Agente:** claude (Opus coordenando; Sonnet no servidor, Haiku nas telas)
- **Início:** 2026-11-10 BRT
- **Fim:** —
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Histórico de ações do admin (tabela nova no banco do Premium), CSV completo, validações do
checkout (nome, telefone, e-mail, CPF no servidor), cota de e-mail transacional separada do
marketing, WhatsApp sem mandar para variação inexistente de fixo, link do cupom no e-mail.
Textos dos templates no banco: o dono vê depois.

## Arquivos e áreas que vou tocar

- `server/db/schema.ts`, `server/db/ordersMigrate.ts` (tabela `admin_order_actions`), `tests/schema-version.lock.json`
- `server/routers/shipping.ts`, `server/lib/` (loja), `server/email/resend.ts`, trechos da loja em `api/index.ts`
- `client/src/pages/SalVitaAdmin.tsx`, `client/src/pages/SalVitaLanding.tsx`, `client/src/lib/checkoutLogic.ts`
- `tests/premium-*.test.ts`

**Não vou tocar em:** CRM, Vita Zap, SMBI, análise de crédito, templates gravados no banco.
