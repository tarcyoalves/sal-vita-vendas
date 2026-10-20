# Migração de schema preguiçosa (lazy) no cold start

- **Agente:** claude
- **Início:** 2026-10-20 00:00 BRT
- **Fim:** 2026-10-20
- **Status:** concluído (no branch, sem push)
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

## Resultado

Cold start não conecta mais em banco nenhum. Cada schema (CRM / loja) migra na 1ª requisição que o
usa, memoizado por instância, com nova tentativa e backoff em caso de falha. Robô SMBI fora da janela
e `premiumAuth.*` não tocam nenhum Neon.

## Verificado

- `npm run check` — 0 erros
- `npx vitest run` (excluindo .claude, node_modules, extensoes) — 103 arquivos, 1414 testes
- `npm run build:api` — bundle regenerado
- Fumaça local com o bundle e URLs de banco inválidas: `/api/health`, `GET /api/smbi/pedidos` (fora da janela) e
  `premiumAuth.me` responderam sem nenhuma tentativa de migração/conexão.

## Não verificado / pendente

- Produção real (Neon): tempo da 1ª requisição de cada banco após o deploy; logs da Vercel.

## Armadilhas encontradas

- `ensureTablesExist` (CRM) engole quase todos os erros: falha dele não gera nova tentativa; as da loja
  (passos `ok:false`) geram.
- Rota nova que usa banco precisa de regra em `server/lib/schemasNecessarios.ts` (teste reprova) e de
  `await` do schema depois da autenticação.
