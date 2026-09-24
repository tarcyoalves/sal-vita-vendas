# HANDOFF — Hermes (Antigravity / Gemini)

> **Para quem é:** o agente Hermes, rodando no Antigravity com Gemini, que vai
> escrever código, alterar e publicar este sistema com autonomia.
>
> **Escrito em:** 24/09/2026, a partir do código real (não de outros documentos).
> Cada commit citado aqui foi conferido com `git log`; cada comando foi executado.
>
> **Linha de base verificada neste dia** (código em `3ab6027`, antes do commit
> que criou este arquivo): `npm run check` com 0 erros, `npm test` com 22 testes
> passando, build do client e bundle da API OK.

---

## 0. Como usar este arquivo

Leia inteiro antes da primeira alteração. Depois, consulte por seção.

**Ordem de leitura na primeira sessão:**

1. Este arquivo (`HANDOFF-HERMES.md`)
2. **`coordenacao/README.md`** — como registrar o que você está fazendo para
   não colidir com outras IAs. **Obrigatório em toda sessão.**
3. `ESTADO-DO-PROJETO.md` — estado atual, pendências e **a seção 4, de
   conformidade sanitária**, que é obrigatória antes de escrever qualquer texto
   que o cliente final leia
4. `CLAUDE.md` — convenções de código (corrigido em 24/09/2026; o que estava
   errado antes está na seção 12)

**Não use como instrução** — são históricos ou de outros contextos:
`HANDOFF.md` (diário longo; útil só para detalhes da VPS/WhatsApp),
`RETOMAR.md`, `SESSAO-2025-05-25.md`, `CLAUDE_PROMPT.md`.

**Quando este arquivo e o código discordarem, o código vence.** Confira e
corrija este arquivo.

---

## 1. Regras invioláveis

Cada regra existe porque alguém — IA ou humano — já causou dano real neste
repositório. A seção 7 conta cada caso.

1. **Feature nova vai em arquivo novo e namespace novo.** Nunca sobrescreva um
   arquivo existente para "adaptar" a outra finalidade. *(seção 7, caso A)*
2. **Antes de commitar, leia `git diff --stat`.** Se um arquivo encolheu muito
   ou apareceu um arquivo que você não pretendia tocar, **pare**. *(casos A, D)*
3. **Nunca invente dado técnico, regulatório ou financeiro.** Sem fonte, o campo
   fica vazio e a tela mostra "não informado". *(caso F)*
4. **Dado que mais de uma pessoa precisa ver mora no servidor** (tabela +
   router tRPC). `localStorage`/`IndexedDB` só para preferência de interface.
   *(caso E)*
5. **Toda procedure que lê dado de cliente ou altera algo é `protectedProcedure`
   ou `staffProcedure`.** `publicProcedure` exige motivo escrito no código.
   *(caso B)*
6. **"Pronto" significa: está em `origin/main` e o deploy subiu.** Commit numa
   branch não está pronto. *(caso H)*
7. **Só afirme o que você verificou nesta sessão.** Número de testes, "build OK",
   "funciona" — só depois de rodar o comando e ver a saída. *(casos H, K)*
8. **Nunca escreva segredo em arquivo do repositório.** O repo é **público**
   (confirmado na API do GitHub em 24/09/2026). *(seção 10)*
9. **Nunca `git push --force` em `main`.** Nunca reescreva histórico sem o dono
   pedir explicitamente.
10. **Conformidade sanitária do produto** — as 6 regras da seção 1 do
    `ESTADO-DO-PROJETO.md` valem integralmente. Resumo na seção 9 deste arquivo.
11. **Registre o que está fazendo, antes de fazer.** Outras IAs trabalham aqui ao
    mesmo tempo. Antes de alterar qualquer coisa: leia `coordenacao/ativo/`,
    crie a sua reivindicação e **publique** (push). Ao terminar, mova para
    `coordenacao/registro/`. Nunca toque arquivos que estejam na reivindicação
    de outro agente. Protocolo completo em `coordenacao/README.md`. *(caso A)*

---

## 2. O que é o sistema

Um repositório, **dois produtos distintos**. Nunca misture um no outro.

| | **CRM de Lembretes** | **Sal Vita Premium** |
|---|---|---|
| Domínio | `lembretes.salvitarn.com.br` | `www.premium.salvitarn.com.br` |
| O que é | SaaS interno: atendentes, tarefas, lembretes, e-mail marketing, faturamento, documentos | Loja: landing, checkout, pedidos, frete, recuperação de vendas, B2B |
| Banco | `DATABASE_URL` | `ORDERS_DATABASE_URL` |
| Layout | com `AppShell` (barra lateral) | sem `AppShell` |
| E-mail marketing | router `emailMarketing` | router `premiumEmailMarketing` |

