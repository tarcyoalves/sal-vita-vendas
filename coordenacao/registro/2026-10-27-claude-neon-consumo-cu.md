# Neon: expediente enxuto, inatividade e intervalos >= 5 min

- **Agente:** claude
- **Início:** 2026-10-27 BRT
- **Fim:**
- **Status:** concluído (branch local, sem push)
- **Branch:** `worktree-agent-a30b2ee58060d2ecd`

## Objetivo

Caber no plano grátis do Neon (100 CU-h/mês): expediente padrão menor, polling só com usuário ativo,
intervalos >= 5 min, heartbeat a cada 10 min (limiar do servidor 25 min).

## Arquivos e áreas que vou tocar

- `shared/expediente.ts`, `shared/usuarioAtivo.ts` (novo), `client/src/lib/useUsuarioAtivo.ts` (novo)
- `client/src/components/AppShell.tsx`, `ActiveTimer.tsx`, `faturamento/SmbiRoboPanel.tsx`, `faturamento/SmbiCadastroClienteDialog.tsx`
- `client/src/pages/AdminDashboard.tsx`, `client/src/_core/hooks/useReminderNotifications.ts`
- `server/lib/workHours.ts`, `server/routers/workSessions.ts` (comentários/limiar), `api/bundle.js`
- `tests/expediente.test.ts`, `tests/consumo-banco-lote4.test.ts`, `tests/work-hours.test.ts`, novo teste de inatividade
- `ESTADO-DO-PROJETO.md`

**Não vou tocar em:** loja Premium, extensoes/, webhooks de e-mail.

## Progresso

- [x] implementação e testes

## Resultado

Expediente padrão menor, polling só com usuário ativo e intervalos >= 5 min; heartbeat 10 min / limiar 25 min.

## Commits

Ver `git log` do branch worktree-agent-a30b2ee58060d2ecd (sem push).
