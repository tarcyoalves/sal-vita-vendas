# Contrato Hermes ⇄ Sal Vita Sales AI (rotas `/api/sales/*`)

Este é o contrato HTTP entre o servidor do Sal Vita (Vercel, `api/index.ts` → `server/salesRoutes.ts`)
e o **executor do Hermes** (processo na VPS do dono que envia e-mail de prospecção por uma caixa comum
via SMTP e lê a caixa de entrada via IMAP). Fonte da verdade no código:

| O quê | Onde |
|---|---|
| Schemas de entrada (zod), escopos e variáveis | `shared/sales.ts` (`HERMES_SCOPES`, `reservarBodySchema`, …) |
| Rotas e autenticação | `server/salesRoutes.ts`, `server/lib/sales/rotasPuro.ts` |
| Fila, autorização, resultado, caixa de entrada | `server/lib/sales/hermes.ts` |
| Regras puras (reserva, autorização, resultado, conciliação) | `server/lib/sales/despacho.ts`, `operacoesPuro.ts` |
| Ciclo (ponte Radar, lote, cadência, conciliação, saída CRM) | `server/lib/sales/ciclo.ts`, `ponte.ts` |

Quando este documento e o código discordarem, **o código vence** — corrija este arquivo.

---

## 1. Regras que não mudam

1. **Nada sai desligado.** O sistema nasce em modo `DRY_RUN`, com o canal desligado
   (`canal.ativo = false`) e sem política aprovada (`canal.politicaAprovada = false`). A fila só entrega
   mensagem quando o **dono** liga as três coisas: modo que permite reservar (`REVIEW`,
   `SEMI_AUTONOMOUS` ou `AUTONOMOUS`), canal ativo e política aprovada. Sem isso, `reservar` devolve
   lista vazia e `autorizar` nega.
2. **Nunca reenviar `UNKNOWN`.** Mensagem cujo resultado o servidor não sabe (o executor caiu depois de
   receber a autorização) fica `UNKNOWN` e **só um humano** a concilia no painel. O executor nunca
   reenvia por conta própria uma mensagem que já autorizou — nem depois de reiniciar, nem com outro
   `messageId`.
3. **Credenciais SMTP/IMAP vivem só no executor.** Elas nunca vão para o servidor, para o banco, para
   o modelo de IA (Hermes/LLM), para log ou para prompt. O modelo decide classificações e propostas; quem
   abre conexão SMTP é o código do executor, com segredo lido do ambiente da VPS.
4. **Resend e Brevo nunca são usados para prospecção.** As políticas deles proíbem e-mail frio. O código
   do Sales AI não importa nenhum remetente do sistema (há teste que reprova o build se importar).
5. **O executor envia exatamente o que a autorização devolveu**: `para`, `assunto`, `corpo`,
   `Message-ID` e os cabeçalhos de descadastro. Não reescreve, não traduz, não acrescenta texto, não troca
   o destinatário. O `contentHash` é `sha256(assunto + "\n\n" + corpo)` em hex; confira antes de enviar.
6. **Supressão prevalece.** Falha ao consultar a supressão = não envia.
7. **Clique não é autorização** nem prova de interesse. Só resposta humana conta.

---

## 2. Autenticação e limites

Cada escopo tem um segredo próprio, numa variável de ambiente do projeto na Vercel:

| Escopo | Variável | Rotas |
|---|---|---|
| `leitura` | `SALES_HERMES_SECRET_READ` | `GET /api/sales/modo`, `GET /api/sales/relatorio`, `POST /api/sales/heartbeat` |
| `despacho` | `SALES_HERMES_SECRET_DISPATCH` | `POST /api/sales/fila/reservar`, `POST /api/sales/envio/:id/autorizar`, `POST /api/sales/envio/:id/resultado`, `POST /api/sales/caixa/eventos` |
| `propostas` | `SALES_HERMES_SECRET_PROPOSE` | `POST /api/sales/propostas` |
| `operacao` | `SALES_HERMES_SECRET_OPERATE` | `POST /api/sales/ciclo` |

- Cabeçalho: `Authorization: Bearer <segredo>`. Comparação em tempo constante.
- Variável ausente, vazia ou com menos de **16 caracteres** → `503 {"error":"escopo desativado"}`.
  Escopo desligado = rota fechada (falha fechado). O banco não é tocado.
- Segredo errado, cabeçalho ausente ou fora do formato → `401 {"error":"Unauthorized"}`.
- A autenticação acontece **antes** de qualquer acesso ao banco: chamada anônima não acorda o Neon.
- Segredos diferentes por escopo: o segredo de leitura não abre o despacho. Guarde no executor só os
  escopos que ele usa. Os valores **nunca** entram no repositório (ele é público).
- Corpo JSON, `Content-Type: application/json`. Teto de corpo: **2 KB** (reservar, autorizar, resultado,
  heartbeat, ciclo), **8 KB** (eventos), **16 KB** (propostas). Acima disso → `413 {"error":"corpo grande demais"}`.
