# confirmarVinculoSmbi passa o peso do pedido ao resolverFaturamento

- **Agente:** claude
- **Início/Fim:** 2026-10-01
- **Status:** concluído no código; aguardando deploy

`faturamento.confirmarVinculoSmbi` chamava `resolverFaturamento` sem o peso do pedido, então a confirmação manual de um vínculo divergente comparava o fiscal com o total acordado inteiro (alerta de desconto falso). Agora passa `pesoLiquidoDoPedido`, como a rota 3 e a rota 5. Verificado: `npm run check`, 362 testes. Não testado contra o banco real.
