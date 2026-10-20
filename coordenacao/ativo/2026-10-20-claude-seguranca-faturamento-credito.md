# Correções de segurança e faturamento/crédito (lotes 1 e 2)

- **Agente:** claude
- **Início:** 2026-10-20
- **Status:** em andamento
- **Branch:** `worktree-agent-a6e9e1430a55f8044` (sem push; main intocada)

## Objetivo

Lote 1 (segurança): bypass de crédito por tarefa/CNPJ, knowledge staff-only, confirmação
server-side na IA, rate limit de reset de senha, mySellerId nulo, senha mínima 10, logs seguros.
Lote 2: robô SMBI x upsert de pedido, PED-n, crédito (veredito, cobrança incerta), fuso horário.

## Arquivos e áreas que vou tocar

- `server/routers/credito.ts`, `server/lib/credito/**`, `server/routers/knowledge.ts`
- `server/routers/ai.ts`, `server/routers/auth.ts`, `server/lib/trpcBatchGuard.ts`
- `server/routers/faturamento.ts`, `server/pdf/pedidoPdf.tsx`
- `server/routers/tasks.ts` (somente `tasks.create`/validação de documento)
- `api/index.ts` (somente o app.use do rate limit de auth), `api/bundle.js`
- `server/smbiRoutes.ts`, `server/smbiCadastroRoutes.ts` (somente trocar o log do console.error)

**Não vou tocar em:** loja Premium, extensoes/, sallog/, lógica das rotas SMBI, db-health.
