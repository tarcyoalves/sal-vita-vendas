# Hotfix: faturamento zerado — colunas SMBI sem migração

- **Agente:** claude
- **Início:** 2026-09-28 BRT
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

O `497ebd6` (hermes) declarou 6 colunas novas em `fat_orders` no `schema.ts` sem
`ALTER TABLE` em `migrate.ts` nem bump de `SCHEMA_VERSION`. Todo `select` em
`fat_orders` falha em produção: faturamento aparece zerado e a revisão de pedidos some.
Correção: criar as colunas na migração e subir o `SCHEMA_VERSION`. Não mexo na lógica
do Hermes.

## Arquivos e áreas que vou tocar

- `server/db/migrate.ts`
- `client/src/components/faturamento/BillingReport.tsx` (só o filtro de mês — somava pendentes de outros meses nos totais)

**Não vou tocar em:** `OrderDialog.tsx`, `smbiCatalog.ts`, `store.ts`, `AppShell.tsx`
(trabalho do Hermes).

## Progresso

- [x] Migração das 6 colunas + bump de SCHEMA_VERSION — `96503ec`
- [ ] Filtro de mês do relatório não somar pendentes de outros meses
- [ ] Verificar deploy
