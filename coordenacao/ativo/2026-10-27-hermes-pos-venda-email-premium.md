# Reivindicação de Tarefa: E-mail de Pós-Venda e Confirmação de Entrega (Loja Premium)

- **Agente:** Hermes
- **Data:** 2026-10-27
- **Escopo:**
  1. Adicionar procedure tRPC `shipping.sendPostPurchaseEmail` para disparo manual sob demanda do e-mail de pós-venda ("Chegou tudo bem?") no painel admin da Loja Premium.
  2. Adicionar botões no card de pedidos com status `delivered` no `SalVitaAdmin.tsx`:
     - "Enviar pós-venda (e-mail)"
     - Link para mensagem de pós-venda no WhatsApp.
  3. No backend (`shipping.updateStatus`), ao marcar o status como `delivered`, disparar o e-mail de pós-venda imediatamente de forma segura e idempotente.
  4. Adicionar testes unitários garantindo que o e-mail de pós-venda respeita as regras da ANVISA, formatação e deduplicação.
