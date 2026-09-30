# Buscador de Clientes: filtro "só empresas com mais de 2 anos de abertura"

- **Agente:** claude
- **Início:** 2026-09-30
- **Fim:** 2026-09-30
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## O que mudou

- `prospectingRadar.search` ganhou `minAnosAbertura` (0–30, padrão 0). Filtra no banco por `data_inicio` (texto YYYY-MM-DD) <= hoje menos N anos. Empresa **sem data** na base não é excluída.
- Tela: seletor "Tempo de abertura" (Qualquer, 1, 2, 3, 5, 10 anos), **padrão 2 anos**, na aba de empresas novas.
- `server/lib/radar/abertura.ts` (data-limite) + `tests/radar-abertura.test.ts`.

## Verificado

`npm run check`, `npx vitest run` (321 testes), builds. Não visto no navegador nem contra o banco real.