- Campos desconhecidos no corpo → `400 {"error":"corpo inválido","detalhes":{...}}` (os schemas são `.strict()`).
- Limite de requisições por IP e por minuto: leitura 60, despacho 240, eventos 120, propostas 30,
  heartbeat 30, ciclo 6. Acima → `429 {"error":"muitas requisições"}` (respeite `RateLimit-*`/`Retry-After`).
- Erro inesperado no servidor → `500 {"error":"erro interno"}`. Para o despacho, trate 500 como
  "não autorizado" (não envie).

`executor` (em todos os corpos): 3–64 caracteres `[A-Za-z0-9._:-]`, estável por processo/máquina
(ex.: `vps1-smtp-a`). É o mesmo valor em reservar, autorizar, resultado e heartbeat.

---

## 3. Ciclo de vida de uma mensagem

```
                ciclo gera (lote do dia ou cadência)
                              │
                              ▼
     ┌──────────────────► PENDING ◄──────────────────────────────┐
     │                        │ reservar (fence+1, token novo)    │
     │                        ▼                                   │
     │ reserva vencida /  RESERVED ── autorizar negado ──────────►│ (liberar: fence+1)
     │ PAUSED / liberar       │      (cancelar) ──► CANCELLED     │
     └────────────────────────┤                                   │
                              │ autorizar OK (fence confere)      │
                              ▼                                   │
                         DISPATCHING ── prazo vence sem resultado ──► UNKNOWN ──► (humano)
                              │                                        │  foi_enviada ──► ACCEPTED
                              │ resultado                              │  nao_foi_enviada ──► PENDING (fence+1)
             ┌────────────────┼──────────────────┬──────────────┐      │  executor informa depois ──► (resultado)
             ▼                ▼                  ▼              ▼
          ACCEPTED   RETRYABLE_FAILURE   PERMANENT_FAILURE   UNKNOWN
                              │ backoff (5 min, 30 min, 2 h)
                              └──► reservável de novo (volta a RESERVED)
```

- `fence` (número de ordem) sobe a cada reserva, a cada reserva liberada/revogada e a cada cancelamento.
  Autorização com `fence` diferente do atual perde (`409 fence_antigo`). Dois executores (ou duas
  tentativas do mesmo) nunca despacham a mesma mensagem: a passagem `RESERVED → DISPATCHING` é um
  único `UPDATE ... WHERE status='RESERVED' AND fence=? AND token=?`.
- `attempts` sobe a cada **autorização** concedida (`RESERVED → DISPATCHING`), não a cada reserva: uma
  reserva devolvida (intervalo mínimo, pausa, revogação, vencida) não gasta tentativa. Com
  `RETRYABLE_FAILURE` e `attempts >= limites.maxTentativas` (padrão 3), a mensagem vira `PERMANENT_FAILURE`.
- `next_retry_at` vale para `RETRYABLE_FAILURE` (espera crescente) **e** para `PENDING` adiada pela
  autorização (`intervalo_minimo`, `teto_empresa`): a fila só a oferece de novo depois dessa hora.
- `ACCEPTED`, `PERMANENT_FAILURE` e `CANCELLED` são finais. `UNKNOWN` só sai por humano ou pelo
  próprio executor informando o resultado da mesma tentativa (com o mesmo `despachoToken`).
- Mensagens que o ciclo NÃO gera hoje: veja a seção 9 (descadastro).

---

## 4. Rotas

### 4.1 `GET /api/sales/modo` — escopo `leitura`

Para o executor decidir se trabalha. Sem efeito.

**Cache:** a resposta sai de um cache de **30 s por instância** do servidor (o executor chama a cada
ciclo). Mudança feita no painel aparece aqui em até 30 s (na mesma instância, na hora). Isso é só
orientação: `reservar` e `autorizar` leem modo e canal do banco a cada chamada, e o `UPDATE` final da
autorização confere de novo, no mesmo comando, que o modo envia e o canal está ligado com política
aprovada. Uma pausa vale para o despacho imediatamente, mesmo com `/modo` ainda mostrando o valor antigo.

Resposta `200`:
```json
{
  "modo": "DRY_RUN",
  "canal": { "ativo": false, "politicaAprovada": false },
  "agenteAtivo": false,
  "limites": {
    "novasEmpresasDia": 20, "enviosDia": 60, "intervaloMinHoras": 48, "maxMensagensPorEmpresa": 3,
    "cadenciaDias": [0, 4, 10], "reservaMinutos": 10, "despachoSegundos": 120, "maxTentativas": 3
  }
}
```
Modos: `DRY_RUN` (nada sai), `REVIEW` (só lote aprovado), `SEMI_AUTONOMOUS` (aprovado ou segmento
validado), `AUTONOMOUS` (dentro dos limites), `PAUSED` (nada novo sai; reservas revogadas).

### 4.2 `POST /api/sales/fila/reservar` — escopo `despacho`

Pedido:
```json
{ "executor": "vps1-smtp-a", "max": 5 }
```
`max`: 1–20.

