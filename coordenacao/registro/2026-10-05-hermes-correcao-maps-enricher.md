# Correção no Parser de Busca do Google Maps no Enriquecedor

- **Agente:** hermes
- **Início:** 2026-10-05 09:30 BRT
- **Fim:** 2026-10-05 10:05 BRT
- **Status:** concluído (código testado e aprovado; aguardando autorização do Tarcyo para reiniciar o radar-enricher)
- **Branch:** `main`

## Objetivo

Diagnosticar e corrigir o falso negativo no enriquecedor (`scripts/radar/enricher/sources/maps.py` e `extract.py`) onde empresas no Google Maps retornam "nenhum resultado compatível" apesar do HTTP 200:
1. Estatísticas dos registros `pronto` no Neon.
2. Análise do HTML retornado pelo Google Maps para empresas que falharam (ex.: AGROSUL, BIOAROMAS, MARONESI).
3. Correção:
   - Em páginas de lista do Maps, capturar o nome do primeiro `a.hfpxzc[aria-label]` e ignorar h1 genérico ("Resultados"/"Results").
   - `build_query`: remover sufixos societários (LTDA, ME, EPP, EIRELI, S/A, "EM RECUPERACAO JUDICIAL") e priorizar nome fantasia.
4. Adição de fixtures e testes em `scripts/radar/enricher/tests` executados e validados.
5. Manter o rate limit de 20s no Maps intacto; reiniciar o serviço apenas com autorização do Tarcyo.

## Evidências e Resultados

- **Estatísticas do Banco Neon (`radar_enrichment`):**
  - Total `pronto`: 879
  - Maps `ok`: 467 (53,1%)
  - Maps `nenhum resultado compatível`: 411 (46,8% de falso negativo!)
- **Diagnóstico das Falhas (3 empresas):**
  - `AGROSUL INDUSTRIA AGRICOLA LTDA EM RECUPERACAO JUDICIAL` (Chapecó/SC)
  - `BIOAROMAS DO BRASIL` (Chapecó/SC)
  - `MERCEARIA MARONESI LTDA` (Matelândia/PR)
  - O Google Maps devolve página de lista com `<h1>Resultados</h1>`. O parser pegava `h1` como nome do lugar, tornando `nome = "Resultados"`, falhando `matches_company`.
- **Correção Implementada:**
  - `extract.py`: `_GENERIC_MAPS_HEADINGS` ignora títulos como "Resultados"/"Results". Fallback busca `a.hfpxzc::attr(aria-label)` e extrai dados completos do card `div.Nv2PK` (nome, endereço, telefone, website, notas).
  - `extract.py`: função `strip_legal_suffixes` para remover sufixos societários.
  - `sources/maps.py`: `build_query` prioriza nome fantasia e remove sufixos jurídicos. Casamento confere tanto nome original quanto nome limpo.
- **Testes Validados:**
  - Pytest enriquecedor: 52 testes aprovados (4 novos testes e nova fixture `maps_search_list.html`).
  - Repo geral: `npm run check` (TypeScript limpo) e `npm test` (411/411 testes aprovados em 28 suítes).
- **Serviço `radar-enricher`:** Intocado. Aguardando OK do Tarcyo para reiniciar.

## Arquivos que vou tocar

- `scripts/radar/enricher/sources/maps.py`
- `scripts/radar/enricher/extract.py`
- `scripts/radar/enricher/tests/` (testes e fixtures)
- `coordenacao/ativo/2026-10-05-hermes-correcao-maps-enricher.md`

## Não vou tocar

- Banco de dados (`radar_enrichment`, CRM, Neon) com escritas diretas não solicitadas
- Código do frontend ou do backend fora do enriquecedor
- Não reiniciar o serviço `radar-enricher` sem o OK do Tarcyo
