# Executor de vendas (Python, só biblioteca padrão)

Despacha as mensagens que o servidor autorizou e lê a caixa de entrada para informar devoluções, respostas
automáticas, pedidos para sair e respostas humanas. Instalação e operação: `../README.md`. Contrato HTTP:
`shared/sales.ts`.

**Não faz:** escolher destinatário, escrever mensagem, responder cliente, apagar ou marcar e-mail como lido,
chamar modelo de IA, enviar qualquer coisa que não tenha vindo da fila autorizada. **Nunca use Resend nem
Brevo aqui** (as políticas deles proíbem e-mail frio): `config.validate` recusa host de SMTP ou IMAP com `resend`,
`brevo`, `sendinblue` ou `sendgrid` no nome, e o executor não inicia.

**Quando roda:** um ciclo a cada `SALES_CYCLE_SECONDS` (padrão 900 s = 15 min, mínimo 600 s; valor menor sobe para 600 com aviso), só
dentro da janela `SALES_JANELA` (padrão `08:00-11:00,14:00-17:00`, a mesma do robô SMBI, fuso de Fortaleza, fim exclusivo; `sempre` desliga o portão;
valor inválido impede a partida). Fora da janela não há nenhuma chamada à API (nem `/modo`, nem heartbeat) nem
leitura da caixa, só uma linha de log local por hora. Motivo: cada chamada acorda o Neon por 5 min (mesma regra do
robô SMBI, `shared/smbiJanela.ts`).

## Arquivos

| Arquivo | Função |
|---|---|
| `config.py` | Lê o ambiente, valida (sem imprimir valores) e define o DRY_RUN padrão ligado |
| `janela.py` | Janela de operação (Fortaleza) e decisão "dentro/fora", sem rede |
| `api.py` | Cliente das rotas `/api/sales/*`; cada rota usa o segredo do seu escopo; 401 vira `ApiAuthError` |
| `journal.py` | Diário SQLite (anti-duplicidade, UID da caixa, contadores, parada) e trava de instância única |
| `despacho.py` | Reservar, autorizar, diário, SMTP, classificação do resultado, ritmo, paradas |
| `caixa.py` | IMAP somente leitura, classificação dos e-mails, limpeza de dados pessoais, gancho `classificar` |
| `worker.py` | Ciclo, heartbeat, redação de segredos no log, `--once`, `--check`, `--liberar` |
| `sales-executor.service` | Unit systemd |
| `tests/` | `python3 -m unittest discover -s tests` (sem rede, sem SMTP real) |

## A fronteira do SMTP (o que impede e-mail duplicado)

O executor conduz o SMTP passo a passo e marca que emitiu o comando `DATA` **antes** de entregá-lo ao `smtplib`.
Depois disso, o provedor pode ter aceitado a mensagem sem que o executor veja a resposta.

| Situação | Resultado informado |
|---|---|
| Resposta **2xx** ao fim do DATA | `ACCEPTED` |
| Resposta **4xx** (em RCPT ou no DATA) | `RETRYABLE_FAILURE` |
| Resposta **5xx** (em RCPT ou no DATA) | `PERMANENT_FAILURE` |
| **Qualquer exceção depois de emitir o DATA** sem resposta SMTP (queda, timeout, TLS, resposta inesperada) | `UNKNOWN` |
| Qualquer falha **antes** do DATA (conexão, STARTTLS, AUTH, MAIL FROM) | `RETRYABLE_FAILURE` |

Decisões deliberadas:

- 5xx em EHLO, STARTTLS, AUTH e MAIL FROM é problema da nossa conta ou do remetente, não do destinatário:
  vira `RETRYABLE_FAILURE` (e não conta para as "3 falhas permanentes seguidas"). Só 5xx de RCPT e DATA diz algo
  sobre aquele destinatário/mensagem.
- Falha de autenticação SMTP é `RETRYABLE_FAILURE` **e para o despacho** (a conta pode ser bloqueada por insistir).
- Erro ao fechar a conexão (QUIT) depois de um 2xx não muda o resultado: continua `ACCEPTED`.
- Nunca se envia sem STARTTLS/SSL: se o servidor não oferece STARTTLS, nada sai.
- `UNKNOWN` **nunca** é reenviado pelo executor. O servidor leva a mensagem à conciliação humana.

## Ordem das gravações (diário local)

