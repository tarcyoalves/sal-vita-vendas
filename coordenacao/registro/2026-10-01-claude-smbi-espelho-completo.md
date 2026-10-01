# SMBI manda: o pedido espelha quantidade, peso, valores e comissão; lista de ligados

- **Agente:** claude
- **Início/Fim:** 2026-10-01
- **Status:** concluído no código; aguardando deploy

Pedido #5239 (Agro Pet) ficou faturado mas mostrando 8.000 kg: o espelho só gravava o fiscal ao lado, sem reescrever o pedido. Agora (`espelharPedidoDoSmbi`): 1 item faturado => quantidade, peso, valor do sal e frete/t = SMBI; original em `itensEstimadoSnapshot`. `comissaoPct` opcional no corpo (rotas 3 e 5): adotado quando o SMBI tem ajuste. Parcial/vários itens: não reescreve.
Novo `GET /api/smbi/ligados` (ligados e não faturados). Texto do selo CONFERIDO corrigido.
Verificado: `npm run check`, 368 testes. Não testado contra o banco real. Pedidos já espelhados (1116, 1117, 1071, 1065, 1100) precisam do reenvio do payload para serem reescritos.
