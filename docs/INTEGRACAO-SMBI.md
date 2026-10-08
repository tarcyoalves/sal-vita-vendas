# Integração CRM ↔ ERP SMBI

Documento para o Hermes (robô `smbi_criar_pedido_express.mjs`, mantido fora
deste repositório) e para o dono. Explica o que o CRM guarda, os dois
endpoints REST expostos para o robô, o fluxo completo e o que fica de fora
desta primeira versão.

## Por que REST e não tRPC

O robô é um script Node externo a este repositório, sem o cliente tRPC do
app. Por isso a integração usa duas rotas REST simples em `api/index.ts`,
autenticadas com um Bearer token próprio — o mesmo padrão dos crons
(`CRON_SECRET`), mas com um segredo dedicado (`SMBI_SYNC_SECRET`) para não
misturar o acesso do robô com o dos crons internos.

## O que o CRM guarda

Cada pedido (`fat_orders`, módulo Faturamento) tem, além dos campos normais
do pedido, seis colunas de integração com o SMBI:

| Coluna | Quem escreve | O que é |
|---|---|---|
| `smbi_condpag_sal_cod` | Atendente/admin, pela tela (`OrderDialog`) | Código SMBI da condição de pagamento do sal, tirado de `client/src/lib/faturamento/smbiCatalog.ts` |
| `smbi_condpag_frete_cod` | Atendente/admin, pela tela | Idem, para o frete |
| `smbi_movsai_id` | **O robô** (via `POST .../retorno`) ou o **admin, só pela ação explícita "Vincular a pedido do SMBI"**; o formulário de edição nunca grava | ID do pedido criado no SMBI (tabela `movsai`) |
| `numero_nfe` | **Só o robô** (via `POST .../retorno`) | Número da NF-e emitida, quando existir |
| `numero_cte` | **Só o robô** (via `POST .../retorno`) | Número do CT-e emitido, quando existir |
| `comissao_comercial_protegida` | Só admin; um payload nulo nunca a zera | Reservado para uma comissão "travada" no momento da criação no SMBI (ainda sem uso na tela) |

**Regra de permissão (`resolveRobotOwnedFields`, `server/lib/smbi.ts`):** `upsertPedido` e
`importLocal` nunca gravam `smbi_movsai_id`, `numero_nfe` e `numero_cte` — para NENHUM papel,
inclusive admin. Numa atualização o valor já gravado é sempre mantido; numa criação começam
`null`. Motivo: com a tela desatualizada (o robô gravou o movsai depois que ela carregou), o
admin mandava `null` e o UPDATE apagava o vínculo, devolvendo o pedido à fila do robô e
duplicando-o no ERP. Esses três só mudam por `POST /api/smbi/pedidos/:id/retorno`.
`comissao_comercial_protegida` só muda por admin e nunca é zerada por `null`. Só
`smbi_condpag_sal_cod` e `smbi_condpag_frete_cod` são escritos pela tela normalmente.

## Prazos de pagamento digitados à mão

Pedidos antigos têm o prazo em texto livre ("30/60/90", "à vista") e a coluna do código
SMBI vazia. O `GET /api/smbi/pedidos` **deriva o código do texto** quando ele corresponde
com certeza a uma condição do catálogo (`shared/smbiCondicoes.ts`): "30/60/90", "30 / 60 / 90
dias" e "30/60/90 DIAS" viram o código 46; "20/40/60" vira 100, "40/60" vira 150 e "15/25" vira 104. Prazo que
**não está no catálogo** (ex.: "20/50/80") continua com código `null` — o robô deve pular e registrar. Para incluir um prazo novo, o dono
informa o código real do SMBI e ele entra na lista em `shared/smbiCondicoes.ts`.

## Só entra na lista do robô o pedido com clique provado

Um pedido só aparece em `GET /api/smbi/pedidos` (e em `?id=`) se estiver aprovado, sem movsai e
com `smbiSolicitadoEm` **e** `smbiSolicitadoPor` preenchidos. Os dois são gravados juntos, e só
pela ação do botão "Enviar pedido para SMBI" (que agora pede confirmação). A resposta traz os dois
campos: **o robô deve recusar pedido sem eles** (defesa dupla) e registrar hora/autor no próprio
log. Pedido sem `smbiSolicitadoPor` nunca sai, mesmo com hora — isso exclui qualquer resíduo
anterior ao campo. Caso real: o movsai 1115 foi criado para um pedido aprovado tarde que já era o
1071 no SMBI; o CRM não guardava quem clicou, então não deu para provar como ele entrou.

