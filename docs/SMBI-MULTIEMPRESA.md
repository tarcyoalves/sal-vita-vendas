# Envio ao SMBI com escolha de empresa — contrato v2 (CRM ⇄ robô da VPS)

Etapa 1 (lado do CRM). **Nada foi instalado, ligado ou executado contra banco real.** O interruptor
`multiempresa_ativo` (`smbi_robot_state`) nasce **FALSE**: com ele desligado o fluxo atual (robô v1) segue idêntico.

## Decisões de negócio
- Duas empresas no SMBI (catálogo canônico em `shared/smbiEmpresas.ts`, comparação por string exata de 14 dígitos):
  - **A S Comércio — Sal Vita**, CNPJ `51422900000168`, `homologada: true`
  - **C Alves Comércio e Moagem de Sal**, CNPJ `49748258000160`, `homologada: false` (vira `true` num commit futuro, depois
    do mapa de códigos aprovado)
- O pedido é digitado normalmente; a empresa é escolhida **só no clique de "Enviar para o SMBI"** (admin e gerente). Uma
  empresa por pedido do CRM. Crédito/regime fiscal **não** afeta cálculo, comissão nem peso no CRM.
- Identidade de referência no ERP = **(empresa, movsai)**. A anti-recriação continua por ID do CRM, global.
- O CNPJ do **comprador** nunca é lido como empresa (`empresaPorCnpj` só aceita as duas strings do catálogo).

## O que o CRM garante
1. Empresa obrigatória e homologada no clique (`dispararSmbi({ id, empresaCnpj })`); recusa clara: "C Alves ainda não está habilitada".
2. A cada clique válido o servidor gera `smbi_solicitacao_id` (UUID) e `smbi_solicitacao_hash` (sha256 canônico de comprador,
   itens ordenados, quantidades, valores, prazos, frete e empresa; sem timestamp nem segredo).
3. Troca de empresa só **antes da primeira reserva** (`smbi_empresa_travada_em` nulo), por UPDATE condicional. A primeira
   reserva fixa `smbi_empresa_travada_em` uma única vez; ele **nunca** é apagado (nem ao vencer a reserva, nem em
   cancelar/vincular/desvincular). Reserva vencida nunca libera troca nem recriação.
4. `smbi_escrita_iniciada_em` é gravado pelo servidor em `POST /iniciar`, **antes** da primeira escrita física. Pedido com
   marcador e sem movsai não volta à fila nem aceita novo clique: só reconciliação humana (Vincular). Desvincular só limpa o
   marcador quando o movsai foi gravado pelo próprio robô (retorno CRIADO), nunca em vínculo manual.
5. A fila (gate ligado) só entrega pedido com: aprovação, prova do clique, `roboAtivo`, sem movsai/vínculo, sem estado que
   para, empresa do catálogo **homologada**, solicitação **vigente** (hash recalculado = gravado e pedido não editado depois
   do clique) e sem risco de escrita. Entrega **um** pedido por vez (como hoje).
6. Retorno de solicitação/empresa errada é **rejeitado sem limpar o token atual** (a decisão é antes do UPDATE, e o UPDATE
   ainda confere empresa, solicitação e token).
7. `upsertPedido`, `importLocal` e o cache antigo da tela **não escrevem nem limpam** nenhum campo empresarial.
8. `vincularSmbi` recusa pedido com reserva vigente; com o gate ligado exige empresa (a do pedido, ou a informada pelo admin,
   origem `VINCULO_MANUAL`) e trava a empresa.
9. Cadastro assistido **por empresa**: chave `(empresa_cnpj, cnpj)`; aprovação/conferência numa empresa não vale na outra.

## Contrato v2 do robô

### Header de protocolo
`X-SMBI-Protocolo: 2` em **todas** as chamadas operacionais. Ausente = worker v1.
- Gate **ligado** + worker v1: `GET /api/smbi/pedidos` devolve `pedidos: []` + `aviso`, sem reservar nada.
- Pedido **com** empresa: toda rota operacional (retorno, /iniciar, faturamento, status, resultado do vínculo) exige protocolo 2
  (HTTP 400, `codigo: PROTOCOLO_2_OBRIGATORIO`). `/ligados` e `/vinculos` simplesmente omitem esses pedidos para o v1.
- Gate **desligado**: nada muda; pedido legado sem empresa segue o comportamento antigo; pedido com empresa não sai na fila.

### `GET /api/smbi/pedidos` (gate ligado)
Cada pedido ganha `empresaCnpj`, `solicitacaoId`, `solicitacaoHash`. A resposta ganha `multiempresaAtivo`. O CRM reserva o
pedido (token de 15 min) e, na primeira reserva, trava a empresa. Re-checagem: `?id=…&token=…` (igual a hoje).

