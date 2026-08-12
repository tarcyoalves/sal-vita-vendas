# HANDOFF — Vita Construções

> Documento de transferência para o próximo agente (Claude Code, OpenClaw,
> Google AI Studio/Gemini, Antigravity, ou humano) dar continuidade ao
> projeto. Leia isto **antes** de tocar em qualquer código.
> Última atualização: **2026-08-02**, branch `claude/github-repo-access-ms553a`
> (única branch do projeto — todo push nela vai direto para produção).

> 🚨 **Leia isto antes de mais nada, principalmente se você for um agente
> novo (Antigravity incluído):**
> 1. **Só existe UM repositório de trabalho real: `tarcyoalves/VITA-CONSTRUCOES`,
>    branch `claude/github-repo-access-ms553a`.** Você pode encontrar
>    `tarcyoalves/vita-construcoes-app` e `tarcyoalves/SAAS-vita-construcoes-app`
>    no GitHub do dono — **são cópias/snapshots antigos**, não projetos
>    paralelos válidos. Os dois já foram comparados árvore-por-árvore com o
>    repositório real mais de uma vez (`DIARIO.md`) e nunca tinham nada que o
>    real já não tivesse. Nunca publique neles achando que é "o mesmo
>    projeto" — e nunca traga conteúdo deles para o repositório real sem
>    comparar primeiro (histórico de duplicação real registrado em
>    `DIARIO.md`, 2026-07-28 e 2026-07-28/08-02).
> 2. **Nunca rode `git push --force` nem reescreva histórico.** Isso já
>    aconteceu de verdade: o Google AI Studio/Gemini forçou um push que
>    apagou 294 commits (RBAC, isolamento entre organizações, todas as
>    migrations) e substituiu por um snapshot antigo, já publicado em
>    produção antes de qualquer revisão (`DIARIO.md`, 2026-07-28,
>    "incidente: force-push não autorizado"). Foi recuperado sem perda real
>    (commit novo em cima, sem reescrever histórico), mas não deveria
>    precisar acontecer de novo. A lista completa de regras aprendidas desse
>    incidente (branch errada, segredo hardcoded, CSS inventado, etc.) está
>    fixada no topo de `DIARIO.md`, seção "INSTRUÇÕES PERMANENTES PARA O
>    GEMINI" — vale para **qualquer** agente que publica por fora do fluxo
>    normal de PR, Antigravity incluído.

> ⚠️ **Este documento é um resumo, não a fonte da verdade.** A fonte mais
> confiável de "o que existe hoje" é sempre `DIARIO.md` (topo do arquivo —
> entradas mais recentes primeiro; boa parte do trabalho fica registrada
> dentro da seção "Em andamento" mesmo depois de concluído, não só em
> "Histórico"). Leia nesta ordem:
>
> 1. **`docs/AGENTES.md`** — contrato de convivência entre agentes: acesso,
>    ambiente, como o banco é operado, regras inegociáveis de código. Leia
>    **inteiro** antes de escrever qualquer linha.
> 2. **`DIARIO.md`** — o que aconteceu por último, e por quem.
> 3. **`docs/MODELO-DE-DADOS.md`**, seção 8 — decisões de modelo de dados que
>    **prevalecem** sobre o resto do documento.
> 4. Este arquivo — contexto de negócio, decisões fechadas, estado atual,
>    convenções. Complementa os três acima, não os substitui.

---

## 1. O que é este projeto (contexto de negócio)

O dono do projeto (Tarcyo) controlava os gastos de construção de casas/obras
numa planilha Excel (`GASTOS CASA 16 - TARCYO.xlsx`). O sistema substitui essa
planilha por uma plataforma web completa, multi-tenant, mobile-first, em
português (pt-BR), valores em Real — hoje **em produção**, uso real, com
dinheiro real.

A planilha misturava no mesmo catálogo tijolos, frete, mão de obra, ART,
gasolina, comissão de corretor — tudo com o mesmo tipo de linha. O sistema
corrige isso com categorias/tipos de lançamento explícitos
(`categories.type` + flags).

**Leia primeiro, nesta ordem:**
1. `docs/AGENTES.md` — como não atropelar outro agente
2. `docs/MODELO-DE-DADOS.md` — ERD autoritativo, seção 8 primeiro
3. Este arquivo — o que já existe e o que falta
4. `docs/SETUP.md` — como rodar localmente

