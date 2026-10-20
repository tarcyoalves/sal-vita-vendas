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
