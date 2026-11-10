# Esteira de pedidos da loja Premium — lote 1 (falhas silenciosas)

- **Agente:** claude (Opus coordenando; Sonnet no backend, Haiku no painel)
- **Início:** 2026-11-10 BRT
- **Fim:** —
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Corrigir os casos em que dinheiro ou cliente se perdem em silêncio, achados na análise da
esteira de 10/11: confirmação só no cron diário, dono sem aviso, `[REVISAR]` invisível,
recuperação de carrinho para quem já comprou, "84+ minerais" em e-mail, etiqueta/rastreio
presos ao WhatsApp, link wa.me sem 55, teto de frete R$ 200.

## Arquivos e áreas que vou tocar

- `api/index.ts` (só webhook MP, cron abandoned-cart, unpaid follow-up, reconcile)
- `server/routers/shipping.ts` (pixStatus, createOrder teto de frete), `server/lib/orderConfirmation.ts`
- `server/email/resend.ts` (texto de recuperação)
- `client/src/pages/SalVitaAdmin.tsx`, `client/src/pages/TrackOrder.tsx`
- `tests/premium-*.test.ts`

**Não vou tocar em:** CRM, Vita Zap, SMBI, análise de crédito, e-mail marketing do CRM.