---

## 2. Decisões já tomadas com o usuário (não reabrir sem motivo)

Estas foram discutidas e fechadas explicitamente — não proponha
alternativas a menos que o dono peça.

### 2.1 Fundação e dinheiro

- **Nome do sistema:** "Vita Construções" (`src/config/app.ts`, trocável em
  1 lugar).
- **Stack:** Next.js 15 (App Router) + TypeScript estrito + Tailwind +
  shadcn/ui + Neon Postgres + Drizzle ORM + Auth.js. Storage de documento é
  **Postgres** (`document_blobs`, bytea), não R2/S3 — decisão tomada depois
  de `/tmp` se mostrar efêmero na Vercel (ver histórico em `DIARIO.md`,
  21/07). E-mail via Resend, adaptador HTTP sem SDK (`src/lib/email.ts`).
- **Dinheiro nunca é float.** Proibido `parseFloat`/`Number(valor)`/
  multiplicação com `number`. Tudo passa por `src/services/finance/money.ts`
  (bigint de centavos, HALF_EVEN). Banco: `numeric(18,2)` para totais,
  `numeric(18,4)` para preços/quantidades, `numeric(7,4)` para percentuais.
  Regra repetida em `docs/AGENTES.md` §5.1 — já causou bug real duas vezes.
- **`db.transaction()` não existe** no driver `neon-http` — use `db.batch()`
  para atomicidade, ou `UPDATE` condicional race-safe quando `batch` não
  serve.

### 2.2 Modelo de negócio

- **Terreno/lote é despesa da obra** (decisão 8.1 de `MODELO-DE-DADOS.md`),
  nunca aquisição de ativo separado. Compra de lote pode acontecer **antes**
  de virar obra (`landLots` com `acquisitionExpenseId` e/ou rateio
  `expense_allocations.targetType='lot'`); ao transformar o lote em obra
  (`transformarLoteEmObra`), **todo** custo ligado ao lote — não só a
  aquisição inicial — é repontado para a obra nova, pra bater o custo final.
- **Ferramentas/equipamentos são imobilizado reutilizável** (`assets`,
  decisão 8.2), não despesa de obra na compra.
- **Pagamento estornado nunca entra em somatório** (decisão 8.4).
  `payments.cancelled_at IS NULL` é obrigatório em toda soma de pagamento —
  fonte recorrente de bug sutil quando esquecido.
- **`financial_status` da despesa é sempre derivado** (aberto/parcial/pago/
  atrasado), nunca digitado — `services/expenses/financial-status.ts`.
- **Corretagem é despesa/custo** vinculada à venda, abate a margem — não é
  campo separado.
- **Nunca excluir fisicamente** lançamento financeiro — sempre
  cancelamento/estorno com motivo, autor e data.
- **Revisão humana sempre obrigatória** em qualquer extração por IA (nota
  fiscal, foto de despesa) — nunca confirma lançamento financeiro sozinha.
- **Assistente de IA de texto livre foi implementado e depois REMOVIDO**
  por completo (23/07, pedido do dono, ver `PLANO-ASSISTENTE-IA.md`) — não
  reimplementar sem pedido novo. A necessidade foi coberta depois pela
  camada de IA estruturada (`PLANO-IA-COPILOTO.md`, ver seção 3.5 abaixo).
- **Petróleo/verde na paleta visual foi revertido para marinho** por pedido
  explícito do dono — não reaplicar sem novo pedido.

### 2.3 RBAC e acesso por obra (F1)

- **Papéis org-wide** (veem todas as obras): `admin`, `financeiro`,
  `gestor_obra`, `corretor`, `cliente`, `contador`.
- **Papéis escopados por obra** (`SCOPED_ROLES` em `rbac.ts`, só enxergam
  as obras atribuídas via `member_project_access`): `mestre_obra`,
  `operacional`, `comprador`, `socio_obra`.
- **`socio_obra` não pode criar obra nova** (`projects:create`, separada de
  `projects:write` — decisão de 23/07: sócio de obra gerencia a obra dele,
  mas não cria outras).
