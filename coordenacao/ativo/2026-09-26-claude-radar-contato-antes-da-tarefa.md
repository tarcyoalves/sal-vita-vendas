# Radar de Cargas: lista → contato → tarefa ou descarte

- **Agente:** claude (+ 1 subagente para a tela, em worktree)
- **Início:** 2026-09-26 BRT
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Pedido do dono: o Radar não deve empurrar a criação de tarefa. A busca mostra uma
lista; o atendente contata direto do card (WhatsApp/telefone, envio manual) e só
depois decide **transformar em tarefa** ou **descartar** (com motivo). Contato e
descarte ficam registrados e visíveis para todos os atendentes.

## Arquivos e áreas que vou tocar

- `shared/radar.ts`
- `server/db/schema.ts` (tabela nova `radar_lead_actions`) e `server/db/migrate.ts`
- `server/routers/prospectingRadar.ts`, `server/lib/radar/leads.ts`
- `client/src/pages/RadarCargas.tsx`, `client/src/components/radar/`
- `tests/radar-*.test.ts`, `PLANO-RADAR-CARGAS.md`, `ESTADO-DO-PROJETO.md`

**Não vou tocar em:** `tasks.ts`, Premium, robô da VPS.

## Progresso

- [ ] Contrato + tabela + backend (registrar contato, descartar, restaurar)
- [ ] Tela: ações de contato no card, "Transformar em tarefa" / "Descartar"
- [ ] Verificação e deploy
