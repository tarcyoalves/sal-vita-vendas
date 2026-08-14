# ⚠️ LEIA ESTE ARQUIVO ANTES DE QUALQUER COISA

**Última atualização:** 13/08/2026 (auditoria do CRM de Lembretes — ver seção 6)
**Este é o ponto de entrada único do repositório.** O repo tem 13 arquivos `.md` e várias
sessões de IA paralelas já se atrapalharam. Leia este primeiro; ele diz o que é verdade
hoje e para onde ir depois.

---

## 1. As 6 regras que NÃO podem ser quebradas

1. **Nunca misture os dois produtos.** São dois sistemas no mesmo repo. Nunca coloque
   tela do Premium dentro do CRM de lembretes nem vice-versa (detalhe na seção 2).
2. **Nunca afirme no site que o sal não tem aditivo.** A embalagem declara dois
   (seção 4). Já quebramos isso uma vez.
3. **Nunca faça alegação de saúde** ("mais saudável", "menos sódio", "faz bem para X").
4. **Nunca prometa número de minerais** ("+80", "84+") sem laudo laboratorial em mãos.
5. **Nunca dispare WhatsApp frio automatizado** nem e-mail frio pelo domínio principal.
6. **Confirme antes de `git push --force`** em qualquer branch. Sessões paralelas já se
   sobrescreveram (seção 6).

---

## 2. Dois produtos, um repositório

| | Sal Vita **Premium** | **CRM de Lembretes** |
|---|---|---|
| Domínio | `premium.salvitarn.com.br` | `lembretes.salvitarn.com.br` |
| O que é | Loja: landing, checkout, pedidos, frete, recuperação de vendas, B2B | SaaS interno: atendentes, tarefas, lembretes, e-mail marketing, faturamento |
| Páginas | `SalVitaLanding`, `SalVitaAdmin`, `SalVitaRecovery`, `TrackOrder`, `Atacado`, `B2bLeads` | `Tasks`, `Attendants`, `Clients`, `EmailMarketing`, `AdminDashboard`, ... |
| Banco | `ORDERS_DATABASE_URL` | `DATABASE_URL` |

**Como o roteamento decide:** `client/src/App.tsx` olha o `hostname`. Se for host premium,
entra num bloco `if (isPremium)` com checagem explícita de `path` e renderiza **sem
`AppShell`**. Qualquer outro host cai no `<Router>` genérico com `AppShell` (a barra
lateral do CRM).

> **Erro já cometido:** um agente criou o admin B2B em `/admin/b2b-leads` dentro do
> `AppShell` — ou seja, o painel do produto Premium apareceu dentro do CRM de lembretes.
> Se você for criar tela do Premium: adicione um branch dentro de `if (isPremium)` **e**
> um rewrite no `vercel.json` para os dois hosts (`premium.` e `www.premium.`).

**Painel administrativo do Premium é UM SÓ.** `SalVitaAdmin.tsx` → `AdminShell` reúne
Pedidos + Recuperação + Leads B2B em abas, com um login e um header. As três URLs
(`/sal-vita-admin`, `/sal-vita-recovery`, `/sal-vita-b2b`) renderizam o mesmo componente;
a URL só escolhe a aba inicial. Não recrie login/header por página.

---

## 3. Stack e deploy

React 19 + TypeScript + Vite · **wouter** (nunca react-router-dom) · **tRPC** + TanStack
Query · Tailwind + shadcn/ui · Express serverless na Vercel (`api/index.ts`) · Drizzle +
Neon Postgres · JWT em cookie HttpOnly.

- **Deploy:** `git push origin main` → Vercel publica sozinha (~2 min).
- **Antes de todo push:** `npx tsc --noEmit`, `npm test` e o build do Vite. Se
  `node_modules` não existir no checkout, rode `npm install` antes.
- **`api/bundle.js` PRECISA continuar versionado.** A Vercel só registra `/api/*` como
  função se o bundle já existir no clone. Já removeram uma vez e derrubaram a API em
  produção por ~6 min.
- **Typecheck está em zero erros e é portão de deploy** (desde 13/08). Se `npx tsc
  --noEmit` acusar algo, é seu — não é baseline. `tsconfig.json` cobre só
  `client/src`, `server` e `api`; `sallog/` e `tests/` estão excluídos de propósito
  (quem checa os tipos dos testes é o Vitest, ao transformar cada arquivo).
