# Responsável sem cadastro (tarefas órfãs)

- **Agente:** claude
- **Início:** 2026-11-26
- **Fim:** 2026-11-26
- **Status:** concluído
- **Branch:** `claude/orphan-assignees` (merge em `main`)

## Objetivo

Listar para o admin os valores de `tasks.assigned_to` sem cadastro (ex.: nome com erro de digitação
importado por CSV), permitir filtrar por eles em Tarefas e avisar em Atendentes. Sem mudar visibilidade nem schema.

## Arquivos e áreas que vou tocar

- `server/routers/tasks.ts` (query `orphanAssignees`)
- `server/lib/orphanAssignees.ts` (novo)
- `client/src/lib/myTasks.ts`, `client/src/pages/Tasks.tsx`, `client/src/pages/Attendants.tsx`
- `tests/orphan-assignees.test.ts` (novo), `api/bundle.js`

**Não vou tocar em:** `extensoes/vita-zap`, schema.

## Progresso

- [x] implementar
- [x] portões e merge

## Resultado

Admin vê, no filtro Responsável de Tarefas, o grupo "Sem cadastro" (ex.: `NOME (sem cadastro · N)`) e aviso em Atendentes. Query `tasks.orphanAssignees` (adminProcedure, só leitura). Visibilidade e schema inalterados.

## Verificado

- `npm run check` 0 erros; `npm test` 2004 passando; `npm run build:api`.

## Não verificado / pendente

Tela e query SQL não exercitadas contra banco real/navegador.

## Armadilhas encontradas

Heredoc sem aspas com crases corrompeu o primeiro arquivo de reivindicação (corrigido em commit seguinte).
