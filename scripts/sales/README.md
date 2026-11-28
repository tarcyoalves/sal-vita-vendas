# Sal Vita Sales AI na VPS — instalação do executor e auditoria

Esta pasta tem o que roda **na VPS do dono**, por fora da Vercel, ao lado do robô do Radar
(`scripts/radar/enricher/`) e do robô do SMBI:

| Item | O que é |
|---|---|
| `executor/` | Executor de despacho e caixa de entrada (Python 3.10+, só biblioteca padrão). Detalhes técnicos em `executor/README.md` |
| `auditoria-vps.sh` | Auditoria **somente leitura** da VPS (não instala nem altera nada) |

O servidor (CRM) decide **quem** recebe **o quê** e **quando**. O executor só cumpre: pede uma
reserva, pede autorização imediatamente antes de cada envio, entrega a UM e-mail ao servidor de
e-mail e informa o resultado. O contrato HTTP está em `shared/sales.ts`.

## ⛔ Antes de qualquer coisa

**Resend e Brevo NUNCA podem ser usados para este envio.** As políticas de uso das duas
proíbem e-mail frio (prospecção sem pedido do destinatário); usar qualquer uma delas aqui
arrisca o bloqueio da conta que também envia os e-mails transacionais e de marketing do
CRM. A prospecção usa uma caixa comum própria (SMTP/IMAP), separada desses serviços.

**O dono precisa ler e registrar os termos de uso do provedor da caixa de e-mail ANTES de
desligar o DRY_RUN.** O registro é feito no painel (provedor, link dos termos, data da conferência,
responsável e conclusão) e só então a política é aprovada. Sem isso o servidor recusa toda autorização
(`politicaAprovada` falso) e o executor não envia nada. Este README não é parecer jurídico.

## O que você precisa providenciar (nada disso vai para o repositório)

- Uma caixa de e-mail comum dedicada (não a pessoal do dono), com acesso **SMTP** (587 STARTTLS ou 465 SSL)
  e **IMAP** (993). Domínio com SPF, DKIM e DMARC configurados no provedor.
- Os segredos do Hermes, gerados pelo dono e configurados também na Vercel (nomes em
  `HERMES_SCOPES`, `shared/sales.ts`). Cada escopo tem o seu; o executor usa **despacho** e **leitura**
  (a de **propostas** é opcional aqui; quem usa é a skill de inteligência comercial).
- Python 3.10 ou mais novo na VPS. Não precisa de venv nem de `pip install`: só biblioteca padrão.

## Passo a passo

### 1. Auditar a VPS (só leitura)

```bash
bash scripts/sales/auditoria-vps.sh --repo /opt/sal-vita-vendas \
  --smtp smtp.SEU-PROVEDOR.exemplo --imap imap.SEU-PROVEDOR.exemplo \
  --skills /caminho/das/skills-do-hermes | tee ~/auditoria-$(date +%F).txt
```

Opções: `--filtrados DIR` (saída do importador), `--envfile ARQ` (repetível; **só os nomes** das variáveis
são lidos, nunca os valores). Rode como o mesmo usuário que roda os robôs (ou root) para conseguir ler os
arquivos de ambiente. Cada item sai como `OK`, `AUSENTE`, `NÃO VERIFICADO` ou `AVISO` (por exemplo, menos de
20 GB livres: a importação da Receita usa cerca de 15 GB temporários). O relatório pode conter IPs locais:
**não cole em lugar público e não commite**. Com `DATABASE_URL` no ambiente e `psql` instalado, mostra também
as contagens de `radar_establishments` por UF e de `radar_enrichment` por status (apenas `SELECT`, sessão
somente leitura).

### 2. Obter o código

```bash
sudo mkdir -p /opt && cd /opt
sudo git clone https://github.com/tarcyoalves/sal-vita-vendas.git     # ou git pull, se já existir
```

### 3. Usuário e arquivo de ambiente

