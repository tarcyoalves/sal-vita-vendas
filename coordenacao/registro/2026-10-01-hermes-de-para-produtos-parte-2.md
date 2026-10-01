# HERMES (2026-10-01) - Parte 2: Consolidação do De-Para de Produtos e Decisões do Tarcyo

- **Agente:** Hermes (antigravity/gemini-3.8-flash-tiered)
- **Data:** 2026-10-01
- **Status:** Decisões aplicadas no catálogo do robô; criação multi-itens mantida estritamente pausada; pronto para piloto de 1 item.
- **Branch:** `main`

## Decisões Aplicadas no Robô (`smbi_sync_crm_pedidos.mjs` e `smbi_robo_daemon.mjs`)

1. **`SAL MOIDO VITA 25 KG` (CRM):**
   - Vinculado com certeza ao `cProd 28` (`SAL MOIDO EXTRA FINO VITA 25 KG`, 25 kg, SCS).
   - Suporte adicionado a alias `crmNome` em `produtoComCerteza`.

2. **`SAL CHURRASCO SALINAS 30X1 KG`:**
   - Conferido: Nome no CRM idêntico ao do SMBI (`SAL CHURRASCO SALINAS 30X1 KG`).
   - Vinculado ao `cProd 45` (30 kg, FDS).
   - `SAL CHURRASCO NOTA 10` mantido sem mapeamento (`null` -> `PRODUTO_SEM_CODIGO`).

3. **Big Bag (Granulado Sem Iodo 1.000 KG):**
   - Mantido sem mapeamento (`null` -> `PRODUTO_SEM_CODIGO`) até o Tarcyo definir entre `14` e `5`.

4. **`SAL MOIDO SAL MARES 30X1 KG`:**
   - Conferido: Nome no CRM idêntico ao do SMBI (`SAL MOIDO SAL MARES 30X1 KG`).
   - Vinculado ao `cProd 74` (30 kg, FDS).

5. **Criação de Multi-Itens:**
   - Trava `MAIS_DE_UM_ITEM` mantida intacta. O robô continua barrando pedidos de 2+ itens para criação até o piloto de 1 item ser concluído.