Resposta `200` com mensagens:
```json
{
  "mensagens": [
    { "messageId": 812, "fence": 3, "reservaToken": "u2Jx…(32 chars base64url)", "reservadaAte": "2026-11-28T15:10:00.000Z" }
  ]
}
```
Resposta `200` sem nada (sempre `200`; o motivo é informativo):
```json
{ "mensagens": [], "motivo": "modo DRY_RUN não permite reservar" }
```
Motivos possíveis: modo não permite reservar; `canal de prospecção desligado`; `política do canal não
aprovada pelo dono`; `teto diário de N envios atingido`; `supressao_indisponivel` (a consulta de
supressão falhou — **nada** é reservado); sem motivo = fila vazia.

Regras:
- Um único comando SQL (`UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED LIMIT n) RETURNING`):
  reservas concorrentes nunca pegam a mesma mensagem.
- Só reserva: `PENDING`, ou `RETRYABLE_FAILURE` depois do backoff; jornada não pausada e no estado do
  passo (`CONTACT_REVIEW` no passo 0, `CONTACTED` nos demais); aprovada quando o modo exige; endereço
  fora das listas de supressão dos dois bancos.
- `n = min(max, enviosDia − envios de hoje)`. "Hoje" = dia de São Paulo.
- **Não devolve conteúdo.** O conteúdo só vem na autorização.
- O token vale até `reservadaAte` (`limites.reservaMinutos`, padrão 10 min). Só o hash fica no banco.
- **Idempotência:** não é idempotente (cada chamada reserva coisas novas). Se a resposta se perder, as
  reservas vencem sozinhas e voltam para `PENDING` no próximo ciclo. Não há problema em perder.

### 4.3 `POST /api/sales/envio/:id/autorizar` — escopo `despacho`

Chame **imediatamente antes** de abrir a conexão SMTP para esta mensagem.

Pedido:
```json
{ "executor": "vps1-smtp-a", "reservaToken": "u2Jx…", "fence": 3 }
```

Resposta `200` (autorizado):
```json
{
  "despachoToken": "Qk9…(32 chars base64url)",
  "expiraEm": "2026-11-28T15:04:00.000Z",
  "para": "contato@emporio.com.br",
  "assunto": "Sal marinho integral de Mossoró para a Empório X",
  "corpo": "Olá, equipe da Empório X.\n\n…",
  "messageIdHeader": "<sv.3f1c…@salvitarn.com.br>",
  "contentHash": "9b1e…(64 hex)",
  "cabecalhos": {
    "List-Unsubscribe": "<mailto:vendas@salvitarn.com.br?subject=sair>, <https://www.premium.salvitarn.com.br/api/unsubscribe?t=…>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  }
}
```
O executor:
1. confere `sha256(assunto + "\n\n" + corpo) == contentHash` (diferente → não envia, informa
   `PERMANENT_FAILURE` com `respostaSmtp: "hash divergente"`);
2. monta a mensagem **texto puro** (UTF-8) com `To: para`, `Subject: assunto`, `Message-ID: messageIdHeader`
   e **todos** os `cabecalhos` exatamente como vieram; `From` é a caixa configurada no executor;
3. entrega ao SMTP **antes de `expiraEm`** (`limites.despachoSegundos`, padrão 120 s). Passou do prazo
   sem ter começado o `DATA`: não envie; informe `RETRYABLE_FAILURE` com `respostaSmtp: "prazo"`.

Antes de responder `200`, o servidor já gravou a mensagem como `DISPATCHING` e a linha de tentativa
(`sales_message_attempts`). Se a resposta `200` se perder, a mensagem vira `UNKNOWN` quando o prazo
vencer — e **não** deve ser enviada (o executor não tem o `despachoToken`).

Negado: o corpo é sempre `{"codigo": "...", "motivo": "..."}`. **Em qualquer código diferente de 200,
não envie.**

O HTTP diz o que fazer com o RESTO do ciclo:
- **`423` = pare o ciclo.** Condição global (pausa, canal, modo, teto do dia): nenhuma outra mensagem
  sai agora. Volte no próximo ciclo (consulte `/modo`).
- **`409` = pule só esta mensagem** e siga com as próximas da reserva.
- **`503` = pare o ciclo** e tente mais tarde (consulta indisponível).
- **`403` = pule esta mensagem** (foi cancelada).

| HTTP | `codigo` | Efeito no servidor | O que o executor faz |
|---|---|---|---|
| 404 | `nao_encontrada` | nada | descarta |
| 409 | `nao_reservada`, `outro_executor`, `fence_antigo`, `token_invalido`, `status_desconhecido` | nada | descarta (a reserva não é dele) |
| 409 | `reserva_vencida` | reserva liberada (fence+1) | descarta; reserve de novo |
| 409 | `corrida` | nada (outra autorização venceu) | descarta |
| 409 | `estado_mudou`, `sem_jornada`, `conteudo_alterado` | mensagem CANCELLED | descarta |
| 409 | `jornada_pausada` | reserva liberada (fence+1) | pula; segue com as outras |
| 409 | `intervalo_minimo` | reserva liberada; `next_retry_at` = fim do intervalo | pula; segue com as outras |
| 409 | `teto_empresa` | reserva liberada; `next_retry_at` = +24 h | pula; segue com as outras |
| 403 | `suprimido`, `inelegivel` | mensagem CANCELLED | pula |
| 423 | `pausado`, `canal_fechado`, `modo_nao_permite`, `sem_descadastro` | reserva liberada (fence+1) | **pare o ciclo** |
| 423 | `teto_diario`, `teto_novas` | reserva liberada | **pare o ciclo**; tente amanhã/depois |
| 503 | `supressao_indisponivel`, `historico_indisponivel`, `contagem_indisponivel`, `configuracao_indisponivel` | reserva liberada | **pare o ciclo**; tente mais tarde |