```bash
sudo useradd --system --home /var/lib/sales-executor --shell /usr/sbin/nologin salesexec
sudo install -m 600 -o root -g root /dev/null /etc/sales-executor.env
sudoedit /etc/sales-executor.env       # preencha como abaixo
```

O arquivo fica **fora do repositório** (que é público), permissão 600. O systemd lê como root e entrega
as variáveis ao processo.

### 4. Variáveis de ambiente (por nome)

| Variável | Obrigatória | Para quê |
|---|---|---|
| `SALES_API_URL` | sim | Endereço do CRM, `https://...` (sem barra final) |
| `SALES_HERMES_SECRET_READ` | sim | Segredo do escopo **leitura** (`/modo`, heartbeat) |
| `SALES_HERMES_SECRET_DISPATCH` | fora do DRY_RUN | Segredo do escopo **despacho** (reservar, autorizar, resultado, caixa) |
| `SALES_HERMES_SECRET_PROPOSE` | não | Escopo **propostas** (não usado pelo executor; reservado às skills) |
| `SALES_EXECUTOR_ID` | não | Identificador deste executor (3-64 caracteres: letras, números, `. _ : -`). Padrão `sales-executor-1` |
| `SALES_DRY_RUN` | não | **Padrão ligado.** Só `0`/`false`/`no`/`nao`/`off` desliga; qualquer outro valor (inclusive erro de digitação) mantém ligado |
| `SALES_SMTP_HOST`, `SALES_SMTP_PORT`, `SALES_SMTP_SECURITY` | fora do DRY_RUN | Servidor de envio. `SALES_SMTP_SECURITY` = `starttls` (587, padrão) ou `ssl` (465). Host de SMTP ou IMAP com `resend`, `brevo`, `sendinblue` ou `sendgrid` no nome é recusado e o executor não inicia (os termos desses provedores proíbem prospecção fria) |
| `SALES_SMTP_USER`, `SALES_SMTP_PASSWORD` | fora do DRY_RUN | Login da caixa |
| `SALES_IMAP_HOST`, `SALES_IMAP_PORT`, `SALES_IMAP_USER`, `SALES_IMAP_PASSWORD` | fora do DRY_RUN | Leitura da caixa (porta padrão 993) |
| `SALES_FROM_NAME`, `SALES_FROM_ADDRESS` | endereço obrigatório fora do DRY_RUN | Remetente. Deve ser o mesmo configurado como canal no painel |
| `SALES_REPLY_TO` | não | Padrão: o próprio remetente |
| `SALES_PACING_SECONDS` | não | Mínimo entre dois envios. Padrão 180 |
| `SALES_MAX_PER_CYCLE` | não | Mensagens reservadas por ciclo (1 a 20). Padrão 5 |
| `SALES_CYCLE_SECONDS` | não | Espera entre ciclos. Padrão e **mínimo 300** (5 min): valor menor sobe para 300 com aviso no log. Cada chamada acorda o Neon por 5 min |
| `SALES_JANELA` | não | Janela de operação no fuso de Fortaleza. Padrão `08:00-18:00` (fim exclusivo); aceita faixas separadas por vírgula (`08:00-11:00,14:00-17:00`) ou `sempre`. **Fora da janela o executor não faz nenhuma chamada à API** (nem `/modo`, nem heartbeat) e não lê a caixa; só escreve uma linha de log por hora. Valor inválido: o executor recusa iniciar |
| `SALES_BOUNCE_BURST` | não | Devoluções numa só varredura que param o despacho. Padrão 5 |
| `SALES_PERMANENT_STREAK` | não | Falhas permanentes seguidas que param o despacho. Padrão 3 |
| `SALES_JOURNAL_PATH` | não | Diário SQLite. A unit já define `/var/lib/sales-executor/journal.sqlite3` |
| `SALES_SMTP_TIMEOUT`, `SALES_API_TIMEOUT`, `SALES_IMAP_FIRST_DAYS`, `SALES_IMAP_BATCH` | não | Ajustes finos (30 s, 20 s, 14 dias na primeira varredura, 50 e-mails por ciclo) |

