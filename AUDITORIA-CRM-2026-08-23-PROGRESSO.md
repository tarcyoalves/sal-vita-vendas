# Auditoria independente do CRM — progresso e handoff

**Iniciada:** 23/08/2026  
**Código-base auditado:** `2915130679338189100c4e7fb6a7fbfb0798f0d0`  
**Base de produção no início:** `origin/main` em `cefe7333f0561e04daabb71fc45dfdeef0473e42`  
**Branch:** `crm/reminders-tests-and-pixel-scope` · PR #15  
**Issue-mãe:** [#21 — Auditoria independente completa do CRM](https://github.com/tarcyoalves/sal-vita-vendas/issues/21)  
**Estado:** 🔄 descoberta e mapeamento em andamento

> Este arquivo é o diário da auditoria e o handoff entre agentes. O relatório anterior
> (`RELATORIO-AUDITORIA-CRM-2026-08-13.md`) é apenas uma fonte de hipóteses: nenhum achado
> antigo será herdado sem nova verificação no código-base acima.

## Regra de evidência

Cada descoberta será marcada como:

- **CONFIRMADO:** caminho executável demonstrado por código, teste, query ou reprodução.
- **PROVÁVEL:** código sustenta o problema, mas depende de estado/serviço externo não disponível.
- **POSSÍVEL:** hipótese com pré-condição ainda não verificada; não será apresentada como vulnerabilidade.
- **DESCARTADO:** hipótese investigada e refutada, com a razão preservada.

Cada achado final terá prioridade (P0/P1/P2/P3/FEATURE), arquivo:linha, causa, impacto,
reprodução, solução, risco da solução e validação feita. Nenhuma correção grande será
implementada durante a descoberta.

## Escopo real do produto

O repositório contém **dois produtos**. Esta auditoria cobre somente o CRM de Lembretes
(`lembretes.salvitarn.com.br`) e os serviços compartilhados que podem afetá-lo. A loja
Premium só entra quando divide autenticação, banco, processo Express, webhook, segredo,
cache, cron, bundle ou infraestrutura com o CRM.

## Baseline e mudanças concorrentes

- [x] `git fetch --prune` executado.
- [x] Nenhuma branch remota de correção posterior ao PR #15 encontrada.
- [x] Nenhum outro worktree deste repositório encontrado.
- [x] Sessões paralelas consultadas: nenhuma sessão ativa trabalhando no CRM.
- [ ] Repetir `fetch`, lista de PRs e diff contra o baseline antes do relatório final.
- [ ] Se surgir código novo, auditar o diff ou registrar explicitamente que ficou fora do escopo.

## Cobertura das 29 fases

Marcadores: ⬜ não iniciado · 🔄 em andamento · ✅ auditado · ⛔ bloqueado · ➖ não existe.

| Fase | Domínio | Estado | Evidência/saída esperada |
|---:|---|:---:|---|
| 1 | Entender o sistema e fluxo de dados | 🔄 | mapa de componentes, serviços e fluxos |
| 2 | Todas as rotas/superfícies | 🔄 | páginas + tRPC + Express + webhooks + cron, com classe de acesso |
| 3 | Banco completo | 🔄 | tabela por tabela: PK/FK/unique/index/null/default/delete/timestamp |
| 4 | CRM/clientes/contatos | ⬜ | matriz CRUD/busca/filtro/import/export/ownership/concorrência |
| 5 | Lembretes | ⬜ | ciclo completo e estados reais |
| 6 | Timezone/data/hora | ⬜ | casos de borda e divergência cliente/servidor/banco |
| 7 | Recorrência | ⬜ | confirmar se existe; matriz de regras ou lacuna de produto |
| 8 | Notificações | ⬜ | caminho criação→agendamento→execução→entrega e falhas silenciosas |
| 9 | Concorrência | ⬜ | races, idempotência, locks, constraints e retry |
| 10 | Autenticação | ⬜ | login/logout/sessão/reset/cookie/token/revogação/brute force |
| 11 | Autorização/IDOR | ⬜ | procedure por procedure, entidade por entidade |
| 12 | Multi-tenancy | ⬜ | confirmar modelo real (empresa/organização/owner) e isolamento |
| 13 | Segurança | ⬜ | OWASP, secrets, CORS, CSRF, SSRF, XSS, uploads, logs |
| 14 | Privacidade técnica/LGPD | ⬜ | PII, retenção, exportação, exclusão, anonimização e acesso |
| 15 | Performance | ⬜ | queries, N+1, limites, polling, bundle, memória, escala |
| 16 | Offline/internet instável | ⬜ | retry, duplicação, feedback e perda de dados |
| 17 | UX | ⬜ | fluxos reais, feedback, destrutividade, vazios e eficiência |
| 18 | Mobile/tablet/desktop | ⬜ | layout e interação em viewports relevantes |
| 19 | Busca/filtros | ⬜ | campos, acentos, case, parcial, paginação e escala |
| 20 | Importação/exportação | ⬜ | malformed/encoding/tamanho/duplicidade/parcialidade |
| 21 | Jobs/cron/workers | ⬜ | idempotência, lock, retry, timeout e observabilidade |
| 22 | Observabilidade | ⬜ | capacidade de detectar falhas sem serviço pago novo |
| 23 | Testes reais | ⬜ | testes/typecheck/lint/build/API/DB/autorização/concorrência |
| 24 | Escalabilidade | ⬜ | 10/100/1k/10k/100k usuários/registros |
| 25 | Melhorias de produto | ⬜ | BUG vs MELHORIA vs FEATURE, sem misturar prioridades |
| 26 | Classificação | ⬜ | P0/P1/P2/P3/FEATURE, confiança e risco da solução |
| 27 | Mudança mínima | ✅ | auditoria primeiro; nenhum rewrite ou desativação de teste |
| 28 | Correções óbvias | ⬜ | só depois de documentar e apenas isoladas/baixo risco |
| 29 | Relatório final | ⬜ | `RELATORIO-AUDITORIA-CRM-2026-08-23.md` |

## Inventário inicial

- Frontend: React 19 RC + Vite + Wouter + TanStack Query/tRPC.
- Backend: Express em função Vercel, entrada de produção `api/index.ts`, bundle versionado
  `api/bundle.js`, tRPC e alguns endpoints Express diretos.
- Banco: PostgreSQL via Drizzle + Neon/Postgres; schema em `server/db/schema.ts`, criação e
  migrações imperativas em `server/db/migrate.ts` e módulos auxiliares.
- Autenticação: JWT em cookie HttpOnly; contexto e RBAC em `server/trpc.ts`.
- Superfícies registradas no appRouter: 16 namespaces no total; **12 namespaces diretamente
  CRM**, com **153 procedures** (7 públicas, 49 autenticadas, 75 staff, 22 admin): `auth`,
  `tasks`, `sellers`, `clients`, `ai`, `knowledge`, `workSessions`, `tv`, `emailMarketing`,
  `tags`, `faturamento`, `catalog`. Os outros 4 (`shipping`, `recovery`,
  `premiumEmailMarketing`, `b2b`) são Premium/loja, mas entram quando compartilham processo,
  segredo, banco ou infraestrutura.
- Entrada de produção: 14 registros Express diretamente relevantes ao CRM/infra (health,
  unsubscribe, webhook Resend duplicado, db-stats, limiters tRPC, adapter tRPC e cron diário);
  classificação detalhada em andamento.
- Páginas: 17 rotas Wouter CRM declaradas (`/tv` comentada/desativada) e 24 arquivos de
  página no repositório, ainda sendo classificados por produto/uso real.
- Banco: 44 tabelas no schema total; `schema.ts` declara 0 foreign keys, 0 índices e 8
  unicidades. A classificação CRM/compartilhada/Premium e a comparação com DDL continuam.
- Código de aplicação: ~55.682 linhas TS/TSX; maiores pontos de risco incluem
  `EmailMarketing.tsx` (5.759), `emailMarketing.ts` (2.544), `Tasks.tsx` (2.244),
  `api/index.ts` (1.496), `ai.ts` (1.406), `schema.ts` (777), `migrate.ts` (771).

## Mapa de arquitetura confirmado até aqui

### Caminho de uma operação CRM

`React` → `httpBatchLink('/api/trpc', credentials: include)` → rota Vercel
`/api/* → api/bundle.js` → Express/tRPC → `createContext` lê JWT do cookie → consulta usuário
(com cache de 30s) → procedure aplica `public/protected/staff/admin` e, quando necessário,
ownership no handler → Drizzle `neon-http` → PostgreSQL.

O frontend usa TanStack Query com `staleTime=60s`, sem refetch em foco/reconexão e com uma
repetição para queries. Mutações não têm retry automático global.

### Caminho real de um lembrete

`tasks.reminderDate` + `tasks.reminderEnabled` → `tasks.reminders` → hook
`useReminderNotifications` consulta a cada **5 minutos** apenas enquanto a aplicação está
aberta/visível → timer local reclassifica a cada **2 minutos** → toast + beep + Web
Notification. O dedupe fica em `sessionStorage` da aba/dispositivo.

Portanto, no baseline:

- ➖ não existe scheduler/worker/cron de lembrete no servidor;
- ➖ não existe Web Push remoto nem registro de push token;
- ➖ não existe SMS de lembrete;
- ➖ WhatsApp existe em fluxos da loja/recuperação, não no lembrete CRM;
- ➖ não existe modelo de recorrência/série/exceção de lembrete; a recorrência solicitada é
  uma lacuna de produto, não uma implementação escondida;
- ➖ não existe calendário dedicado; data/hora vive no formulário e nas listas;
- a tabela `reminders` é legado sem router/tela; lembrete ativo é campo de `tasks`.

As consequências de confiabilidade desse desenho serão classificadas depois da prova de
comportamento (aba fechada, polling, janela de disparo, dois dispositivos e timezone).

## Validações previstas

- [ ] `npm test`
- [ ] `npm run check`
- [ ] lint — confirmar se existe script/configuração; não alegar que rodou se não existir
- [ ] `npm run build:client`
- [ ] `npm run build:api`
- [ ] `npm audit --omit=dev`
- [ ] testes estáticos/executáveis de matriz de autorização
- [ ] testes de concorrência/idempotência possíveis sem tocar produção
- [ ] comparação schema Drizzle × DDL de migração
- [ ] inspeção do banco real **somente leitura**, se `DATABASE_URL` estiver disponível e
      for possível garantir que nenhuma query de escrita será emitida
- [ ] verificação no browser de páginas CRM, viewports e fluxos que não exigem credenciais

## Bloqueios conhecidos

- Fluxos autenticados no browser e testes de IDOR contra produção exigem credenciais de
  teste e autorização explícita para exercitar dados reais; até lá serão testados no
  nível de router/banco isolado ou classificados como PROVÁVEL/POSSÍVEL.
- Entrega efetiva de e-mail/push/WhatsApp e comportamento de provedores externos não será
  inventado: sem sandbox/credencial, a auditoria termina na fronteira observável.
- Não existe evidência inicial de organizações/tenants. Se o modelo for apenas owner/admin,
  a seção multi-tenancy registrará a ausência e os riscos, não presumirá `organization_id`.

## Diário

### 23/08/2026 — início

- Baseline Git e sessões concorrentes verificados.
- Inventário de alto nível iniciado; denominadores mecânicos fechados para tRPC, rotas Wouter
  e tabelas.
- Auditoria anterior declarada não autoritativa.
- Issue-mãe #21 criada.
- Seis revisores Opus 5 independentes iniciados em modo somente leitura: auth/autorização;
  banco/concorrência; CRM/lembretes; jobs/integrações; frontend/UX; testes/infra.
- Próximo passo: classificar cada procedure/endpoint/tabela e cruzar os seis relatórios;
  depois executar provas e uma verificação adversarial dos achados.

### 24/08/2026 — retomada após interrupção

- Um revisor criou indevidamente `RELATORIO-AUDITORIA-CRM-2026-08-23.md` e marcou esta
  auditoria como concluída. O arquivo é **rascunho não validado**: contém contagens erradas,
  severidades infladas (duplo clique classificado P0), cobertura declarada sem evidência e
  chama uma notificação local de "cron-driven". Não usar como relatório final.
- As revisões de banco/concorrência, jobs/integrações e testes/infra terminaram. Auth/RBAC e
  frontend/UX falharam por sobrecarga e foram relançados com Opus 5.
- Portões executados pela sessão principal: `npm test` 49/49; `npm run check` limpo;
  `npm run build:client` passa (chunk 2.043,59 kB / gzip 531,17 kB); `npm run build:api`
  passa (7,5 MB); lint não existe; `npm audit --omit=dev` confirma 15 advisories
  (1 critical, 6 high, 8 moderate).
- A auditoria continua em descoberta. Nenhum P0/P1 está aceito até cruzamento e verificação
  adversarial.
