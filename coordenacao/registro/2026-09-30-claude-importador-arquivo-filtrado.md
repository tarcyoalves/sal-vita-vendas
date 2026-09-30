# Importador do Buscador: `--save-filtered` / `--from-filtered`

- **Agente:** claude
- **Início:** 2026-09-30
- **Fim:** 2026-09-30
- **Status:** concluído no código
- **Branch:** `main`

## Por quê

O dry-run e a gravação liam os ~20 GB da Receita duas vezes (25–35 min cada). Agora o dry-run salva o resultado filtrado em NDJSON (`--save-filtered`) e a gravação lê dele em segundos (`--from-filtered`).

## O que mudou

- `scripts/radar/import-receita.ts`: leitura separada em `lerDaReceita` / `lerFiltrado` / `salvarFiltrado`. O caminho antigo (`--dir`) continua igual.
- `server/lib/radar/filteredFile.ts`: validação do cabeçalho (release, UFs, lista de CNAEs-alvo, versão) e de cada linha. O arquivo é recusado se a lista de CNAEs mudou, se as UFs/release diferem ou se estiver truncado.
- `baseCompleta` (os 10 arquivos lidos) vai no cabeçalho, então a limpeza de registros antigos segue a mesma regra.
- `tests/radar-filtered-file.test.ts` + `scripts/radar/README.md`.

## Verificado

`npm run check`, `npx vitest run` (333 testes) e um round-trip real com arquivo pequeno: leitura OK, UF errada recusada, arquivo truncado recusado. **Não** foi testado com os 20 GB reais.