O que é revalidado AGORA (nada vem da reserva): posse da reserva (executor, token, fence, validade),
modo, canal e política, supressão nos dois bancos (`email_suppressions` do Premium e do CRM e
`suppression_list` por e-mail ou domínio; falha = 503), jornada (pausa, resposta, compra), limites do
árbitro (teto diário, teto de empresas novas, teto por empresa, intervalo mínimo entre mensagens de
marketing ao mesmo endereço), elegibilidade do passo 0, hash do conteúdo e presença de descadastro.

Histórico usado no "intervalo mínimo" (último envio ao endereço): `sales_messages` aceitas ou `UNKNOWN`
(Premium), `email_campaign_recipients` com `status='sent'` e `email_sequence_sends` com `status='sent'`
(nos dois bancos). **Não** cobre: carrinho abandonado/pós-compra (`automation_runs`, mensagens
transacionais) nem disparos que não gravam em `email_campaign_recipients`.

### 4.4 `POST /api/sales/envio/:id/resultado` — escopo `despacho`

Informe **uma vez por autorização**, logo depois da conversa SMTP.

Pedido:
```json
{ "executor": "vps1-smtp-a", "despachoToken": "Qk9…", "resultado": "ACCEPTED", "respostaSmtp": "250 2.0.0 Ok: queued as 4F2A" }
```
`resultado`:
- `ACCEPTED`: o SMTP respondeu 2xx ao fim do `DATA`.
- `RETRYABLE_FAILURE`: erro 4xx, ou falha de conexão **antes** de o servidor aceitar o `DATA`.
- `PERMANENT_FAILURE`: erro 5xx (destinatário recusado, política), ou hash divergente.
- `UNKNOWN`: a conexão caiu **depois** de enviar o `DATA` e antes da resposta final (pode ter saído).
`respostaSmtp`: código e texto curto do servidor (≤300 caracteres). **Nunca** inclua o conteúdo da
mensagem nem credenciais.

Respostas:
| HTTP | Corpo | Significado |
|---|---|---|
| 200 | `{"ok":true,"status":"ACCEPTED","proximaTentativaEm":null}` | gravado |
| 200 | `{"ok":true,"status":"RETRYABLE_FAILURE","proximaTentativaEm":"2026-11-28T15:09:00.000Z"}` | volta à fila depois do backoff (5 min, 30 min, 2 h) |
| 200 | `{"repetido":true}` | o mesmo resultado já estava gravado (repetição segura) |
| 409 | `{"codigo":"conflito","motivo":"resultado já registrado como …"}` | resultado diferente do gravado; não insista |
| 403 | `{"codigo":"token_invalido"}` / `{"codigo":"outro_executor"}` | token errado ou de outro executor |
| 404 | `{"codigo":"nao_encontrada"}` | id não existe |

Idempotência: repetir a MESMA chamada é seguro (`repetido`). Em falha de rede, repita com o mesmo
corpo até receber 200 ou 409. Se a mensagem já virou `UNKNOWN` por prazo, o resultado informado
depois **ainda vale** (e fecha a exceção de "envio desconhecido").

Efeitos de `ACCEPTED` na jornada: passo 0 → `PRIMEIRO_ENVIO` (`CONTACT_REVIEW → CONTACTED`);
`last_contacted_at`; `cadence_step` (nunca regride); `next_action_at` = data do próximo passo
(`limites.cadenciaDias`) ou, depois do último passo, envio + 7 dias (quando a cadência encerra sem
resposta: `FIM_CADENCIA → CLOSED`). Evento fora de ordem não regride o estado (ex.: a resposta chegou
antes do resultado: a jornada continua `INTERESTED`).

### 4.5 `POST /api/sales/caixa/eventos` — escopo `despacho`

O executor lê a caixa de entrada (IMAP), o Hermes classifica, e cada mensagem recebida vira um evento.

Pedido:
```json
{
  "idempotencyKey": "<CAF=abc123@mail.gmail.com>",
  "tipo": "RESPOSTA",
  "email": "contato@emporio.com.br",
  "emRespostaA": "<sv.3f1c…@salvitarn.com.br>",
  "classificacao": "pediu_preco",
  "trecho": "Qual o valor da caixa e o frete para Natal?",
  "recebidoEm": "2026-11-28T16:02:11Z"
}
```
- `idempotencyKey` (8–300): estável por mensagem recebida — use o `Message-ID` dela. Para bounce sem
  Message-ID, `bounce:<Message-ID original>:<destinatário>`.
- `tipo`: `RESPOSTA` | `AUTO_RESPOSTA` | `DEVOLVIDO` | `PEDIU_PARA_SAIR` | `RECLAMACAO`.
- `email`: o endereço do contato (remetente da resposta, ou destinatário que devolveu). O servidor
  normaliza para minúsculas.
