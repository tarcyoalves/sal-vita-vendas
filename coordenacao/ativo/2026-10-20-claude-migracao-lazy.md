# Migração de schema preguiçosa (lazy) no cold start

- **Agente:** claude
- **Início:** 2026-10-20 00:00 BRT
- **Fim:** (preencha ao concluir)
- **Status:** em andamento
- **Branch:** `worktree-agent-a915c956856c82dfe`

## Objetivo

Hoje `api/index.ts` roda `ensureTablesExist` / `ensureOrdersTablesExist` / `ensureB2bTablesExist` no
carregamento do módulo: todo cold start (inclusive robô SMBI fora da janela e `premiumAuth.*`) acorda
os DOIS bancos Neon. Trocar por migração LAZY e memoizada por instância, aguardada só por quem usa
aquele banco.

## Arquivos e áreas que vou tocar

- `api/index.ts` (topo do módulo, middleware `/api/trpc`, handlers de webhook/cron/smbi)
- `api/bundle.js` (regenerado)
- `server/lib/schemaPreguicoso.ts` e `server/lib/schemasNecessarios.ts` (novos)
- `tests/schema-preguicoso.test.ts` (novo)
- `ESTADO-DO-PROJETO.md` (seção 5, nota curta)

**Não vou tocar em:** DDL, `SCHEMA_VERSION`, `server/db/migrate*.ts`, routers.

## Progresso

- [ ] módulos puros + testes
- [ ] integração em api/index.ts
- [ ] check, testes, build:api
