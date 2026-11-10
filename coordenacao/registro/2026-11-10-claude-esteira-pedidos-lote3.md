# Esteira de pedidos da loja Premium — lote 3

- **Agente:** claude (Opus coordenando; Sonnet no servidor, Haiku nas telas)
- **Início:** 2026-11-10 BRT
- **Fim:** 2026-11-10 BRT
- **Status:** concluído
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

## Commits

- `0c5b493` — histórico do admin (tabela admin_order_actions, orders-2026-11-10a), validação no
  servidor, cota de e-mail transacional separada, WhatsApp sem inserir 9, cupom no e-mail, CSV

## Verificado

- check 0 erros; 1679 testes sem variáveis de banco; build:client e build:api.

## Atenção

- Cota: marketing passou de 90 para 70/dia por padrão (`server/email/marketing.ts`,
  `marketingQuota.ts`) para sobrar 30 aos e-mails de pedido. Toca o CRM também (mesma conta
  Resend). Se `RESEND_MKT_DAILY_LIMIT` estiver na Vercel com 90, baixar para 70.
- CPF continua opcional no schema do createOrder (a loja sempre envia); validado quando vem.

## Pendente (dono)

- Textos dos templates no banco (aba Mensagens) e passo dia 0 da Pós-compra.
- Etiqueta de teste Jadlog/Azul/J&T.
