# Responsável sem cadastro (tarefas órfãs)

- **Agente:** claude
- **Início:** 2026-11-26
- **Fim:** (ao concluir)
- **Status:** em andamento
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

- [ ] implementar
- [ ] portões e merge
