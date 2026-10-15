# Etiqueta automática após o pagamento (Melhor Envio)

- **Agente:** claude
- **Início:** 2026-10-15 BRT
- **Status:** em andamento (aguardando aprovação do dono para publicar)
- **Branch:** `main`

## Objetivo

Pedido do dono: gerar a etiqueta sozinha depois do pagamento, com travas (só pago e não
cancelado, confere o saldo do Melhor Envio, e-mail se o saldo acabar, painel mostrando o que
foi gerado).

## Arquivos

`server/routers/shipping.ts` (generateLabelForOrder extraído, autoGenerateLabels, autoLabelReport),
`server/lib/meTracking.ts`, `server/lib/orderConfirmation.ts` (só uma chamada no fim de
confirmOrderPaid), `api/index.ts` (cron), `client/src/pages/SalVitaAdmin.tsx` (painel),
`tests/premium-auto-label.test.ts`.

## Não vou tocar

A lógica de pagamento do Mercado Pago e o webhook; schema e migrações.
