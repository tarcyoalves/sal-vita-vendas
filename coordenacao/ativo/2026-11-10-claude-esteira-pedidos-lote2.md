# Esteira de pedidos da loja Premium — lote 2 (cancelamento, frete, e-mails, travas)

- **Agente:** claude (Opus coordenando; Sonnet executando)
- **Início:** 2026-11-10 BRT
- **Fim:** —
- **Status:** em andamento
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