**Pedido que já existe no SMBI** (aprovado tarde, já embarcado): não use o botão de enviar. O admin
usa "Vincular a pedido do SMBI" e informa o número; o robô nunca cria pedido que já tem movsai.
Isso também corrige um vínculo errado (ação `faturamento.vincularSmbi`, só admin, com log).

## Contrato robô ⇄ CRM — etapa 1 (estabilidade)

Implementa as rotas 2, 8 e 9 do `CONTRATO-ROBO-CRM.md` (Hermes, 29/09/2026).

**Chave de parada (`roboAtivo`).** Nasce **desligada**. Só o admin liga, no painel "Robô do SMBI"
no topo de Faturamento. Desligada, `GET /api/smbi/pedidos` (e `?id=`) devolve `pedidos: []` —
a trava é do servidor. A resposta traz `roboAtivo` e `simulacao`. Com `?simular=1` a lista sai
mesmo desligado, para o robô conferir o que criaria; **nesse modo ele não pode criar nada**.

**`GET /api/smbi/pedidos`** ganhou `atualizadoEm` (última edição do pedido pela tela, ou a
criação). Se for posterior a `smbiSolicitadoEm`, o pedido foi editado depois do clique e o robô
deve reconferir antes de criar. Continuam: `smbiSolicitadoEm`, `smbiSolicitadoPor`, cliente,
`itens[]`, códigos de prazo e frete.

**`POST /api/smbi/pedidos/:id/retorno`** aceita, além de `smbiMovsaiId`/`numeroNfe`/`numeroCte`:

```json
{ "estado": "CRIADO|PENDENTE|ERRO|DIVERGENTE", "motivoCodigo": "…", "motivoTexto": "…",
  "tentativa": 1, "conferidoEm": "2026-09-29T15:00:00-03:00" }
```

- `motivoCodigo`: `CLIENTE_NAO_CADASTRADO`, `PRAZO_SEM_CODIGO`, `PRODUTO_SEM_CODIGO`,
  `MAIS_DE_UM_ITEM`, `PRECO_INVALIDO`, `CRIACAO_FALHOU`, `DIVERGENTE_APOS_CRIAR`.
- `CRIADO` exige movsai (no corpo ou já gravado) e não tem motivo; motivo só vale com `estado`
  (HTTP 400 nos outros casos). Cada `estado` novo **substitui** o anterior, inclusive o motivo.
- O CRM grava `smbiEstado`, `smbiMotivoCodigo`, `smbiMotivoTexto`, `smbiTentativa`,
  `smbiAtualizadoEm`, `smbiConferidoEm` e mostra no pedido o selo e a frase de "por que não foi".
- Um novo clique em "Enviar/Reenviar ao SMBI" **zera** o estado anterior (nova tentativa).
- Movsai diferente do já gravado continua sendo **409**; o estado não muda o vínculo.

**`POST /api/smbi/heartbeat`** a cada ciclo: `{ "versao", "ciclo", "pendentes", "pulados", "criados" }`
(inteiros ≥ 0). Resposta `{ ok, roboAtivo }`. O batimento **nunca** liga/desliga o robô. Sem sinal
por mais de 10 minutos, o painel do faturamento mostra o aviso em vermelho.

## Anti-duplicidade: reserva por ciclo e sem retentativa automática

Contra o robô criar o mesmo pedido duas vezes (caso 1113 = duplicata do 1112, e o 1115):

- **Reserva atômica.** `GET /api/smbi/pedidos` (robô ligado, sem `simular`) reserva, num único
  UPDATE, os pedidos que devolve: cada um sai com `reservaToken` e `reservadoAte` (15 min). Duas
  consultas ao mesmo tempo, ou dois ciclos sobrepostos, **nunca recebem o mesmo pedido**.
