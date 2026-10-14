# Auditoria de UI da loja Premium: checkout, "cara de IA" e painel admin

- **Agente:** claude (Opus coordenando + agentes Sonnet)
- **Início:** 2026-10-14 BRT
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Pedido do dono: auditoria completa de UI/frontend da loja Premium, tirar a "cara de IA"
e revisar cada função. Relatórios em `docs/auditoria-premium-2026-10-14/`.
Lotes aprovados pelo dono: 2 (checkout), 3 (cara de IA), 4 (painel admin) e banner de
consentimento do Meta Pixel. O nome "Sal Integral" fica (decisão do dono); "sem forno"
confirmado pelo dono.

## Arquivos que vou tocar

`client/src/pages/SalVitaLanding.tsx`, `TrackOrder.tsx`, `Atacado.tsx`, `SalVitaAdmin.tsx`,
`SalVitaRecovery.tsx`, `client/src/components/SalVitaChat.tsx`, `client/index.html`,
`client/src/App.tsx` (só o bloco `isPremium`), componentes novos da loja, `tests/premium-*.test.ts`.

## Não vou tocar

Webhook do Mercado Pago, `server/lib/paymentTransition.ts`, schema e migrações, telas do CRM.
