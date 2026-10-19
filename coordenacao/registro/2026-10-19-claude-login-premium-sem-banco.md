# Login da loja Premium isolado do banco do CRM

- **Agente:** claude
- **Início:** 2026-10-19
- **Fim:** 2026-10-19
- **Status:** parcial (commit só na branch; falta integrar em `main`, rebuild de `api/bundle.js` e configurar as 2 variáveis na Vercel)
- **Branch:** `worktree-agent-a1e4ec0cf71a3d124` (não vai para `main` por este agente; o responsável integra e reconstrói `api/bundle.js`)

## Objetivo

O painel admin da loja (`SalVitaAdmin.tsx`) logava pela tabela `users` do banco do CRM.
Quando esse banco caiu por cota, o login da loja caiu junto. Decisão do dono: um único
admin da loja, credencial em variáveis de ambiente (`PREMIUM_ADMIN_EMAIL`,
`PREMIUM_ADMIN_PASSWORD_HASH`), sem consulta a banco.

## Arquivos e áreas que vou tocar

- `server/routers/premiumAuth.ts` (novo), `server/lib/premiumSession.ts` (novo)
- `server/trpc.ts`, `server/routers/index.ts`, `shared/const.ts`
- `server/routers/shipping.ts`, `recovery.ts`, `premiumEmailMarketing.ts`, `b2b.ts` (só o nível das procedures administrativas)
- `server/lib/trpcBatchGuard.ts`, `api/index.ts` (limiter do login da loja; não espera migração do CRM para `premiumAuth.*`)
- `client/src/pages/SalVitaAdmin.tsx` (+ novo hook em `client/src/_core/hooks/`)
- `scripts/premium-admin-hash.ts` (novo), `package.json` (script `premium:hash`)
- `tests/premium-auth*.test.ts` (novos), `ESTADO-DO-PROJETO.md`

**Não vou tocar em:** `api/bundle.js`, `server/auth.ts` (algoritmo de senha), schema do CRM.

## Progresso

- [x] implementação
- [x] testes

## Resultado

Login da loja sem banco (`premiumAuth`), cookie/JWT próprios, `premiumStaffProcedure`/`premiumAdminProcedure`,
routers da loja trocados, frontend sem `trpc.auth`, script `premium:hash`, testes.

## Verificado

- `npm run check` e `npm test` verdes (99 arquivos, 1324 testes). Não testado em navegador.

## Armadilhas encontradas

- `api/index.ts` esperava a migração do CRM (`dbReady`) antes de qualquer `/api/trpc`; agora `premiumAuth.*` não espera.
- Throttle por e-mail (como no `emergencyReset`) deixaria qualquer um trancar o dono para fora; o da loja é só por IP.
- Alguns testes leem o código-fonte e fixavam `protectedProcedure`/`staffProcedure` nos routers da loja.