- **Um pedido por vez, nunca lote.** `GET /api/smbi/pedidos` (robô ligado, sem `simular`) devolve no
  máximo **um** pedido por consulta: o clique mais antigo. Enquanto esse pedido estiver reservado e sem
  resposta do robô, a lista vem vazia; o próximo só sai depois do `POST .../retorno` (que libera a
  reserva) ou quando a reserva vencer (15 min). Cada pedido sai só depois do clique do dono em
  "Enviar para SMBI".
- **Re-checagem exige o token.** `GET /api/smbi/pedidos?id=<id>&token=<reservaToken>` só devolve o
  pedido se o token bate e a reserva não venceu. Sem token, ou de outro ciclo, a lista vem vazia:
  **o robô não pode criar**. (Robô antigo que rechecava sem token fica parado — falha segura.)
- **A resposta encerra a reserva.** `POST .../retorno` com `smbiMovsaiId` ou `estado` libera a reserva.
  Se o robô cair no meio, o pedido volta à lista após 15 min; o robô deve procurar a marca
  `CRM:<id>` no SMBI antes de criar.
- **Sem retentativa automática.** Pedido devolvido como `PENDENTE`, `ERRO` ou `DIVERGENTE` sai da
  lista até um **novo clique** do dono ("Reenviar ao SMBI"), que zera o estado.
- **Vínculo manual bloqueia o robô.** Pedido com vínculo (`smbiVinculoEstado`) nunca é entregue.
- **O clique é travado no servidor:** pedido já **faturado** não pode ser enviado (é o caso do 1115:
  use "Vincular"), pedido vinculado não pode ser enviado, e não dá para reenviar enquanto o robô
  estiver com o pedido reservado. "Cancelar envio" desfaz um clique por engano antes de o robô pegar.
- `simular=1` nunca reserva e nunca expõe token.

## Contrato robô ⇄ CRM — etapas 2 e 3

**Rota 3 — `POST /api/smbi/pedidos/:id/faturamento`** (pedido ligado foi faturado no SMBI)

```json
{ "movsais": [{ "id": "1071", "pesoKg": 30000,
    "nfe": { "numero": "123", "chave": "…", "data": "2026-09-25", "valorTotal": 0, "valorSal": 0 },
    "cte": { "numero": "456", "chave": "…", "valorFrete": 0 } }],
  "faturadoEm": "2026-09-25T10:00:00-03:00", "snapshotHash": "…" }
```

- Só aceita se algum `movsais[].id` está ligado ao pedido (senão **409**). Aceita N movsais.
- Grava `status = faturado` + `faturadoEm`, `numeroNfe`/`numeroCte` (vários: "10, 11"), o espelho fiscal
  e `smbiAlertaDesconto`. **Nunca** altera itens, valor comercial nem comissão.
- Pedido que um humano já faturou: só o espelho é atualizado (status e data ficam).
- `alertaDesconto` = (Σ `nfe.valorSal` + Σ `cte.valorFrete`) **menor** que o total acordado (itens +
  frete) menos R$ 0,05. Igual = só realocação sal→frete, sem alerta. Idempotente.

**Rota 7 — `POST /api/smbi/pedidos/:id/status`** `{ "evento", "dados": {…}, "em": "<iso>" }`,
`evento` ∈ `EM_OE`, `FATURADO`, `CIOT`, `MDFE`, `CANCELADO_SMBI`, `EXCLUIDO_SMBI`. Vai para a linha do
tempo do pedido ("Histórico do SMBI"); evento repetido (mesmo pedido, evento e `em`) é ignorado.
`EXCLUIDO_SMBI` desfaz o vínculo (se `dados.movsaiId` vier e não for o ligado, só registra) e o pedido só
volta ao robô com **novo clique**.

**Rota 4 — `GET /api/smbi/vinculos`** → `[{ pedidoId, movsaiNumeros: [...], solicitadoEm, solicitadoPor }]`
(vínculos aguardando conferência).

**Rota 5 — `POST /api/smbi/vinculos/:pedidoId/resultado`**

```json
{ "movsais": [{ "id": "1071", "cnpj": "…", "cliente": "…", "faturado": true,
    "itens": [{ "produto": "…", "qtdKg": 30000, "valorUnit": 0 }], "nfe": {…}, "cte": {…}, "status": "…" }],
  "confere": { "cliente": true, "produto": true, "quantidade": true } }
```

