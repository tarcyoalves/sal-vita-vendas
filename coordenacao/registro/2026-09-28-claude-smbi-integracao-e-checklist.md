# Integração CRM → SMBI funcionando + checklist anti-colapso

- **Agente:** claude (+ 1 subagente em worktree para o código SMBI)
- **Início:** 2026-09-28 BRT
- **Fim:** 2026-09-28 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

1. Completar o plano do Hermes (robô `smbi_criar_pedido_express.mjs`): guardar o
   código SMBI da condição de pagamento, servidor aceitar os campos SMBI, e um
   endpoint autenticado para o robô ler pedidos aprovados e devolver movsai/NF-e/CT-e.
2. Checklist "o que não pode faltar" para qualquer IA + teste que falha o build quando
   uma coluna do schema não tem migração.

## Arquivos e áreas que vou tocar

- `server/routers/faturamento.ts`, `api/index.ts` (rotas `/api/smbi/*`), `server/lib/smbi*.ts` (novo)
- `client/src/components/faturamento/OrderDialog.tsx`, `client/src/lib/faturamento/`
- `tests/schema-migrations.test.ts`, `tests/smbi-*.test.ts` (novos)
- `docs/INTEGRACAO-SMBI.md` (novo), `CHECKLIST-ALTERACOES.md` (novo)
- `server/db/migrate.ts` (2 colunas antigas sem migração + bump), `scripts/schema-lock.mjs`, `package.json` (script `schema:lock`), `.kiro/steering/`
- `HANDOFF-HERMES.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `CLAUDE.md` (link para o checklist)

## Progresso

- [x] Teste de migração (trava do build) — pega coluna sem migração e migração sem bump
- [x] Checklist anti-colapso (`CHECKLIST-ALTERACOES.md`), linkado em todos os arquivos de entrada de IA
- [x] Código SMBI (subagente) — `64f9f09` + gravação condicional do movsai
- [x] Revisão, deploy, registro

---

## Resultado

- `CHECKLIST-ALTERACOES.md` + `tests/schema-migrations.test.ts`: build reprova coluna sem
  migração e migração sem bump de versão (simulado nos dois casos).
- SMBI: condição de pagamento grava descrição + código; servidor aceita os 6 campos
  (os 4 do robô só admin/robô gravam); rotas `GET /api/smbi/pedidos` e
  `POST /api/smbi/pedidos/:id/retorno` com `SMBI_SYNC_SECRET`; `docs/INTEGRACAO-SMBI.md`.

## Commits

`ddb5134` (trava + checklist), `64f9f09` (SMBI, subagente), commit desta finalização.

## Verificado

- `npm run check` 0 erros; `npx vitest run --dir tests` 181 passando; bundle da API ok.

## Não verificado / pendente

- Rotas `/api/smbi/*` e escrita no banco só typecheck + testes das funções puras.
- `SMBI_SYNC_SECRET` precisa ser configurada pelo dono.
- Formulário de pedido revisado no código, não aberto no navegador.

## Armadilhas encontradas

- `store.ts` monta pedido novo campo a campo (`buildPedido`): campo novo no tipo precisa
  entrar lá também, senão some no primeiro salvamento.
- Retorno do robô: a checagem de conflito do movsai precisa estar no próprio UPDATE
  (duas chamadas simultâneas passariam na leitura).
