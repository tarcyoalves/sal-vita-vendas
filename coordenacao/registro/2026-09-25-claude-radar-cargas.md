# Radar de Cargas (prospecção para completar carreta)

- **Agente:** claude (coordena) + 4 subagentes claude em worktrees, integrados por mim
- **Início:** 2026-09-25 BRT
- **Fim:** 2026-09-26 BRT
- **Status:** concluído (código em `main`; ligar na VPS é do dono)
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

- **Fase 2 (scraping, pedido do dono em 26/09):** `scripts/radar/enricher/` (novo, Python),
  tabela nova `radar_enrichment`, `tests/llm-chain.test.ts`

**Não vou tocar em:** nada do Premium (`ORDERS_DATABASE_URL`, loja, webhooks),
tabelas B2B (`suppression_list`/`audit_logs` ficam no banco do Premium — o Radar
não usa), `tasks.ts`.

## Progresso

- [x] Contrato (tabela, tipos, geo, esqueleto do router) em `main` — `a18b2d7`, `6a39aa9`
- [x] Importador da base aberta da Receita (`scripts/radar/`)
- [x] Backend do router
- [x] IA: provedor antigravity + rascunho de mensagem
- [x] Tela do Radar — `/radar-cargas` no ar
- [x] Integração e deploy da Fase 1 (até `7183e1a`)
- [x] Fase 2: contrato do enriquecimento (tipos, tabela, esqueleto)
- [x] Fase 2: robô Python/Scrapling na VPS
- [x] Fase 2: backend da fila
- [x] Fase 2: tela com cards se completando

---

## Resultado

Tela `/radar-cargas` no CRM (menu "Radar de Cargas", admin/gerente/atendente). O
atendente busca empresas ativas dos CNAEs compradores de sal num raio da cidade da
carga, vê quem já está no CRM ou foi excluído antes, confirma o CNPJ ao vivo, gera
rascunho de mensagem e cria a tarefa com link `wa.me` (envio manual). Com o robô da VPS
ligado, os cards se completam com site, Google Maps, WhatsApp de link `wa.me`,
Instagram/Facebook. **Hoje a tela abre vazia**: falta o dono rodar o importador e o robô.

## Commits

Todos em `origin/main`. Contrato: `a18b2d7`, `6a39aa9`, `09f023a`. Fase 1: `6173202`,
`ad4eabf`, `5e59b3b`, `4027c07`, `6233dce`, `04a72f7`, `a1e68e3`, `7183e1a`. Fase 2:
`831bfe5`, `1c54149`, `6cebfbc`, `032f7a4`, `656b061`, `0034779`.
Implementação feita por 7 subagentes em worktrees; revisão, correções e integração por
mim.

## Verificado

- `npm run check` — 0 erros; `npm test` — 143 testes passando (7 arquivos).
- `pytest scripts/radar/enricher/tests` — 48 passando; pyflakes limpo.
- `npx esbuild api/index.ts --bundle` — ok (o JSON de municípios entra no bundle).
- Importador com `--dry-run` sobre arquivo latin1 de teste — contou e mapeou certo.
- Tela renderizada com a API simulada (Playwright, 375 e 1280 px): sem rolagem
  horizontal; estados novo / já no CRM / excluído antes / enriquecendo / pronto / falhou /
  robô desligado.
- Robô: `busca` e `site` rodados uma vez ao vivo pelo subagente (salvitarn.com.br).

## Não verificado / pendente

- Nenhuma query rodou contra banco real (sem acesso a banco de produção). Só typecheck.
- BrasilAPI ao vivo, provedor `antigravity` real, Google Maps e Instagram/Facebook reais.
- Importador com a base real da Receita (URL de download marcada "confira" no README).
- Lista de CNAEs não validada com a carteira real.

## Armadilhas encontradas

- `suppression_list` e `audit_logs` (B2B) ficam no banco do **Premium** (`ordersDb`),
  apesar de declaradas em `server/db/schema.ts`. Feature do CRM não pode usá-las; as
  exclusões do CRM são `task_deletion_logs` e `email_suppressions`.
- `runTriggerNow('lead_created')` inscreve o e-mail em sequência sem olhar
  `emailConfirmed`. Quem criar tarefa com e-mail não consentido não deve chamá-lo.
- Link vindo de scraping vira `href`: validar http(s) no servidor (`safeHttpUrl`).
- `tasks.bulkCreate` marca e-mail importado como confirmado — registrado no ESTADO 10a.
- User-Agent com acento quebra o `curl_cffi` do Scrapling (só ASCII).
- `vitest` roda também os testes de `.claude/worktrees/` se houver worktrees locais —
  use `npx vitest run --dir tests` para medir só o repositório.