- `emRespostaA`: `In-Reply-To`/`References` que bate com um `messageIdHeader` nosso, quando houver.
- `classificacao` (só `RESPOSTA`): `interessado`, `pediu_preco`, `pediu_informacao`, `compra_depois`
  (positivas), `sem_interesse`, `ja_tem_fornecedor` (negativas), `outro`.
- `trecho` (≤600): já **sem** telefone, CPF, CNPJ e e-mails de terceiros (o servidor mascara de novo).

Efeitos:
| `tipo` | Efeito |
|---|---|
| `RESPOSTA` positiva | `RESPOSTA_INTERESSE` (→ `INTERESTED`); cancela mensagens pendentes da jornada; exceção `resposta_humana` (alta) + tarefa no CRM |
| `RESPOSTA` negativa | `RESPOSTA_NEGATIVA` (→ `CLOSED`); cancela pendentes; exceção `resposta_humana` + tarefa no CRM |
| `RESPOSTA` sem classe / `outro` | jornada **pausada** (`resposta_humana`); cancela pendentes; exceção + tarefa |
| `AUTO_RESPOSTA` | jornada pausada (`auto_resposta`), estado não muda, exceção baixa; **nunca retoma sozinha** |
| `PEDIU_PARA_SAIR` | supressão nos dois bancos (`unsubscribe`); pendentes canceladas; jornada `SUPPRESSED` |
| `RECLAMACAO` | supressão (`complaint`) **e modo `PAUSED` para toda a operação** + exceção crítica + tarefa |
| `DEVOLVIDO` | supressão (`bounce`) |

**E-mail sem jornada** (endereço que não está na prospecção): `PEDIU_PARA_SAIR`, `RECLAMACAO` e
`DEVOLVIDO` têm o MESMO efeito acima (supressão em todas as listas; a reclamação também pausa a
operação e abre a exceção crítica). Só `RESPOSTA` e `AUTO_RESPOSTA` de endereço desconhecido são
guardadas e ignoradas.

Se a transição não se aplica ao estado atual (ex.: resposta negativa de quem já é cliente), o estado
não muda e a jornada fica pausada para um humano.

Respostas:
| HTTP | Corpo | Significado |
|---|---|---|
| 200 | `{"ok":true,"efeitos":["transicao","cancelar_pendentes","excecao"],"falhas":[]}` | processado |
| 200 | `{"duplicado":true}` | a chave já foi processada; nada foi feito de novo |
| 200 | `{"ok":true,"ignorado":true}` | resposta (ou resposta automática) de e-mail sem jornada: guardada e ignorada |
| 500 | `{"ok":false,"efeitos":[…],"falhas":["suprimir:premium.email_suppressions"]}` | algum efeito falhou: **repita com a mesma chave** |

Idempotência: a mesma `idempotencyKey` nunca tem efeito duas vezes. Ela só é reprocessada se a
tentativa anterior falhou (`500`) ou ficou presa por mais de 2 minutos sem terminar. Todos os efeitos
são idempotentes (supressão, cancelamento, transição com controle de versão, exceção e tarefa por chave).

### 4.6 `GET /api/sales/relatorio?de=YYYY-MM-DD&ate=YYYY-MM-DD` — escopo `leitura`

Período em dias de São Paulo, inclusive, até 366 dias. Data inválida → `400 {"error":"..."}`.
Só agregados — **nenhum dado pessoal** (sem e-mail, nome ou CNPJ).

```json
{
  "de": "2026-11-01", "ate": "2026-11-28",
  "empresas": { "pesquisadas": 340, "elegiveis": 52, "contatadas": 40 },
  "mensagens": { "tentadas": 95, "aceitas": 90, "devolvidas": 2, "desconhecidas": 1, "falhas": 3 },
  "respostas": { "humanas": 6, "positivas": 3, "pedidosDeSaida": 1, "reclamacoes": 0 },
  "agente": { "conversas": 12, "linksDePedido": 4, "encaminhadas": 2, "respostasBarradas": 1 },
  "vendas": { "pedidosSiteComCupomCampanha": 0, "caixasSite": 2, "receitaSiteCentavos": 39800 },
  "indicios": ["O Mercado Livre não informa a origem do comprador: …", "…"],
  "porSegmento": [{ "segmento": "loja_natural", "contatadas": 25, "respostas": 4, "positivas": 2 }],
  "porUf": [{ "uf": "RN", "contatadas": 30, "respostas": 5, "positivas": 3 }],
  "rentabilidade": "nao_calculavel"
}
```
O que cada número é (e o que NÃO é) — seção 8.

### 4.7 `POST /api/sales/propostas` — escopo `propostas`

O Hermes propõe uma decisão ao dono (ex.: validar um segmento, mudar um limite). Vira uma exceção
`proposta_hermes` na central "Precisa de você". **Não muda nada sozinha.**

