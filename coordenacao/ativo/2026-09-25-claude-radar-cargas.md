# Radar de Cargas (prospecção para completar carreta)

- **Agente:** claude (coordena) + 4 subagentes claude em worktrees, integrados por mim
- **Início:** 2026-09-25 BRT
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
- **Branch:** `main` (subagentes trabalham em worktrees locais; só eu publico em `main`)

## Objetivo

Implementar o módulo "Radar de Cargas" pedido pelo dono (proposta do Hermes,
revisada em `PLANO-RADAR-CARGAS.md`): o atendente informa cidade da carga, raio e
saldo de sacos; o CRM lista empresas ativas dos CNAEs compradores de sal no raio,
marca as que já estão no CRM e transforma as aprovadas em tarefa com link wa.me
para envio **manual**. Inclui provedor de IA opcional (Gemini via endpoint
OpenAI-compatível do dono) no topo da cadeia de fallback.

## Arquivos e áreas que vou tocar

- `PLANO-RADAR-CARGAS.md` (novo)
- `shared/radar.ts` (novo)
- `server/db/schema.ts` — só a tabela nova `radar_establishments` no fim do arquivo
- `server/db/migrate.ts` — CREATE TABLE da tabela nova + bump de `SCHEMA_VERSION`
- `server/data/municipios.json` (novo)
- `server/lib/radar/` (novo)
- `server/lib/llm.ts` (novo)
- `server/routers/prospectingRadar.ts` (novo) e registro em `server/routers/index.ts`
- `server/routers/ai.ts` — só adicionar o provedor `antigravity` à cadeia
- `scripts/radar/` (novo)
- `client/src/pages/RadarCargas.tsx`, `client/src/components/radar/` (novos)
- `client/src/App.tsx` (uma rota) e `client/src/components/AppShell.tsx` (um item de menu)
- `tests/radar-*.test.ts` (novos)

**Não vou tocar em:** nada do Premium (`ORDERS_DATABASE_URL`, loja, webhooks),
tabelas B2B existentes (só leitura de `suppression_list`), `tasks.ts`.

## Progresso

- [ ] Contrato (tabela, tipos, geo, esqueleto do router) em `main`
- [ ] Importador da base aberta da Receita (`scripts/radar/`)
- [ ] Backend do router
- [ ] IA: provedor antigravity + rascunho de mensagem
- [ ] Tela do Radar
- [ ] Integração, verificação, deploy