- **O escopo de obra é resolvido por requisição no servidor**, nunca
  guardado no JWT — permissões e vínculos podem mudar sem precisar de novo
  login.
- Ver seção 3.4 abaixo para a lista completa de permissões por papel.

### 2.4 Segurança — importante

- `DATABASE_URL`/`AUTH_SECRET`/token do GitHub/senha do Neon **nunca**
  aparecem em commit, código ou chat. Vivem só em: secrets do repositório
  (Settings → Secrets → Actions), Environment Variables da Vercel (escopo
  **Project**, nunca Shared), e `.env.local` local (gitignored). Se
  aparecerem em chat/log/commit, considere vazado e **rotacione** — não
  apenas apague.
- O projeto passou por uma auditoria de segurança completa OWASP (26–27/07,
  347 arquivos revisados) com correções aplicadas em produção: SSRF/IDOR
  (nenhum achado após varredura de 30 módulos), rate limit de login,
  headers de segurança (HSTS, CSP Report-Only, X-Frame-Options), upgrade de
  dependências com CVE. CI ganhou `npm audit`, Dependabot, CodeQL.
  **Regras permanentes que saíram dessa auditoria** (ver `docs/AGENTES.md`
  §5 e o histórico em `DIARIO.md` para o detalhe de cada achado):
  - Nunca `"use server"` no topo de um módulo utilitário — em Next.js isso
    transforma toda função exportada num endpoint HTTP público. Já causou
    um incidente real (`lib/documents.ts`, escrita cross-tenant).
  - `organizationId` sempre de `requireSession()`/`requirePermission()`,
    nunca do client.
  - Migrations são sempre aditivas (nunca DROP/rename direto — vira
    perda de dado silenciosa).
  - Nunca logar segredo, nem em mensagem de erro.

---

## 3. Estado atual do código (2026-08-02)

O sistema está em produção (`https://vita-construcoes.vercel.app`), CI
verde, com **todo o roadmap M0–M12 fechado** (orçamento, avanço físico,
cronograma, BI, alertas, contratos, estoque, repasse CEF, DRE gerencial), a
primeira camada de IA estruturada em uso real, e a extração de despesa por
foto/PDF evoluída (texto nativo de PDF antes de OCR, modelo de visão dedicado
obrigatório — falha rápido em vez de silencioso, desconto/rateio/fornecedor
automáticos). Esta seção é um mapa; para o detalhe de qualquer item,
`DIARIO.md` tem a entrada original.

**Iniciativa ativa agora — transformar o ERP em SaaS multi-tenant vendido
para outras construtoras.** Só planejamento por enquanto, nada implementado.
Plano completo em `docs/skill-erp-vita/saas/` (README + 4 documentos:
segurança multi-tenant, negócio/go-to-market, painel admin da plataforma,
infra/limites). **Quatro achados que mudam a decisão antes de vender para o
primeiro cliente pagante:**
1. **Plano Hobby da Vercel proíbe uso comercial** — vender hospedado ali
   viola os termos no primeiro cliente pagante, risco de suspensão sem
   aviso.
2. **Nenhuma das 55 tabelas tem RLS no Postgres** — isolamento é 100%
   disciplina de query (já achou 9 rotas sem checagem numa auditoria
   anterior, 4 exploráveis). Neon RLS/Authorize foi investigado e não
   validado (driver `neon-http` é stateless por requisição).
3. **Foto de nota fiscal é gravada como `bytea` no Postgres** — 0,5 GB do
   plano grátis do Neon esgota em meses com um cliente ativo só. Tirar o
   binário do banco é pré-requisito do segundo cliente.
4. **Não existe camada comercial** — sem cadastro self-service, plano,
   cobrança, teste grátis, painel de plataforma. Sem isso, gastar em
   anúncio traz visitante que o produto não converte.

Também documentado: a extração por foto manda o documento inteiro
(CNPJ, valores) em base64 para Groq/NVIDIA fora do Brasil, sem base legal
documentada nem mascaramento — achado de LGPD que nenhum dos dois relatórios
de IA externos trazidos pelo dono identificou (`DIARIO.md`, 31/07).

