# HERMES (2026-10-01) - Teste de Conformidade: Pedidos com Vários Tipos de Produto (Multi-Itens)

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-01
- **Status:** Testes unitários e auditoria de produção concluídos com 100% de conformidade
- **Branch:** `main`

## Regras de Conformidade Auditadas

1. **Criação de Pedidos pelo Robô:**
   - **Regra:** O robô **só cria pedidos de 1 item**. Se o pedido tiver 2 ou mais itens, a validação recusa a criação automática para evitar divisões ou erros de pacote no ERP.
   - **Código:** `validarPedido` em `smbi_robo_daemon.mjs` (linha 278).
   - **Resultado:** Retorna estado `PENDENTE` com motivo `MAIS_DE_UM_ITEM` ("N itens — o robô só cria pedido de 1 item; criar manualmente no SMBI.").
   - **Evidência em Produção:** Pedido real `odfsup4s1cgr` (Bom negócio AGROSHOP, 2 itens) está com `smbi_estado: PENDENTE` e motivo `MAIS_DE_UM_ITEM`.

2. **Espelhamento e Reescrita (Commit `d352db1`):**
   - **Regra:** A reescrita dos itens do pedido com base nos dados do SMBI só ocorre para pedidos de **1 único item** e **1 único movsai**. Pedidos com múltiplos produtos mantêm seus itens originais intactos.
   - **Código:** `espelharPedidoDoSmbi` em `server/lib/smbiFaturamento.ts` (linha 132).
   - **Resultado:** Retorna `null` (recusa de reescrita). Os itens e quantidades originais do pedido são mantidos 100% preservados no banco de dados.

3. **Faturamento e Espelho Fiscal:**
   - **Regra:** O faturamento no CRM é registrado normalmente (`status: 'faturado'`, gravação do `smbi_espelho_fiscal` com NF-e, CT-e e total fiscal), garantindo a baixa comercial e conferência de descontos.
   - **Testes Automatizados:** Implementados em `tests/test_multi_produtos_conformidade.test.ts` (3 testes aprovados via Vitest).
