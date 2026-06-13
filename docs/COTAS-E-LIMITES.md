# Cotas e Limites das Plataformas — Sal Vita Lembretes

> **Objetivo:** reunir num só lugar todos os limites de plano gratuito das
> plataformas que o sistema usa, o que o código já faz para se proteger, e
> **o que VOCÊ (admin) deve fazer para o sistema nunca sair do ar.**
>
> ⚠️ Os valores de plano gratuito mudam com o tempo. Sempre confirme na
> página oficial de pricing de cada serviço. Última revisão: 2026-06.

---

## Resumo rápido — o que mais "estoura"

| Risco | Plataforma | Limite grátis | O que fazer |
|-------|-----------|---------------|-------------|
| 🔴 Alto | **Resend (e-mails)** | 100/dia · 3.000/mês por conta | Não disparar campanhas grandes de uma vez; usar múltiplas contas |
| 🟡 Médio | **Gemini / Groq (IA)** | Rate limit por minuto | Evitar reanálises repetidas; respeitar o cooldown |
| 🟡 Médio | **Neon (banco)** | Conexões + compute limitados | Evitar muitos acessos simultâneos; banco "dorme" sem uso |
| 🟢 Baixo | **Vercel (hosting)** | 100 GB-banda/mês · execução serverless | Monitorar; raramente é problema neste porte |

---

## 1. Resend — envio de e-mails 🔴 (o mais crítico)

O sistema tem **dois** caminhos de e-mail, **independentes**, cada um com sua(s) conta(s):

### 1a. E-mails transacionais (Sal Vita Premium / e-commerce)
- **Arquivo:** `server/email/resend.ts`
- **Conta:** `RESEND_API_KEY` (1 conta), remetente `noreply@premium.salvitarn.com.br`
- **Limite Resend grátis:** **100 e-mails/dia**, **3.000/mês**
- **Proteção no código:** limite "soft" de **80/dia** (`RESEND_DAILY_LIMIT`), deixando margem de 20.
- **⚠️ Fragilidade:** o contador é **em memória** — ele zera a cada "cold start" do serverless. Ou seja, em teoria o sistema pode passar de 80 num dia movimentado. É um freio de mão, não uma garantia.

### 1b. E-mail Marketing (CRM de Lembretes — campanhas e sequências)
- **Arquivos:** `server/email/marketing.ts`, `server/routers/emailMarketing.ts`
- **Contas:** sistema "cascata" (waterfall) com **até 5 contas Resend**:
  - `RESEND_MKT_API_KEY_1` + `RESEND_MKT_FROM_1`
  - `RESEND_MKT_API_KEY_2` + `RESEND_MKT_FROM_2` … até `_5`
- **Limite por conta:** **90/dia** (`RESEND_MKT_DAILY_LIMIT`) → fica abaixo dos 100 reais.
- **Capacidade total:** 5 contas × 90 = **450 e-mails/dia**.
- **Proteção no código:** contador **persistido no banco** (tabela `email_send_counters`) — sobrevive a cold start. Quando a conta 1 enche, passa para a 2, e assim por diante. Quando todas enchem, o envio para e mostra aviso *"Limite diário das contas de e-mail atingido"*.
- **Lote (batch):** no máximo **100 e-mails por chamada** à API.

#### O que estoura o plano de e-mail marketing:
1. **Campanha para uma lista grande** (> 80–90 destinatários) num único dia.
2. **Várias sequências ativas** + **automações** inscrevendo leads ao mesmo tempo (todas consomem da mesma cota diária).
3. **Reenviar** campanhas/sequências repetidamente no mesmo dia.

#### ✅ O que fazer para não sair do ar:
- **Parcele campanhas grandes:** mande em blocos ao longo de vários dias. O sistema já continua de onde parou no dia seguinte.
- **Cadastre mais contas Resend** (`_2` a `_5`) se precisar de volume — cada conta nova soma +90/dia.
- **Monitore a cota:** a aba **Estatísticas** mostra "Cota Resend hoje" (ex: `120/450`).
- **Não confunda as contas:** a conta transacional (`RESEND_API_KEY`) é separada das de marketing (`RESEND_MKT_*`). Encher uma não afeta a outra.
- **Verifique domínio/DNS** (SPF, DKIM) nas contas Resend — sem isso os e-mails caem em spam mesmo dentro da cota.

#### Variáveis de ambiente (Vercel → Settings → Environment Variables):
| Variável | Padrão | Para quê |
|----------|--------|----------|
| `RESEND_API_KEY` | — | Conta transacional (Premium) |
| `RESEND_DAILY_LIMIT` | `80` | Freio diário transacional |
| `RESEND_MKT_API_KEY_1..5` | — | Contas de marketing (cascata) |
| `RESEND_MKT_FROM_1..5` | — | Remetente de cada conta |
| `RESEND_MKT_DAILY_LIMIT` | `90` | Freio diário por conta de marketing |
| `RESEND_MKT_WEBHOOK_SECRET_1..5` | — | Validação dos webhooks (aberturas/cliques) |