**Sistema de documentação SKILL ERP** (`docs/skill-erp-vita/`, Fase L):
19 arquivos verificados contra o código real (`npm run docs:gen` +
`npm run docs:check`, gate no CI) — existe justamente porque uma versão
anterior desses documentos tinha fabricação ("25+ tabelas" quando são 55,
"banco guarda centavos inteiros" quando a coluna é `numeric(18,2)`). Se
você for um agente novo lendo pouco código antes de responder, comece por
`SKILL_ERP_VITA.md` na raiz — mas **confira contra o código**, não repita
número de lá sem checar primeiro.

### 3.1 Estrutura de diretórios (visão atual, não exaustiva)

```
src/
├── app/
│   ├── (auth)/{login,recuperar-senha,redefinir-senha}/page.tsx
│   ├── api/{auth,export,health}/...
│   └── app/                          # shell autenticado
│       ├── page.tsx                  # Painel (briefing, alertas, caixa, BI)
│       ├── conta/                    # troca de senha própria
│       ├── ativos/, cadastros/, centros-de-custo/, clientes/,
│       │   equipes/, fornecedores/, insumos/, usuarios/[id]/obras/
│       ├── contas/ (+relatorio)      # Contas a pagar
│       ├── despesas/ (+nova, extrair, extrair/[id]/revisar)
│       ├── lotes/ (+novo, [id])
│       ├── obras/ (+nova, [id], [id]/relatorio-orcamento)  # Central da Obra em abas
│       ├── vendas/
│       └── financeiro/
│           ├── conciliacao/ (+[id])
│           ├── contas-a-receber/ (+relatorio)
│           ├── contas-bancarias/ (+nova, [id])
│           ├── dre/ (+relatorio)
│           ├── fluxo-previsto/
│           └── tesouraria/
├── db/schema/          # barrel em index.ts — tabela nova SEMPRE exportada aqui
│   ├── ai-extractions.ts, assets.ts, audit.ts, auth.ts, banking.ts,
│   │   bi-summaries.ts, budgets.ts, contracts.ts, cost-centers.ts,
│   │   documents.ts, enums.ts, expenses.ts, login-attempts.ts, lots.ts,
│   │   member-project-access.ts, parties.ts, payables.ts, products.ts,
│   │   projects.ts, purchases.ts, reference.ts, sales.ts, schedule.ts,
│   │   stock.ts, tenancy.ts, _shared.ts
├── features/            # actions + componentes de UI, por domínio
│   ├── account, ai, ai-extraction, assets, auth, banking, budgets,
│   │   clients, contracts, copiloto, cost-centers, documents, expenses,
│   │   lots, payables, products, projects, sales, schedule, stock,
│   │   suppliers, users, workers
├── services/            # lógica pura + queries, por domínio
│   ├── ai, alerts, briefing, budgets, contracts, copiloto, dashboard,
│   │   expenses, finance, lots, projects, sales, schedule, stock
├── lib/
│   ├── auth/ (rbac.ts, session.ts, project-access.ts + regras F1)
│   ├── security/ (rate-limit.ts, login-attempts.ts, get-client-ip.ts)
│   ├── export/ (csv.ts — serializer manual, sem dependência nova)
│   ├── ai/ (providers mock + openai-compatible)
│   └── audit.ts, documents.ts, document-storage.ts, email.ts, ...
└── middleware.ts
```

> `/app/assistente` (Fase I, chat de texto livre) **não existe mais** —
> removido por completo, não reimplementar sem pedido novo.

### 3.2 O que FUNCIONA hoje (núcleo operacional completo)

- **Auth/RBAC**: login/logout, troca de senha, recuperação por e-mail,
  força troca no primeiro acesso, rate limit de login. RBAC sempre checado
  no servidor via `requirePermission()`.
- **Obras**: cadastro, Central da Obra em abas (Resumo/Custos/Orçamento/
  Cronograma/Vendas/Documentos), avanço físico ponderado por etapa,
  orçamento versionado × realizado, exclusão com trava (só sem vínculo).
- **Lotes**: cadastro, lançamento de aquisição pré-obra, transformação em
  obra (com reponte de todo custo vinculado), alertas de custo incompleto.
- **Despesas / Contas a Pagar**: duplo status (operacional/financeiro),
  rateio polimórfico (obra/unidade/centro de custo/lote) que sempre fecha
  exato no total, aprovação com botão de verdade em cada tela relevante,
  banco obrigatório no lançamento, campos NF/OBS, captura por foto com IA
  (revisão humana obrigatória).
