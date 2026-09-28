# Hotfix: faturamento zerado — colunas SMBI sem migração

- **Agente:** claude
- **Início:** 2026-09-28 BRT
- **Fim:** 2026-09-28 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

O `497ebd6` (hermes) declarou 6 colunas novas em `fat_orders` no `schema.ts` sem
`ALTER TABLE` em `migrate.ts` nem bump de `SCHEMA_VERSION`. Todo `select` em
`fat_orders` falha em produção: faturamento aparece zerado e a revisão de pedidos some.
Correção: criar as colunas na migração e subir o `SCHEMA_VERSION`. Não mexo na lógica
do Hermes.

## Arquivos e áreas que vou tocar

- `server/db/migrate.ts`
- `HANDOFF-HERMES.md` (caso M na seção 7)
- `client/src/components/faturamento/BillingReport.tsx` (só o filtro de mês — somava pendentes de outros meses nos totais)

**Não vou tocar em:** `OrderDialog.tsx`, `smbiCatalog.ts`, `store.ts`, `AppShell.tsx`
(trabalho do Hermes).

## Progresso

- [x] Migração das 6 colunas + bump de SCHEMA_VERSION — `96503ec`
- [x] Filtro de mês do relatório não somar pendentes de outros meses — `8177ca3`
- [x] Deploy do `96503ec` READY na Vercel
- [x] Caso M registrado no `HANDOFF-HERMES.md`

---

## Resultado

Faturamento e revisão de pedidos voltam a carregar (colunas criadas no banco). Totais
mensais do relatório voltam a contar só pedidos da competência.

## Commits

`96503ec`, `8177ca3`, `da76a79` + revisão de texto — em `origin/main`.

## Verificado

- `npm run check` 0 erros; `npx vitest run --dir tests` 149 passando.
- Deploy do `96503ec` READY na Vercel.
- Revisão das mudanças do Hermes por subagente (store, nav mobile, badge: ok).

## Não verificado / pendente

- Não tenho acesso ao banco: confirmação final é o dono ver os pedidos de volta.
- **Pergunta ao dono:** os códigos de `client/src/lib/faturamento/smbiCatalog.ts`
  (10 condições de pagamento, 11 produtos, marcados "oficial SMBI") não têm fonte no
  repositório. O `OrderDialog` hoje só aceita prazo dessa lista em pedido novo.
- `pedidoSchema` (server/routers/faturamento.ts) não inclui os 6 campos SMBI: o servidor
  descarta esses valores. Sem efeito hoje (nada os preenche).

## Armadilhas encontradas

- Ver caso M do `HANDOFF-HERMES.md`.