Pedido:
```json
{
  "idempotencyKey": "prop-2026-11-28-segmento-granel",
  "skill": "salvita-inteligencia-comercial",
  "titulo": "Validar o segmento granel_cerealista",
  "detalhe": "Nas últimas 3 semanas o segmento teve 4 respostas positivas em 18 contatos…",
  "evidencia": { "fonte": "GET /api/sales/relatorio", "periodo": "2026-11-07..2026-11-28", "denominador": "empresas contatadas", "amostra": 18, "confianca": "baixa" },
  "decisaoSugerida": "Incluir granel_cerealista em segmentosValidados",
  "severidade": "normal"
}
```
`skill`: `salvita-prospeccao` | `salvita-inteligencia-comercial` | `salvita-vendas` |
`salvita-relacionamento` | `salvita-auditoria`. `severidade`: `baixa` | `normal` | `alta` | `critica`.

Resposta `200`: `{"ok":true,"id":57,"duplicada":false}` — repetir a chave devolve o mesmo `id` com
`"duplicada":true` (não atualiza o conteúdo).

### 4.8 `POST /api/sales/heartbeat` — escopo `leitura`

Pedido:
```json
{ "executor": "vps1-smtp-a", "versao": "0.3.1", "ciclo": 1532, "contagens": { "enviadas": 4, "falhas": 0 } }
```
`contagens`: mapa nome (≤40) → inteiro, livre. Resposta `200`:
```json
{ "ok": true, "modo": "REVIEW", "canalAtivo": true }
```
Envie uma vez por ciclo do executor (padrão a cada **15 minutos**, nunca menos de 10), só dentro da janela
(padrão `08:00-11:00,14:00-17:00`, Fortaleza). Mais de **35 minutos** sem sinal DENTRO da janela, com a faixa
aberta há pelo menos 35 min → exceção `heartbeat_ausente` (uma aberta por executor; nova chave por hora).
Silêncio fora da janela é esperado. Se a janela do executor for outra, configure `SALES_JANELA_EXECUTOR` na Vercel.

Duas contagens têm efeito no servidor: `diario_pendentes` (resultados no diário local ainda não
confirmados) e `resultados_pendentes` (resultados que ficaram sem resposta do servidor no ciclo). Se
algum heartbeat dos últimos 15 minutos tiver uma delas > 0, o painel **recusa** a conciliação manual
"não foi enviada" de uma mensagem `UNKNOWN` (o resultado pode estar a caminho; reabrir a mensagem
poderia enviá-la duas vezes) até o executor informar o que tem guardado.

### 4.9 `POST /api/sales/ciclo` — escopo `operacao`

Roda o ciclo do servidor (seção 6). Pedido:
```json
{ "executor": "vps1-hermes", "simular": false }
```
`simular: true` calcula tudo e **não grava nada** (útil para a auditoria). Resposta `200`:
```json
{
  "simulado": false,
  "empresasSincronizadas": 180, "contatosNovos": 37, "qualificados": 22,
  "inelegiveisPorMotivo": { "canal_desligado": 120, "email_do_cadastro_cnpj": 40, "empresa_sem_email": 310 },
  "loteId": 14,
  "mensagensGeradas": 0,
  "mensagensNaoGeradas": { "link_descadastro_indisponivel": 20 },
  "reservasLiberadas": 0, "marcadasDesconhecidas": 0, "cadenciasAvancadas": 0, "tarefasCrmProcessadas": 2,
  "avisos": ["descadastro: a jornada não tem token reconhecido por /api/unsubscribe …"]
}
```
Um ciclo por vez: se outro estiver rodando, volta `200` com `avisos: ["outro ciclo em andamento: nada foi feito"]`
e zeros. O ciclo usa no máximo ~45 s (a ponte do Radar, ~22 s; o resto continua no próximo ciclo).
Frequência sugerida: a cada 1–2 horas no horário comercial. Limite: 6 chamadas por minuto.

---

## 5. Roteiro do executor (pseudocódigo)

```
loop a cada 60–120 s:
  POST /heartbeat
  m = GET /modo
  se m.modo em (DRY_RUN, PAUSED) ou não m.canal.ativo ou não m.canal.politicaAprovada: dormir; continuar
  r = POST /fila/reservar {executor, max: 5}
  para cada item em r.mensagens:                 # um de cada vez, nunca em paralelo para o mesmo id
      a = POST /envio/{id}/autorizar {executor, reservaToken, fence}
      se a.http em (423, 503): parar o ciclo     # NÃO envia; condição global
      se a.http != 200: continuar               # NÃO envia; 409/403/404 = só esta mensagem
      se sha256(a.assunto + "\n\n" + a.corpo) != a.contentHash: resultado PERMANENT_FAILURE; continuar
      se agora >= a.expiraEm: resultado RETRYABLE_FAILURE ("prazo"); continuar
      grava em disco {id, despachoToken, estado: "enviando"}   # antes do DATA
      smtp: MAIL FROM / RCPT TO / DATA (com Message-ID e List-Unsubscribe)
      resultado = ACCEPTED | RETRYABLE_FAILURE | PERMANENT_FAILURE | UNKNOWN
      grava em disco {id, resultado}
      POST /envio/{id}/resultado {executor, despachoToken, resultado, respostaSmtp}   # repete até 200/409

  ao reiniciar: para cada registro em disco sem resultado confirmado:
      se tinha chegado ao DATA: POST resultado UNKNOWN (nunca reenvia)
      senão: POST resultado RETRYABLE_FAILURE

caixa de entrada (IMAP), a cada 5 min:
  para cada mensagem nova: o Hermes classifica → POST /caixa/eventos (chave = Message-ID)
  só marca como lida depois de 200 (duplicado também é 200)
```