### `POST /api/smbi/pedidos/:id/iniciar` (novo)
Header `X-SMBI-Reserva: <token>`, `X-SMBI-Protocolo: 2`. Corpo: `{ empresaCnpj, solicitacaoId, solicitacaoHash }`.
Uma operação condicional confere Bearer, protocolo, gates (`robo_ativo` e `multiempresa_ativo`), empresa homologada, solicitação,
hash (e que o pedido não foi editado) e a reserva viva; **grava `smbi_escrita_iniciada_em` antes de responder**.
- `200 { ok, jaIniciado:false, iniciadoEm }` → pode escrever.
- `200 { ok, jaIniciado:true }` → o marcador já existia: **não escreva**; reconcilie no SMBI (marca `CRM:<id>`).
- `409` com `codigo` (`EMPRESA_DIVERGENTE`, `EMPRESA_NAO_HOMOLOGADA`, `SOLICITACAO_OBSOLETA`, `RESERVA_INVALIDA`,
  `PEDIDO_NAO_ELEGIVEL`, `GATE_DESLIGADO`, `CONCORRENCIA`) → não escreva.
- Timeout, erro de rede ou resposta ambígua **nunca** autoriza escrita.

### `POST /api/smbi/pedidos/:id/retorno` (pedido com empresa)
Corpo ganha `empresaCnpj` e `solicitacaoId` (obrigatórios) e o header `X-SMBI-Reserva` é obrigatório quando o retorno encerra a
tentativa (`smbiMovsaiId` ou `estado`). Recusas (409, token intacto): `EMPRESA_DIVERGENTE`, `SOLICITACAO_OBSOLETA`,
`RESERVA_INVALIDA`. Repetição idêntica depois do token liberado continua idempotente. NF-e/CT-e avulsos exigem empresa e
solicitação, não o token. Os 7 motivos atuais continuam os únicos aceitos em `motivoCodigo`: para empresa não habilitada,
empresa divergente ou solicitação obsoleta devolva `PENDENTE` + `CRIACAO_FALHOU` + `motivoTexto` descrevendo o caso (os
códigos novos entram no enum quando a tela receber os rótulos).

### Referências ERP = (empresa, movsai)
- `GET /api/smbi/ligados` e `GET /api/smbi/vinculos`: cada item leva `empresaCnpj` (null no legado). Procure o número **na
  empresa indicada**; o mesmo número em duas empresas são pedidos diferentes.
- `POST /api/smbi/pedidos/:id/faturamento` e `POST /api/smbi/vinculos/:pedidoId/resultado`: corpo leva `empresaCnpj` (a
  empresa em que os movsais foram **lidos**). Pedido com empresa: divergência = 409; movsais fora do vínculo = 409; faltando
  documento esperado continua **parcial** (não fatura, sem alerta). `POST …/status` também leva `empresaCnpj`.

## Ordem das operações do worker (VPS) por pedido
1. Lock global (um pedido por vez, como hoje).
2. `GET /api/smbi/pedidos` com `X-SMBI-Protocolo: 2`; revalidar solicitação (`GET ?id&token`: ainda vigente, mesmo hash).
3. Abrir sessão no SMBI.
4. Selecionar/conferir a **empresa** pela navegação nativa do SMBI (a empresa lida na tela tem que ser `empresaCnpj`).
5. Checar duplicidade (marca `CRM:<id>` + comprador) **naquela empresa**.
6. Validar cadastros e catálogos **da empresa** (cliente, produto, prazos). Falha → retorno `PENDENTE` (nada escrito).
7. `POST /iniciar` (só escreve com `jaIniciado:false` e 200 confirmado).
8. Criar o pedido.
9. Reler e conferir **empresa** e pedido (cliente, itens, quantidades, valores).
10. `POST /retorno` com `empresaCnpj` + `solicitacaoId` + `X-SMBI-Reserva` (+ movsai/estado).
11. Liberar o lock.

## Quem garante o quê
| CRM | VPS |
|---|---|
| Empresa/homologação/solicitação/hash, travamento, marcador de risco, fila, rejeição de retorno tardio, `(empresa, movsai)` em /ligados e /vinculos, rejeição de faturamento de outra empresa | Operar na empresa certa (conferir pela tela), nunca escrever sem `/iniciar` confirmado, reconciliar quando `jaIniciado:true`, mapa de códigos por empresa, usar o header e os campos novos, nunca assumir empresa padrão |

## Implantação (nada foi feito ainda)
1. Deploy do CRM com a migração (colunas novas; `multiempresa_ativo` = FALSE). Conferir `[migrate:build] ok` no log.
2. Ferramentas da VPS (criação com empresa, `/iniciar`, leitura por empresa).
3. Daemon da VPS com `X-SMBI-Protocolo: 2`.
4. Admin liga `multiempresa_ativo` (`setMultiempresaAtivo`).
5. Piloto na **A S Comércio** (um pedido real, acompanhado).
6. Homologar a C Alves (mapa de códigos aprovado).
7. Commit trocando `homologada: true` da C Alves em `shared/smbiEmpresas.ts`.
8. Piloto na **C Alves**.

Para reverter: desligar `multiempresa_ativo`. Pedidos com empresa deixam de sair na fila; o legado volta ao fluxo v1.

## Declaração
Esta entrega **não instalou nada na VPS, não ligou nenhum gate** (`multiempresa_ativo`, `cadastro_ativo`, `robo_ativo` seguem como
estavam), **não executou DDL contra banco real** e **não fez backfill**: pedidos antigos ficam com `smbi_empresa_cnpj` NULL.
