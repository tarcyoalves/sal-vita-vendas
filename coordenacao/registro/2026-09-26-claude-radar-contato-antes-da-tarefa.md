# Radar de Cargas: lista → contato → tarefa ou descarte

- **Agente:** claude (+ 1 subagente para a tela, em worktree)
- **Início:** 2026-09-26 BRT
- **Fim:** 2026-09-26 BRT
- **Status:** concluído
- **Branch:** `main`

## Objetivo

Pedido do dono: o Radar não deve empurrar a criação de tarefa. A busca mostra uma
lista; o atendente contata direto do card (WhatsApp/telefone, envio manual) e só
depois decide **transformar em tarefa** ou **descartar** (com motivo). Contato e
descarte ficam registrados e visíveis para todos os atendentes.

## Arquivos e áreas que vou tocar

- `shared/radar.ts`
- `server/db/schema.ts` (tabelas novas `radar_lead_actions` e `radar_lead_events`) e `server/db/migrate.ts`
- `server/routers/prospectingRadar.ts`, `server/lib/radar/leads.ts`
- `client/src/pages/RadarCargas.tsx`, `client/src/components/radar/`
- `tests/radar-*.test.ts`, `PLANO-RADAR-CARGAS.md`, `ESTADO-DO-PROJETO.md`

**Não vou tocar em:** `tasks.ts`, Premium, robô da VPS.

## Progresso

- [x] Contrato + tabela + backend (registrar contato, descartar, restaurar) — `7b36444`
- [x] Descartes permanentes: histórico append-only, restaurar só admin/gerente, descartado fora do limite e do robô
- [x] Tela: ações de contato no card, "Transformar em tarefa" / "Descartar" — `39b0e2d`
- [x] Verificação e deploy

---

## Resultado

Cada card do Radar tem WhatsApp/Ligar (manual) como ação principal; o contato é
registrado para todos. Depois: "Transformar em tarefa" (resultado do contato + próximo
retorno) ou "Descartar" (motivo). Filtros: Para contatar / Contatados / Já no CRM /
Descartados / Todos. Descartes permanentes, só admin/gerente restaura.

## Commits

`7b36444` (backend contato/descarte), `d98bcca` (descartes permanentes + histórico),
`39b0e2d` (tela, feita por subagente) — todos em `origin/main`.

## Verificado

- `npm run check` 0 erros; `npx vitest run --dir tests` 149 passando; `build:client` ok.
- Tela com API simulada, 375 e 1280 px, sem rolagem horizontal: lista, contato de outro
  atendente em âmbar, diálogo de transformar, diálogo de descarte, descartado recolhido.

## Não verificado / pendente

- Nenhuma mutation rodou contra banco real. Papel "gerente" não foi visto na tela (só admin).

## Armadilhas encontradas

- `restore` é `staffProcedure`: o botão some para atendente, mas a regra vale no servidor.
- `radar_lead_events` é append-only por convenção — não há trigger no banco impedindo
  UPDATE/DELETE; não escreva código que altere essas linhas.
