# Auditoria técnica — CRM Lembretes Vita

**Data:** 13/08/2026  
**Commit auditado:** `7ef810b` (`crm/reminders-tests-and-pixel-scope`)  
**Escopo:** somente o CRM de Lembretes (`lembretes.salvitarn.com.br`). A loja Premium foi inspecionada apenas quando compartilha autenticação, middleware ou infraestrutura com o CRM.  
**Método:** leitura dos fluxos frontend/backend, validação de autorização, integridade financeira, migrações, automações, e-mail, dependências e builds. Nenhum código de produção foi alterado durante a auditoria.

## Resumo executivo

O CRM compila e a suíte atual passa, mas há riscos importantes que os 49 testes existentes não cobrem. As prioridades máximas são: remover a credencial administrativa padrão ressuscitável, tornar o rate limit compatível com batching do tRPC, fechar a falsificação de IP, recalcular comissões no servidor e corrigir IDORs do E-mail Marketing.

| Severidade | Quantidade | Tema principal |
|---|---:|---|
| Crítica | 2 | tomada de conta administrativa / força bruta sem proteção efetiva |
| Alta | 8 | IP spoofing, dinheiro, IDOR, disparos, migração e integridade |
| Média | 10 | prompt injection, HTML, sessões, cache, webhooks e resiliência |
| Baixa / melhoria | 5 | bundle, CSV, tipagem de RBAC e manutenção |

## P0 — corrigir antes de novas funcionalidades

### C1. Conta administrativa padrão pode ser recriada com senha pública

**Evidência:** `server/db/migrate.ts:7-16` cria `tarcyo.alves@gmail.com` com senha literal `admin123`, `must_change_password=false`. `ensureTablesExist()` chama esse seed em todo cold start (`server/db/migrate.ts:23-25`) se não existir nenhuma linha com papel `admin`.

**Impacto:** se a conta administrativa for removida ou perdida, o próximo cold start pode reabrir acesso total com uma credencial conhecida no repositório. `sellers.delete` também pode apagar a linha correspondente em `users` (`server/routers/sellers.ts:74-82`).

**Correção:** retirar o seed automático do runtime de produção. Bootstrap deve ser explícito, usar segredo aleatório fornecido por ambiente e sempre criar a conta com troca obrigatória de senha. Impedir que a última conta admin seja excluída.

### C2. Rate limits por rota são contornáveis pelo batching do tRPC

**Evidência:** os limiters são montados em caminhos exatos como `/api/trpc/auth.login` e `/api/trpc/auth.emergencyReset` (`api/index.ts:965-966`), enquanto o cliente usa `httpBatchLink` (`client/src/main.tsx:77-89`). Uma requisição em lote usa caminho com procedimentos separados por vírgula e não casa com o middleware específico.

**Impacto:** login, recuperação administrativa, chat e outros endpoints considerados limitados podem receber lotes de tentativas. O contador local de `emergencyReset` não compensa: é um `Map` por instância serverless (`server/routers/auth.ts:18,113-138`).

**Correção:** aplicar proteção na base `/api/trpc`, interpretar todos os procedimentos do lote e limitar cada operação sensível. Definir limite de tamanho do lote ou migrar operações sensíveis para um link sem batching. Para autenticação, usar armazenamento de rate limit compartilhado e chave confiável por conta + IP.

## P1 — segurança e integridade de negócio

### A1. Restrição de IP pode confiar em `X-Forwarded-For` controlável

**Evidência:** Express usa `app.set('trust proxy', 1)` (`api/index.ts:163-166`) e a autorização lê `req.ip` (`server/trpc.ts:21-23,68-70`). Em cadeia de proxies, a posição aceita pode ser influenciada por um header enviado pelo cliente. Além disso, uma linha legada com restrição ativa e lista vazia passa pelo ramo liberado (`server/trpc.ts:68`).

**Impacto:** uma conta com restrição de rede pode ser acessada fora do IP permitido.

**Correção:** derivar o IP apenas de header confiável da plataforma, validando a cadeia de proxies; usar fail-closed quando a restrição estiver ativa e a lista estiver vazia; adicionar testes de headers simples e encadeados.

### A2. Comissão é aceita do navegador e persistida sem recálculo

**Evidência:** `server/routers/faturamento.ts:22-52` aceita quantidades, valores e percentuais como `z.number()` sem limites; `upsertPedido` persiste `comissaoPct` e `comissaoFixaPct` fornecidos pelo cliente (`server/routers/faturamento.ts:132-186`). A regra de comissão só é calculada no frontend.

**Impacto:** atendente autenticado pode alterar payload e registrar percentual negativo, enorme ou infinito. O valor alimenta os painéis administrativos e pode distorcer pagamento de comissão.