Para começar, preencha **apenas** `SALES_API_URL`, `SALES_HERMES_SECRET_READ` e `SALES_DRY_RUN=1`.

### 5. Instalar a unit e iniciar **em DRY_RUN**

```bash
sudo cp /opt/sal-vita-vendas/scripts/sales/executor/sales-executor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now sales-executor
```

Teste antes, na mão, sem enviar nada:

```bash
cd /opt/sal-vita-vendas/scripts/sales/executor
python3 -m unittest discover -s tests          # os testes não usam rede
set -a; . /etc/sales-executor.env; set +a      # como root
python3 worker.py --check                      # valida a configuração sem imprimir valores
python3 worker.py --once                       # um ciclo
```

Em DRY_RUN o executor chama **só** `GET /api/sales/modo` e o heartbeat, não abre SMTP nem IMAP e não
informa nada como aceito. O painel deve mostrar o executor com sinal recente.

### 6. Ler os logs

```bash
journalctl -u sales-executor -f                  # ao vivo
journalctl -u sales-executor --since "1 hour ago"
journalctl -u sales-executor -p warning          # só avisos e alertas
journalctl -u sales-executor | grep ALERTA       # alertas de parada, UNKNOWN, 409
```

Os logs trazem ids de mensagem, códigos e o **domínio** do destinatário. Nunca trazem senha, segredo, corpo do
e-mail nem endereço completo. Um filtro de redação troca qualquer segredo configurado por `***`.

### 7. Liberar o envio de verdade (ato do dono)

Só depois de: termos do provedor lidos e registrados no painel; SPF/DKIM/DMARC ok; auditoria sem pendência;
modo do servidor em **Revisão** com um primeiro lote aprovado pelo dono.

1. Preencha no arquivo de ambiente os segredos de despacho, SMTP, IMAP e remetente.
2. Troque `SALES_DRY_RUN=0` e `sudo systemctl restart sales-executor`.
3. Confira `journalctl -u sales-executor -f` durante os primeiros envios (ritmo de 1 a cada 3 minutos).

**Voltar atrás:** `SALES_DRY_RUN=1` e reiniciar; ou colocar o sistema em **Pausado** no painel (a autorização
passa a ser recusada em até um ciclo). Ver a seção "Interruptor" em `docs/HERMES-SKILLS-VENDAS.md`.

### 8. Paradas de segurança

O executor **para sozinho** (e avisa no log e no heartbeat com `parado=1`) quando: o servidor responde 401, o
login SMTP ou IMAP é recusado, há 3 falhas permanentes seguidas ou uma rajada de devoluções. A parada
**persiste a reinício**. Depois de descobrir e corrigir a causa:

```bash
cd /opt/sal-vita-vendas/scripts/sales/executor && set -a && . /etc/sales-executor.env && set +a
python3 worker.py --liberar && sudo systemctl restart sales-executor
```

### 9. Envio com resultado `UNKNOWN`

Significa que a conexão caiu depois do comando DATA: o provedor **pode** ter aceitado. O executor **nunca** reenvia
sozinho. A mensagem aparece no painel como "Desconhecidas" para o dono conferir na pasta Enviados da caixa e
marcar "foi enviada" ou "não foi enviada".

## Segurança

- Credenciais ficam só no arquivo de ambiente da VPS. Nenhuma vai para modelo de IA, repositório ou log.
- O diário `/var/lib/sales-executor/journal.sqlite3` é a memória anti-duplicidade: faça backup, **não** restaure
  versão antiga e não apague com o serviço rodando.
- A caixa de entrada é aberta somente para leitura (`BODY.PEEK`): nada é marcado como lido, apagado ou respondido.
