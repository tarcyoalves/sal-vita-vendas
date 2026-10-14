# Rastreio automático do Melhor Envio na loja Premium

- **Agente:** claude
- **Início:** 2026-10-14 BRT
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Depois que a etiqueta é gerada, consultar o rastreio no Melhor Envio (`/api/v2/me/shipment/tracking`)
no cron diário: na postagem grava o código, marca `shipped` e manda UMA vez o WhatsApp de
pedido enviado; na entrega marca `delivered`. Link de rastreio que funcione para Correios, Jadlog,
Azul Cargo e J&T (hoje vai sempre para os Correios). Gravar o código já ao gerar a etiqueta.

## Arquivos que vou tocar

`server/routers/shipping.ts` (geração de etiqueta, `updateTracking`, `sendTrackingWhatsApp`, link),
`server/lib/meTracking.ts` (novo), `api/index.ts` (só uma chamada no cron `/api/cron/abandoned-cart`),
`client/src/pages/TrackOrder.tsx` e `client/src/pages/SalVitaAdmin.tsx` (só o link/rótulo de rastreio),
`client/src/lib/trackingLink.ts` (novo), `tests/premium-me-tracking.test.ts` (novo).

## Não vou tocar

Webhook do Mercado Pago, `paymentTransition.ts`, schema e migrações.
