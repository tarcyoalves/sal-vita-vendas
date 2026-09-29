# Contrato Robô (VPS) ⇄ CRM Lembretes — versão 1 (29/09/2026)

Objetivo: envio de pedidos estável, pedido faturado no SMBI espelhado no CRM, vínculo manual com pedido já faturado — sem mexer na comissão.

## Princípios
- A **VPS é a única que fala com o SMBI**. O CRM nunca acessa o SMBI. O robô puxa do CRM (polling de 2 min) e devolve resultados com o segredo já usado hoje (`SMBI_SYNC_SECRET`); recomendado evoluir para assinatura HMAC + horário.
- **Só cria pedido que o Tarcyo clicou** em "Enviar para SMBI" (`smbiSolicitadoEm` ≥ marco). Nada retroativo. Nunca recria pedido excluído no SMBI.
- **Comissão NÃO muda com o faturamento.** O CRM mantém `comissao_comercial_protegida` (base comercial combinada do sal, regra da skill `crm-faturamento-pedidos`). O que o robô traz do SMBI é só **espelho fiscal**; nunca sobrescreve valor comercial nem comissão. O fechamento do dia 05 e a conciliação ficam com o Hermes.
- Idempotência: mesmo valor reenviado = OK; valor diferente para pedido já ligado = **409**.

## Rotas (as marcadas [novo] o Claude do CRM implementa)
1. `GET /api/smbi/pedidos` (existe). Deve trazer: id, `smbiSolicitadoEm`, cliente (CNPJ), itens[] (descrição, qtd, unidade), `smbiCondpagSalCod`, `smbiCondpagFreteCod`, `valorFretePorUnidade`, `atualizadoEm` (para detectar edição depois do clique). Só pedidos aprovados + clicados + sem movsai + não desvinculados.
2. `POST /api/smbi/pedidos/:id/retorno` (existe; **estender**). Corpo:
   `{ smbiMovsaiId?: string, estado: "CRIADO"|"PENDENTE"|"ERRO"|"DIVERGENTE", motivoCodigo?: string, motivoTexto?: string, tentativa?: number, conferidoEm?: iso }`
   Códigos de motivo: `CLIENTE_NAO_CADASTRADO`, `PRAZO_SEM_CODIGO`, `PRODUTO_SEM_CODIGO`, `MAIS_DE_UM_ITEM`, `PRECO_INVALIDO`, `CRIACAO_FALHOU`, `DIVERGENTE_APOS_CRIAR`. O CRM grava `smbiEstado`, `smbiMotivo`, `smbiAtualizadoEm` e mostra selo + motivo para o atendente ("por que não foi").
3. [novo] `POST /api/smbi/pedidos/:id/faturamento` — robô → CRM quando o pedido ligado foi faturado no SMBI:
   `{ movsais: [{ id, pesoKg, nfe: {numero, chave, data, valorTotal, valorSal}, cte: {numero, chave, valorFrete} }], faturadoEm, snapshotHash }`
   O CRM: `status='faturado'`, preenche `nfe_numero`/`cte_numero` (aceitar **N movsais por pedido do CRM**, ex. carga com excesso de peso), guarda o espelho fiscal e **não altera** valor comercial/comissão. Se `valorTotalFiscal(sal+frete) < total acordado` (tolerância R$ 0,05), marca `alertaDesconto=true` para Hermes/Tarcyo decidirem; se for igual, é só realocação sal→frete (nenhum alerta).
4. [novo] `GET /api/smbi/vinculos` — pedidos com vínculo manual solicitado: `[{ pedidoId, movsaiNumeros: [..], solicitadoEm, solicitadoPor }]`.
5. [novo] `POST /api/smbi/vinculos/:pedidoId/resultado` — o robô leu os movsais no SMBI:
   `{ movsais: [{ id, cnpj, cliente, itens:[{produto, qtdKg, valorUnit}], faturado: bool, nfe?, cte?, status }], confere: { cliente: bool, produto: bool, quantidade: bool } }`
   O CRM decide: tudo confere → aceita, grava `smbiMovsaiId` (e, se faturado, marca faturado com o espelho fiscal, como na rota 3) e **bloqueia criação pelo robô**. Divergência → estado `VINCULO_COM_DIVERGENCIA` com comparação lado a lado, aguardando confirmação do admin.
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
