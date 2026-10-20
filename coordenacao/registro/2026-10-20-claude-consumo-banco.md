# Lote 4 e 3: consumo do banco (Neon) e tarefas/dashboard (CRM Lembretes)

- **Agente:** claude
- **Início:** 2026-10-20 BRT
- **Fim:** (preencher ao concluir)
- **Status:** em andamento
- **Branch:** `worktree-agent-a43747f002a8cdaef` (sem push, sem main)

## Objetivo

Reduzir computação do Neon: portão da janela do robô SMBI em ligados/vinculos/cadastros, db-health sem banco,
TV pública sem banco quando desativada, índice em fat_orders(criado_em), polling de cadastro com expediente.
E consistência de "atrasadas" entre tarefas, dashboard e TV; lembretes com filtro no SQL; dedup interna na importação.

## Arquivos e áreas que vou tocar

- `shared/smbiJanela.ts`, `shared/tarefasAtrasadas.ts` (novo)
- `server/lib/schemasNecessarios.ts`, `server/smbiRoutes.ts` (só GET ligados/vinculos), `server/smbiCadastroRoutes.ts` (só GET cadastros)
- `api/index.ts` (só /api/db-health), `api/bundle.js`
- `server/routers/tv.ts`, `server/routers/tasks.ts` (só `reminders` e `bulkCreate`), `server/lib/taskImport.ts`
- `server/db/migrate.ts` (índice + SCHEMA_VERSION), `tests/schema-version.lock.json`
- `client/src/components/faturamento/SmbiCadastroClienteDialog.tsx`
- `client/src/lib/taskOrder.ts`, `client/src/lib/dashboardAgg.ts`, `client/src/pages/AdminDashboard.tsx`, `client/src/pages/Tasks.tsx` (linha 96)
- `docs/CONTRATO-ROBO-CRM.md`, testes novos em `tests/`

**Não vou tocar em:** credito*, knowledge, ai.ts, auth, trpcBatchGuard, faturamento.ts, tasks.create, loja Premium, extensoes/, sallog/.

---

## Resultado (status: parcial, só no branch worktree-agent-a43747f002a8cdaef; não está em main)

Lote 4 (itens 1-5) e Lote 3 (itens 6-10) com testes em tests/consumo-banco-lote4.test.ts e tests/tarefas-lote3.test.ts.
SCHEMA_VERSION do CRM: 2026-10-16a para 2026-10-20a (índice fat_orders_criado_em_idx).

## Commits
- 393e143 perf: cut Neon wake-ups (código + api/bundle.js)

## Verificado
- npm run check sem erros; vitest completo 105 arquivos / 1445 testes passando; npm run build:api ok.

## Não verificado
- Nada rodou contra banco real nem na Vercel; telas (Dashboard em 375 px) não foram abertas no navegador.

## Armadilhas
- getAll do faturamento e tasks.list continuam sem limite/paginação (a UI depende da lista inteira).
- bulkCreate: lembrete escalonado (1 a cada 2 min a partir de +5 min) segue igual; 2000 linhas = ~66 h de lembretes.
- Outro agente também pode subir SCHEMA_VERSION: conflito esperado no merge; reconciliar e rodar npm run schema:lock.