- **Vendas / Contas a Receber**: registro de venda, geração de parcelas,
  baixa de recebimento, comissão de corretor como custo, esteira de
  repasse CEF.
- **Financeiro**: contas bancárias + Tesouraria (saldo sempre derivado),
  conciliação bancária, DRE gerencial por obra/período, fluxo de caixa
  previsto, painel de capacidade de investimento (considera só o que falta
  gastar em obra em andamento — lote já pago não conta), exportação CSV e
  impressão (PDF via navegador) em Contas a Pagar/Receber/DRE/Orçado×Real/
  Fluxo de Caixa.
- **Compras/Estoque/Contratos**: schema e ações completos (`purchases`,
  `stock_items`/`stock_movements`, `contracts`/`contract_amendments`/
  `contract_measurements`) — **UI de Compras (E3) ainda não tem tela
  própria**, o resto tem.
- **Cadastros**: fornecedores (com dados bancários/PIX), clientes,
  produtos/insumos, centros de custo, trabalhadores/equipes, membros da
  organização com atribuição de obra (F1).
- **Documentos**: anexo de documento (contrato, escritura, comprovante) em
  obra ou lote, armazenado em Postgres (`document_blobs`), sem RBAC
  dedicada (espelha a entidade-mãe).
- **IA estruturada** (`docs/PLANO-IA-COPILOTO.md`): motor de alertas
  determinístico (17 regras, sem chamada de IA), explicador de obra
  (Groq narra números já calculados), resumo executivo diário cacheado,
  briefing no topo do Painel, copiloto conversacional (widget flutuante,
  4 de 9 ferramentas planejadas — leva 1 apenas, sem RBAC por obra ainda).
- **Painel**: seções por zona de decisão, briefing diário, fôlego de
  caixa, fluxo semanal, matriz custo×avanço, capacidade de investimento —
  contraste e densidade mobile revisados (medidos, não estimados).

### 3.3 O que NÃO existe ainda / pendências conscientes

- **Compras (E3)**: schema e RBAC (`purchases:*`) existem desde 21/07, mas
  não há tela de solicitação/ordem de compra.
- **Copiloto de IA — leva 2**: faltam 5 das 9 ferramentas planejadas, rate
  limit, e RBAC por obra (hoje só papel não-escopado usa o copiloto).
  Ficou para quando houver uso real que justifique.
- **Conciliação bancária — opção (a) do plano** (lançamento de ajuste
  avulso) não foi implementada, só a opção (b) (corrigir
  `openingBalance`/`balanceAsOf`).
- **Exportação Excel/PDF "de verdade"** — hoje é CSV manual + impressão do
  navegador, sem lib de PDF real.
- **`gestor_obra` sem `cashflow:read` dedicado** — perdeu acesso ao fluxo
  previsto numa correção de escopo da Fase K; não confirmado se é
  intencional ou pendência.
- **Piso de margem / prazos de capital parado** no painel de capacidade de
  investimento são hoje constantes fixas, não configuráveis pelo dono.
- **Chave real da Groq** — verificar se ainda é pendência; a IA está em
  produção nos blocos A0–A3, então pode já estar resolvida.
- **Importação da planilha original** (Fase 2, `scripts/import-planilha.ts`)
  segue no plano mas sem urgência — decisão 8.3: planilha é só referência
  de domínio, não precisa importar os dados dela.
- **Fase E5** (cadastros/perfis reorganizados) não aparece fechada
  explicitamente no histórico — confirme antes de assumir feita ou não.

### 3.4 RBAC — matriz de papéis (`src/lib/auth/rbac.ts`)

`Role = admin | financeiro | gestor_obra | mestre_obra | comprador | operacional | corretor | cliente | contador | socio_obra`

