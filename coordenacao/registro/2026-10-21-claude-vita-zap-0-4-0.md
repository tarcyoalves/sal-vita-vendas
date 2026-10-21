# Vita Zap 0.4.0 — aba Ajustes (painel configurável)

- **Agente:** claude
- **Início:** 2026-10-21 BRT
- **Fim:** 2026-10-21 BRT
- **Status:** concluído (commit no branch, sem push)
- **Branch:** `worktree-agent-a6ece841718907794`

## Objetivo

Pedido do dono: painel configurável e editável, já preenchido com os padrões, para ritmo, limites,
horários, freio, filtros e textos, com perfis e indicador de risco, sem afrouxar nenhuma trava de envio.

## Arquivos e áreas que toquei

- `extensoes/vita-zap/` (somente). Novos: `src/shared/ajustes.ts`, `src/sidepanel/Ajustes.tsx`, `tests/ajustes.test.ts`.
- Alterados: política, automático, banco, exportar, texto, campanha, executor, abas do painel, README, versão.

**Não toquei em:** CRM (raiz), content script de envio, token, conferências.

## Resultado

Aba Ajustes com todos os parâmetros editáveis, perfis, risco, validação, persistência e backup.
Ver `extensoes/vita-zap/README.md`, seção 0.4.0.

## Verificado

- `npx tsc --noEmit -p .`, `npm test` e `npm run build` em `extensoes/vita-zap`.

## Não verificado / pendente

- Interface não exercitada no Chrome real; só typecheck, build e testes de lógica.
- "Pausar em aviso do WhatsApp" desligado afeta só o aviso visto durante a espera; decisão a confirmar com o dono.

## Armadilhas encontradas

- `normalizarConfig` tinha piso fixo de 60 s; os Ajustes usam o piso de 30 s via `PISO_AJUSTES`. Sem o argumento, o comportamento antigo foi mantido para os testes antigos.
