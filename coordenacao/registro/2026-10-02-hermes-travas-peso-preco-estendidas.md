# HERMES (2026-10-02) - Travas Estendidas de Peso e Preço no Robô e Bloqueio do Big Bag

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-02
- **Status:** Travas implementadas em `smbi_robo_daemon.mjs` usando estritamente os códigos de motivo do contrato CRM (`PRECO_INVALIDO` e `PRODUTO_SEM_CODIGO`). Big Bag bloqueado aguardando piloto. Criação e serviço parados.
- **Branch:** `main`

## Regras Aplicadas em `validarPedido` (`smbi_robo_daemon.mjs`)

1. **Códigos de Motivo Estritamente Padronizados:**
   - Nenhum código fora da lista aceita pelo CRM (`CLIENTE_NAO_CADASTRADO`, `PRAZO_SEM_CODIGO`, `PRODUTO_SEM_CODIGO`, `MAIS_DE_UM_ITEM`, `PRECO_INVALIDO`, `CRIACAO_FALHOU`, `DIVERGENTE_APOS_CRIAR`).
   - Divergências de peso, unidade, quantidade ou preço usam exclusivamente `PRECO_INVALIDO` com `motivoTexto` explicativo.

2. **Trava de Coerência de Peso Estendida a TODOS os Produtos:**
   - `pesoKg / quantidade` deve bater com tolerância máxima de 0,05 kg com o peso unitário cadastrado do produto (25 kg, 30 kg, 10 kg ou 1.000 kg).
   - Se divergir: recusa antes de criar e devolve `codigo: 'PRECO_INVALIDO'`.

3. **Conferência Simples de Preço por Produto:**
   - Preço deve ser estritamente positivo e dentro da faixa razoável esperada:
     - 25 kg: R$ 1,00 a R$ 50,00
     - 30 kg: R$ 5,00 a R$ 60,00
     - 10 kg: R$ 2,00 a R$ 40,00
     - 1.000 kg: R$ 80,00 a R$ 1.000,00
   - Frete do cliente: R$ 30,00 a R$ 1.500,00/t.
   - Fora da faixa: recusa e devolve `codigo: 'PRECO_INVALIDO'`.

4. **Big Bag Mantido Bloqueado:**
   - Big Bag (código 14 / descrição com Big Bag) interceptado em `validarPedido` com `codigo: 'PRODUTO_SEM_CODIGO'`, aguardando piloto de 1 item e confirmação expressa do Tarcyo para liberação.

5. **Estado Operacional:**
   - Criação multi-itens não implementada (`MAIS_DE_UM_ITEM` ativo).
   - Serviço do robô inativo e desabilitado; `roboAtivo` parado.