Respeite os limites: o servidor já limita envios por dia, empresas novas por dia, mensagens por
empresa e intervalo por endereço. O executor pode ser mais conservador (ex.: espaçar 30–90 s entre envios),
nunca menos.

---

## 6. O ciclo do servidor (o que `POST /ciclo` faz)

Em ordem; cada passo isolado (falha de um vira aviso e não impede os outros):

1. **Conciliação.** `RESERVED` vencida → `PENDING` (fence+1, tokens apagados). `DISPATCHING` vencido →
   `UNKNOWN` + tentativa `EXPIRED` + exceção `envio_desconhecido` (nunca reenviada sozinha).
2. **Ponte Radar → prospecção** (banco do CRM só leitura). Para cada candidato Premium das UFs da onda
   (`ondas.ufs`) com pelo menos um e-mail: empresa em `companies` (outbound, `radar_receita`, por CNPJ),
   contatos em `contacts` (um por e-mail, `is_public_business_contact = true`, `channel_type = email:<fonte>`),
   uma `public_sources` por origem (Receita + cada página de onde um e-mail foi lido, com URL e
   confiança), e uma jornada por e-mail (`sales_journeys`, `ON CONFLICT DO NOTHING`) com segmentos,
   pontuação e elegibilidade. `QUALIFICAR` quando há segmento e evidência. Domínio bloqueado pelo dono
   não entra. Lead inbound com o mesmo CNPJ é pulado. CNPJ duplicado é mesclado na empresa de menor id.
   Retoma de onde parou (cursor) se o tempo acabar.
3. **Pontuação e elegibilidade** das jornadas `QUALIFIED` (com supressão consultada agora).
4. **Lote do dia** (um por data de São Paulo): as `limites.novasEmpresasDia` melhores jornadas
   `QUALIFIED` elegíveis, uma por empresa, só empresas nunca prospectadas → `ENTRAR_NO_LOTE` e mensagem
   do passo 0 `PENDING`. Só com modelo aprovado, remetente completo, domínio do canal e link de
   descadastro (senão conta o motivo em `mensagensNaoGeradas` e a jornada não se move). Mensagem cortada
   pelo dono não é reposta no mesmo dia.
5. **Cadência.** Jornadas `CONTACTED` com `next_action_at` vencido: gera o próximo passo (`PENDING`); o
   passo herda a aprovação do passo 0 (`approved_by = heranca:passo0:<id>:lote:<id>`), senão nasce sem
   aprovação. Depois do último passo, `FIM_CADENCIA → CLOSED`.
6. **Saída para o CRM.** Tarefas pendentes (`sales_sync_ops`) viram tarefa em `tasks` do CRM para o
   atendente `atendente.crmUserId`, com o marcador `[sales:<chave>]` nas notas (nunca duplica). Sem
   atendente configurado: a tarefa espera e o ciclo avisa.
7. **Executores sem sinal** há mais de 35 min dentro da janela → exceção `heartbeat_ausente`.
8. **Retenção do vendedor virtual:** conversas (`sales_agent_conversations`) com `expires_at` vencido
   (90 dias) são apagadas com as mensagens delas, num único comando, até 500 por ciclo.

Primeiro contato sem aprovação de lote de dia anterior é cancelado (a jornada volta a `QUALIFIED`)
**só nos modos `REVIEW`, `DRY_RUN` e `PAUSED`**. Em `SEMI_AUTONOMOUS`/`AUTONOMOUS` o passo 0 não recebe
aprovação e fica na fila, governado pelo árbitro. Empresa cuja mensagem foi só cancelada (cortada ou
vencida) volta a um lote de outro dia com uma mensagem nova (chave `prosp:<jornada>:0:<lote>`); o que
conta como "já prospectada" é mensagem aceita, desconhecida ou ainda na fila. Cortada hoje não volta hoje.
O lote para com aviso se o orçamento do ciclo acabar (o resto entra no próximo ciclo).

---

## 7. Modo `PAUSED` (e `DRY_RUN`, canal desligado)

Mudar o modo para `PAUSED` ou `DRY_RUN` (no painel, ou `PAUSED` automaticamente por uma `RECLAMACAO`),
e desligar o canal ou tirar a política aprovada, revogam as reservas do mesmo jeito. Mudar o modo para
`PAUSED`:
- grava o modo primeiro (nenhuma reserva nova a partir daí);
- **revoga todas as reservas**: `RESERVED → PENDING`, fence+1, tokens apagados. Uma autorização com
  reserva revogada recebe `409 nao_reservada`/`fence_antigo`; uma autorização em voo recebe `423 pausado`;
- **não recolhe** mensagens em `DISPATCHING`: elas já foram autorizadas e podem estar no SMTP. O
  resultado delas continua sendo aceito e registrado. A quantidade fica no log e na auditoria;