- **Testes são portão de PR e de `deploy-vercel.yml`, não do `vercel-build`.**
  `npm test` roda no workflow `Typecheck e Testes`. O push direto em `main`
  publica pela Vercel sem passar por ele — nesse caminho só o typecheck barra.
- **Se o typecheck acusar módulo faltando** (`Cannot find module 'qrcode'` e afins),
  provavelmente é o checkout local desatualizado, não o código: rode `npm install`. O
  CI usa `npm ci`, que instala o lockfile inteiro.

---

## 4. Conformidade do produto — a embalagem manda

Arte da embalagem 1 kg (auditada em 11/08/2026). **O produto está conforme; o site é que
estava errado.**

```
INGREDIENTES: Cloreto de Sódio, Iodato de Potássio e
              Antiumectante INS-535 (Ferrocianeto de Sódio).
Iodo: 2.500 µg/100 g  =  25 mg/kg   (faixa legal 15–45 ✓)
Sódio: 39.000 mg/100 g
Rótulo traz: "Este produto é enriquecido com 15 mg a 45 mg de iodo por quilograma."
Verso: "com dezenas de minerais traço naturais"   ← redação conservadora
Selo frontal: "+80 MINERAIS NATURAIS PRESERVADOS"  ← contradiz o verso
```

**Consequências que o site precisa respeitar:**

| Não escreva | Por quê | Escreva |
|---|---|---|
| "iodo natural do oceano" | Sal marinho natural tem 0,1–2 mg/kg; o mínimo legal é 15. O iodo é **iodato adicionado**. | "iodado conforme a legislação (25 mg/kg)" |
| "nenhum químico/aditivo adicionado", "zero aditivos" | Há dois aditivos no rótulo | "nenhum mineral traço é retirado" |
| "não empedra naturalmente" | Quem evita o empedramento é o antiumectante INS-535 | "umidade característica do processo" |
| "+80 minerais" / "84+ minerais" | Alegação objetiva de composição, sem laudo. O próprio verso diz "dezenas". | "minerais traço naturais" |
| "sem processos que alterem a composição mineral" | O iodato altera | "sem refino que remova os minerais traço" |
| Atacar o refinado por "adicionar químicos para evitar umidade" | Autocontraditório — o nosso também tem | "o refino remove os minerais traço" |

**O diferencial verdadeiro e vendável:** origem em Mossoró/RN (95% do sal brasileiro),
secagem por evaporação solar, ausência de refino industrial (os minerais traço ficam),
granulometria, umidade característica, embalagem zip lock com janela.

Também evite **"100% natural"** como descrição do produto. Descreva o processo
("evaporação solar", "secagem ao sol") — o produto passa por seleção, moagem, iodação e
embalagem.

### Precedentes reais da ANVISA (leia antes de escrever copy)

| Data | O que aconteceu | Lição |
|---|---|---|
| 21/01/2026 | Recolhimento do lote 901124 do sal **Marfim**, reprovado no ensaio de **teor de iodo** (LACEN-DF), via RE nº 219. | A fiscalização testa iodo em sal de verdade. O da Sal Vita está em 25 mg/kg. |
| **07/08/2026** | **Proibição de 6 produtos** (Quanqton Ocean Salts, Sal Integral Quanqton, Sal Perfeito, New Quantic, Endurance e um chamado literalmente **"Sal Marinho Integral"**), publicada no DOU. | Ver abaixo — é o precedente mais relevante. |

**O caso de 07/08/2026 em detalhe.** A proibição não foi pelo nome nem pelo conceito de
"sal integral". Foi pela combinação de três coisas:

1. **Fabricante desconhecido / clandestino**
2. **Sem registro sanitário**
3. **Alegações terapêuticas**: prevenção de cãibras e fadiga muscular, reposição mineral
   em treinos, hidratação celular por eletrólitos, recuperação após esforço, equilíbrio
   do sistema nervoso e muscular.

A ANVISA foi explícita: **alimento não pode ser anunciado com indicação terapêutica nem
promessa de prevenir problema de saúde** — isso é exclusivo de medicamento e exige
comprovação científica.

**Por que a Sal Vita é um caso diferente:** o rótulo identifica produtor (CNPJ
11309104000107) e distribuidor (A S Comércio e Moagem de Sal Ltda, CNPJ
51.422.900/0001-68) com endereço completo em Mossoró — o oposto do perfil clandestino
punido. E o site não faz nenhuma alegação terapêutica (auditado em 11/08/2026: zero).

