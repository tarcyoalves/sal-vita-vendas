# SMBI: só pedido com clique provado + vincular a pedido existente

- **Agente:** claude
- **Início:** 2026-09-29 11:00 BRT
- **Fim:** —
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

O robô criou o movsai 1115 para o pedido `hq7ra5rce4pb`, que o dono NÃO enviou pelo botão
(aprovou tarde um pedido que já era o 1071 do SMBI, embarcado). O CRM não guarda quem clicou,
então não dá para provar como entrou na lista. Regra nova do dono: só pedido em que ele clicar
a partir de agora. Grava o autor do clique, a lista só devolve pedido com autor, a resposta do
robô traz hora/autor, o botão pede confirmação e o admin pode vincular o pedido a um movsai
que já existe (corrige o 1115 → 1071).

## Arquivos e áreas que vou tocar

- `server/db/schema.ts`, `server/db/migrate.ts`, `tests/schema-version.lock.json` (coluna `smbi_solicitado_por`)
- `server/lib/smbi.ts`, `server/routers/faturamento.ts`, `api/index.ts` (só a rota GET do SMBI)
- `client/src/components/faturamento/OrderDetailDialog.tsx`, `client/src/lib/faturamento/store.ts`, `types.ts`
- `tests/smbi-*.test.ts`, `docs/INTEGRACAO-SMBI.md`, `HANDOFF-HERMES.md`

## Progresso

- [ ] coluna + migração + lock
- [ ] clique grava autor; lista exige autor; payload com hora/autor
- [ ] vincularSmbi (admin) + botão + confirmação
- [ ] testes, check, build, deploy READY
