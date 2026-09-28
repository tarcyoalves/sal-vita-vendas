# Integração CRM → SMBI funcionando + checklist anti-colapso

- **Agente:** claude (+ 1 subagente em worktree para o código SMBI)
- **Início:** 2026-09-28 BRT
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
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
- [ ] Código SMBI (subagente)
- [ ] Revisão, deploy, registro