Tudo confere **e** os movsais lidos são exatamente os do vínculo ⇒ `CONFERIDO` (e, se faturado, espelha como
na rota 3). Senão ⇒ `VINCULO_COM_DIVERGENCIA`: nada é espelhado; o admin vê a comparação lado a lado e
decide (confirmar ou desvincular).

**Rota 6 (tela, só admin):** "Vincular a pedido do SMBI" (um ou vários números; vale na hora e bloqueia o robô;
o robô confere depois), "Trocar vínculo", "Desvincular" (motivo obrigatório, auditado) e "Confirmar vínculo
mesmo assim". Tudo entra na linha do tempo com **quem** fez.

## Autenticação

Todas as rotas exigem `Authorization: Bearer $SMBI_SYNC_SECRET`.

- **Falha fechada:** sem `SMBI_SYNC_SECRET` configurado na Vercel, toda
  chamada recebe `401` — nunca existe um estado "sem checagem".
- Comparação em tempo constante (`crypto.timingSafeEqual`), para não vazar o
  segredo por timing.
- `SMBI_SYNC_SECRET` é **diferente** de `CRON_SECRET`: o robô nunca usa o
  segredo dos crons internos.

## Endpoints

### `GET /api/smbi/pedidos`

Lista pedidos aprovados pelo admin/manager que ainda não foram criados no
SMBI (`aprovado_em IS NOT NULL AND smbi_movsai_id IS NULL`), até 100 por
chamada, do mais antigo aprovado para o mais recente. O robô faz polling
nesta rota.

```bash
curl -s "https://lembretes.salvitarn.com.br/api/smbi/pedidos" \
  -H "Authorization: Bearer $SMBI_SYNC_SECRET"
```

```json
{
  "ok": true,
  "pedidos": [
    {
      "id": "abcd1234",
      "sellerName": "Fulano de Tal",
      "cnpj": "12345678000100",
      "razaoSocial": "Cliente X LTDA",
      "clienteNome": "Cliente X",
      "cidade": "Mossoró",
      "uf": "RN",
      "status": "estimado",
      "itens": [
        { "id": "i1", "produtoId": null, "descricao": "SAL DO FAZENDEIRO MOIDO 25 KG",
          "quantidade": 100, "pesoKg": 2500, "valorUnitario": 6.0,
          "pesoBrutoKg": 2600, "comissaoFixaPct": null, "isentoFrete": false }
      ],
      "prazoPagamentoSal": "30 DIAS",
      "prazoPagamentoFrete": "20 DIAS",
      "smbiCondpagSalCod": "2",
      "smbiCondpagFreteCod": "5",
      "valorFretePorUnidade": 120.5,
      "observacoes": "",
      "previsaoFaturamentoEm": "2026-09-30",
      "aprovadoEm": "2026-09-28T12:00:00.000Z",
      "aprovadoPor": "Admin"
    }
  ]
}
```

`?id=<pedidoId>` busca um pedido específico (qualquer status, aprovado ou
não) em vez da lista de pendentes — útil para o robô conferir o estado atual
de um pedido antes ou depois de agir.

```bash
curl -s "https://lembretes.salvitarn.com.br/api/smbi/pedidos?id=abcd1234" \
  -H "Authorization: Bearer $SMBI_SYNC_SECRET"
```

A resposta nunca inclui `smbiMovsaiId`/`numeroNfe`/`numeroCte`: o robô só lê
pedidos que ainda não têm esses valores (ou, com `?id=`, pode consultar um
pedido específico já criado — nesse caso o robô já sabe o que devolveu, não
precisa que o CRM ecoe de volta).

### `POST /api/smbi/pedidos/:id/retorno`

O robô devolve o que criou no SMBI. Corpo (`application/json`), ao menos um
campo, cada um até 40 caracteres:

```json
{ "smbiMovsaiId": "123456", "numeroNfe": "9876", "numeroCte": "5432" }
```

```bash
curl -s -X POST "https://lembretes.salvitarn.com.br/api/smbi/pedidos/abcd1234/retorno" \
  -H "Authorization: Bearer $SMBI_SYNC_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"smbiMovsaiId":"123456"}'
```

Regras:

- **404** se o pedido não existir.
- **409** se `smbi_movsai_id` já estiver gravado com um valor **diferente**
  do enviado — o vínculo com o ERP nunca é sobrescrito em silêncio. Reenviar
  o **mesmo** valor é idempotente (`200`, sem erro) — o robô pode repetir a
  chamada com segurança se a resposta anterior se perder.