> ⚠️ **Item aberto para o dono:** a proibição girou em torno de **falta de registro
> sanitário**. Confirme com o produtor a situação de regularização sanitária do produto e
> a licença do estabelecimento. Isso é documental, não é copy — e nenhuma IA consegue
> verificar por código.

**Não vale a pena chegar perto.** Mesmo sem promessa terapêutica explícita, evite a
família semântica que a ANVISA acabou de atacar: "reposição mineral", "eletrólitos",
"minerais essenciais para o organismo", "energia", "hidratação", ou listar minerais com a
função de cada um no corpo. Fale de **sabor, textura, origem e processo** — que é onde a
marca é forte e onde não há risco nenhum.

**Se um dia sair um laudo** enumerando os elementos, aí sim dá para voltar com número de
minerais. Até lá, não.

---

## 5. O que está feito

**CRM de Lembretes (13/08/2026 — sessão da noite)**
- **Testes rodam e são portão de PR.** Vitest 3.2.4 instalado, `npm test` =
  `vitest run`, config em `vitest.config.ts` (environment `node`, `TZ` fixo em
  `America/Sao_Paulo` para o CI não mudar o resultado das datas). O workflow
  `typecheck.yml` virou "Typecheck e Testes" e roda `npm test` — como o
  `deploy-vercel.yml` o chama via `workflow_call`, teste quebrado também barra
  aquele deploy. **Os testes NÃO entraram no `vercel-build`** de propósito: o
  `buildCommand` tem limite de 256 caracteres e já derrubou o deploy uma vez.
- **A suíte de lembretes passou a testar produção.** Os 41 casos antigos
  reimplementavam cada filtro em array local e testavam a própria
  reimplementação — verde mesmo se o dashboard mudasse a regra. A lógica foi
  extraída para `client/src/lib/tasks/reminders.ts` (puro, sem React) e agora
  `AdminDashboard`, `Tasks` e `useReminderNotifications` importam de lá. 42
  casos, e a mutação `<=` → `<` na classificação de atrasado faz quebrar
  (verificado).
- **Achado da extração:** o hook prometia "janela de ±2 minutos" para o alerta
  na hora, mas `overdue` é avaliado antes e captura tudo abaixo de -60s, então a
  janela real é -60s..+60s. Um lembrete 90s atrasado sai como "Atrasada", não
  como "Lembrete". Comportamento **mantido** (mudar é decisão de produto) e
  registrado em teste + comentário em `ALERT_WINDOWS`.
- **Meta Pixel não carrega mais no CRM.** O `fbq('init')` + `PageView` rodava em
  qualquer host: toda tela do sistema interno autenticado reportava para a Meta.
  Agora o IIFE só boota nos hosts `premium.` / `www.premium.` e na rota
  `/sal-vita`. O JSON-LD de produto (nome, preço, disponibilidade) também é
  removido no host `lembretes.`. Coberto por `tests/index-html-hosts.test.ts`,
  que executa o `client/index.html` real em jsdom e checa os dois hosts.
- **`remindersRouter` removido — era código morto.** `trpc.reminders.*` não tinha
  um único consumidor em client/api/server; o lembrete do CRM é
  `tasks.reminderDate` servido por `tasks.reminders`. A **tabela `reminders`
  continua** no schema (pode ter linhas legadas em produção; o monitor de
  storage a lista e `recoverOldDb` a copia), agora com comentário de "LEGADO —
  não escreva aqui" para ninguém reintroduzi-la como modelo ativo.

