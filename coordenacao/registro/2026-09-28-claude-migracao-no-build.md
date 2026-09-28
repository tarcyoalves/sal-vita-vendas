# Migração do banco no build de produção (fim da dependência dos 20 s do cold start)

- **Agente:** claude (+ 1 subagente em worktree)
- **Início:** 2026-09-28 BRT
- **Fim:** 2026-09-28 BRT
- **Status:** parcial (código em main; falta confirmar no log do build de produção)
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

- [x] Script + testes (subagente) — `592cc4f`
- [x] Revisão (check, 215 testes, dry-run, preview, falha não derruba o build)
- [ ] Confirmar `[migrate:build] ok` no log do BUILD do primeiro deploy com o script

---

## Resultado

Builds de produção rodam `scripts/migrate-build.ts` (CRM: `ensureTablesExist`; Premium:
`ensureOrdersTablesExist` + `ensureB2bTablesExist`) sem limite de tempo. Preview nunca migra.
Falha vira `[migrate:build] FALHOU: ...` no log do build e o deploy segue.

## Verificado

- `npm run check` 0 erros; `npx vitest run --dir tests` 215 passando (12 novos).
- Sem env, preview e `--dry-run` de produção: decisões corretas, saída 0.
- `(false || echo ...) && echo` — a cadeia do `vercel-build` segue quando o script falha.

## Não verificado / pendente

- **Nenhuma execução contra banco real.** Só o primeiro build de produção prova.
- O build precisa enxergar `DATABASE_URL`, `ORDERS_DATABASE_URL` e `JWT_SECRET`
  (`server/db/migrate.ts` importa `server/auth.ts`, que exige `JWT_SECRET`). Sem alguma delas
  o script imprime PULAR/FALHOU e o cold start continua no caminho antigo.
- Janela de troca: enquanto o deploy novo não assume, o código antigo ainda pode tentar a
  migração longa no cold start (inofensivo: tudo é idempotente e só adiciona).
- Preview não migra: coluna nova só existe em produção depois do merge em `main`.

## Armadilhas

- Depois de qualquer mudança de schema, procure `[migrate:build] FALHOU` no log do BUILD
  (não no log de runtime).
