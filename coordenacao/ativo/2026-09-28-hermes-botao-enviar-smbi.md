# Botão "Enviar pedido para SMBI" volta a filtrar

- **Agente:** hermes
- **Início:** 2026-09-28 21:10 BRT
- **Fim:**
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Pedido do Tarcyo: o robô CRM → SMBI só pode receber pedidos que ele enviou pelo
botão "Enviar pedido para SMBI". O commit 6626244 tirou o filtro
`smbiSolicitadoEm` da rota `GET /api/smbi/pedidos` e o robô criou no SMBI os
pedidos antigos 1108–1113 (1113 duplicado do 1112).

## Arquivos e áreas que vou tocar

- `api/index.ts` (só a rota `GET /api/smbi/pedidos`)
- `server/lib/smbi.ts` (função pura nova de elegibilidade)
- `tests/smbi-api.test.ts`
- `HANDOFF-HERMES.md` (seção 7, caso novo)

**Não vou tocar em:** schema, migrações, UI.

## Progresso

- [ ] filtro restaurado + trava em código puro
- [ ] testes
