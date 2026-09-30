# HERMES (2026-09-30) - Importação do Radar (Novos Estados Centro-Oeste/Nordeste)

- **Agente:** Hermes
- **Status:** Ativo
- **Objetivo:** Adicionar dados ao Radar (`radar_establishments`) via `import-receita.ts` para os estados TO, GO, MT, MG, MA e BA, cobrindo supermercados, agropecuárias, indústrias, químicos etc, filtrados do lote 2026-09.
- **Limitações:** Executar primeiro como Dry-Ryn para validação de storage do NeonDB contra as travas do free tier (500MB).

## Resultado
- **Concluído:** Executou a extração real em banco (`import-receita.ts` sem `--dry-run`) aplicando as novas lógicas de segmento.
- **Concluído:** 255.316 registros das UF's PR, SC, RS, TO, GO, MT, MG, MA e BA mesclados no DB com a competência 2026-09.
- **Concluído:** Limpeza nativa rodada ao final do script para rebaixar leads extintos / CNPJs que mudaram de CNAE ou deram baixa na jurisdição das UFs passadas.
- **Concluído:** Painel Neon pós-insert aferido usando `pg_database_size`.
- **NÃO Modificado:** Outras unidades federativas que não estavam no alvo ficaram fora da gravação/limpeza.
