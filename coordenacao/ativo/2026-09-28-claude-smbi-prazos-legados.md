# SMBI: reconhecer prazos de pagamento digitados como texto livre

- **Agente:** claude
- **Início:** 2026-09-28 BRT
- **Fim:** <preencha ao concluir>
- **Status:** em andamento
- **Branch:** `main`

## Objetivo

Pedidos antigos têm prazo em texto livre ("30/60/90", "20/40/60") e por isso ficam sem
código SMBI — o robô os pularia. Reconhecer as variações ("30/60/90" = "30/60/90 DIAS",
código 46) na tela e na API do robô. Não invento código: prazos que o catálogo não tem
(ex.: "20/40/60") continuam sem código até o dono informar o do SMBI.

## Arquivos e áreas que vou tocar

- `shared/smbiCondicoes.ts` (novo — catálogo de condições + normalização, usado por cliente e servidor)
- `client/src/lib/faturamento/smbiCatalog.ts` (só passa a reexportar a lista do shared; produtos ficam)
- `client/src/components/faturamento/OrderDialog.tsx` (só o casamento código ↔ descrição)
- `server/lib/smbi.ts` (código derivado quando a coluna está vazia)
- `tests/smbi-condicoes.test.ts` (novo)

**Não vou tocar em:** banco/migração, `server/routers/faturamento.ts`, o robô.

## Progresso

- [ ] Normalização + testes
- [ ] Tela e API usando
- [ ] Deploy