| Papel | Escopo | Notas |
|---|---|---|
| `admin` | org-wide | todas as permissões (`ALL`) |
| `financeiro` | org-wide | despesas/pagamentos/fornecedores/relatórios/compras/lotes/bancos; sem gestão de projeto |
| `gestor_obra` | org-wide | quase tudo exceto `org:manage`/`users:manage`/`banks:manage`; tem `projects:create` |
| `corretor` | org-wide | só `projects:read`, `sales:write`, `reports:read` |
| `cliente` | org-wide | só leitura |
| `contador` | org-wide | só leitura financeira + `audit:read` |
| `mestre_obra` | **escopado (F1)** | leitura/escrita básica de projeto e despesa, só nas obras atribuídas |
| `operacional` | **escopado (F1)** | despesa/pagamento/fornecedor, sem aprovar |
| `comprador` | **escopado (F1)** | despesa + `purchases:request/order` + `lots:read` |
| `socio_obra` | **escopado (F1)** | quase-total dentro da obra dele; nunca `org:manage`, `users:manage`, `banks:manage`, `budgets:write`, `audit:read`, `purchases:approve`, `sales:write`, `lots:*`, `projects:create` |

Papéis escopados só enxergam obras atribuídas via `member_project_access`
(`src/lib/auth/project-access.ts` — `accessibleProjectIds`,
`isProjectAccessible`, `accessibleExpenseIds`). Regras puras (sem `db`)
ficam em `project-access-rules.ts`, separadas para poder ser testadas sem
mock de banco.

### 3.5 Documentos de planejamento e status

| Documento | Assunto | Status |
|---|---|---|
| `PLANO-VISUAL-G.md` | Redesenho visual (tokens/primitivos) | ✅ Fechado |
| `PLANO-SOCIO-OBRA.md` | Papel `socio_obra` | ✅ Fechado (convite manual do dono é o único item fora de código) |
| `PLANO-M-INTELIGENCIA.md` | Roadmap M0–M12 | ✅ Todos os 12 blocos fechados |
| `PLANO-IA-COPILOTO.md` | Alertas/explicador/resumo/copiloto/briefing | ✅ A0–A2 e briefing fechados; A3 só leva 1 |
| `PLANO-DOCUMENTOS-OBRA-LOTE.md` | Anexos em obra/lote | ✅ Fechado |
| `PLANO-CONCILIACAO-BANCARIA.md` | Conciliação bancária | ✅ H1–H4 fechados; opção (a) do H4 não implementada |
| `PLANO-EXPORTACAO-E-CAIXA.md` | Exportação CSV/PDF + capacidade de investimento | ✅ Fechado |
| `PLANO-ASSISTENTE-IA.md` | Assistente de IA de texto livre | ⚠️ Implementado e **removido** — não reimplementar |
| `PLANO-EXPANSAO.md` | Fases E1–E5 | E1/E2/E4 feitos; E3 (Compras) sem UI; E5 não confirmado |
| `PLANO-EXPANSAO-2.md` | Fases F1–F5 (prevalece sobre o plano 1) | F1–F4 fechados; F5 virou Fase I e foi removido |
| `AUDITORIA-E-ROADMAP.md` | Auditoria que originou o Plano M | Histórico — superado pelo M0–M12 já fechado |
| `PLANO-SKILL-ERP.md` + `docs/skill-erp-vita/*` | Documentação verificada contra o código, gate de CI (`docs:check`) | ✅ Fechado, mantido vivo — atualize ao mexer no que ela descreve |
| `docs/skill-erp-vita/saas/README.md` + 4 docs | Transformação em SaaS multi-tenant (segurança, negócio, painel admin, infra) | 📝 Só plano — nada implementado, ver 4 achados críticos na seção 3 |

---

## 4. Próximo passo imediato

O roadmap operacional (M0–M12) está fechado. A iniciativa de maior porte em
aberto agora é a **transformação em SaaS** (seção 3) — ainda 100% plano, sem
nenhuma linha implementada. Se o dono pedir para começar a executar, os
quatro achados críticos da seção 3 são pré-requisito, não item de backlog
comum — em especial o RLS ausente e o plano Hobby da Vercel, porque decidem
se dá para vender pra sequer um cliente pagante nas condições atuais.

Fora isso, prioridades plausíveis, em ordem de risco/valor, mas **confirme
com o dono antes de assumir**:

1. Itens do plano SaaS que o dono decidir priorizar (playbook de segurança
   multi-tenant primeiro, por pedido explícito dele em 31/07).