- é auditado em `audit_logs` (`sales_modo_alterado`).

Sair de `PAUSED` é sempre decisão do dono.

---

## 8. O que cada contador significa

**`ResultadoCiclo`** (resposta de `POST /ciclo`):
| Campo | Significado |
|---|---|
| `empresasSincronizadas` | candidatos do Radar com e-mail processados neste ciclo (sem lead inbound) |
| `contatosNovos` | jornadas novas criadas (uma por e-mail) |
| `qualificados` | jornadas que passaram a `QUALIFIED` neste ciclo |
| `inelegiveisPorMotivo` | por motivo, quantos contatos avaliados neste ciclo NÃO são elegíveis (um contato conta uma vez em cada motivo). Inclui `empresa_sem_email` e `ja_e_lead_inbound`, contados por empresa |
| `loteId` | lote do dia (pode existir vazio) |
| `mensagensGeradas` | mensagens novas (`PENDING`) neste ciclo, de lote e de cadência |
| `mensagensNaoGeradas` | por motivo, mensagens que deveriam ser geradas e não foram (`modelo_rascunho`, `remetente_incompleto`, `dominio_do_canal_ausente`, `link_descadastro_indisponivel`, `jornada_mudou`, texto barrado…) |
| `reservasLiberadas` | reservas vencidas devolvidas à fila |
| `marcadasDesconhecidas` | mensagens que viraram `UNKNOWN` neste ciclo |
| `cadenciasAvancadas` | jornadas que ganharam o próximo passo ou foram encerradas por fim de cadência |
| `tarefasCrmProcessadas` | tarefas criadas (ou encontradas já criadas) no CRM |
| `avisos` | o que impediu algum passo (texto para humano) |

**Relatório** (`GET /relatorio`), no período:
| Campo | Significado |
|---|---|
| `empresas.pesquisadas` | empresas criadas pela ponte do Radar no período |
| `empresas.elegiveis` | empresas com jornada criada no período e elegível na última avaliação |
| `empresas.contatadas` | empresas com o passo 0 aceito pelo SMTP no período |
| `mensagens.tentadas` | autorizações de despacho (linhas de tentativa) |
| `mensagens.aceitas` | aceitas pelo SMTP (`ACCEPTED`) |
| `mensagens.devolvidas` | eventos `DEVOLVIDO` |
| `mensagens.desconhecidas` | ainda `UNKNOWN` |
| `mensagens.falhas` | `PERMANENT_FAILURE` |
| `respostas.*` | eventos da caixa por tipo (`positivas` = classes positivas); e-mail sem jornada não conta |
| `agente.*` | vendedor virtual: conversas, chamadas de ferramenta com "link" no nome, conversas encaminhadas, respostas barradas |
| `vendas.caixasSite` / `receitaSiteCentavos` | **confirmado só pelo e-mail**: pedidos pagos no site, no período, com o e-mail de um contato que recebeu mensagem ANTES do pedido (soma de `quantity` e de `total_price`) |
| `vendas.pedidosSiteComCupomCampanha` | **associado a cupom de campanha**. Hoje sempre 0: não existe configuração de "cupom de campanha" (ver seção 9) |
| `indicios` | o que **não prova** venda: Mercado Livre (sem origem do comprador), jornadas que viraram cliente, respostas positivas |
| `rentabilidade` | sempre `nao_calculavel`: sem custo industrial informado, margem e lucro não são calculáveis |

**Painel** (`hoje`): `empresasNovasContatadas` (passo 0 aceito hoje), `mensagensAceitas` (hoje),
`respostasHumanas`, `pedidosDeSaida`, `devolvidas` (eventos de hoje), `desconhecidas` (todas as
`UNKNOWN` em aberto, de qualquer dia).

---

## 9. Limitações conhecidas (o que este lote NÃO faz)

- **Descadastro por link: bloqueado.** O link reusa `/api/unsubscribe?t=<uuid>`, que só reconhece
  tokens de `email_campaign_recipients`/`email_sequence_enrollments`. Sem uma coluna `unsub_token` em
  `sales_journeys` e a busca correspondente em `server/routers/unsubscribe.ts`, nenhum token de
  prospecção é reconhecido. Por isso **o ciclo não gera mensagem nenhuma** hoje (motivo
  `link_descadastro_indisponivel`). A mudança está descrita em `server/lib/sales/descadastro.ts`.
- **Linha de abertura por IA** (`modeloEmail.aberturaPorIa`): não implementada; a abertura é sempre vazia.
- **Cupom de campanha**: não há configuração; o contador fica 0.
- **Limites diários sob concorrência**: com mais de um executor ao mesmo tempo, o teto diário pode
  passar por até (executores − 1) mensagens (a contagem inclui as em voo, mas não é serializada).
- **Mensagens de cadência em modo `REVIEW`** só saem se o passo 0 tiver sido aprovado (herança).
- Rascunhos de lotes antigos não aprovados continuam `PENDING`; em `AUTONOMOUS` eles podem sair (dentro
  dos limites diários). Corte ou aprove os lotes antes de mudar para `AUTONOMOUS`.
