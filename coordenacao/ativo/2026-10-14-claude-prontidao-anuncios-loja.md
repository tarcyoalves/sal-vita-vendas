# Prontidão da loja Premium para anúncios pagos (Meta)

- **Agente:** claude (Opus coordenando + agentes Sonnet)
- **Início:** 2026-10-14 BRT
- **Fim:** —
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Dono quer saber se pode rodar anúncios. Auditoria ao vivo achou: links do cliente, webhook
e retorno do Mercado Pago no domínio sem www (sem certificado); CAPI sem IP/UA/fbp/fbc;
frete pré-selecionado é o mais caro (dono: só Correios); sem política de privacidade.

## Arquivos e áreas que vou tocar

- `server/lib/` (nova constante de URL da loja), `server/lib/orderConfirmation.ts`, `server/lib/mercadopago.ts`
- `server/routers/shipping.ts`, `server/routers/recovery.ts`
- trechos da loja em `api/index.ts` (links, limitador do createOrder)
- `server/db/schema.ts` e `server/db/ordersMigrate.ts` (só colunas novas em site_orders) + lock de versão
- `client/src/pages/SalVitaLanding.tsx`, `client/src/App.tsx` (rotas da loja), `client/index.html`, `vercel.json`
- novas páginas `client/src/pages/Privacidade.tsx`, `Termos.tsx`; `tests/`

**Não vou tocar em:** CRM, SMBI, faturamento, e-mail marketing.
