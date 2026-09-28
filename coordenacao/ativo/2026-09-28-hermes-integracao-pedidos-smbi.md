# Reivindicação: Integração de Pedidos CRM x SMBI

- **Agente:** Hermes
- **Início:** 2026-09-28
- **Objetivo:** Adicionar campos de integração com o ERP SMBI (`smbi_movsai_id`, `numero_nfe`, `numero_cte`, mapeamento de produtos e códigos de condição de pagamento) na esteira de faturamento e revisão de pedidos do CRM.
- **Arquivos impactados:**
  - `server/db/schema.ts`
  - `client/src/lib/faturamento/types.ts`
  - `client/src/components/faturamento/OrderDialog.tsx`
  - `client/src/lib/faturamento/smbiCatalog.ts`
