# Etiqueta automÃ¡tica apÃ³s o pagamento (Melhor Envio)

- **Agente:** claude
- **InÃ­cio:** 2026-10-15 BRT
- **Status:** em andamento (aguardando aprovaÃ§Ã£o do dono para publicar)
- **Branch:** `main`

## Objetivo

Pedido do dono: gerar a etiqueta sozinha depois do pagamento, com travas (sÃ³ pago e nÃ£o
cancelado, confere o saldo do Melhor Envio, e-mail se o saldo acabar, painel mostrando o que
foi gerado).

## Arquivos

`server/routers/shipping.ts` (generateLabelForOrder extraÃ­do, autoGenerateLabels, autoLabelReport),
`server/lib/meTracking.ts`, `server/lib/orderConfirmation.ts` (sÃ³ uma chamada no fim de
confirmOrderPaid), `api/index.ts` (cron), `client/src/pages/SalVitaAdmin.tsx` (painel),
`tests/premium-auto-label.test.ts`.

## NÃ£o vou tocar

A lÃ³gica de pagamento do Mercado Pago e o webhook; schema e migraÃ§Ãµes.
