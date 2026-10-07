# Auditoria completa da loja Premium (storefront)

- **Agente:** claude (Opus coordenando + agentes Sonnet executores)
- **Início:** 2026-10-07 BRT
- **Fim:** —
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Pedido do dono: auditoria completa da loja `premium.salvitarn.com.br` (jornada de
compra, checkout, segurança, mobile, SEO, performance, acessibilidade, "cara de IA")
e correção do que for encontrado, priorizando P0→P3. O redesign de 07/10 cobriu só o
CRM ("Não tocado: telas do Premium"); esta é a lacuna. Também revisar um relatório do
Gemini que descreve mudanças que não existem no repositório.

## Arquivos e áreas que vou tocar

- `client/src/pages/SalVitaLanding.tsx`, `SalVitaLandingClassic.tsx`
- `client/src/pages/TrackOrder.tsx`, `Atacado.tsx`
- `client/src/components/SalVitaChat.tsx`
- `client/index.html`, `client/public/` (robots, sitemap, imagens da loja)
- `server/routers/shipping.ts`, `server/routers/b2b.ts`, `server/lib/orderConfirmation.ts`
- `server/db/ordersDb.ts`, `server/db/ordersMigrate.ts`
- trechos do Premium em `api/index.ts` (mp-webhook, orders-health, b2b inbound, cron abandoned-cart)
- `vite.config.ts` / `client/src/App.tsx` (só se fizer code-splitting Premium × CRM)
- `tests/` (novos testes do Premium)

**Não vou tocar em:** telas e routers do CRM (tasks, sellers, clients, emailMarketing,
faturamento, smbi, radar, ai, tv, workSessions), `docs/DESIGN-SYSTEM.md`, primitivos
`components/ui/*`, `AppShell`.

## Progresso

- [ ] Inventário e auditoria (somente leitura) por dimensão
- [ ] Triagem P0–P3
- [ ] Correções P0/P1
- [ ] Correções P2/P3
- [ ] Gates + render 320/390/1280 + segunda revisão
