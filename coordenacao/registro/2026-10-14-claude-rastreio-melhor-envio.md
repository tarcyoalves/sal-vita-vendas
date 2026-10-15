# Rastreio automático do Melhor Envio na loja Premium

- **Agente:** claude
- **Início:** 2026-10-14 BRT
- **Fim:** 2026-10-15 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Pedido do dono: tudo automático depois da etiqueta, e o cliente informado **por e-mail** a cada
status do envio (para poupar o WhatsApp não oficial do risco de banimento). Link de rastreio que
funcione para Correios, Jadlog, Azul Cargo e J&T (antes ia sempre para os Correios).

## Como funciona

- **Eventos** (`server/lib/meTracking.ts`): postado, entregue, não entregue, entrega interrompida,
  suspensa. O Melhor Envio **não** informa "saiu para entrega" nem cada movimentação da
  transportadora — para isso o e-mail leva o link do Melhor Rastreio.
- **Fontes:** webhook `POST /api/me-webhook` (em tempo real, assinado com `X-ME-Signature`,
  segredo em `MELHOR_ENVIO_WEBHOOK_SECRET`; sem o segredo recusa tudo) e o cron diário
  `/api/cron/abandoned-cart` (`syncMeTracking`, rede de segurança, consulta
  `/api/v2/me/shipment/tracking`).
- **Um aviso por pedido e evento:** tabela `shipping_events`, chave `(order_id, event)`,
  `INSERT … ON CONFLICT DO NOTHING RETURNING`. Se nada sair (sem e-mail, cota, rede) a linha é
  apagada para tentar de novo. Pedidos já `shipped`/`delivered` antes da automação foram marcados
  como `posted` (`notified='backfill'`) e não recebem aviso de postado. Evento com data de mais de
  4 dias é registrado sem aviso (`notified='antigo'`).
- **Canal:** e-mail (Resend) em todos; WhatsApp só no "postado" e só para quem não tem e-mail ou
  se o e-mail falhar (decisão do dono em 15/10). Ocorrências também viram `[REVISAR]` nas notas.
- **Status do pedido:** postado → `shipped`; entregue → `delivered`; ocorrência não muda o status e
  aparece no `/meu-pedido` (`deliveryIssue`).
- O código de rastreio é gravado logo após gerar a etiqueta, se o Melhor Envio já o tiver.
- Salvar o rastreio à mão no painel usa a mesma trava (não reenvia o "postado").

## Passos do dono (fora do código)

1. No Melhor Envio: Integrações → Área Dev → app da loja → Novo Webhook com a URL
   `https://www.premium.salvitarn.com.br/api/me-webhook`. Só funciona para etiquetas geradas
   pelo mesmo app do token da loja.
2. Na Vercel: variável `MELHOR_ENVIO_WEBHOOK_SECRET` (Production) com o segredo desse app, e Redeploy.
Sem esses passos, os avisos saem só uma vez por dia, no cron das 12h (BRT).

## Arquivos

`server/lib/meTracking.ts` (novo), `server/routers/shipping.ts`, `server/email/resend.ts`,
`server/db/ordersMigrate.ts` (`shipping_events`, versão `orders-2026-10-15a`),
`tests/schema-version.lock.json`, `api/index.ts` (webhook + cron), `client/src/lib/trackingLink.ts`
(novo), `client/src/pages/TrackOrder.tsx`, `client/src/pages/SalVitaAdmin.tsx`,
`tests/premium-me-tracking.test.ts`.
