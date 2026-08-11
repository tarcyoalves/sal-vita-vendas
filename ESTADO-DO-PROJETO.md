# ⚠️ LEIA ESTE ARQUIVO ANTES DE QUALQUER COISA

**Última atualização:** 11/08/2026
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
- **Antes de todo push:** `npx tsc --noEmit` e o build do Vite. Se `node_modules` não
  existir no checkout, rode `npm install` antes.
- **`api/bundle.js` PRECISA continuar versionado.** A Vercel só registra `/api/*` como
  função se o bundle já existir no clone. Já removeram uma vez e derrubaram a API em
  produção por ~6 min.
- **Typecheck tem erros de baseline** (deps shadcn ausentes, subprojeto `sallog/`,
  tipagem do `express-rate-limit`, `AiTab` do Recovery). Não são seus. Confirme com
  `git stash` antes de sair caçando.

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

**Norma:** RDC 604/2022 (ANVISA). A ANVISA está fiscalizando teor de iodo em sal — em
21/01/2026 recolheu o lote 901124 do sal Marfim por reprovação nesse ensaio. O risco da
Sal Vita **não** é o produto; era o site contradizer o próprio rótulo.

**Se um dia sair um laudo** enumerando os elementos, aí sim dá para voltar com número de
minerais. Até lá, não.

---

## 5. O que está feito

**Premium**
- Landing redesenhada (versão anterior preservada em `/classic`).
- Copy alinhada à conformidade (commits `6caaee9`, `175b97a`).
- Frete server-authoritative; token opaco de rastreio (sem telefone na URL).
- Confirmação de pagamento idempotente (`UPDATE ... WHERE payment_status='awaiting'
  RETURNING`) nos dois caminhos — webhook e reconcile — para não disparar
  WhatsApp/e-mail/CAPI/cupom em dobro.
- Reconcile valida o valor pago antes de confirmar.
- Cron de abandoned-cart agendado; portão de conectividade do WhatsApp para não queimar
  as tentativas de recuperação com o WA fora do ar.
- Pareamento de WhatsApp por QR pelo próprio painel.
- Painel admin unificado (Pedidos + Recuperação + Leads B2B).

**B2B — Sprint 1 (fundação)**
- 6 tabelas (`companies`, `contacts`, `public_sources`, `consent_records`,
  `suppression_list`, `audit_logs`) via `ensureB2bTablesExist()`.
- Página pública `/atacado` + `POST /api/b2b/inbound` com dedup (CNPJ → e-mail →
  telefone), suppression, consentimento e audit log.
- Admin de leads como aba do painel Premium.
- Planejamento em `PLANO-PROSPECCAO-B2B.md` (estratégia) e
  `PLANO-FINAL-EXECUCAO-B2B.md` (execução por sprints).

---

## 6. Pendências — em ordem de urgência

### 🔴 Só o dono resolve (fora do código)
1. **Rotacionar a API key do WhatsApp.** Ela vazou em texto puro no commit `767565a`
   (`vps-wa-patch.sh`), junto com IP da VPS, usuário SSH e caminho da chave privada. O
   HEAD já foi limpo, **mas o commit continua no histórico e o repositório é público** —
   limpar o arquivo não revoga a chave. Trocar a chave é o que resolve; reescrever o
   histórico (`git filter-repo`) é o passo seguinte.
2. **TLS do domínio sem `www`.** `premium.salvitarn.com.br` (sem www) apresentou
   certificado emitido só para `www.premium...`. Quem digita sem www não abre o site.
3. **Setar `B2B_NOTIFY_EMAIL`** na Vercel — sem isso o aviso de lead novo do `/atacado`
   não chega.

### 🟠 Código, ainda aberto
4. **`server/db/ordersDb.ts` continua fail-open.** O comentário diz "fail loudly", mas o
   código é `ORDERS_DATABASE_URL ?? DATABASE_URL` e só lança erro se as duas faltarem. Se
   só a do Premium sumir, os pedidos vão para o banco do CRM com um `console.warn`.
   Alguém começou e não terminou.
5. **`GET /api/orders-health` é público e roda DDL.** Sem autenticação, executa
   `ensureOrdersTablesExist(true)` e devolve estado do schema.
6. **Sem outbox para efeitos pós-pagamento.** O pedido vira `confirmed` antes de
   `confirmOrderPaid()`. Se a notificação falhar, o retry do webhook é barrado pelo guard
   idempotente e o cliente nunca recebe aviso.
7. **Webhook do Mercado Pago é fail-open no HMAC** (sem secret, ou sem os headers, segue).
8. **Cupom:** o contador é atômico, mas o desconto já foi aplicado no checkout antes da
   checagem — pedidos simultâneos podem sair com desconto além do limite.
9. **Migrações rodam no cold start** com `.catch()` que só loga; o app serve requisição
   com schema incompleto.
10. **CSP duplicada** em `vercel.json` e `api/index.ts`, ambas com `unsafe-inline`.
11. **`client/index.html` é compartilhado** — por isso o CRM mostra título do Premium.
12. **Sem testes executáveis e sem gate de CI.**

### 🔵 Operacional
13. Pedidos com PIX inline (sem `mpPreferenceId`) não aparecem em `listOrders`.
14. Frete da caixa de 10 kg saiu R$ 200,88 (PAC p/ SP) — mais caro que o produto. Decisão
    comercial, não bug.
15. B2B Sprints 2–4 (pipeline comercial, prospecção manual assistida, outbound) não
    começaram. Domínio secundário só é necessário no Sprint 4.

---

## 7. Estado do Git — atenção

Sessões paralelas divergiram. Em 11/08/2026:

- **`origin/main` é a linhagem de produção.** É o que a Vercel publica. Tem o B2B, o
  painel unificado e as correções de conformidade.
- **`origin/claude/sharp-fermat-nY6Bf` é uma linhagem SEPARADA** (trabalho de migração
  Neon, cron a cada 5 min). **Não é ancestral da `main`** e não tem o B2B nem o painel
  unificado. Um `cherry-pick` entre as duas dá conflito.

**Antes de commitar:** rode `git log --oneline -3` e `git fetch origin main` e confirme em
que linhagem você está. **Não force-push** sobre a branch da outra sessão — alguém ainda
precisa decidir se aquela migração entra ou é descartada.

---

## 8. Os outros arquivos .md

Leia sob demanda, não todos:

| Arquivo | Para quê |
|---|---|
| `CLAUDE.md` | Convenções de código, estrutura de pastas, variáveis de ambiente |
| `HANDOFF.md` | Diário longo de sessões; detalhes da VPS/WhatsApp e erros já cometidos |
| `RELATORIO-PREMIUM-2026-08-09.md` | Auditoria da loja (12 achados) — a mais recente |
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