**Como o roteamento decide:** `client/src/App.tsx` lê `window.location.hostname`.
Host premium entra num bloco `if (isPremium)` e renderiza sem `AppShell`.
Qualquer outro host cai no `<Router>` do CRM.

> Tela do Premium vai dentro de `if (isPremium)` **e** precisa de rewrite no
> `vercel.json` para os dois hosts. Já criaram painel do Premium dentro do
> `AppShell` do CRM uma vez.

**Empresa:** Sal Vita, sal marinho de Mossoró/RN. Dono: Tarcyo Alves.

---

## 3. Arquitetura verificada

### Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Roteamento | **wouter** — nunca `react-router-dom` |
| API | **tRPC** + TanStack Query + **superjson** |
| Estilo | Tailwind CSS + shadcn/ui (Radix) + lucide-react |
| Backend | Express serverless na Vercel — entry point **`api/index.ts`** |
| Banco | PostgreSQL Neon + Drizzle ORM |
| Auth | JWT em cookie HttpOnly, **7 dias**, PBKDF2-SHA512 310.000 iterações |
| IA | Groq → Cerebras → NVIDIA → OpenRouter (cadeia de fallback). **Não usa Gemini.** |
| Testes | Vitest |

### Os 17 routers tRPC (`server/routers/index.ts`)

`auth` · `reminders` · `tasks` · `sellers` · `clients` · `ai` · `knowledge` ·
`workSessions` · `tv` · `shipping` · `recovery` · `emailMarketing` ·
`premiumEmailMarketing` · `tags` · `faturamento` · `b2b` · `catalog`

Para listar de novo:
```bash
grep -oE "^\s+[a-zA-Z0-9]+: [a-zA-Z0-9]+Router" server/routers/index.ts
```

### Níveis de acesso (`server/trpc.ts`)

| Procedure | Quem |
|---|---|
| `publicProcedure` | qualquer pessoa na internet |
| `protectedProcedure` | qualquer usuário logado |
| `staffProcedure` | `admin` e `manager` |
| `adminProcedure` | só `admin` |

### Pastas que importam

```
api/index.ts              entry point do servidor (webhooks, crons, REST)
api/bundle.js             gerado pelo build — PRECISA ficar versionado
client/src/App.tsx        rotas + decisão CRM vs Premium
client/src/components/    AppShell, faturamento/, email/, tasks/, ui/
client/src/lib/           faturamento/ (calc, store, types), tasks/location.ts
client/src/pages/         uma página por rota
server/db/schema.ts       fonte da verdade das tabelas
server/db/migrate.ts      ensureTablesExist() + SCHEMA_VERSION
server/db/ordersDb.ts     conexão do Premium
server/email/             motores de e-mail (marketing, campaigns, automations, frequency)
server/routers/           um router por domínio
tests/                    Vitest
sallog/                   OUTRO PROJETO — não mexa, está fora do tsconfig
```

### Crons (`vercel.json`, horário **UTC**)

| Path | Schedule | BRT |
|---|---|---|
| `/api/cron/email-daily` | `0 11 * * *` | 08:00 |
| `/api/cron/abandoned-cart` | `0 15 * * *` | 12:00 |

Ambos exigem `Authorization: Bearer $CRON_SECRET`.

---

## 4. Fluxo de trabalho — passo a passo de uma alteração

Siga nesta ordem, sempre.

```bash
# 1. Sincronize. O repositório já teve cópias locais 4 commits atrás sem ninguém notar.
git fetch origin main
git checkout main
git pull origin main
git log --oneline -3

# 2. Dependências. O node_modules pode não existir no checkout.
test -d node_modules || npm install

# 3. Quem mais está trabalhando agora? (coordenacao/README.md)
ls coordenacao/ativo/
```

**Coordene antes de mexer.** Leia cada reivindicação em `coordenacao/ativo/`.
Se alguma lista arquivos que você vai tocar, **não toque neles**. Senão, crie a
sua a partir de `coordenacao/MODELO.md`, commite e **publique antes de
codar** — reivindicação que não foi publicada não existe para os outros.

**4. Entenda antes de mudar.**
- Leia o arquivo inteiro que você vai editar, não só o trecho.
- Antes de apagar qualquer coisa, procure quem usa:
  `grep -rn "NomeDaCoisa" client/src server api`
- Antes de criar feature nova, confira se já existe algo parecido.

**5. Faça a mudança.** Uma finalidade por commit. Fique dentro do escopo que
você reivindicou; se precisar de outro arquivo, atualize a reivindicação antes.

**6. Verifique — os três portões:**
```bash
npm run check       # tsc --noEmit — tem que dar zero erros
npm test            # vitest — tudo passando
npm run build:client
npm run build:api
```

