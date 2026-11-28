# Sal Vita Sales AI — ecossistema de vendas B2B (caixa de 10 kg)

- **Agente:** claude
- **Início:** 2026-11-28 BRT
- **Fim:** —
- **Status:** em andamento
- **Branch:** `claude/sales-ai-b2b` (nada vai para `main` sem autorização do dono)

## Objetivo

Construir o ecossistema descrito no projeto V3.1 (documento do dono, fora do repositório):
base de empresas Premium no Radar, página `/atacado` voltada à caixa de 10 kg, vendedor
virtual no site, máquina de estados das jornadas, contrato com o Hermes e painel
"Vendas B2B" no admin da loja. Envio de e-mail comercial fica DESLIGADO (modo `DRY_RUN`,
canal desativado) até o dono escolher a caixa de envio.

## Arquivos e áreas que vou tocar

Arquivos novos (feature nova em arquivo novo):
- `shared/sales*.ts`, `server/lib/sales/**`, `server/db/salesMigrate.ts`
- `server/salesRoutes.ts` (rotas `/api/sales/*` do Hermes)
- `server/routers/sales.ts`, `server/routers/salesAgent.ts`, `server/routers/salesPublic.ts`
- `client/src/components/sales/**`, `client/src/pages/admin/sales/**`
- `shared/radarPremium.ts`, `scripts/sales/**`, `docs/CONTRATO-HERMES-VENDAS.md`, `docs/HERMES-SKILLS-VENDAS.md`
- `tests/sales-*.test.ts`

Arquivos existentes, só acréscimos:
- `server/db/schema.ts` (tabelas `sales_*` no fim), `scripts/schema-lock.mjs`, `tests/schema-version.lock.json`
- `scripts/migrate-build.ts`, `scripts/migrate-build-plan.ts`
- `api/index.ts` (registrar rotas e a migração da loja), `server/lib/schemasNecessarios.ts`,
  `server/lib/premiumSession.ts`, `server/routers/index.ts`
- `client/src/pages/Atacado.tsx`, `client/src/pages/SalVitaAdmin.tsx`
- `scripts/radar/import-receita.ts`, `server/lib/radar/*` (só para incluir o perfil Premium)

**Não vou tocar em:** checkout e pagamento, webhooks, robô SMBI, crédito, faturamento,
e-mail marketing existente, carrinho abandonado (o árbitro entra atrás de interruptor desligado).

## Progresso

- [ ] Alicerce: tabelas, migração, contratos e regras puras
- [ ] API do Hermes, ciclo, ponte Radar → prospecção, relatórios
- [ ] Vendedor virtual
- [ ] Painel "Vendas B2B"
- [ ] Segmentos Premium no Radar
- [ ] `/atacado` da caixa de 10 kg
- [ ] Lado do Hermes: contrato, skills, auditoria da VPS, executor
