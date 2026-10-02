# Contrato Robô (VPS) ⇄ CRM Lembretes — versão 1 (29/09/2026)

Objetivo: envio de pedidos estável, pedido faturado no SMBI espelhado no CRM, vínculo manual com pedido já faturado — sem mexer na comissão.

## Princípios
- A **VPS é a única que fala com o SMBI**. O CRM nunca acessa o SMBI. O robô puxa do CRM (polling de 2 min) e devolve resultados com o segredo já usado hoje (`SMBI_SYNC_SECRET`); recomendado evoluir para assinatura HMAC + horário.
- **Só cria pedido que o Tarcyo clicou** em "Enviar para SMBI" (`smbiSolicitadoEm` ≥ marco). Nada retroativo. Nunca recria pedido excluído no SMBI.
- **Comissão segue o PESO FATURADO (decisão do dono, 01/10/2026).** O robô nunca grava comissão nem valor comercial; quem faz a conta é o CRM: para pedido faturado com peso no espelho fiscal, comissão, valor e peso efetivos = pedido × (peso faturado ÷ peso do pedido) (`fatorPesoFaturado`, client/src/lib/faturamento/calc.ts). A base é a comercial (itens × % congelada), nunca o valor fiscal, porque o piso mínimo de frete baixa o sal na nota e sobe o frete. Fechamento do dia 05 e conciliação devem usar a mesma conta. (Antes: "Comissão NÃO muda com o faturamento.") O CRM mantém `comissao_comercial_protegida` (base comercial combinada do sal, regra da skill `crm-faturamento-pedidos`). O que o robô traz do SMBI é só **espelho fiscal**; nunca sobrescreve valor comercial nem comissão. O fechamento do dia 05 e a conciliação ficam com o Hermes.
- Idempotência: mesmo valor reenviado = OK; valor diferente para pedido já ligado = **409**.

## Rotas (as marcadas [novo] o Claude do CRM implementa)
1. `GET /api/smbi/pedidos` (existe). Deve trazer: id, `smbiSolicitadoEm`, cliente (CNPJ), itens[] (descrição, qtd, unidade), `smbiCondpagSalCod`, `smbiCondpagFreteCod`, `valorFretePorUnidade`, `atualizadoEm` (para detectar edição depois do clique). Só pedidos aprovados + clicados + sem movsai + não desvinculados.
2. `POST /api/smbi/pedidos/:id/retorno` (existe; **estender**). Corpo:
   `{ smbiMovsaiId?: string, estado: "CRIADO"|"PENDENTE"|"ERRO"|"DIVERGENTE", motivoCodigo?: string, motivoTexto?: string, tentativa?: number, conferidoEm?: iso }`
   Códigos de motivo: `CLIENTE_NAO_CADASTRADO`, `PRAZO_SEM_CODIGO`, `PRODUTO_SEM_CODIGO`, `MAIS_DE_UM_ITEM`, `PRECO_INVALIDO`, `CRIACAO_FALHOU`, `DIVERGENTE_APOS_CRIAR`. O CRM grava `smbiEstado`, `smbiMotivo`, `smbiAtualizadoEm` e mostra selo + motivo para o atendente ("por que não foi").
3. [novo] `POST /api/smbi/pedidos/:id/faturamento` — robô → CRM quando o pedido ligado foi faturado no SMBI:
   `{ movsais: [{ id, pesoKg, nfe: {numero, chave, data, valorTotal, valorSal}, cte: {numero, chave, valorFrete} }], faturadoEm, snapshotHash }`
   **Pedido com vários movsais ligados:** só vale como faturado quando TODOS os movsais ligados vierem no corpo; enquanto faltar algum, o CRM guarda o espelho como parcial (`parcial: true`) e NÃO marca faturado, não liga alerta e não usa o peso. O robô deve enviar a rota 3 quando todos estiverem faturados. O CRM: `status='faturado'`, preenche `nfe_numero`/`cte_numero` (aceitar **N movsais por pedido do CRM**, ex. carga com excesso de peso), guarda o espelho fiscal e **não altera** valor comercial/comissão. O total acordado é **ajustado ao peso faturado** (quantidade alterada não é desconto: sal e frete são por peso). Se `valorTotalFiscal(sal+frete) < total esperado` (tolerância R$ 0,05), marca `alertaDesconto=true` para Hermes/Tarcyo decidirem; se for igual, é só realocação sal→frete pelo piso mínimo de frete (baixa o sal, sobe o frete, o valor final do cliente não muda): nenhum alerta. Se o peso faturado difere do pedido, a tela avisa que a comissão segue o pedido até alguém ajustar a quantidade.
