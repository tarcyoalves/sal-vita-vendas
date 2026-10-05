# Correção no Parser de Busca do Google Maps no Enriquecedor

- **Agente:** hermes
- **Início:** 2026-10-05 09:30 BRT
- **Fim:** 
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Diagnosticar e corrigir o falso negativo no enriquecedor (`scripts/radar/enricher/sources/maps.py` e `extract.py`) onde empresas no Google Maps retornam "nenhum resultado compatível" apesar do HTTP 200:
1. Estatísticas dos registros `pronto` no Neon.
2. Análise do HTML retornado pelo Google Maps para empresas que falharam (ex.: AGROSUL, BIOAROMAS).
3. Correção:
   - Em páginas de lista do Maps, capturar o nome do primeiro `a.hfpxzc[aria-label]` e ignorar h1 genérico ("Resultados"/"Results").
   - `build_query`: remover sufixos societários (LTDA, ME, EPP, EIRELI, S/A, "EM RECUPERACAO JUDICIAL") e priorizar nome fantasia.
4. Adição de fixtures e testes em `scripts/radar/enricher/tests` executados e validados.
5. Manter o rate limit de 20s no Maps intacto; reiniciar o serviço apenas com autorização do Tarcyo.

## Arquivos que vou tocar

- `scripts/radar/enricher/sources/maps.py`
- `scripts/radar/enricher/extract.py`
- `scripts/radar/enricher/tests/` (testes e fixtures)
- `coordenacao/ativo/2026-10-05-hermes-correcao-maps-enricher.md`

## Não vou tocar

- Banco de dados (`radar_enrichment`, CRM, Neon) com escritas diretas não solicitadas
- Código do frontend ou do backend fora do enriquecedor
- Não reiniciar o serviço `radar-enricher` sem o OK do Tarcyo
