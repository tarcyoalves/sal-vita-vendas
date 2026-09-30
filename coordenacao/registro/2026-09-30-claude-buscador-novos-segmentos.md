# Buscador de Clientes: novos segmentos (CNAE) — sem minimercados

- **Agente:** claude
- **Início:** 2026-09-30
- **Fim:** 2026-09-30
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## O que mudou

`shared/radar.ts` (RADAR_SEGMENTS), códigos conferidos na API de subclasses CNAE do IBGE:

| Segmento | CNAEs |
|---|---|
| Atacado de rações | 4623109 |
| Varejo de rações / pet | 4789004 |
| Fábricas de ração (novo) | 1066000 |
| Laticínios | 1052000 |
| Frigoríficos (abate) | 1011201, 1011205, 1012101, 1012103 (era só 1011201) |
| Atacado de alimentos em geral | 4639701, 4639702 (era só 4639701) |
| Supermercados e hipermercados (novo) | 4711301, 4711302 |
| Fábricas de sabão e detergente (novo) | 2061400 |

**Fora de propósito:** 4712100 (minimercados, mercearias e armazéns), decisão do dono. O código `1012000` que o Hermes citou não existe na tabela do IBGE; `1064300` é farinha de milho, não ração.

Na tela, pet shop e supermercado vêm **desmarcados** por padrão (são muitos e escondem clientes de carga maior).

## Para o Hermes

A base já gravada (PR, SC, RS) foi importada com a lista antiga: os CNAEs novos não estão nela. Rodar o importador de novo com **todas** as UFs desejadas (PR, SC, RS + novas), mesma release, após `git pull`. O upsert não duplica.

## Verificado

`npm run check`, `npx vitest run` (326 testes), builds. Não visto no navegador nem contra o banco real. `tests/radar-import.test.ts` trocou `4711301` por `4712100` como exemplo de CNAE não-alvo.
