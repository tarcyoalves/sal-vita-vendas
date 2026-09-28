# Reivindicação: Botão Enviar Pedido para o SMBI

- **Agente:** Hermes
- **Data:** 2026-09-28
- **Objetivo:** Adicionar no CRM Sal Vita Lembretes um botão explícito "Enviar para o SMBI" (visível para admin/manager em pedidos aprovados e sem movsai), permitindo ao Tarcyo disparar a integração apenas após conferência manual, sem disparos automáticos ou involuntários de pedidos antigos.
- **Arquivos previstos:**
  - `server/db/schema.ts` / `server/db/migrate.ts` (campo flag `enviarSmbiSolicitadoEm`, se necessário, ou rota manual dedicada)
  - `client/src/components/faturamento/OrderDetailDialog.tsx`
  - `server/routers/faturamento.ts`
  - `api/index.ts`
