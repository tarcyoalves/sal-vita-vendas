# Telas da análise de crédito (CRM Lembretes)

- **Agente:** claude
- **Status:** em andamento
- **Branch:** `worktree-agent-a5db237f45482ab34` (sem push)

## Objetivo

Telas do módulo de crédito (continuação de `2026-10-15-claude-analise-credito.md`): componentes
`client/src/components/credito/`, página `/admin/analise-credito`, seção de crédito no pedido e na tarefa.

## Arquivos e áreas que vou tocar

- `client/src/components/credito/`, `client/src/lib/credito/`, `client/src/pages/AnaliseCredito.tsx`
- `client/src/App.tsx`, `client/src/components/AppShell.tsx` (rota e menu)
- `client/src/components/faturamento/BillingReport.tsx`, `OrderDetailDialog.tsx`, `client/src/lib/faturamento/types.ts`, `smbiEmpresaUi.ts`
- `client/src/pages/Tasks.tsx` (só a expansão da tarefa)
- Servidor: `server/routers/credito.ts` (semaforos, provedor em ultimo), `server/lib/credito/semaforos.ts`, `server/lib/credito/pdf.ts` (faixa de simulação)

**Não vou tocar em:** loja Premium, robô, schema.
