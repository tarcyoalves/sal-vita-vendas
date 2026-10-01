# SMBI: alerta de desconto compara com o valor proporcional ao peso faturado

- **Agente:** claude
- **Início:** 2026-10-01
- **Fim:** 2026-10-01
- **Status:** concluído no código; aguardando deploy
- **Branch:** `main`

## Regra do dono

1. Quantidade pode mudar entre o pedido e a carga (vendedor fecha de um jeito, aumenta ou diminui): isso altera valor, **não é desconto**.
2. Piso mínimo de frete: pedido de uma entrega/NF só para um cliente sem outras entregas precisa atingir o piso; baixa-se o sal e sobe-se o frete, mantendo o valor final do cliente. Comissão do representante correta.

## O que mudou

- `resolverFaturamento` compara o fiscal (sal + frete) com o **total esperado** = acordado × peso faturado ÷ peso do pedido (`totalEsperadoPeloPeso`). Sem peso de um dos lados, vale o acordado (comportamento anterior).
- Realocação sal→frete (mesmo total) continua sem alerta.
- Espelho fiscal guarda `pesoPedidoKg`, `pesoFaturadoKg`, `totalEsperado`.
- Tela: o alerta mostra o valor esperado para o peso faturado, e um aviso âmbar "Peso faturado diferente do pedido" explica que **a comissão segue o pedido** até alguém ajustar a quantidade.
- Vale também para o vínculo manual (rota 5). Testes novos em `tests/smbi-contrato-etapas-2-3.test.ts` (350 testes).

## Fora do escopo / decisão do dono

- O robô **não** altera quantidade, valor comercial nem comissão. Se a comissão deve seguir o peso faturado, quem ajusta é a pessoa, na tela.
- O CRM não calcula o piso mínimo de frete; só reconhece a realocação pelo total. Não sabemos o valor do piso nem a regra de "entrega única": não inventei.

## Verificado

`npm run check`, `npx vitest run` (350). Não testado contra o banco real.