**Correção:** o servidor deve carregar produto e comissão do banco e ignorar percentuais enviados pelo cliente. Validar números com `.finite()`, faixas de negócio e quantidades inteiras/positivas. Adicionar testes de adulteração.

### A3. Aprovação financeira não é invalidada após edição

**Evidência:** edição de pedido aprovado preserva `aprovadoEm`/`aprovadoPor`; `aprovarPedido` permite staff e não impede manager de aprovar o próprio pedido; pedidos de manager não entram na fila baseada em `createdByRole='user'`; `removePedido` não bloqueia exclusão de faturado (`server/routers/faturamento.ts:132-248`).

**Impacto:** um pedido pode ser aprovado com um valor e alterado depois, ou desaparecer após faturamento.

**Correção:** qualquer mudança financeira deve limpar aprovação; aprovação exige usuário diferente do criador e papel autorizado; bloquear edição/exclusão de faturado ou criar estorno auditável.

### A4. IDOR em métricas e inscrições do E-mail Marketing

**Evidência:** `engagementByTaskIds` e `enrollmentsByTaskIds` aceitam IDs arbitrários sem `ctx` nem `userTaskFilter` (`server/routers/emailMarketing.ts:1541-1626`). `enrollTasksInSequence` também busca tarefas apenas com `inArray` (`server/routers/emailMarketing.ts:971-1007`).

**Impacto:** atendente autenticado pode enumerar dados de campanhas e engajamento de tarefas alheias; se tiver E-mail Marketing habilitado, pode inscrever leads de outro atendente em uma sequência.

**Correção:** calcular primeiro os IDs visíveis com `userTaskFilter` para todo não-admin e usar somente a interseção. Repetir o controle nas mutations que cancelam/removem inscrições vinculadas a tarefas.

### A5. Disparo rápido aceita destinatários arbitrários

**Evidência:** `attendantBroadcast` recebe até 50 endereços fornecidos pelo chamador (`server/routers/emailMarketing.ts:573-630`). Verifica supressão, mas não comprova que os destinatários pertencem às tarefas do atendente, não exige `emailConfirmed`, não aplica o mesmo frequency cap das audiências e não possui rate limit distribuído.

**Impacto:** uso do domínio corporativo para envio não autorizado, spam e incidente de LGPD/reputação.

**Correção:** receber IDs internos em vez de e-mails livres; resolver e validar destinatários no servidor, com ownership, consentimento/confirmação, suppression, limite de frequência e auditoria.

### A6. Exclusão e renomeação de atendentes quebram vínculos

**Evidência:** renomear atualiza `sellers.name` e `tasks.assignedTo`, mas não `users.name` nem snapshots de faturamento. Excluir remove `users` e zera `tasks.assignedTo`, mas deixa `tasks.userId`, pedidos, comissões e sessões órfãos (`server/routers/sellers.ts:74-147`). O schema não declara foreign keys.

**Impacto:** tarefas podem ficar invisíveis, pedidos continuam somando sem responsável e integrações por nome passam a divergir.

**Correção:** usar `userId/sellerId` como identidade, tratar nome como apresentação, preferir desativação a exclusão física e definir política explícita de reassociação/anonimização. Adicionar constraints e índices gradualmente após saneamento dos dados.

### A7. Migração pode deixar banco novo incompatível com o schema

**Evidência verificada:** `schema.ts` declara `tasks.reminder_enabled` e `work_sessions.updated_at`, mas a migração não garante ambas; o bloco histórico de tags pode consultar `tasks.tags` antes do `ALTER` que cria a coluna. Erros de inicialização são capturados e apenas registrados em `api/index.ts:173-177`.

**Impacto:** banco novo/restaurado pode subir a aplicação e falhar apenas quando listar tarefas ou iniciar sessão. A migração incompleta pode repetir em cold starts.

**Correção:** reordenar DDL, incluir todas as colunas do schema, elevar `SCHEMA_VERSION` e tornar falha de migração bloqueante para endpoints dependentes. Criar teste de banco vazio em CI.

### A8. Dependências de produção têm advisories abertos

`npm audit --omit=dev` encontrou **15** advisories: 1 critical, 6 high e 8 moderate. Diretas relevantes: `drizzle-orm@0.33.0`, `dompurify@3.4.11`, `express@4.22.1`, `express-rate-limit@8.4.1` e `postcss@8.5.9`. O `tar` crítico chega por `@capacitor/cli`, atualmente listado em `dependencies` embora seja ferramenta de build.

**Correção:** atualizar em PR isolado com suíte/build; mover CLIs para `devDependencies`; remover `react-router-dom`, que não é usado e contraria a arquitetura Wouter. Não aplicar `npm audit fix --force` sem revisar migrações de Drizzle/tRPC.

## P2 — robustez e defesa em profundidade

### M1. Base compartilhada permite prompt injection persistente

