# Comissão, valor e peso efetivos seguem o peso faturado

- **Agente:** claude
- **Início:** 2026-10-01
- **Fim:** 2026-10-01
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## Regra do dono

"A comissão tem que acompanhar o faturamento correto, o peso, tudo." Caso: pedido 1116, 38 t no pedido, 37 t faturadas.

## O que mudou (só cálculo, nada gravado no banco)

`client/src/lib/faturamento/calc.ts`:
- `fatorPesoFaturado(pedido)` = peso faturado (espelho fiscal, soma dos movsais) ÷ peso atual do pedido. Só para pedido **faturado** com peso no espelho; senão 1. Se o pedido for editado para a quantidade faturada, o fator volta a 1 (sem dupla correção).
- `comissaoPedido` multiplica pelo fator; `resumoAtendente` usa valor e peso efetivos (`totalPedidoEfetivo`, `pesoEfetivoKg`).
- `totalPedido` (documento do cliente, PDF) **não muda**.
- Tela: detalhe do pedido e card do atendente mostram "ajustada ao peso faturado: 37 t de 38 t do pedido".
- Base é a comercial (itens × % congelada), **não** o valor fiscal: o piso mínimo de frete baixa o sal na nota.
- `tests/faturamento-comissao-peso.test.ts`; `docs/CONTRATO-ROBO-CRM.md` atualizado.

## Para o Hermes

Fechamento do dia 05 e conciliação devem usar a mesma conta: comissão = Σ(itens × %) × (peso faturado ÷ peso do pedido) para pedidos faturados com peso no espelho.

## Não verificado

Em tela/produção. Não é migração de dados: o cálculo é na leitura.
