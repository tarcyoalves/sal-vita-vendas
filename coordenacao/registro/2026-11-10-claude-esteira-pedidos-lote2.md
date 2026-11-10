# Esteira de pedidos da loja Premium — lote 2 (cancelamento, frete, e-mails, travas)

- **Agente:** claude (Opus coordenando; Sonnet executando)
- **Início:** 2026-11-10 BRT
- **Fim:** 2026-11-10 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Cancelamento (reembolso prometido e não feito, cancelar enviado, aviso ao cliente, cupom),
seguro da cotação = seguro da etiqueta, marcar frete estimado, reply-to dos e-mails
(contato@salvitarn.com.br, decisão do dono), e-mail "chegou bem?" duplicado, travas de status.
Peso: dono decidiu manter 1 kg por unidade.

## Arquivos e áreas que vou tocar

- `server/routers/shipping.ts`, `server/email/resend.ts`, `server/lib/` (loja)
- `client/src/pages/SalVitaAdmin.tsx`
- `tests/premium-*.test.ts`

**Não vou tocar em:** CRM, Vita Zap, SMBI, análise de crédito, schema/migrações.

## Commits

- `325d77b` — cancelamento, seguro do frete, reply-to, pós-venda único, travas de status

## Verificado

- check 0 erros; 1639 testes; build:client e build:api.

## Pendente

- Sequência Pós-compra (inativa): o passo dia 0 já gravado no banco mantém o texto antigo
  ("chegou bem?"). Antes de ativar, editar o passo 1 no editor de sequências.
- Pedido pago via MP cancelado fica `paymentStatus=confirmed` até o webhook de estorno chegar.
- Próximo: histórico de ações do admin (precisa tabela), CSV, validações do formulário,
  etiqueta de teste Jadlog/Azul/J&T, cota do Resend separada, envio WhatsApp às duas variações.
