# SMBI: reconhecer prazos de pagamento digitados como texto livre

- **Agente:** claude
- **Início:** 2026-09-28 BRT
- **Fim:** 2026-09-28 BRT
- **Status:** concluído (código 100 = 20/40/60 e 150 = 40/60 informados pelo dono em 29/09/2026)
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

- [x] Normalização + testes (22)
- [x] Tela e API usando
- [x] Deploy

---

## Resultado

"30/60/90" (e variações como "30 / 60 / 90 dias") agora é reconhecido como a condição 46
na tela do pedido e no `GET /api/smbi/pedidos`. Pedidos antigos passam a sair com código.

## Pendente

- **"20/40/60" não existe no catálogo do Hermes** e eu não inventei código. Precisa do código
  real do SMBI (ou da tabela `condpag` inteira) para entrar em `shared/smbiCondicoes.ts`.
  Enquanto isso, pedidos com esse prazo saem com código `null` e o robô os pula.
- Backfill: as colunas `smbi_condpag_*_cod` dos pedidos antigos continuam vazias no banco;
  a API deriva na leitura, mas o banco só é preenchido quando o pedido é salvo de novo.

## Verificado

- `npm run check` 0 erros; `npx vitest run --dir tests` passando; build do cliente e bundle da API ok.

## Armadilhas

- Não amplie a normalização para casar texto com mais informação ("30 dias após a NF"):
  um prazo errado no SMBI vira cobrança errada. O teste cobre esses casos.
