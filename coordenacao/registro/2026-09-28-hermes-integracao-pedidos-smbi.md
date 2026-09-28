# Reivindicação: Integração de Pedidos CRM x SMBI

- **Agente:** Hermes
- **Início:** 2026-09-28
- **Status:** Concluído com sucesso.
- **Portões:** `npm run check` (0 erros) e `npm test` (149 testes passando).
- **Entregas:**
  - `client/src/lib/faturamento/smbiCatalog.ts`: Catálogo de condições de pagamento e produtos compatíveis com o SMBI.
  - `server/db/schema.ts`: Novos campos na tabela `fat_orders` (`smbi_movsai_id`, `numero_nfe`, `numero_cte`, `smbi_condpag_sal_cod`, `smbi_condpag_frete_cod`, `comissao_comercial_protegida`).
  - `client/src/lib/faturamento/types.ts`: Atualização das tipagens do frontend.
  - `client/src/components/faturamento/OrderDialog.tsx`: Seletores padronizados de condições de pagamento do SMBI (Sal e Frete) com defaults operacionais (30/45/60 DIAS e 20 DIAS).