`knowledge.list` e `knowledge.create` são `protectedProcedure`; qualquer atendente pode escrever conteúdo consumido por `search_knowledge` da IA administrativa (`server/routers/knowledge.ts:7-29`, `server/routers/ai.ts:540-568`). Marcar texto como “dados, não instruções” ajuda, mas não cria uma fronteira de confiança.

**Correção:** escrita/edição só por admin ou fluxo de aprovação; registrar autor e status; separar documentos administrativos dos documentos visíveis a atendentes; nunca executar ações irreversíveis com base apenas em texto recuperado.

### M2. Sanitização e interpolação de HTML são frágeis

`sanitizeCampaignHtml` usa regex (`server/email/marketing.ts:753-759`) apesar de o projeto já depender de `sanitize-html`. `renderTemplate` substitui `{nome}` e `{empresa}` sem escape (`server/email/marketing.ts:761-766`). Outros e-mails interpolam nome de usuário/cliente diretamente.

**Impacto:** HTML controlado por usuário pode alterar conteúdo visual do e-mail e criar links enganosos; clientes de e-mail costumam bloquear scripts, mas isso não elimina phishing ou HTML malformado.

**Correção:** allowlist com `sanitize-html`, escape por contexto para variáveis de texto e sanitização depois da interpolação. Usar URLs apenas após validação de protocolo.

### M3. Sessão ativa atravessando meia-noite desaparece do painel

`allActiveToday` filtra `startedAt >= todayStart` (`server/routers/workSessions.ts:121-149`). Uma sessão iniciada ontem e ainda ativa/pausada deixa de aparecer após 00:00.

**Correção:** incluir toda sessão ativa/pausada independentemente do início e calcular somente a interseção com o dia atual quando o objetivo for “horas de hoje”.

### M4. Purga de sessões usa status que o router não grava

A migração apaga `status='completed'`, enquanto o router encerra como `ended`. O histórico cresce sem a retenção esperada. A purga de chat usa `CURRENT_DATE` do banco, que pode não representar a virada de Brasília.

**Correção:** alinhar enum/status e usar fronteira temporal explícita de São Paulo.

### M5. Webhook Resend está registrado duas vezes

A primeira rota está em `api/index.ts:291`; outra, com limiter e processamento adicional, em `api/index.ts:494`. Express responde pela primeira, tornando a segunda efetivamente inacessível.

**Impacto:** rate limit e parte do processamento de engajamento não são aplicados como esperado.

**Correção:** manter um único handler, com raw body, assinatura, replay protection, limiter e todos os efeitos.

### M6. Comparação e proteção de emergência são inconsistentes

`emergencyReset` usa `input.secret !== envSecret` (`server/routers/auth.ts:113-138`) e contador em memória por IP. O mesmo `ADMIN_RESET_SECRET` também protege `/api/db-stats`.

**Correção:** comparação time-safe, segredo exclusivo para cada finalidade, rate limit distribuído e trilha de auditoria. Idealmente substituir o reset mestre por fluxo de recuperação operacional com credencial de curta duração.

### M7. Dummy hash não equaliza tempo de login

`DUMMY_HASH` usa o formato legado de 10 mil iterações, enquanto hashes atuais usam 310 mil (`server/auth.ts:9-16,64-69`). Conta inexistente responde muito mais rápido que conta existente.

**Correção:** gerar dummy no mesmo formato/custo atual e adicionar teste estatístico tolerante.

### M8. Cache de autorização pode manter papel/IP antigo por instância

`server/lib/cache.ts` usa `Map` local e `createContext` cacheia usuário por 30s. Algumas mutações de papel não invalidam todas as chaves relevantes.

**Correção:** invalidar em toda mudança de papel, senha, status e restrição de IP; para decisões críticas, reduzir cache ou adotar versão de sessão/revogação persistida.

### M9. `attendantBroadcast`/automação e criação em lote podem gerar carga longa

`tasks.bulkCreate` aceita até 2.000 itens e depois chama automação sequencialmente para cada e-mail (`server/routers/tasks.ts:153-217`). Em função serverless, isso pode exceder tempo e deixar importação parcialmente automatizada.

**Correção:** inserir em lote e enfileirar efeitos em outbox; limitar trabalho síncrono; responder com job/import ID.

### M10. Aprovação/remoção de associações do E-mail Marketing precisa de ownership completo

A tela chama `cancelEnrollment` e `removeCampaignRecipient` a partir de IDs retornados (`client/src/pages/Tasks.tsx:849-883`). A leitura já tem IDOR; mutations `staffProcedure` permitem managers, mas não necessariamente validam que a associação pertence a uma tarefa visível.

**Correção:** conferir ownership na mutation, não confiar no fato de o ID ter vindo da UI.

## P3 — desempenho e manutenção

### B1. Bundle inicial único e grande