---

## 2. IA — Google Gemini e Groq 🟡

- **Arquivo:** `server/routers/ai.ts`
- **Variáveis:** `GEMINI_API_KEY`, `GROQ_API_KEY`
- **Usos:** Chat IA (todos), Análise IA de atendentes (admin), sugestões de abordagem.

### Limites de plano gratuito (confira sempre, mudam muito):
- **Gemini free:** cota por **requisições/minuto** e **por dia** (varia conforme o modelo).
- **Groq free:** cota por **tokens/minuto** e **requisições/minuto**.

### Proteção no código:
- **Cooldown de chat:** 2,5s por usuário (`CHAT_COOLDOWN_MS = 2500`) — evita spam de cliques.
- **Cache de análise:** 15 minutos — clicar "Analisar" de novo no mesmo período reaproveita o resultado, sem gastar cota.
- **Limite de dados:** análise de atendentes processa no máximo 5.000 tarefas (protege também o banco).
- **Fallback automático:** se um provedor responde 429 (rate limit), o sistema tenta o outro (Groq ↔ Gemini).
- **Tokens máximos:** 8.000 (análise), 1.000/700 (chat).

#### O que estoura:
1. **Muitos atendentes usando o Chat IA ao mesmo tempo.**
2. **Clicar "Analisar" repetidamente** ou ter uma base enorme de tarefas.

#### ✅ O que fazer:
- **Mantenha as duas chaves** (`GEMINI_API_KEY` **e** `GROQ_API_KEY`) configuradas — o fallback só funciona com as duas.
- **Aproveite o cache:** não reanalise antes de 15 min.
- Se o volume crescer muito, avaliar plano pago de um dos provedores.

---

## 3. Neon — banco de dados PostgreSQL 🟡

- **Variável:** `DATABASE_URL`
- **Limites do plano gratuito (confira no painel Neon):**
  - **Conexões simultâneas** limitadas (use sempre a string **`-pooler`** do Neon).
  - **Compute** que **"dorme"** (auto-suspend) após inatividade → a 1ª requisição depois de um tempo parado fica lenta ("cold start" do banco).
  - **Armazenamento** e **horas de compute/mês** limitados.

#### O que estoura:
1. **Pico de uso concorrente:** muitos atendentes + cron de automações + chat IA ao mesmo tempo.
2. Base crescendo sem limpeza (sessões de trabalho antigas são purgadas após 90 dias automaticamente).

#### ✅ O que fazer:
- **Use a connection string com pooling** (`...-pooler.neon.tech...`) no `DATABASE_URL`.
- **Monitore** o uso de compute/armazenamento no painel da Neon.
- Se o banco "dormir" e a 1ª resposta vier lenta, é normal no plano grátis — considere o plano pago para manter sempre ativo.

---

## 4. Vercel — hospedagem / serverless 🟢

- **Limites do plano Hobby (grátis) — confira no painel:**
  - **~100 GB de banda/mês.**
  - **Execução de funções serverless** com teto de tempo e invocações/mês.
  - **Sem uso comercial** no plano Hobby (atenção: este é um sistema interno de empresa — avaliar se exige plano Pro).

#### ✅ O que fazer:
- **Monitorar** o uso em Vercel → Usage.
- Como é uso **comercial/interno de empresa**, o correto a médio prazo é o **plano Pro** da Vercel (evita bloqueio por termos de uso e dá mais cota).

---

## Checklist do admin — "como não deixar o sistema off"

- [ ] **Resend:** acompanhar "Cota Resend hoje" na aba Estatísticas antes de campanhas grandes.
- [ ] **Resend:** parcelar disparos > 80–90 e/ou cadastrar contas extras (`RESEND_MKT_*_2..5`).
- [ ] **Resend:** DNS (SPF/DKIM) verificado em todas as contas.
- [ ] **IA:** manter `GEMINI_API_KEY` **e** `GROQ_API_KEY` ativas (fallback).
- [ ] **Neon:** usar string `-pooler`; monitorar compute/armazenamento.
- [ ] **Vercel:** monitorar banda/execuções; avaliar plano Pro (uso comercial).
- [ ] **Geral:** revisar este documento sempre que mudar plano ou volume.

---

## Ideia futura (sugestão)

Criar uma aba/painel **"Saúde do Sistema"** (admin) que mostre, em tempo real:
- Cota Resend usada hoje por conta (já temos os dados em `email_send_counters`).
- Número de chamadas de IA no dia.
- Aviso visual (amarelo/vermelho) quando qualquer cota passar de ~80%.

Isso transformaria este documento num **painel vivo**. Hoje a aba Estatísticas já
mostra a cota Resend — dá para expandir.
