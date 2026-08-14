# Plano de correções — CRM Lembretes

**Este arquivo é o handoff entre agentes.** Se você é um agente começando agora, leia
`ESTADO-DO-PROJETO.md` primeiro (regras invioláveis) e depois este arquivo.

**Origem dos itens:** `RELATORIO-AUDITORIA-CRM-2026-08-13.md` (auditoria de 13/08/2026,
commit `7ef810b`). O relatório tem a evidência completa; aqui fica só o estado de execução.

**Última atualização:** 14/08/2026 · **Branch de trabalho:** `crm/reminders-tests-and-pixel-scope` (PR #15)

---

## Como usar este arquivo

1. Escolha um item **não iniciado** do lote de menor número que ainda tiver pendência.
2. Troque o marcador para 🔄 **no início do trabalho**, com seu identificador e a data, e
   comite só essa linha. Isso evita dois agentes na mesma correção.
3. Ao terminar, marque ✅ no **mesmo commit da correção**, com o hash do commit anterior se
   houver, e escreva em uma linha como verificou.
4. Se descobrir que o item está errado ou não se aplica, marque ❌ e explique. Não apague.

Marcadores: ⬜ não iniciado · 🔄 em andamento · ✅ feito e verificado · ❌ descartado
(com justificativa) · ⛔ bloqueado (depende de algo fora do código)

**Regra que não pode ser quebrada aqui:** nenhum item é marcado ✅ sem `npm run check`,
`npm test` e o build passando. Correção de segurança precisa de teste que falhe antes e
passe depois.

---

## Lote 1 — acesso e fronteiras (P0)

Estes dois são os únicos que permitem tomada de conta. Fazer antes de qualquer feature.

| | Item | Onde | Estado |
|---|---|---|---|
| 1.1 | Remover seed de admin com senha `admin123` do runtime; exigir segredo por env e manter `must_change_password = true` | `server/db/migrate.ts:7-25` | ⬜ |
| 1.2 | Impedir exclusão da última conta admin | `server/routers/sellers.ts:74-87` | ⬜ |
| 1.3 | Rate limit que funcione com `httpBatchLink`: aplicar na base `/api/trpc`, ler todos os procedimentos do lote, limitar tamanho do lote | `api/index.ts:965-966`, `client/src/main.tsx:77-89` | ⬜ |
| 1.4 | Rate limit de auth em armazenamento compartilhado (o `Map` por instância não vale em serverless) | `server/routers/auth.ts:18,113-138` | ⬜ |
| 1.5 | IP: derivar de header confiável da plataforma e fail-closed quando restrição ativa com lista vazia | `server/trpc.ts:21-23,68-70` | ⬜ |
| 1.6 | Separar segredos: `ADMIN_RESET_SECRET` não deve servir também `/api/db-stats`; comparação time-safe | `server/routers/auth.ts:125`, `api/index.ts:312` | ⬜ |

**Depende do dono (fora do código):** rotacionar `ADMIN_RESET_SECRET` depois de 1.6, e
trocar a senha da conta admin atual se `admin123` já foi usada em produção.

## Lote 2 — dinheiro e dados entre usuários (P1)

| | Item | Onde | Estado |
|---|---|---|---|
| 2.1 | Recalcular `comissaoPct` e `comissaoFixaPct` no servidor a partir de `fat_commissions`/`fat_products`, ignorando o payload | `server/routers/faturamento.ts:132-186` | ⬜ |
| 2.2 | `.finite()` + faixa em todo percentual/valor/quantidade | `server/routers/faturamento.ts:22-52` | ⬜ |
| 2.3 | Editar pedido aprovado limpa a aprovação | `server/routers/faturamento.ts:162-186` | ⬜ |
| 2.4 | Aprovação exige aprovador ≠ criador; pedido de manager entra na fila | `server/routers/faturamento.ts:234-248` | ⬜ |
| 2.5 | Bloquear exclusão de pedido faturado (ou criar estorno auditável) | `server/routers/faturamento.ts:192` | ⬜ |
| 2.6 | `userTaskFilter` em `engagementByTaskIds` e `enrollmentsByTaskIds` | `server/routers/emailMarketing.ts:1541-1626` | ⬜ |
| 2.7 | Ownership em `enrollTasksInSequence` | `server/routers/emailMarketing.ts:971-1007` | ⬜ |
| 2.8 | `attendantBroadcast` deve receber IDs internos, não e-mails livres; exigir `emailConfirmed`, frequency cap e auditoria | `server/routers/emailMarketing.ts:573-630` | ⬜ |
| 2.9 | Ownership nas mutations `cancelEnrollment` / `removeCampaignRecipient` | `server/routers/emailMarketing.ts` | ⬜ |

## Lote 3 — integridade, migração e revogação

| | Item | Onde | Estado |
|---|---|---|---|
| 3.1 | `invalidateUserCache` em `updateRole` e `delete` | `server/routers/sellers.ts:137-147`, `:74-87` | ⬜ |
| 3.2 | Migração: garantir `tasks.reminder_enabled` e `work_sessions.updated_at`; corrigir ordem do bloco de tags; subir `SCHEMA_VERSION` | `server/db/migrate.ts` | ⬜ |
| 3.3 | Falha de migração não pode ser silenciosa | `api/index.ts:173-177` | ⬜ |
| 3.4 | Exclusão de atendente → desativação/reassign, sem deixar órfãos | `server/routers/sellers.ts:74-87` | ⬜ |
| 3.5 | Sessão ativa que atravessa a meia-noite deve continuar aparecendo | `server/routers/workSessions.ts:121-149` | ⬜ |
| 3.6 | Purga usa `status='completed'`, router grava `ended` — alinhar | `server/db/migrate.ts:40,770` | ⬜ |
| 3.7 | Remover registro duplicado de `/api/resend-webhook` | `api/index.ts:291` e `:494` | ⬜ |
| 3.8 | Confirmar `maxDuration` efetivo (chave aponta `api/index.ts`, rotas servem `api/bundle.js`) | `vercel.json:5-6,86,91,105` | ⬜ |
| 3.9 | Tirar automações do `bulkCreate` do caminho síncrono + fragmentar no cliente | `server/routers/tasks.ts:200-215`, `client/src/pages/Tasks.tsx:1114` | ⬜ |

## Lote 4 — conteúdo, dependências, desempenho e qualidade

| | Item | Onde | Estado |
|---|---|---|---|
| 4.1 | Base de conhecimento gravável só por admin ou com aprovação (prompt injection na IA do admin) | `server/routers/knowledge.ts:7-29`, `server/routers/ai.ts:540-568` | ⬜ |
| 4.2 | Sanitização HTML por allowlist com `sanitize-html` em vez de regex | `server/email/marketing.ts:753-759` | ⬜ |
| 4.3 | Escape por contexto nas variáveis de template, **depois** da interpolação | `server/email/marketing.ts:761-766` | ⬜ |
| 4.4 | Escapar nome de usuário/cliente nos e-mails de pedido e de recuperação | `server/routers/faturamento.ts:307`, `server/routers/auth.ts:171` | ⬜ |
| 4.5 | Atualizar dependências com advisory (15: 1 critical, 6 high) em PR isolado | `package.json` | ⬜ |
| 4.6 | Mover `@capacitor/*` para `devDependencies` e remover `react-router-dom` (não usado, contraria a regra do wouter) | `package.json` | ⬜ |
| 4.7 | Importação CSV: aceitar vírgula, descartar cabeçalho, respeitar aspas, detectar encoding | `client/src/pages/Tasks.tsx:978,1072,1080,1106` | ⬜ |
| 4.8 | Unificar fuso cliente/servidor (cliente usa meia-noite do aparelho) | `client/src/pages/AttendantProgress.tsx:68`, `client/src/pages/Tasks.tsx:378` | ⬜ |
| 4.9 | `TRPCError` em vez de `throw new Error` (erros de validação saem como 500) | `server/routers/sellers.ts:44,107,121,144`, `server/routers/auth.ts:73,75,89,90,103`, `server/routers/ai.ts:933` | ⬜ |
| 4.10 | Atomicidade em operações multi-tabela (driver `neon-http` não tem transação) | `server/db/index.ts`, `server/routers/sellers.ts:79-84` | ⬜ |
| 4.11 | Extrair `SidebarContent` de dentro de `AppShell` (remonta a subárvore a cada render) | `client/src/components/AppShell.tsx:302,159` | ⬜ |
| 4.12 | Lazy loading por rota (chunk único de 2,04 MB / 531 kB gzip) | `client/src/App.tsx` | ⬜ |
| 4.13 | Acessibilidade: associar `<label htmlFor>`, nomear botões de ícone, teclado em clicáveis | páginas do CRM | ⬜ |
| 4.14 | Índices declarados em `schema.ts`, não só em `migrate.ts` (`db:push` local cria banco sem índice) | `server/db/schema.ts` | ⬜ |
| 4.15 | Corrigir `CLAUDE.md:39`: JWT é de 7 dias, não 30 | `CLAUDE.md` | ⬜ |

## Lote 5 — cobertura de teste

A suíte atual (49 testes, 2 arquivos) cobre lembretes e hosts. Nenhum defeito confirmado
na auditoria tem teste. Ordem sugerida, do maior risco para o menor:

| | Item | Estado |
|---|---|---|
| 5.1 | Autorização: cada procedure sensível nega atendente comum e nega dados de outro usuário | ⬜ |
| 5.2 | Invariantes financeiros: comissão não vem do payload, aprovação cai na edição, faturado não some | ⬜ |
| 5.3 | Rate limit: tentativa em lote não escapa do limite | ⬜ |
| 5.4 | Migração em banco vazio sobe o schema completo | ⬜ |
| 5.5 | Importação CSV: vírgula, aspas, cabeçalho, Windows-1252 | ⬜ |
| 5.6 | Fuso: fronteira do dia igual no cliente e no servidor | ⬜ |

**Como isolar o banco ainda não está decidido** (banco de teste dedicado vs mock do
Drizzle). Essa decisão é pré-requisito de 5.1, 5.2 e 5.4 — resolva e registre aqui.

---

## Estado verificado no HEAD (14/08/2026)

- `npm run check` — zero erros TypeScript (é portão de deploy da Vercel)
- `npm test` — 49/49 passando
- `npm run build:client` — passa, com aviso de chunk de 2.043,59 kB (531,17 kB gzip)
- `npm run build:api` — passa, bundle de 7,5 MB
- `npm audit --omit=dev` — 15 advisories (1 critical, 6 high, 8 moderate)

## Já resolvido antes desta auditoria (não reabrir)

`CallHistory`/`results` router removidos · `premiumEmailMarketing` já é staff-only · Meta
Pixel restrito aos hosts da loja · lembrete duplicado · testes ligados e portão de PR ·
`remindersRouter` morto removido (a tabela `reminders` fica, é legado).

## Alegações de relatórios anteriores que são falsas (não gastar tempo)

- `z.number()` aceitar `NaN` — não aceita. O problema real é `Infinity` e negativo.
- Exportação CSV sem BOM — tem BOM (`client/src/pages/AdminDashboard.tsx:63`).
- XSS por `dangerouslySetInnerHTML` — as ocorrências passam por DOMPurify, com
  sanitização também no servidor.
- Procedures inexistentes chamadas pelo frontend — nenhuma.
- PWA cacheando resposta de API — `runtimeCaching` só cobre fontes; `/api/*` é `no-store`.
