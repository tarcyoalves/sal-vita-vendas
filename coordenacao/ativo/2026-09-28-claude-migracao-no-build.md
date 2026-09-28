# Migração do banco no build de produção (fim da dependência dos 20 s do cold start)

- **Agente:** claude (+ 1 subagente em worktree)
- **Início:** 2026-09-28 BRT
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

A migração completa (175 comandos sequenciais no Neon HTTP) é abandonada aos 20 s no
cold start (casos M e N do HANDOFF-HERMES.md). Rodá-la uma vez durante o build de
produção, sem limite de tempo, e deixar o cold start só no caminho rápido. Não bloqueia
o deploy se falhar (o passo rápido `ensureRecentSchema` continua como rede de segurança).

## Arquivos e áreas que vou tocar

- `scripts/migrate-build.ts` (novo)
- `package.json` (só o script `vercel-build` e um script novo `migrate:build`)
- `tests/migrate-build.test.ts` (novo, lógica pura de decisão)
- `CHECKLIST-ALTERACOES.md`, `HANDOFF-HERMES.md` (nota curta), `ESTADO-DO-PROJETO.md`

**Não vou tocar em:** `server/db/migrate.ts`, `ordersMigrate.ts`, `b2bMigrate.ts`, `api/index.ts`,
telas, faturamento.

## Progresso

- [ ] Script + testes (subagente)
- [ ] Revisão, deploy, confirmação nos logs de build
