# CRM lote 3 (telas do atendente)

- **Agente:** claude
- **Início:** 2026-11-23
- **Fim:**
- **Status:** em andamento
- **Branch:** `crm-lote3` (worktree /home/user/crm-l3; commits locais, sem push)

## Objetivo

Melhorar as telas do atendente (só frontend): rascunho de tarefa, registrar contato em um toque, lista paginada, alertas de atraso agrupados, erros com mensagem real, AccessDenied, sessão com erro, alvos de toque, aviso de lista desatualizada, limpeza de páginas órfãs.

## Arquivos e áreas que vou tocar

- `client/src/pages/Tasks.tsx`, `AdminDashboard.tsx`, `Attendants.tsx`, `Orders.tsx` e `TvDashboard.tsx` (só se órfãos)
- `client/src/_core/hooks/useReminderNotifications.ts`, `client/src/components/AppShell.tsx`
- `client/src/lib/tasks/` (módulos novos), `tests/` (testes novos), `CLAUDE.md` (tabela de rotas)

**Não vou tocar em:** server/, api/index.ts, recovery, crons, emailMarketing, campaigns, zapContatos, auth.ts, trpc.ts.

## Progresso

- [ ] itens 1 a 10