1. `autorizar` imediatamente antes do envio (depois da espera do ritmo).
2. Grava `DISPATCHING` (id da mensagem, fence, `Message-ID`, `contentHash`, destinatário, token) **antes** de conectar.
3. SMTP.
4. Grava o resultado (`RESULT_PENDING`) **antes** de falar com a API.
5. `POST resultado` com 5 tentativas e espera crescente (2, 4, 8, 16 s). Só vira `REPORTED` quando o servidor
   confirma (200, `repetido: true` ou 409 de conflito, que gera alerta). Se o servidor não responder, o resultado
   continua pendente e é reenviado no próximo ciclo e na partida.
6. Na partida, tudo que ficou `DISPATCHING` (a execução anterior caiu) vira `UNKNOWN` e é informado como tal.
   **Nenhuma** mensagem em `DISPATCHING`, `ACCEPTED` ou `UNKNOWN` é reenviada, mesmo que o servidor a entregue
   de novo (a checagem é por id lógico e por `Message-ID`).

Antes de enviar, o executor também recusa (sem SMTP, e libera a mensagem no servidor como `RETRYABLE_FAILURE`) uma
autorização cujo `contentHash` não bate com `sha256(assunto + "\n\n" + corpo)` (a mesma fórmula do servidor, em
`server/lib/sales/mensagem.ts`), sem cabeçalho `List-Unsubscribe`, com destinatário inválido ou com cabeçalho
adulterado. Cabeçalhos críticos (From, To, Subject, Message-ID, Date, Reply-To) não podem ser sobrescritos pelo servidor.

## Paradas de segurança (persistem a reinício)

Falha de login SMTP; 401 da API; 3 falhas permanentes seguidas (`SALES_PERMANENT_STREAK`); rajada de devoluções
numa varredura (`SALES_BOUNCE_BURST`); caixa de entrada ilegível por 5 ciclos seguidos ou login IMAP recusado
(sem ler a caixa não se envia: pedidos para sair poderiam passar despercebidos). Enquanto parado, o executor só
envia heartbeat com `parado=1`. Liberação humana: `python3 worker.py --liberar`.

Além disso, `UNKNOWN`, falha temporária de conexão ou qualquer recusa global do servidor (423/503) encerram o
ciclo corrente; as demais reservas simplesmente vencem.

## Caixa de entrada

IMAP `select(readonly=True)` e `BODY.PEEK[]`; o UID processado fica no diário. Primeira varredura: últimos
`SALES_IMAP_FIRST_DAYS` dias. Prioridade da classificação:

1. DSN (`multipart/report`, `mailer-daemon`) com `Action: failed` → `DEVOLVIDO` (relatório de abuso ARF → `RECLAMACAO`).
   DSN de atraso (`delayed`) é ignorada.
2. Resposta automática (`Auto-Submitted`, `X-Autoreply`, `Precedence: auto_reply`, assuntos "resposta automática",
   "out of office", "fora do escritório", "férias"...) a mensagem nossa → `AUTO_RESPOSTA`.
3. Pedido para sair (`sair`, `descadastrar`, `remover`, `não quero receber`, `unsubscribe`...) → `PEDIU_PARA_SAIR`.
   Frases fortes valem em qualquer lugar do texto novo; palavra solta ("sair") só em mensagem curta ou assunto.
   Sem vínculo com mensagem nossa, só vale pedido curto de uma pessoa (rodapé de boletim com `List-Unsubscribe` não conta).
   Na dúvida erra-se para o lado de suprimir.
4. Qualquer outro e-mail que responda (`In-Reply-To`/`References`) a um `Message-ID` nosso → `RESPOSTA`, com trecho
   de até 600 caracteres, **sem** telefone, CPF, CNPJ nem e-mails (todos são removidos), sem texto citado.
5. O resto fica na caixa para um humano.

`idempotencyKey` é o `Message-ID` recebido (sem ele, um hash do e-mail). Nunca marca como lido, apaga ou responde.

### Gancho de classificação (opcional, para o Hermes)

`classificacao` (`REPLY_CLASSES`) fica **em branco** por padrão. Para o Hermes plugar a sua:

```python
import caixa
caixa.classificar = lambda trecho: "pediu_preco"   # ou None; valores fora de REPLY_CLASSES são descartados
```

A função recebe **só o trecho já limpo**, nunca o e-mail cru, e erros nela não derrubam o executor. Este código
não chama nenhum modelo de IA.

## Heartbeat

Todo ciclo dentro da janela, `POST /api/sales/heartbeat` (escopo leitura) com `ciclo` e `contagens` inteiras: `reservadas`,
`aceitas`, `falhas_temporarias`, `falhas_permanentes`, `desconhecidas`, `recusadas`, `puladas`, `conflitos`,
`resultados_pendentes`, `caixa_<tipo>`, `parado`, `dry_run`, `diario_pendentes`.
