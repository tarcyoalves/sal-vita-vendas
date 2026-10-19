# Pausar polling das telas fora do expediente + desligar Painel TV

- **Agente:** claude
- **Início:** 2026-10-19
- **Fim:** 2026-10-19
- **Status:** concluído (branch `worktree-agent-a2c9c455e63b1418b`, ainda não integrado em `main`)
- **Branch:** `worktree-agent-a2c9c455e63b1418b`

## Objetivo

Neon Free estourou porque o banco nunca dorme. Depois do limite do robô SMBI, faltava parar o polling das
telas fora do expediente (decisão do dono: "faça pausarem fora do expediente. pode desligar o painel TV").

## Arquivos e áreas

- `shared/expediente.ts` (novo), `shared/smbiJanela.ts` (só exporta `minutoLocal`)
- `client/src/lib/useExpediente.ts`, `client/src/lib/tvPainel.ts` (novos)
- `SmbiRoboPanel.tsx`, `AppShell.tsx`, `AdminDashboard.tsx`, `ActiveTimer.tsx`, `useReminderNotifications.ts`, `TvDashboard.tsx`
- `tests/expediente.test.ts`, `ESTADO-DO-PROJETO.md` (seção 5)

## Resultado

Fora de 07:00–19:00 (Fortaleza) as telas não fazem polling periódico; o Painel TV fica desligado por padrão.

## Verificado

- `npx tsc --noEmit` — 0 erros; vitest (sem `.claude/**`) — 101 arquivos, 1375 testes passando;
  `vite build` com `VITE_EXPEDIENTE` confirmou que a env entra no bundle.

## Não verificado / pendente

- Comportamento no navegador. Precisa de novo deploy; `api/bundle.js` não foi tocado.

## Armadilhas encontradas

- `tsconfig` usa `module: CommonJS`: `import.meta.env` exige `@ts-expect-error`, e deve ficar no formato
  literal `import.meta.env.VITE_X` (com cast o Vite não substitui e a env some em silêncio).
- Em worktree, `node_modules/pdfkit` pode faltar e reprovar 7 testes de crédito (falso negativo).
