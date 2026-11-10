# Esteira de pedidos da loja Premium — lote 1 (falhas silenciosas)

- **Agente:** claude (Opus coordenando; Sonnet no backend, Haiku no painel)
- **Início:** 2026-11-10 BRT
- **Fim:** 2026-11-10 BRT
- **Status:** concluído
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

## Commits

- `a6028b6` — painel: `[REVISAR]` visível + aba, notas não se apagam, wa.me com 55, rastreio
- `7a9e925` — confirmação pelo pixStatus (rotina única), retry do webhook em 5xx/429, alertas ao
  dono, recuperação não atinge quem comprou, cobrança certa, etiqueta/rastreio fora do gate do
  WhatsApp, teto de frete, textos proibidos

## Verificado

- check 0 erros; 1616 testes; build:client e build:api.

## Pendente (próximos lotes — análise de 10/11)

- Templates gravados no banco (aba Mensagens do painel) ainda dizem "estoque é limitado",
  "ofertas por tempo limitado", "pedido reservado por tempo limitado" (seeds em
  `ordersMigrate.ts` ~L257-273); idem `server/routers/recovery.ts:216`. Dono pode editar pelo painel.
- Cancelamento: pedido confirmado à mão não é reembolsado (a tela promete), cancelar enviado,
  sem aviso ao cliente, cupom não devolvido.
- Frete: cotação sem seguro x etiqueta com seguro; pesos líquidos no CATALOG; fallback estático
  sem marcação; NF-e/declaração e documento do remetente para Jadlog/Azul/J&T não provados.
- Travas de status no `updateStatus`, histórico de ações do admin, CSV, validações do formulário.
- E-mails saem de `noreply@` mas o pós-venda diz "responda este e-mail"; dois "chegou bem?".
- Cota diária do Resend compartilhada com marketing; WhatsApp enviado às duas variações do número.
