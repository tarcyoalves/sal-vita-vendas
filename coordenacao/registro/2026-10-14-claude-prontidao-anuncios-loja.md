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

- **Fim:** 2026-10-14 BRT · **Status:** concluído

## Resultado

- Domínio sem www sem certificado (não está no projeto Vercel): todas as URLs de cliente,
  Mercado Pago (notification_url/back_urls) e Meta passaram para `www` via `STORE_URL`.
- Frete: só Correios, Jadlog, Azul Cargo e J&T (decisão do dono), ordenado por preço, mais
  barato pré-selecionado. Verificado ao vivo: 1 kg → SP abre em R$ 33,55 (antes R$ 86,05).
- CAPI: IP, user agent, fbp/fbc, zp, country, external_id; 4 colunas novas em site_orders
  (orders-2026-10-14a) — migração confirmada no log do build de produção.
- Pixel: ViewContent separado de AddToCart, ids por pacote; páginas /privacidade e /termos.
- Limites createOrder 30 e pagamentos 40 por 15 min (CGNAT de operadoras móveis).

## Commits

- `b0530cd` — URLs www, transportadoras, CAPI, limites
- `9a3e714` — frete mais barato, Pixel, privacidade e termos

## Verificado

- check 0 erros; 865 testes; build:client/api; migração no build de produção (`[migrate:build] ok`)
- Produção: `/`, `/privacidade`, `/termos`, `/atacado`, `/meu-pedido`, robots, sitemap 200;
  canonical www; `shipping.calculate` real para SP/RN/RS/AM só com as 4 transportadoras.

## Não verificado / pendente

- Compra real (PIX e cartão), recebimento do webhook e evento na Meta — ver ESTADO §6 item 00.
- Variáveis de ambiente (a IA não tem permissão de listar).
- Purchase do Pixel usa `salvita-001`; eventos anteriores usam ids por pacote.

## Armadilhas encontradas

- DNS apontando para a Vercel não basta: o domínio precisa estar no projeto para ter certificado.
- O primeiro frete do Melhor Envio é Correios, não o mais barato.
- Plano Hobby da Vercel guarda só 1 h de logs: não há histórico para provar entregas de webhook.
