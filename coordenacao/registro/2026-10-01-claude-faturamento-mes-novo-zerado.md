# Faturamento "zerado" no 1º dia do mês

- **Agente:** claude
- **Início:** 2026-10-01
- **Fim:** 2026-10-01
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## O que o dono viu

Tela de Faturamento zerada em 01/10/2026.

## Diagnóstico (o que foi e o que não foi verificado)

- Os três painéis (`AdminBillingPanorama`, `AttendantBilling`, `BillingReport`) abrem no **mês atual** (`mesAtual()`); o mês é decidido pela data de competência (faturado → `faturadoEm`). No dia 01/10 não há pedido de outubro, então tudo aparece zerado.
- Logs de runtime de produção (últimas 3 h): **nenhum erro**. O `faturamento.getAll` não falhou.
- **Não confirmado em tela.** Se setembro também aparecer zerado, é outro problema (ver caso M do HANDOFF: coluna sem migração) e precisa de investigação.

## O que mudou

- `ultimoMesComPedidos` (calc.ts) e `AvisoMesSemPedidos`: quando o mês do filtro não tem pedido e um mês anterior tem, os três painéis mostram um aviso âmbar com botão "Ver <mês>". Nenhum dado é alterado.
- `tests/faturamento-mes-vazio.test.ts` (354 testes no total).
