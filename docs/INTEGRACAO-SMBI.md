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
| `smbi_movsai_id` | **Só o robô** (via `POST .../retorno`) ou admin | ID do pedido criado no SMBI (tabela `movsai`) |
| `numero_nfe` | **Só o robô** ou admin | Número da NF-e emitida, quando existir |
| `numero_cte` | **Só o robô** ou admin | Número do CT-e emitido, quando existir |
| `comissao_comercial_protegida` | **Só o robô** ou admin | Reservado para uma comissão "travada" no momento da criação no SMBI (ainda sem uso na tela) |

**Regra de permissão:** `upsertPedido`/`importLocal`
(`server/routers/faturamento.ts`) recusam deixar um atendente sobrescrever
`smbi_movsai_id`, `numero_nfe`, `numero_cte` ou `comissao_comercial_protegida`.
Numa atualização, o valor já gravado no banco é mantido sempre que quem está
salvando não é `admin` — mesmo que o payload do cliente traga outra coisa
(mirror desatualizado, por exemplo). Numa criação, esses quatro campos
começam sempre `null` para quem não é admin. Só `smbi_condpag_sal_cod` e
`smbi_condpag_frete_cod` são escritos pela tela normalmente.

## Prazos de pagamento digitados à mão

Pedidos antigos têm o prazo em texto livre ("30/60/90", "à vista") e a coluna do código
SMBI vazia. O `GET /api/smbi/pedidos` **deriva o código do texto** quando ele corresponde
com certeza a uma condição do catálogo (`shared/smbiCondicoes.ts`): "30/60/90", "30 / 60 / 90
dias" e "30/60/90 DIAS" viram o código 46. Prazo que **não está no catálogo** (ex.: "20/40/60")
continua com código `null` — o robô deve pular e registrar. Para incluir um prazo novo, o dono
informa o código real do SMBI e ele entra na lista em `shared/smbiCondicoes.ts`.

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

## Configuração necessária

`SMBI_SYNC_SECRET` — string aleatória longa — precisa estar configurada em
**dois lugares**, com o mesmo valor:

- Vercel → Settings → Environment Variables → Production (nunca escreva o
  valor num arquivo deste repositório, que é público)
- Na máquina onde `smbi_criar_pedido_express.mjs` roda, como variável de
  ambiente lida pelo robô ao montar o header `Authorization`

Sem essa variável configurada na Vercel, as duas rotas respondem sempre
`401` — é o comportamento esperado (falha fechada), não um bug.