4. [novo] `GET /api/smbi/vinculos` — pedidos com vínculo manual solicitado: `[{ pedidoId, movsaiNumeros: [..], solicitadoEm, solicitadoPor }]`.
5. [novo] `POST /api/smbi/vinculos/:pedidoId/resultado` — o robô leu os movsais no SMBI:
   `{ movsais: [{ id, cnpj, cliente, itens:[{produto, qtdKg, valorUnit}], faturado: bool, nfe?, cte?, status }], confere: { cliente: bool, produto: bool, quantidade: bool } }`
   O CRM decide: tudo confere → aceita, grava `smbiMovsaiId` (e, se faturado, marca faturado com o espelho fiscal, como na rota 3) e **bloqueia criação pelo robô**. **O SMBI é a verdade; o CRM é espelho (decisão do dono, 01/10/2026):** se o robô leu exatamente os movsais ligados, o vínculo é aceito mesmo que quantidade, produto ou cliente difiram do pedido (`confere` fica só como informação). `VINCULO_COM_DIVERGENCIA` só se o robô leu movsais diferentes dos ligados.
6. [novo] Ação de tela (admin): "vincular ao pedido nº ___ do SMBI" (gera a fila da rota 4) e "desvincular" (auditado; desfaz vínculo errado como o do movsai 1115 apagado). O robô nunca desvincula.
7. [novo, fase 2] `POST /api/smbi/pedidos/:id/status` — `{ evento: "EM_OE"|"FATURADO"|"CIOT"|"MDFE"|"CANCELADO_SMBI"|"EXCLUIDO_SMBI", dados: {...}, em }` → linha do tempo do pedido. `EXCLUIDO_SMBI` desliga o vínculo; o pedido só volta ao robô com **novo clique**.
8. [novo] `POST /api/smbi/heartbeat` — a cada ciclo: `{ versao, ciclo, pendentes, pulados, criados }`. O CRM avisa se ficar > 10 min sem heartbeat.
9. [novo] Chave de parada: campo `roboAtivo` (false = robô não cria nada; consulta continua).

## Comportamento do robô (lado VPS — eu implemento)
- **Validar antes de criar** (cliente existe no SMBI, produto e prazos com código, preço/qtd/frete, 1+ itens) e devolver `PENDENTE` + motivo.
- **Conferir depois de criar** (ler o pedido no SMBI: cliente, itens, quantidade, valores == CRM); só então `CRIADO`; senão `DIVERGENTE`.
- **Achar antes de criar de novo:** grava `CRM:<id>` na observação do pedido do SMBI e procura por essa marca antes de criar (proteção contra queda no meio e resposta perdida).
- Retry máximo 2 com espera; nunca recria sem checar a marca; 401 = parar e avisar; 409 = nunca criar outro.
- Suporte a pedido com vários itens (ferramenta de criação estendida).
- Aviso no WhatsApp (via Hermes) se o robô parar ou pular muitos pedidos.

## Ordem de entrega
1. Rotas 2 e 8 + selo de motivo na tela + `roboAtivo` (estabilidade).
2. Rotas 3 e 7 (faturado espelhado; comissão protegida intacta).
3. Rotas 4, 5 e 6 (vínculo manual com pedido já faturado).


## O SMBI é a verdade; o CRM espelha (decisão do dono, 01/10/2026)
- Rota 3 (e a conferência do vínculo): para pedido de **1 item** com todos os movsais faturados, o CRM **reescreve** quantidade, peso, valor do sal (NF-e `valorSal`) e frete por tonelada (CT-e `valorFrete`) com os do SMBI. O pedido original fica em `itensEstimadoSnapshot` ("Desfazer faturamento" restaura). Vários itens ou faturamento parcial: não reescreve; o fator de peso cuida da comissão.
- Comissão: o corpo aceita `comissaoPct` opcional. **Só envie quando houver ajuste** (sal baixado e frete subido para atingir o piso de frete, compensado com % maior): o CRM adota esse % no pedido. Sem ele, a % do pedido não muda.
- Rota 4b `GET /api/smbi/ligados`: pedidos com movsai ligado e ainda não faturados no CRM: `[{ pedidoId, movsaiNumeros, vinculoEstado }]`. O robô confere o faturamento deles no SMBI (não depende de arquivo local).

- `GET /api/smbi/ligados` e `GET /api/smbi/vinculos` trazem também `cnpj` (do pedido) e `comissaoPct` (do pedido), para a trava de documento (raiz do CNPJ / CPF) e para decidir se manda `comissaoPct`.