O build gera um JS de **2.043,59 kB** minificado (**531,17 kB gzip**). `App.tsx` importa todas as páginas estaticamente e não usa `React.lazy`/`Suspense`.

**Melhoria:** lazy-load por rota, principalmente `EmailMarketing`, faturamento, dashboards com gráficos/PDF e páginas Premium. Separar os dois produtos em chunks distintos reduz carga e superfície acidental do CRM.

### B2. Parser CSV não respeita CSV real

`Tasks.tsx` usa `line.split(sep)` e `readAsText(..., 'UTF-8')` (`client/src/pages/Tasks.tsx:969-1106`). Campos entre aspas com `;`/quebra de linha, BOM e arquivos Windows-1252 podem ser interpretados incorretamente.

**Melhoria:** parser CSV maduro ou parser pequeno com aspas/escape; detectar BOM/encoding; validar e mostrar erros por linha antes do `bulkCreate`.

### B3. RBAC manual em routers Premium/B2B é frágil

Os procedimentos sensíveis revisados fazem `role === 'admin'`, mas vários são declarados `protectedProcedure` e dependem de checagem manual. Isso não é exposição atual, mas uma procedure nova pode esquecer o guard.

**Melhoria:** usar `adminProcedure`/`staffProcedure` como garantia estrutural.

### B4. Dependências e configuração antigas/ociosas

`react-router-dom` não é usado; `@capacitor/cli` está em produção; React 19 RC e tipos React 18 coexistem; há warning de módulo em `postcss.config.js`.

**Melhoria:** remover dependência morta, alinhar versões e mover ferramentas para desenvolvimento em PR próprio.

### B5. Cobertura não alcança os riscos principais

A suíte possui 49 testes em 2 arquivos e cobre lembretes/hosts, mas não auth, RBAC, faturamento, migrações, importação, E-mail Marketing ou webhooks.

**Melhoria:** primeiro criar testes de autorização e invariantes financeiros; depois migração em banco vazio e integração de e-mail/webhook.

## Alegações antigas já corrigidas ou reclassificadas

- **CallHistory / results router:** já removidos; rota não existe no `App.tsx` atual.
- **`premiumEmailMarketing` público:** já corrigido; procedures administrativas usam staff no HEAD.
- **Bypass direto das ferramentas de IA:** não reproduzido como alegado. Admin recebe `TOOLS`; atendente recebe `ATTENDANT_TOOLS`, e o `callerUserId` vem do servidor. O problema real é a base compartilhada gravável e o risco de prompt injection.
- **Meta Pixel no CRM:** já corrigido e coberto por teste de host.
- **Lembrete duplicado:** já corrigido.
- **Testes desligados:** já corrigido; Vitest está ativo no projeto/CI.
- **`NaN` aceito por Zod:** falso para `z.number()`; porém `Infinity`, negativos e valores fora de faixa continuam exigindo `.finite()` e limites.

## Plano recomendado de execução

### Lote 1 — acesso e fronteiras (P0)

1. Remover seed de admin padrão e proteger a última conta admin.
2. Corrigir rate limit/batching e adicionar testes HTTP contra URL em lote.
3. Corrigir obtenção de IP e fail-closed da restrição.
4. Rotacionar `ADMIN_RESET_SECRET` após separar usos.

### Lote 2 — dinheiro e dados entre usuários

1. Recalcular comissão server-side.
2. Invalidar aprovação em edição e bloquear exclusão de faturado.
3. Aplicar ownership aos três endpoints de E-mail Marketing e às mutations relacionadas.
4. Restringir `attendantBroadcast` a destinatários internos confirmados.

### Lote 3 — integridade e migração

1. Corrigir DDL/ordem/colunas e testar banco vazio.
2. Transformar exclusão de atendente em desativação/reassign.
3. Corrigir sessão noturna e retenção.
4. Unificar webhook Resend.

### Lote 4 — conteúdo, dependências e desempenho

1. Admin-only/aprovação na base de conhecimento.
2. Sanitização HTML por allowlist e escape pós-template.
3. Atualizar dependências em etapas.
4. Lazy loading por rota e parser CSV robusto.

## Validação realizada

- `npm test`: **49/49 testes passaram**.
- `npm run check`: **zero erros TypeScript**.
- `npm run build:client`: passou; warning de chunk único de 2,04 MB.
- `npm run build:api`: passou; bundle de 7,5 MB.
- `npm audit --omit=dev`: 15 advisories (1 critical, 6 high, 8 moderate).
- `git status --short`: limpo antes da criação deste relatório.

## Critério de encerramento da auditoria

A auditoria é estática e não acessou dados reais nem executou exploração contra produção. Achados que dependem de configuração da Vercel, cadeia real de proxies ou conteúdo atual do banco devem ser confirmados em ambiente de preview com contas de teste. As correções P0/P1 devem receber testes de regressão antes de merge.