**Infra e portões (13/08/2026 — PRs #12 e #13)**
- **Typecheck é portão de verdade** (`a29da9e` + `#12`). Os 153 erros foram zerados
  deletando ~6.300 linhas de código órfão, e `tsconfig.json` passou a excluir `sallog/`
  e `tests/`. O bloqueio efetivo está no `buildCommand` do `vercel.json`, porque a Vercel
  publica no push e não passa pelo Actions; o workflow `typecheck.yml` faz o erro
  aparecer no PR antes disso.
- **Deploy voltou a funcionar.** O `a29da9e` tinha levado o `buildCommand` a 262
  caracteres e a API da Vercel corta em 256 — o job `typecheck` passava e só o `deploy`
  quebrava, ou seja o portão recém-criado nunca guardou um deploy. O build agora mora no
  script `vercel-build` do `package.json` e o `buildCommand` é `npm run vercel-build`.
  **Os binários são chamados por nome, não por `node_modules/.bin/`** — a forma explícita
  falha no Windows e deixava o build irrodável localmente.
- **`server/db/ordersDb.ts` não é mais fail-open.** Em produção recusa subir sem
  `ORDERS_DATABASE_URL`; o fallback para `DATABASE_URL` só vale em dev.
- **`GET /api/orders-health` exige `CRON_SECRET`** (mesmo padrão fail-closed dos crons).
  Não é probe passivo: roda DDL e devolve o layout do schema. Nada no frontend o consome.
- **`GET /api/db-health` devolve só `{db:"ok"}`.** Antes entregava a mensagem do driver
  (que carrega host, database e role) e o tempo de ida e volta; os dois vão para o log.
- **Três gitlinks removidos** (`.claude/skills/get-shit-done` e dois
  `.claude/worktrees/agent-*`). Eram repos git aninhados commitados sem `.gitmodules`, e
  faziam todo job do Actions terminar com `fatal: No url found for submodule path` +
  exit 128. Regra no `.gitignore` não desrastreia o que já está no index — precisa de
  `git rm --cached`.

**Premium**
- Landing redesenhada (versão anterior preservada em `/classic`).
- Copy alinhada à conformidade (commits `6caaee9`, `175b97a`).
- Frete server-authoritative; token opaco de rastreio (sem telefone na URL).
- Confirmação de pagamento idempotente (`UPDATE ... WHERE payment_status='awaiting' RETURNING`) nos dois caminhos — webhook e reconcile.
- Reconcile valida o valor pago antes de confirmar.
- Cron de abandoned-cart agendado; portão de conectividade do WhatsApp para não queimar as tentativas de recuperação com o WA fora do ar.
- Pareamento de WhatsApp por QR pelo próprio painel.
- **Painel Admin Unificado Redesenhado (SaaS Profissional)**:
  - `SalVitaAdmin.tsx`, `SalVitaRecovery.tsx` e `B2bLeads.tsx` redesenhados com Tailwind CSS e `lucide-react` (zero visual de IA).
  - Esteira visual de progresso (Order Stepper em 5 etapas: `Criado` ➔ `Pago` ➔ `Etiqueta` ➔ `Enviado` ➔ `Entregue`).
  - Busca inteligente por Cliente, Telefone, CPF, E-mail, Cidade, Pedido # ou Rastreio + Filtros por período temporais.
  - Seleção por checkbox + Barra flutuante no rodapé para emissão de etiquetas em lote no Melhor Envio (`batchGenerateLabels`) e exportação CSV.
  - Disparo de rastreio direto pelo WhatsApp do servidor na VPS (`sendTrackingWhatsApp`).
  - Varredura de bugs: tratamento defensivo de valores nulos em telefones/CPFs e prevenção de `NaN` em métricas financeiras.
- **Sistema Completo de E-mail Marketing (Sal Vita Premium)**:
  - 13 tabelas criadas no banco de dados do Premium (`ORDERS_DATABASE_URL`).
  - Reserva atômica de cota com `FOR UPDATE` (`reserveDailyQuota` em `marketingQuota.ts`), eliminando o bug de reset por cold start.
  - Gestão multi-conta em cascata (Resend 1..5 + Brevo 1..5) e suporte a Teste A/B de assunto.
  - Montagem de público (`buildAudience`) a partir de compradores (`site_orders`), carrinhos (`abandoned_carts`) e leads B2B (`contacts` + `companies`).
  - Disparos em lote resilientes com claim `FOR UPDATE SKIP LOCKED` e reciclagem de reservas órfãs.
  - Conformidade LGPD total — Opção (b): Opt-out e webhook de bounce/queixa propagam silenciosamente em todas as tabelas de supressão do grupo (`email_suppressions` Premium, `email_suppressions` CRM, `suppression_list` B2B).
  - Suporte a RFC 8058 One-Click Unsubscribe (GET & POST) com links em SSL `https://www.premium.salvitarn.com.br`.
  - Webhook Svix HMAC com verificação de assinatura time-safe (`timingSafeEqual`).
  - Motor de sequências drip (`sequenceEngine.ts`) com condições de engajamento (`if_opened`, `if_clicked`), loops e motor de regras de automação.
  - Orçamento de tempo estrito (45s) no cron diário `/api/cron/email-daily`.
  - Aba de alta performance **"E-mail Marketing"** integrada ao `AdminShell` do Sal Vita Premium (`SalVitaEmailMarketing.tsx`).

**B2B — Sprint 1 (fundação)**
- 6 tabelas (`companies`, `contacts`, `public_sources`, `consent_records`, `suppression_list`, `audit_logs`) via `ensureB2bTablesExist()`.
- Página pública `/atacado` + `POST /api/b2b/inbound` com dedup (CNPJ → e-mail →
  telefone), suppression, consentimento e audit log.
- Admin de leads como aba do painel Premium.
- Planejamento em `PLANO-PROSPECCAO-B2B.md` (estratégia) e
  `PLANO-FINAL-EXECUCAO-B2B.md` (execução por sprints).

---

## 6. Pendências — em ordem de urgência

### 🔴 Só o dono resolve (fora do código)
1. **Rotacionar a API key do WhatsApp.** O HEAD já está limpo (`vps-wa-patch.sh` e
   `vps-wa-qr-patch.sh` hoje leem `$WA_API_KEY` do ambiente), **mas o literal continua
   no histórico e o repositório é público** — limpar o arquivo não revoga a chave.
   Trocar a chave é o que resolve; reescrever o histórico (`git filter-repo`) é o passo
   seguinte. *Correção de 13/08: o commit é `e0cc24c`, não `767565a` — este último é só
   um changelog. Verificado varrendo todas as versões do arquivo no histórico.*
2. **TLS do domínio sem `www`.** `premium.salvitarn.com.br` (sem www) apresenta
   certificado emitido só para `www.premium...`. Quem digita sem www não abre o site.
   *Reconferido em 13/08: continua falhando (`SEC_E_WRONG_PRINCIPAL`); com `www` responde
   200.*
3. **Setar `B2B_NOTIFY_EMAIL`** na Vercel — sem isso o aviso de lead novo do `/atacado`
   não chega.

### 🔴 CRM de Lembretes — achados da auditoria de 13/08/2026

Detalhe completo, com arquivo:linha e plano em 4 lotes, em
`RELATORIO-AUDITORIA-CRM-2026-08-13.md`. Resumo do que é P0/P1:

- **Seed de admin com senha `admin123`** (`server/db/migrate.ts:7-25`) roda em todo cold
  start quando não existe nenhuma linha `role='admin'` — e `sellers.delete` pode apagar
  essa linha. Credencial pública no repo = tomada de conta.
- **Rate limit é contornável por batching do tRPC.** Os limiters estão em caminhos exatos
  (`api/index.ts:965-966`) e o cliente usa `httpBatchLink` (`client/src/main.tsx:77-89`);
  URL em lote não casa com o middleware. Vale para `auth.login` e `auth.emergencyReset`.
- **Restrição de IP confia em `req.ip` com `trust proxy: 1`** (`server/trpc.ts:21-23,68-70`)
  e é fail-open quando a lista está vazia com a restrição ligada.
- **Comissão vem do navegador e nunca é recalculada** (`server/routers/faturamento.ts:22-186`).
  Sem `.finite()`/faixa; editar pedido aprovado não invalida a aprovação.
- **IDOR no E-mail Marketing:** `engagementByTaskIds` e `enrollmentsByTaskIds`
  (`server/routers/emailMarketing.ts:1541-1626`) não recebem `ctx` nem aplicam
  `userTaskFilter`; `enrollTasksInSequence` (`:971-1007`) idem. `attendantBroadcast`
  (`:573-630`) aceita até 50 e-mails livres, sem ownership nem `emailConfirmed`.
- **Migração pode deixar banco novo quebrado:** `tasks.reminder_enabled` e
  `work_sessions.updated_at` não são garantidas, o bloco de tags consulta `tasks.tags`
  antes do `ALTER`, e o erro é engolido em `api/index.ts:173-177`.
- **`/api/resend-webhook` está registrado duas vezes** (`api/index.ts:291` e `:494`); só a
  primeira responde, então o limiter da segunda nunca se aplica.
- **`npm audit --omit=dev`: 15 advisories** (1 critical, 6 high). O `tar` crítico entra por
  `@capacitor/cli`, que está em `dependencies` sem precisar estar. `react-router-dom` está
  instalado e não é usado — contraria a regra do wouter.

### 🟠 Código, ainda aberto
4. **Sem outbox para efeitos pós-pagamento.** O pedido vira `confirmed` antes de
   `confirmOrderPaid()`. Se a notificação falhar, o retry do webhook é barrado pelo guard
   idempotente e o cliente nunca recebe aviso. **É a maior pendência de código hoje** —
   as outras não fazem o cliente pagar e não receber nada.
5. **Webhook do Mercado Pago é fail-open no HMAC** (sem secret, ou sem os headers, segue).
6. **Cupom:** o contador é atômico, mas o desconto já foi aplicado no checkout antes da
   checagem — pedidos simultâneos podem sair com desconto além do limite.
7. **Migrações rodam no cold start** com `.catch()` que só loga; o app serve requisição
   com schema incompleto.
8. **CSP duplicada** em `vercel.json` e `api/index.ts`, ambas com `unsafe-inline`.
9. **Schema sem foreign keys declaradas** — as relações são inteiros por convenção, sem
   `.references()`. Integridade depende só do código.
10. **Cobertura de teste é só de lembretes.** O runner existe e é portão de PR
    (seção 5), mas as duas suítes cobrem lembretes e o head do `index.html`.
    Nada cobre pagamento, frete, e-mail marketing ou os routers — que é onde
    mora o risco financeiro. Testar router exige decidir como isolar o Neon
    (banco de teste ou mock do Drizzle); nada disso está montado.

### 🔵 Operacional
11. Pedidos com PIX inline (sem `mpPreferenceId`) não aparecem em `listOrders`.
12. Frete da caixa de 10 kg saiu R$ 200,88 (PAC p/ SP) — mais caro que o produto. Decisão
    comercial, não bug.
13. B2B Sprints 2–4 (pipeline comercial, prospecção manual assistida, outbound) não
    começaram. Domínio secundário só é necessário no Sprint 4.

---

## 7. Estado do Git — atenção

**`origin/main` é a linhagem de produção.** É o que a Vercel publica.

A divergência que assustava em 11/08 se resolveu: `origin/claude/sharp-fermat-nY6Bf`
está hoje **0 commits à frente e 397 atrás** da `main` (verificado em 13/08). Não tem
nada exclusivo — pode ser apagada sem perder trabalho. O mesmo vale para a maioria das
27 branches remotas, quase todas `claude/*` de sessões antigas.

**Antes de commitar:** rode `git fetch origin main` e `git log --oneline -3`. A cópia
local em `Downloads/sal-vita-vendas-atual` já ficou 4 commits atrás sem ninguém notar.

**Não force-push em `main`.** Se precisar publicar, abra PR: o workflow `typecheck` roda
no PR e a Vercel gera preview, então dá para verificar antes do merge — foi assim que os
PRs #12 e #13 foram validados.

---

## 8. Os outros arquivos .md

Leia sob demanda, não todos:

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` | Convenções de código, estrutura de pastas, variáveis de ambiente |
| `HANDOFF.md` | Diário longo de sessões; detalhes da VPS/WhatsApp e erros já cometidos |
| `RELATORIO-AUDITORIA-CRM-2026-08-13.md` | **Auditoria do CRM de Lembretes — a mais recente.** 25 achados com arquivo:linha, o que já estava corrigido, e plano em 4 lotes |
| `RELATORIO-PREMIUM-2026-08-09.md` | Auditoria da loja (12 achados) |
| `RELATORIO-AUDITORIA-PREMIUM.md` | Auditoria anterior (02/07); os 3 críticos já foram corrigidos |
| `PLANO-PROSPECCAO-B2B.md` | Estratégia B2B completa (25 partes) |
| `PLANO-FINAL-EXECUCAO-B2B.md` | Execução B2B por sprints + prompt do agente executor |
| `FATURAMENTO_PLAN.md`, `REMINDER_IMPLEMENTATION.md` | Módulos do CRM de lembretes |
| `AGENTS.md`, `GEMINI.md`, `CLAUDE_PROMPT.md` | Config de ferramentas de IA |
| `RETOMAR.md`, `SESSAO-2025-05-25.md` | Históricos antigos, provavelmente obsoletos |

---

## 9. Ao terminar sua sessão

Atualize **este arquivo**: mova o que você concluiu para a seção 5, tire da seção 6, e
registre qualquer armadilha nova que você descobriu. Se você quebrou alguma das 6 regras
da seção 1 e aprendeu algo, escreva lá — foi assim que essa lista nasceu.
