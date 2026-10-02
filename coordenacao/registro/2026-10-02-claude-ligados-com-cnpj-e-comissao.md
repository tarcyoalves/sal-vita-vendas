# /ligados e /vinculos trazem cnpj e comissaoPct

- **Agente:** claude
- **Início/Fim:** 2026-10-02
- **Status:** concluído no código; aguardando deploy

Revisão do `smbi_espelho_daemon.mjs` do Hermes: ele lê `v.cnpj`/`l.cnpj` e `v.comissaoPct`/`l.comissaoPct`, que as rotas não devolviam. Resultado: a trava de documento nunca disparava e `comissaoPct` nunca era enviado. As duas rotas agora devolvem `cnpj` e `comissaoPct` do pedido. Verificado: `npm run check`, 371 testes. Não testado contra o banco real.