- `numeroNfe`/`numeroCte` não têm essa trava: chegam depois do movsai
  (a NF-e/CT-e só existe depois do pedido criado) e sempre atualizam.
- **Nunca muda `status` nem `faturadoEm`.** Marcar um pedido como "faturado"
  continua sendo uma ação humana feita na tela do CRM — o retorno do SMBI só
  registra o vínculo com o ERP e os números fiscais, não fecha o pedido
  sozinho.

## Fluxo completo

```
1. Atendente cria o pedido (estimado) na tela de Faturamento,
   escolhendo as condições de pagamento do catálogo SMBI.
2. Admin/manager aprova o pedido (aprovadoEm/aprovadoPor).
3. Robô faz polling em GET /api/smbi/pedidos (aprovados, sem smbi_movsai_id).
4. Robô cria o pedido no SMBI e devolve o movsai via POST .../retorno.
5. Quando a NF-e/CT-e são emitidos no SMBI, o robô devolve os números
   (chamada separada, mesmo endpoint).
6. Alguém no CRM marca o pedido como faturado manualmente, quando o
   embarque de fato acontece — isso nunca é automático.
```

## De onde vêm os códigos de condição de pagamento

`client/src/lib/faturamento/smbiCatalog.ts` — `SMBI_CONDICOES_PAGAMENTO` —
foi fornecido pelo dono, espelhando a tabela de condições de pagamento do
SMBI. Não são inventados nem recalculados aqui; qualquer mudança nesses
códigos precisa vir do SMBI (dono ou Hermes), nunca de uma suposição da IA.

## Lacuna conhecida: catálogo de produtos não está ligado

`SMBI_PRODUTOS_CATALOGO` (mesmo arquivo) lista os produtos do SMBI com seus
IDs, mas os itens de um pedido no CRM (`fat_orders.itens`) carregam só o
**nome** do produto (`descricao`), sem nenhum `smbiId`. Isso significa que,
hoje, **o robô precisa mapear os itens do pedido para o SMBI pelo nome** —
não há de-para gravado no CRM. Esta versão da integração não resolve isso de
propósito (evitar inventar um mapeamento sem confirmação do dono); se for
necessário, o próximo passo é o dono confirmar o de-para exato entre os
nomes usados no CRM (`fat_products.nome`) e `SMBI_PRODUTOS_CATALOGO`, e algum
agente adicionar um campo de vínculo no catálogo de produtos do CRM.

## De-para confirmado: Sal Churrasco com Iodo Vita 25 kg (08/10/2026)

Por solicitação do Tarcyo, `SAL CHURRASCO COM IODO VITA 25 KG` corresponde ao
**código SMBI `55`**, **25 kg por saco**. O nome foi incluído no catálogo do
cliente (`client/src/lib/faturamento/smbiCatalog.ts`) e no catálogo instalado
do robô (`smbi_sync_crm_pedidos.mjs`). A exportação REST preserva `itens.descricao`;
o robô resolve o código por nome exato normalizado, sem ampliar correspondência
para Churrasco Salinas, Nota 10, sem iodo ou outra apresentação.

Testes: `tests/smbi-produto55.test.ts` (CRM) e `test_produto55_robo.mjs` (VPS,
exercita `mapearProduto` e o trecho puro real de `produtoComCerteza`, sem rede).
O daemon carrega o catálogo no início do processo: um processo que já estava
ativo precisa de reinício autorizado pelo Tarcyo para reconhecer a inclusão.
Nenhum pedido deve ser criado apenas para testar este de-para.

## Configuração necessária

`SMBI_SYNC_SECRET` — string aleatória longa — precisa estar configurada em
**dois lugares**, com o mesmo valor:

- Vercel → Settings → Environment Variables → Production (nunca escreva o
  valor num arquivo deste repositório, que é público)
- Na máquina onde `smbi_criar_pedido_express.mjs` roda, como variável de
  ambiente lida pelo robô ao montar o header `Authorization`

Sem essa variável configurada na Vercel, as duas rotas respondem sempre
`401` — é o comportamento esperado (falha fechada), não um bug.