2. Tela de Compras (E3) — schema e RBAC já existem, falta só UI.
3. Copiloto de IA — leva 2 (5 ferramentas restantes) + RBAC por obra, se o
   uso real justificar.
4. Qualquer item da lista de pendências conscientes (seção 3.3).
5. Itens que o dono trouxer em conversa — este projeto historicamente anda
   mais por pedido direto dele do que por backlog pré-definido.

---

## 5. Comandos úteis

O ambiente de desenvolvimento **varia por máquina** (confirmado presente e
ausente em duas máquinas Windows diferentes do dono no mesmo dia) —
**não assuma**, verifique no seu processo atual. Ver `docs/AGENTES.md` §2
para o comando de diagnóstico e a tabela de o que roda/não roda quando
Smart App Control está ativo.

```bash
npx tsc --noEmit         # sempre roda
npm run lint              # sempre roda
npm install                # roda ou não, dependendo da máquina — ver AGENTES.md
npm test                   # vitest
npm run build
npm run db:generate       # NÃO rode manualmente — CI (drizzle-migrations.yml) gera e commita
npm run db:migrate        # NÃO rode manualmente — CI (db-migrate.yml) aplica no Neon
npm run db:seed
npm run db:studio
```

Estado do ambiente sem depender de log:
`GET https://vita-construcoes.vercel.app/api/health` — responde se o banco
conecta, se as migrations foram aplicadas e se o seed rodou.

---

## 6. Convenções de commit e branch

- **Uma única branch**: `claude/github-repo-access-ms553a`. Não crie outra
  sem o dono pedir — push nela vai direto para produção.
- Commits em português, formato `tipo(escopo): resumo`, corpo explicando o
  **porquê**.
- **Sempre validar** `tsc` + `lint` + `test` + `build` antes de fechar uma
  fase — confira o resultado do CI antes de considerar algo concluído.
- Nunca commitar `.env`, `.env.local`, ou qualquer segredo real.
- Ver `docs/AGENTES.md` §6 e §7 para o checklist completo antes de entregar
  e o fluxo de mudança de schema.

---

## 7. Perguntas em aberto para o dono (se chegar a esse ponto)

- SaaS: qual dos quatro achados críticos (RLS, Vercel Hobby, bytea no
  Neon, camada comercial ausente) o dono quer atacar primeiro? O plano
  em `docs/skill-erp-vita/saas/` recomenda segurança multi-tenant antes de
  cadastro self-service, mas quem decide a ordem é ele.
- Compras (E3): vale investir em tela agora, ou o fluxo de solicitação/
  ordem de compra continua informal?
- Copiloto de IA leva 2: quais das 5 ferramentas restantes têm mais valor
  no uso real de hoje?
- `gestor_obra` sem `cashflow:read` — intencional ou pendência a corrigir?
- Piso de margem / prazos de capital parado no painel de capacidade de
  investimento: valores fixos hoje, o dono quer poder ajustar?
- Provider de storage: continua tudo em Postgres (`document_blobs`), ou em
  algum volume isso passa a valer a pena migrar para R2/S3?
- Exportação Excel/PDF real: vale a pena investir numa lib, ou CSV +
  impressão do navegador resolve?

---

## 8. Resumo de uma frase

**O roadmap principal está fechado**: fundação, RBAC com acesso por obra
(F1), núcleo operacional completo (obras → despesas com duplo status e
rateio, incluindo lote como custo pré-obra → contas a pagar → pagamentos),
vendas e recebíveis, orçamento e avanço físico, BI com alertas e IA
estruturada (explicador, resumo executivo, copiloto leva 1), contratos,
estoque, repasse CEF, DRE gerencial, exportação CSV/impressão, conciliação
bancária e documentos anexados — tudo em produção com CI verde, depois de
uma auditoria de segurança OWASP completa; falta principalmente a tela de
Compras (E3), a leva 2 do copiloto, a execução do plano de transformação em
SaaS (hoje só documento, com quatro achados críticos de segurança/infra/
negócio pendentes de decisão), e os itens de decisão do dono na seção 7 —
sempre passando por `requireSession()`/`requirePermission()` para a
organização e o escopo de obra da sessão, nunca usando float para dinheiro,
e sempre no único repositório/branch real (seção no topo deste documento).