**7. Se mudou interface:** veja a tela renderizada (seção 5, "O que os portões
NÃO pegam").

**8. Revise o que vai no commit:**
```bash
git status
git diff --stat     # arquivo encolheu muito? arquivo inesperado? PARE.
git diff            # leia a mudança de verdade
```

**9. Restaure o bundle se você só rodou o build para testar:**
```bash
git checkout -- api/bundle.js
```
(o bundle é regerado no deploy; commitá-lo sem motivo só gera ruído)

**10. Commite, traga o que outros publicaram, e publique.** Commite **antes**
de puxar — o git recusa `pull --rebase` com mudança não commitada:
```bash
git add <arquivos específicos>
git commit -m "tipo(escopo): descrição em inglês"
git pull --rebase origin main   # outro agente pode ter publicado
npm run check && npm test       # confira de novo em cima do código dele
git push origin main
```

**11. Confirme que chegou:**
```bash
git fetch origin main
git merge-base --is-ancestor <seu-commit> origin/main && echo "está em main"
```
O deploy da Vercel leva ~2 minutos depois do push.

### Formato de commit

Em **inglês**, tipo convencional (`feat`, `fix`, `refactor`, `test`, `docs`,
`ci`, `build`, `chore`). Assunto curto; corpo explica **o porquê**, não só o quê.
Descreva o que o código faz — nunca promessas ("100% permanent", "NEVER lost").

---

## 5. Os portões de qualidade

O deploy roda `npm run vercel-build`:

```
npm install && npm run check && npm test && npm run build:client && npm run build:api
```

Se qualquer etapa falhar, **nada é publicado**. O workflow
`.github/workflows/typecheck.yml` roda `check` + `test` em push e PR, para o
erro aparecer antes.

| Portão | Comando | Pega |
|---|---|---|
| Tipos | `npm run check` | procedure inexistente, função não definida, tipo errado, import quebrado |
| Testes | `npm test` | regressão nas regras cobertas (hoje: competência do faturamento e datas) |
| Build | `npm run build:client` / `build:api` | erro de sintaxe, módulo faltando no bundle |

### O que os portões NÃO pegam

- **`as any` desliga o typecheck.** O crash `e.trim is not a function` da página
  de progresso passou por todos os portões porque `tasks as any[]` escondia o
  tipo. Evite `as any`; se precisar, comente o motivo.
- **Layout quebrado.** Tipos e build não sabem se o painel abriu fora da tela.
  Para UI nova, renderize e veja (ex.: Playwright com screenshot em 1280px e
  420px). O Chromium está disponível em ambientes com Playwright.
- **Regra de negócio sem teste.** Se você mudou cálculo de dinheiro, comissão ou
  data, **escreva o teste**. Prove que o teste falha sem a sua correção e passa
  com ela.
- **Dado inventado.** Nenhum portão sabe que "NaCl ≥ 98,5%" é falso.

### Por que o build fica num script

A API da Vercel corta o `buildCommand` em **256 caracteres**. O comando longo
já quebrou o deploy uma vez. Por isso ele mora em `vercel-build` no
`package.json` e o `vercel.json` só chama `npm run vercel-build`. Os binários
são chamados por nome (não por `node_modules/.bin/`) porque a forma explícita
falha no Windows.

---

## 6. Git e deploy

- **`origin/main` é produção.** Push em `main` → Vercel publica sozinha.
- **Nunca `git push --force` em `main`.**
- **Push falhou com "Internal Server Error"?** Pode ser transitório. Tente de
  novo com espera crescente (2s, 4s, 8s, 16s). Já aconteceu e passou na 4ª.
- **Branch do Hermes:** se preferir trabalhar em branch, publique mesclando em
  `main` com `git merge --ff-only`. Trabalho que fica só na branch **não está
  em produção**.
- **Antes de trazer commits de outra branch** (`cherry-pick`), confira se eles
  já não estão em `main` e se não conflitam com o que mudou desde então.
- **`api/bundle.js` precisa continuar versionado.** A Vercel só registra
  `/api/*` como função se o arquivo existir no clone. Já apagaram e derrubaram a
  API por ~6 minutos.

---

## 7. Erros reais cometidos neste repositório

Esta é a seção mais importante. Cada caso aconteceu de verdade, tem commit, e
gerou uma regra. **Os casos A a H foram feitos por agentes Antigravity/Gemini
neste repositório; os casos I a L foram erros do Claude.** Não é para culpar
ninguém — é para você reconhecer o padrão antes de repeti-lo.

### A. O router do CRM foi sobrescrito — `3c678a4`

Pediram e-mail marketing para o **Premium**. O agente escreveu por cima de
`server/routers/emailMarketing.ts`, que era o e-mail marketing do **CRM**:
2.544 linhas viraram 356. Os dois usavam o mesmo namespace
`trpc.emailMarketing.*`. O CRM perdeu **59 das 65 procedures** que a tela
chamava — campanhas, sequências, automações, estatísticas, tudo — em produção.
O build passou, porque o Vite não checa tipos.

Restaurado em `c7e77aa`: o CRM voltou a `emailMarketing`, o Premium foi para
`premiumEmailMarketing`.

**Essa restauração ficou incompleta** — erro do Claude. O `3c678a4` também tinha
alterado `api/index.ts` e registrado uma segunda rota `POST /api/resend-webhook`
na frente da do CRM. A correção olhou só os routers e não percebeu. O bug só foi
achado em 24/09/2026 (seção 11, item 1).

**Regra:** feature nova = arquivo novo + namespace novo. **Ao reparar um commit
ruim, revise todo arquivo que ele tocou** (`git show --stat <commit>`), não só o
que quebrou de forma visível. Se `git diff --stat`
mostra um arquivo existente encolhendo centenas de linhas, você está apagando
trabalho de alguém.

### B. Todas as procedures do Premium eram públicas — `3c678a4`

As 24 procedures do e-mail marketing do Premium eram `publicProcedure`.
Qualquer pessoa na internet podia disparar campanha, apagar dados e baixar a
lista de contatos dos clientes. Corrigido para `staffProcedure` em `c7e77aa`.

**Regra:** comece de `protectedProcedure`/`staffProcedure`. Público só com motivo.

### C. Descadastro com três falhas — `3c678a4`

Endpoint público `/api/unsubscribe`:
1. **XSS refletido** — o e-mail entrava cru no HTML da página.
2. **Aceitava `?email=`** — qualquer pessoa descadastrava qualquer outra.
3. **Token buscado só no banco do Premium** — todo link já enviado pelo CRM
   dizia "Descadastro Confirmado" sem descadastrar ninguém. Falha silenciosa e
   violação de LGPD.

Corrigido em `c7e77aa`.

**Regra:** nunca interpole entrada externa em HTML sem escapar. Endpoint
público identifica a pessoa só por token opaco. Operação que envolve os dois
produtos precisa olhar os **dois bancos**.

### D. Arquivos de outro projeto entraram aqui — `3c678a4`

O mesmo commit trouxe `HANDOFF (1).md` e `antigravityonboardingHANDOFF.md`,
que são do projeto **Vita Construções** (outro repositório). Eles mandavam
"nunca publique em `main`" e apontavam outra branch — o oposto deste repo.
Removidos em 24/09/2026.

**Regra:** leia `git status` antes de todo commit. Nada de outro repositório
entra aqui.

### E. `/documentos` salvava só no navegador — `3e2831f` a `3295925`

A página de documentos guardava anexos e fotos no `IndexedDB` do navegador.
Cada pessoa via **só os próprios arquivos**: o laudo que o dono anexava não
existia para as atendentes. Sem backup; limpar o navegador apagava tudo.

Foram **12 commits** seguidos, vários "fix" em cadeia (`localStorage` → cota
estourada → compressão por Canvas → `IndexedDB`), com mensagens como
*"100% permanent data retention"* e *"NEVER lost"* — ambas falsas. Refeito com
tabelas e router no servidor em `dcc97fa`.

**Regra:** se você está no terceiro "fix" do mesmo problema, pare — o problema é
de arquitetura, não de detalhe. E mensagem de commit descreve o código, não
promete resultado.

### F. Especificações técnicas inventadas — `f209d05`

A ficha técnica dos produtos exibia pureza "NaCl ≥ 98,5%", granulometria,
solubilidade e armazenamento — **todos inventados**, sem laudo, sob o selo
"Especificação Técnica Oficial". O botão de WhatsApp enviava isso ao cliente.
Para sal alimentício, pureza é declaração regulada. Removidos em `fe9bad0`; o
dono preenche com dados de laudo pela própria tela.

**Regra:** nunca invente número. Sem fonte, "não informado".

### G. Tela que quebrava ao abrir

`AiSettings.tsx` chamava `handleTestConnection`, que não existia. Tela branca.
Corrigido em `c7e77aa`. O `npm run check` pega esse tipo de erro — por isso ele
é portão hoje.

### H. Trabalho "pronto" que nunca foi publicado

Um agente escreveu data de faturamento e "desfazer faturamento", testou, e
deixou numa branch (PR #15, nunca mesclado). O dono usou a versão antiga
achando que estava corrigida. O handoff dizia **"66 testes passando"** — não
reproduzível: nem havia Vitest instalado; eram 17. Publicado em `bc26db4` e
`8667607`; runner de testes adicionado em `f1ca8ef`.

**Regra:** confira com `git merge-base --is-ancestor <commit> origin/main`. E
número de teste só vale se você rodou o comando agora.

### I. Painel de filtros abrindo fora da tela — Claude, `8c7e40b`

O painel "Filtros" de Tarefas foi entregue sem ser visto renderizado. Abria em
x=1056 com 560px de largura numa tela de 1280 — 336px para fora, recortado pelo
`overflow-y-auto` do `<main>`.

**Regra:** UI nova, renderize e meça antes de entregar.

### J. Apagar dependência achando que era órfã — Claude

`usePersistFn.ts` foi apagado como "órfão", mas `useComposition` dependia dele,
e `input.tsx`/`textarea.tsx` dependiam de `useComposition`. O typecheck pegou
antes de publicar.

**Regra:** antes de apagar, procure quem importa — inclusive indiretamente.

### K. Afirmar uma mudança que não aconteceu — Claude, `9e3d632`

Um script de edição procurou o texto "Typecheck" para inserir o passo de
testes no CI, mas uma substituição anterior no mesmo script já tinha renomeado
o passo. A inserção não achou nada e não fez nada. Foi afirmado que o CI rodava
testes; não rodava.

**Regra:** depois de editar, **releia o arquivo** e confirme que a mudança está
lá. Edição por busca-e-substitui falha em silêncio.

### L. Crash por data que não era string — Claude, `3ab6027`

`parseDataLocal` fazia `valor.trim()`, mas `lastContactedAt` chega do tRPC como
`Date`. A página de progresso quebrava com `e.trim is not a function`. O
`tasks as any[]` escondeu isso do typecheck. Com os tipos de volta, apareceu um
segundo bug: `new Date(null)` vira 1970 e contava lead não convertido como
convertido.

**Regra:** datas do tRPC são `Date` (superjson). E `as any` desliga o portão.

---

## 8. Armadilhas técnicas deste código

### SQL raw é necessário em pontos específicos — não "traduza"

O `CLAUDE.md` dizia "sempre Drizzle, nunca SQL raw". **Está errado**: 20
arquivos usam `sql\`...\`` ou `db.execute()` de propósito. Os mais importantes
usam `FOR UPDATE` e `FOR UPDATE SKIP LOCKED` para garantir que:

- duas execuções simultâneas não gastem a mesma cota diária de e-mail
  (`server/email/marketing.ts`, `reserveDailyQuota`);
- dois disparos da mesma campanha não peguem os mesmos destinatários
  (`server/email/campaigns.ts`, `processCampaignBatch`).

**Reescrever isso no query builder do Drizzle destrói a atomicidade** e causa
e-mail duplicado e estouro de cota. Use Drizzle para o resto; não mexa nessas
queries sem entender o lock.

### Datas do tRPC chegam como `Date`

O superjson desserializa timestamps como objeto `Date`, não string. Qualquer
helper de data precisa aceitar `Date`. Os helpers em
`client/src/lib/faturamento/calc.ts` (`parseDataLocal`, `isoNoMes`,
`formatDataBR`, `dataInputLocal`) aceitam `string | Date | number | null`.

### Fuso horário

"Dia" de negócio é em **America/Sao_Paulo**. Use `spDateStr()` de
`server/lib/tz.ts`. Nunca `new Date().toISOString().slice(0, 10)` — isso
conta como dia seguinte tudo que acontece entre 21h e meia-noite.

`new Date('2026-09-01')` é interpretado como UTC e, no Brasil, vira 31/08.
Para `YYYY-MM-DD`, use `parseDataLocal`.

### Migrações

Não há Drizzle Kit rodando em produção. As tabelas são criadas por
`ensureTablesExist()` em `server/db/migrate.ts`, no cold start. Para tabela ou
coluna nova:

1. Adicione em `server/db/schema.ts`
2. Adicione o `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
   em `server/db/migrate.ts`
3. **Aumente `SCHEMA_VERSION`** (hoje `'2026-09-04a'`). Sem isso o fast path
   pula a migração e a coluna nunca é criada.

Tabelas do Premium ficam em `server/db/ordersMigrate.ts` (banco
`ORDERS_DATABASE_URL`).

### Webhooks

Os webhooks usam `express.raw({ type: 'application/json' })` antes de verificar
a assinatura. Os esquemas são diferentes:

- **Resend (Svix):** HMAC sobre `id.timestamp.<corpo bruto>`. Com
  `express.json()` o corpo é reserializado e a assinatura nunca bate.
- **Mercado Pago:** HMAC sobre um manifesto montado de headers e do id —
  `id:<data.id>;request-id:<x-request-id>;ts:<ts>` — não sobre o corpo.

**Uma rota, um handler.** No Express, o primeiro handler que casa com a rota
responde e os seguintes nunca rodam (a não ser que ele chame `next()`). Veja o
bug aberto na seção 11, item 1.

### Regras dos hooks do React

Todos os hooks antes de qualquer `return` condicional. `trpc.useUtils()` no
corpo do componente, **nunca** dentro de `onClick` ou outro callback.

### Dois bancos

- `DATABASE_URL` → CRM, e-mail marketing do CRM, faturamento, B2B, catálogo
- `ORDERS_DATABASE_URL` → pedidos, carrinhos, cupons, e-mail marketing do Premium

Em produção, `server/db/ordersDb.ts` **recusa subir** sem `ORDERS_DATABASE_URL`
(de propósito — antes caía no banco do CRM e misturava dados).

### Supressão de e-mail existe em três lugares

`email_suppressions` (CRM), `email_suppressions` (Premium) e `suppression_list`
(B2B). O descadastro propaga para as três via `suppressEmailGlobal()` em
`server/routers/unsubscribe.ts`. **Não crie uma quarta.**

### Tracking de e-mail no Resend é por domínio

Não existe parâmetro de rastreio por e-mail. Abertura liga no domínio; clique
exige um subdomínio de rastreio (CNAME) verificado. E `GET /domains` (lista)
não traz os flags de tracking — só `GET /domains/:id`.

### Cidade e estado das tarefas não são colunas

Estão embutidos no título e na descrição (`"CIDADE - UF"`). São extraídos por
`client/src/lib/tasks/location.ts`, que nunca inventa localização.

---

## 9. Conformidade sanitária — resumo

A fonte completa é a **seção 4 do `ESTADO-DO-PROJETO.md`**. Leia antes de
escrever qualquer texto que um cliente veja. Resumo:

- A embalagem declara **dois aditivos**: iodato de potássio e antiumectante
  INS-535. Nunca escreva "sem aditivos", "zero químicos", "100% natural".
- O iodo é **adicionado** (25 mg/kg), não "natural do oceano".
- **Nenhuma alegação de saúde**: nada de "reposição mineral", "eletrólitos",
  "hidratação", "energia", "previne cãibras".
- **Nenhum número de minerais** ("+80", "84+") sem laudo.
- Em 07/08/2026 a ANVISA proibiu seis produtos de sal — um deles chamado
  literalmente "Sal Marinho Integral" — pela combinação de fabricante
  clandestino, falta de registro sanitário e **alegação terapêutica**.
- Fale de **sabor, textura, origem (Mossoró/RN) e processo (evaporação solar)**.

---

## 10. Permissões e acessos

### ⚠️ O repositório é público

Confirmado na API do GitHub em 24/09/2026 (`"visibility": "public"`). Todo
arquivo commitado é visível para qualquer pessoa, **para sempre** — apagar
depois não adianta, fica no histórico. Isso já aconteceu: uma chave da API do
WhatsApp está no commit `e0cc24c`. Ele não está na linhagem de `main`, mas está
em duas branches remotas públicas (`claude/busy-ritchie-WU8fG` e
`claude/skills-discovery-install-vchro3`, verificado em 24/09/2026). **A
correção é rotacionar a chave** — apagar essas branches não revoga uma chave que
já pode ter sido copiada.

**Nunca escreva em arquivo do repositório:** token do GitHub, chave de API,
`DATABASE_URL`, senha, segredo de webhook, `JWT_SECRET`.

### O que o Hermes precisa para trabalhar igual ao Claude

| Acesso | Necessário? | Para quê |
|---|---|---|
| **GitHub: escrita em `tarcyoalves/sal-vita-vendas`** | **Sim** | clonar, commitar, fazer push em `main` (que publica) |
| Node 20 + npm | Sim | rodar `check`, `test`, builds |
| Vercel: leitura | Opcional | ver status de deploy e logs de runtime |
| Vercel: escrita de variáveis de ambiente | Não | só o dono configura segredos |
| Banco de produção | **Não** | ver abaixo |

**O Claude fez todo o trabalho deste repositório sem credencial do banco de
produção.** Mudança de schema entra por `migrate.ts` e roda sozinha no deploy.
Dar ao agente acesso de escrita ao banco de produção aumenta o risco sem
necessidade. Se o dono quiser que o Hermes consulte dados, o recomendado é um
**usuário somente-leitura** no Neon.

### Como configurar (o dono faz, fora do repositório)

- **Token do GitHub:** gere um *fine-grained token* com acesso **só** a
  `tarcyoalves/sal-vita-vendas`, permissão *Contents: Read and write*. Guarde
  no armazenamento de credenciais do Antigravity/Hermes — nunca num arquivo do
  projeto.
- **Variáveis de ambiente de produção:** ficam no painel da Vercel
  (*Settings → Environment Variables*). O agente não precisa lê-las.

### Variáveis que o código lê

Referência para saber o que existe — **os valores ficam só na Vercel**:

- **Núcleo:** `DATABASE_URL`, `ORDERS_DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`,
  `PUBLIC_APP_URL`, `ALLOWED_ORIGIN`, `ALLOWED_ORIGINS`, `CRON_SECRET`,
  `ADMIN_RESET_SECRET`
- **Admin inicial (opcional):** `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_NAME`,
  `INITIAL_ADMIN_PASSWORD` — sem nenhuma das três, o bootstrap fica desligado
  (é o estado atual). Preenchimento parcial é registrado no log e ignorado.
- **IA:** `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `NVIDIA_API_KEY`,
  `OPENROUTER_API_KEY`, `SUGGEST_MODEL`
- **E-mail do CRM:** `RESEND_MKT_API_KEY_1..5`, `RESEND_MKT_FROM_1..5`,
  `RESEND_MKT_WEBHOOK_SECRET_1..5`, `RESEND_MKT_DAILY_LIMIT`,
  `RESEND_MKT_MONTHLY_LIMIT`, `BREVO_API_KEY_1..5`, `BREVO_FROM_1..5`,
  `BREVO_WEBHOOK_SECRET`, `BREVO_DAILY_LIMIT`, `BREVO_MONTHLY_LIMIT`
- **E-mail do Premium:** `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`,
  `RESEND_DAILY_LIMIT`
- **Loja:** `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`,
  `MELHOR_ENVIO_TOKEN`, `MELHOR_ENVIO_ORIGIN_CEP`, `FB_PIXEL_ID`,
  `FB_CAPI_TOKEN`, `B2B_NOTIFY_EMAIL`
- **WhatsApp (VPS):** `WA_SERVER_URL`, `WA_API_KEY`, `WA_FORCE_SEND`

Para regerar essa lista a partir do código:
```bash
grep -rhoE "process\.env\.[A-Z_0-9]+" server api/index.ts | sort -u
```

---

## 11. Estado atual (24/09/2026)

### Funcionando

- Typecheck zerado e como portão; Vitest com 22 testes e como portão
- E-mail marketing do CRM restaurado (71 procedures, nenhuma faltando para a tela); do Premium isolado e protegido
- Descadastro seguro, buscando token nos dois bancos
- `/documentos` com anexos, fotos e especificações no servidor
- Especificações técnicas: **vazias até o dono preencher com laudo** (intencional)
- Faturamento com data de embarque escolhida e "desfazer faturamento"
- Comissão entra no mês do embarque, não no mês da digitação
- Filtros de Tarefas: tags (qualquer/todas), estado, cidade, busca ampliada
- Página de progresso do atendente corrigida

### Pendências de código (em ordem de urgência)

1. **🔴 O webhook do Resend do CRM está inalcançável desde 11/08/2026.**
   `api/index.ts` registra `POST /api/resend-webhook` **duas vezes**: primeiro o
   handler do Premium (`handleResendWebhook`, de `server/routers/resendWebhook.ts`,
   acrescentado por `3c678a4`), depois o original do CRM. O do Premium responde
   sempre (401/400/200) e nunca chama `next()`, então **o do CRM nunca executa**.
   - O do Premium só aceita assinatura com `RESEND_WEBHOOK_SECRET`; as contas do
     CRM assinam com `RESEND_MKT_WEBHOOK_SECRET_1..5`.
   - O do Premium grava `email_events` no **`ordersDb`**; o CRM lê do banco
     principal.
   - **Efeito provado pelo código:** aberturas e cliques do CRM não chegam ao
     banco do CRM — o 🔥 lead quente deixa de ser marcado, as estatísticas de
     abertura/clique do CRM param, e condições de sequência `if_opened` /
     `if_clicked` avaliam dado velho.
   - **Não verificado (sem acesso aos segredos nem aos logs — a Vercel Hobby
     reteve só 2 linhas em 7 dias):** se os eventos do CRM estão recebendo 401.
     Se estiverem, bounces e reclamações do CRM também deixaram de suprimir o
     endereço.
   - **Correção sugerida:** no handler do Premium, quando a assinatura não bater
     com `RESEND_WEBHOOK_SECRET`, chamar `next()` em vez de responder 401 — assim
     o evento cai no handler do CRM, que valida com os segredos `MKT_1..5`.
     Teste com payload assinado pelos dois segredos antes de publicar.

2. **Sem outbox nos efeitos pós-pagamento (Premium).** O pedido vira
   `confirmed` antes de `confirmOrderPaid()`; se a notificação falhar, o retry é
   barrado e o cliente nunca é avisado. **É a maior pendência do Premium.**
3. **Webhook do Mercado Pago aceita sem HMAC** quando falta segredo ou header.
4. **Cupom:** o desconto é aplicado antes da checagem do limite — pedidos
   simultâneos podem passar do limite.
5. **Migração no cold start** só loga erro; o app pode servir com schema
   incompleto.
6. **CSP duplicada** em `vercel.json` e `api/index.ts`, ambas com `unsafe-inline`.
7. **`client/index.html` compartilhado** — o CRM mostra título do Premium.
8. **Sem foreign keys** declaradas no schema.
9. **Cobertura de testes baixa** — só faturamento e datas. Autenticação,
   permissões e e-mail não têm teste.
10. **`drizzle-orm` com vulnerabilidade alta** conhecida (escape de
   identificador SQL). Atualizar em branch isolada, testando os routers.

### Pendências que só o dono resolve

- **Rotacionar a chave da API do WhatsApp** (commit `e0cc24c`, em duas branches remotas públicas — ver seção 10)
- **Certificado TLS** de `premium.salvitarn.com.br` sem `www`
- **Configurar `B2B_NOTIFY_EMAIL`** na Vercel
- **Preencher as especificações técnicas** dos 8 produtos com dados de laudo
- **Confirmar a regularização sanitária** do produto com o produtor

---

## 12. Divergências conhecidas na documentação

Corrigidas no `CLAUDE.md` em 24/09/2026. Se ainda encontrar em outro arquivo,
**o código vence**:

| Documento dizia | A verdade (verificada no código) |
|---|---|
| JWT de 30 dias | **7 dias** (`server/auth.ts`) |
| IA com Google Gemini | **Groq, Cerebras, NVIDIA, OpenRouter** — sem Gemini |
| "Sempre Drizzle, nunca SQL raw" | SQL raw é **necessário** nos locks de concorrência (seção 8) |
| Rota `/history` (CallHistory) | **Removida** — chamava um router `results` que nunca existiu |
| Build com `node node_modules/vite/...` | **`npm run vercel-build`** |
| 9 routers | **17** routers |
| "Sem testes executáveis" | **Vitest** configurado, 22 testes, portão de deploy |

---

## 13. Protocolo de sessão

Detalhes completos em **`coordenacao/README.md`**. O essencial:

### Ao começar

```bash
git fetch origin main && git checkout main && git pull origin main
git log --oneline -5              # o que mudou desde a última sessão?
ls coordenacao/ativo/             # quem está trabalhando AGORA, e em quê
ls coordenacao/registro/ | tail -5   # o que acabou de ser feito
test -d node_modules || npm install
npm run check && npm test         # a linha de base está saudável?
```

1. Leia as reivindicações ativas e as entradas recentes do registro.
2. Se a linha de base **já** estiver quebrada, conserte isso primeiro ou avise o
   dono — não empilhe trabalho novo em cima de um portão vermelho.
3. **Reivindique e publique** antes de alterar código:
   ```bash
   cp coordenacao/MODELO.md coordenacao/ativo/AAAA-MM-DD-hermes-assunto.md
   # preencha agente, início, objetivo e arquivos
   git add coordenacao/ativo/ && git commit -m "chore(coord): claim <assunto>"
   git push origin main
   ```

### Ao terminar

1. Os três portões verdes (`check`, `test`, builds).
2. Seus commits em `main`, confirmados com `git merge-base --is-ancestor`.
3. **Preencha a reivindicação** (resultado, commits, verificado, não verificado,
   armadilhas) e **mova para o registro**:
   ```bash
   git mv coordenacao/ativo/<arquivo>.md coordenacao/registro/
   ```
4. **Atualize o `ESTADO-DO-PROJETO.md`**: mova o que concluiu para "O que está
   feito", tire das pendências.
5. Publique — commit, `git pull --rebase origin main`, `git push origin main`.
6. Se aprendeu algo que evitaria um erro futuro, **acrescente na seção 7 deste
   arquivo**. Foi assim que ela nasceu.

**Nunca termine uma sessão deixando a sua reivindicação em `ativo/`.** Se não
terminou o trabalho, registre como `parcial` ou `interrompido`, diga em que
estado o código ficou, e mova assim mesmo. Reivindicação esquecida bloqueia os
arquivos para todos os outros agentes.

### Relatório ao dono

Diga o que mudou, o que você verificou (com o comando que rodou), e **o que
você não conseguiu verificar**. Se algo depende de o dono testar na tela com
dados reais, diga exatamente o quê.

---

## 14. Quando parar e perguntar ao dono

- Vai apagar ou reescrever mais que um punhado de linhas de código de outra pessoa
- A mudança toca **dinheiro**: pagamento, comissão, cupom, frete, faturamento
- A mudança toca **texto que o cliente lê** sobre o produto (conformidade)
- A mudança envia algo para fora: e-mail, WhatsApp, webhook
- Precisa de uma credencial, variável de ambiente ou acesso que não tem
- Duas instruções se contradizem e o código não resolve qual vale
- Vai fazer `git push --force`, reescrever histórico ou apagar branch
- Está no terceiro "fix" seguido do mesmo problema
- O que você precisa fazer toca arquivos da reivindicação ativa de outro agente
- O `git pull --rebase` deu conflito num arquivo de código que outro agente alterou

Nesses casos, explique o que encontrou, proponha o caminho e espere a resposta.
