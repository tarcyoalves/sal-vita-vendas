# Auditoria independente completa — CRM de Lembretes Sal Vita

**Data:** 24/08/2026  
**Produto auditado:** CRM de Lembretes (`lembretes.salvitarn.com.br`)  
**Repositório:** `tarcyoalves/sal-vita-vendas`  
**Código auditado:** `16031b90e42881332182bbe94a844eb2a70264ca`  
**Branch:** `crm/reminders-tests-and-pixel-scope`  
**Pull request:** [#15 — CRM: testes de lembrete com dentes + pixel restrito à loja](https://github.com/tarcyoalves/sal-vita-vendas/pull/15)  
**Produção no fechamento:** `origin/main` em `cefe7333f0561e04daabb71fc45dfdeef0473e42`  
**Natureza:** auditoria de código e provas locais; nenhuma correção funcional aplicada neste relatório

---

## 1. Veredito executivo

O relatório do Gemini de 13/08/2026 **não pode ser executado literalmente**. Ele contém achados importantes e ainda válidos, mas também contém alegações já corrigidas, uma vulnerabilidade central incorreta e diagnósticos parcialmente verdadeiros.

### O que é urgente de verdade

1. **P0 — bootstrap administrativo inseguro:** se o banco não tiver nenhuma conta `admin`, cada inicialização tenta criar `tarcyo.alves@gmail.com` com a senha pública `admin123` (`server/db/migrate.ts:7-25`).
2. **P0 — integridade financeira controlada pelo navegador:** comissão do pedido, comissão fixa dos itens, valores, status e snapshots entram pelo payload do cliente e são persistidos sem recálculo autoritativo; uma edição posterior também preserva a aprovação anterior (`server/routers/faturamento.ts:18-66,132-188`).
3. **P0 — webhook do Resend ativo escreve no banco/formato errados:** a primeira rota registrada intercepta todos os eventos, grava em `ordersDb`, mantém `email.opened` em vez de `opened` e não marca `hotLead`; a implementação correta posterior é inalcançável (`api/index.ts:291,486-560`; `server/routers/resendWebhook.ts`).
4. **P1 — força bruta/flooding contornam os limitadores:** o cliente usa batching tRPC, mas o Express monta limitadores em caminhos de procedure. Uma URL de batch com vírgula não casa com esses middlewares. A recuperação de senha nem sequer está registrada no limiter (`api/index.ts:908-978`).
5. **P1 — IDOR no E-mail Marketing:** três procedures autenticadas aceitam IDs de tarefas arbitrários sem aplicar `userTaskFilter` (`server/routers/emailMarketing.ts:971-1007,1541-1626`).
6. **P1 — migração pode deixar um banco novo incompleto:** a migração usa `tasks.tags` e `email_sequence_sends.retry_number` antes de criar essas colunas e não garante `tasks.reminder_enabled` nem `work_sessions.updated_at` (`server/db/migrate.ts:192-208,405-420,446-471,585-590`).
7. **P1 — exclusão destrutiva no faturamento:** o botão “Limpar dados” apaga produtos e todos os pedidos visíveis ao staff com um único `confirm()`, em chamadas independentes, sem transação ou restauração (`client/src/components/faturamento/ProductManager.tsx:124-129`).
8. **P1 — lembrete não é entregue com o app fechado:** não há scheduler de lembrete, Web Push ou canal de fallback. A entrega depende de polling em uma aba aberta e visível (`client/src/_core/hooks/useReminderNotifications.ts`; `client/src/lib/tasks/reminders.ts`).

### Estado dos portões no commit auditado

- `npm test`: **49/49 passaram** — somente 2 arquivos de teste.
- `npm run check`: **passou**, zero erros TypeScript.
- `npm run build:client`: **passou**, com chunk principal de **2.043,59 kB** (gzip **531,17 kB**) e avisos.
- `npm run build:api`: **passou**, bundle de **7,5 MB**.
- `npm audit --omit=dev`: **15 advisories** — 1 crítico, 6 altos e 8 moderados.
- PR #15: checks Typecheck e Vercel verdes no fechamento.

Esses portões provam que o código compila e que a lógica extraída de lembretes/isolamento do HTML por host não regrediu. **Eles não exercitam autenticação, RBAC, IDOR, faturamento, migração, recuperação de senha, e-mail marketing ou concorrência.**

---

## 2. Escopo, método e regra de evidência

### 2.1 Escopo

A auditoria cobre somente o CRM de Lembretes e infraestrutura compartilhada capaz de afetá-lo:

- React/Wouter, páginas e stores do CRM;
- tRPC, Express, autenticação e autorização;
- tarefas, lembretes, atendentes, sessões, IA, documentos, e-mail marketing e faturamento;
- schema Drizzle, criação/migração imperativa e retenção;
- webhooks, jobs e limites serverless;
- build, dependências e cobertura de testes.

A loja Premium só foi considerada quando compartilha processo Express, webhook, segredo, bundle ou dependência. Falhas exclusivas de checkout, frete, Mercado Pago e WhatsApp da loja não entram neste relatório.

### 2.2 Método

- inventário mecânico de rotas, procedures, páginas e tabelas;
- revisão paralela por domínio e revisão adversarial posterior;
- leitura do caminho executável, sem herdar conclusão de relatório antigo;
- provas locais não destrutivas para batching/roteamento;
- comparação do schema Drizzle com `ensureTablesExist()`;
- execução dos portões de teste, tipo e build;
- nenhuma chamada autenticada à produção e nenhuma escrita no banco real.

### 2.3 Estados usados

- **CONFIRMADO:** caminho executável demonstrado no código ou por prova local.
- **PARCIAL:** parte da alegação é verdadeira, mas causa/impacto foi exagerado ou há mitigação.
- **JÁ CORRIGIDO:** existiu ou foi descrito, mas não está presente no commit auditado.
- **REFUTADO:** o código atual contradiz a alegação.
- **FEATURE:** capacidade solicitada não existe; não é regressão de uma implementação existente.

### 2.4 Limitações

- não foram usados dados ou credenciais reais;
- entrega efetiva por Resend/Brevo não foi disparada;
- não houve teste destrutivo de exclusão, comissão ou reset em produção;
- não foi inspecionado o conteúdo real do banco Neon; drift já presente em produção continua **não verificado**;
- mobile/PWA autenticado não foi validado em dispositivo físico.

---

## 3. Conferência integral do relatório do Gemini

| # | Alegação do Gemini | Veredito no commit atual | Evidência e correção da alegação |
|---:|---|---|---|
| 1 | Todas as rotas de `emailMarketingRouter` são `publicProcedure` | **REFUTADO** | Há 71 procedures: 63 `staffProcedure` e 8 `protectedProcedure`; zero `publicProcedure`. O risco real está em procedures autenticadas sem ownership, não em acesso anônimo. |
| 2 | Atendente usa prompt injection para chamar `list_tasks`/`read_notes` de outro atendente | **REFUTADO como exploração descrita; hardening recomendado** | Admin recebe `TOOLS`; atendente recebe apenas `ATTENDANT_TOOLS`, que chama `ownTasksFor(callerUserId)` (`ai.ts:330-435,1000-1001`). O dispatcher ainda deve ter allowlist server-side por papel para defesa em profundidade. |
| 3 | Restrição de IP ativa com lista vazia libera acesso | **PARCIAL** | `sellers.setIpRestriction` hoje impede ativar com lista vazia (`sellers.ts:224-245`), mas `createContext` continua fail-open se estado vazio surgir por dado legado, migração ou edição manual (`trpc.ts:68-78`). |
| 4 | Recuperação de senha sem rate limit | **CONFIRMADO** | `requestPasswordReset` e `resetPasswordWithToken` não estão nos middlewares de `api/index.ts:965-978`. O primeiro pode gerar flooding/custo de e-mail. |
| 5 | `emergencyReset` usa Map efêmero e comparação simples | **CONFIRMADO** | `auth.ts:18,113-143`; o Map é por instância e `input.secret !== envSecret` não é time-safe. O limiter Express também é contornável por batching. |
| 6 | `/history` quebra por `trpc.results.list` inexistente | **JÁ CORRIGIDO** | A rota foi comentada/removida e `CallHistory.tsx` não existe no commit auditado. Não reintroduzir sem um modelo real de histórico. |
| 7 | Atendente manipula comissão pelo payload | **CONFIRMADO e mais amplo** | `comissaoPct`, `comissaoFixaPct`, preços, quantidades e frete são aceitos do cliente. O servidor não consulta `fat_commissions`/`fat_products` no upsert (`faturamento.ts:18-66,132-188`). |
| 8 | Sessão noturna desaparece após meia-noite | **CONFIRMADO** | `allActiveToday` exige `startedAt >= todayStart`; sessão ainda ativa iniciada ontem fica fora (`workSessions.ts:121-134`). A mesma condição existe no TV (`tv.ts:68-73`). |
| 9 | Renomear seller não atualiza `users.name` | **CONFIRMADO** | Atualiza `sellers.name`, `tasks.assignedTo` e eventualmente e-mail, mas não `users.name` nem snapshots de `fat_orders` (`sellers.ts:89-131`). |
| 10 | Exclusão de atendente deixa órfãos | **CONFIRMADO** | `tasks.assignedTo` vira `null`, mas `tasks.userId`, pedidos, comissão e sessões permanecem; não há FKs (`sellers.ts:74-87`; `schema.ts`). |
| 11 | `nomeCliente` permite HTML injection no e-mail do pedido | **CONFIRMADO; existem três pontos** | Pedido (`faturamento.ts:297-310`), nome no reset (`auth.ts:164-178`) e `{nome}/{empresa}` em templates (`email/marketing.ts:761-767`) não escapam variáveis. |
| 12 | Zod aceita negativos, NaN e Infinity | **PARCIAL** | Negativos e `Infinity` passam; `NaN` é rejeitado por `z.number()`. SuperJSON representa `Infinity`, então `.finite()` continua necessária. |
| 13 | `bulkCreate` pode expirar por automação sequencial | **CONFIRMADO** | O INSERT ocorre primeiro; depois cada lead executa `await runTriggerNow` em série (`tasks.ts:153-217`). Um timeout deixa tarefas criadas e automações parciais. |
| 14 | CSV usa apenas UTF-8 | **CONFIRMADO** | `reader.readAsText(file, 'UTF-8')` (`Tasks.tsx:1106`). Há ainda ausência de vírgula e parser por `split()` que ignora aspas. |
| 15 | Frontend e backend divergem em timezone | **CONFIRMADO, impacto de borda** | Partes do frontend usam meia-noite local do dispositivo; backend usa regra de São Paulo. Afeta dispositivo fora de Brasília e bordas do dia. |
| 16 | Routers usam `Error` genérico em erros de negócio | **CONFIRMADO, baixa severidade** | Ex.: `sellers.ts:107,121,144` e `auth.ts:73-90`. Vira `INTERNAL_SERVER_ERROR` em vez de código semântico. |

**Conclusão sobre o relatório antigo:** 11 alegações permanecem confirmadas, 2 são parciais, 2 foram refutadas e 1 já foi corrigida. A alegação mais alarmista — “todo e-mail marketing é público” — é falsa no código atual.

---

## 4. Achados confirmados — P0

### P0-01 — Conta administrativa recriada com senha pública

**Evidência:** `server/db/migrate.ts:7-25`  
**Confiança:** confirmada por código  
**Causa:** `seedAdminIfNeeded()` roda antes do fast path em toda inicialização. Se não houver linha `role='admin'`, grava `tarcyo.alves@gmail.com` com `hashPassword('admin123')` e `must_change_password=false`.

**Caminho de falha:**

1. banco novo, restauração incompleta ou exclusão do último admin;
2. cold start chama `ensureTablesExist()`;
3. seed cria credencial conhecida e publicada no repositório;
4. qualquer pessoa que conheça a credencial pode tentar login.

**Impacto:** tomada total do CRM quando a pré-condição ocorre. A função `sellers.delete` também pode apagar um usuário administrativo associado a seller e tornar essa pré-condição mais plausível.

**Correção mínima:**

- remover o seed automático do runtime;
- impedir exclusão/rebaixamento do último admin;
- criar bootstrap explícito, único e auditado, com segredo aleatório obrigatório via ambiente;
- `mustChangePassword=true` no bootstrap;
- verificar e rotacionar as senhas administrativas reais. Não testar a senha pública contra produção.

**Critérios de aceite:**

- banco sem admin faz startup falhar com mensagem operacional ou exige bootstrap explícito; nunca cria senha constante;
- teste de migração confirma que `admin123` não aparece em runtime nem scripts de produção;
- tentativa de excluir/rebaixar o último admin retorna `CONFLICT`;
- sessão e senha antigas são revogadas após rotação.

---

### P0-02 — Comissão e estado financeiro não são server-authoritative

**Evidência:** `server/routers/faturamento.ts:18-66,132-188,232-253,353-365`  
**Confiança:** confirmada por código e pelo formato SuperJSON  
**Causa:** o backend aceita do cliente:

- `comissaoPct` do pedido;
- `comissaoFixaPct` e `isentoFrete` dentro de cada item;
- quantidade, peso, preço e frete;
- status `estimado/faturado` e snapshots;
- `sellerName` e demais campos derivados.

O upsert não consulta `fat_commissions` nem `fat_products`. Além disso, o `set` de edição preserva `aprovadoEm/aprovadoPor`, então um pedido pode ser aprovado e depois alterado sem voltar à fila.

**Caminho de falha:** atendente cria pedido legítimo, intercepta a mutation ou edita um pedido aprovado, altera percentual/itens/valores/status, e o servidor persiste os dados. O panorama calcula a partir do registro manipulado.

**Agravantes:**

- no insert, `aprovadoEm/aprovadoPor` também vêm do payload: como o ID nasce no cliente, um atendente pode criar um pedido já “aprovado” e liberar `enviarPedidoEmail` sem revisão;
- `aprovarPedido` permite manager aprovar pedido próprio;
- `pendingApproval` só inclui `createdByRole='user'`, portanto pedidos de manager não entram na fila;
- `removePedido` permite apagar pedido `faturado`;
- percentuais e valores aceitam negativos e não finitos;
- não há teste financeiro automatizado.

**Impacto:** distorção de comissão, faturamento, peso/frete e trilha de aprovação.

**Correção mínima:**

- definir DTO de entrada sem campos derivados;
- buscar seller pelo usuário autenticado;
- buscar comissão oficial em `fat_commissions` e regras dos produtos em `fat_products`;
- recalcular no servidor preço/peso/frete/comissão a partir de IDs e quantidades;
- validar `.finite()`, `.nonnegative()`, `.int()` e limites de negócio;
- no insert, ignorar sempre `aprovadoEm`, `aprovadoPor`, `createdByUserId` e `createdByRole`, derivando autoria do contexto;
- em qualquer edição financeira: limpar aprovação e registrar versão/auditoria;
- impedir autorrevisão conforme política e bloquear hard delete de faturado;
- usar transação/controle de versão para evitar edição concorrente perdida.

**Critérios de aceite:**

- payload com `comissaoPct=500`, negativo, `Infinity` ou regra de produto alterada é rejeitado ou ignorado;
- comissão gravada coincide com cadastro oficial, independentemente do payload;
- pedido novo não pode nascer aprovado mesmo que o payload envie `aprovadoEm/aprovadoPor`; envio ao cliente permanece bloqueado até `aprovarPedido` válido;
- editar pedido aprovado remove aprovação e gera log de antes/depois;
- faturado não pode ser apagado; somente cancelado/estornado com motivo;
- manager não aprova o próprio pedido se a política exigir revisão independente;
- testes cobrem atendente, manager e admin.

---

### P0-03 — Webhook Resend ativo grava eventos no banco e formato errados

**Evidência:** `api/index.ts:283-291,486-560`; `server/routers/resendWebhook.ts:3,81-84`.  
**Confiança:** confirmada por código e prova de precedência do Express  
**Causa:** `/api/resend-webhook` é registrada duas vezes. A primeira rota chama `handleResendWebhook` e encerra a resposta; a implementação posterior, que contém limiter, escreve no banco CRM, normaliza `email.opened` para `opened` e chama `flagEngagementByMessageId`, fica inalcançável. O handler ativo usa `ordersDb`, grava o tipo cru e não marca engajamento.

**Impacto:**

- métricas do CRM filtram `opened/clicked`, mas recebem zero porque o evento vai para outro banco e com `event_type='email.opened'`;
- `tasks.hotLead` não é marcado por eventos Resend;
- lembretes/contagens de lead quente falham silenciosamente;
- deduplicação do banco CRM não protege o banco usado pelo handler ativo.

**Correção mínima:** manter um único handler, protegido pelo limiter, que verifique a assinatura, escreva no banco CRM, normalize o tipo, use `ON CONFLICT`/índice de dedupe e chame todos os efeitos (`flagEngagementByMessageId`, bounce/complaint/supressão). Remover o registro morto.

**Critérios de aceite:**

- um `email.opened` assinado grava exatamente uma linha `opened` em `email_events` do CRM;
- a tarefa ligada ao `message_id` fica `hot_lead=true`;
- replay é idempotente;
- assinatura inválida retorna 401;
- existe um único registro Express para a rota.

---

## 5. Achados confirmados — P1

### P1-01 — Limites de autenticação podem ser contornados por batching tRPC

**Evidência:** `client/src/main.tsx` usa `httpBatchLink`; `api/index.ts:908-978` limita caminhos de procedure.  
**Prova local:** URLs como `/api/trpc/auth.login,auth.me?batch=1` e `/api/trpc/auth.me,auth.login?batch=1` não executaram o middleware montado em `/api/trpc/auth.login`.

**Impacto:** força bruta em login/emergency reset e flooding de operações públicas sem o limite pretendido. A senha ainda é necessária; não é bypass de autenticação.

**Correção:** aplicar limiter antes do adapter `/api/trpc`, identificando cada procedure do batch, ou retirar operations sensíveis do batch e aplicar um limiter persistente por IP + identificador normalizado. Incluir `requestPasswordReset` e proteção adequada em `resetPasswordWithToken`.

**Aceite:** batch com operation sensível em qualquer posição conta cada operação e retorna `429` após o limite; batch misto não escapa; teste automatizado reproduz os dois ordenamentos.

---

### P1-02 — Sessões não são revogadas imediatamente após senha/papel/exclusão

**Evidência:** JWT de 7 dias (`server/auth.ts:50-55`); contexto consulta usuário com cache local de 30 s (`server/trpc.ts:54-79`); `sellers.updateRole` e `sellers.delete` não invalidam o cache de usuário (`sellers.ts:74-87,137-147`).  
**Impacto:** usuário demitido/rebaixado pode manter acesso por uma janela; reset de senha não invalida JWT já emitido; caches são por instância, então invalidar um processo não invalida os demais.

**Correção:** adicionar `sessionVersion`/`passwordChangedAt` ao usuário e ao JWT; comparar a cada contexto ou em cache distribuído; incrementar em reset, troca de papel, bloqueio e exclusão. Invalidar chaves corretas em todas as mutações.

**Aceite:** token antigo falha imediatamente após reset, rebaixamento e desativação, inclusive quando a próxima chamada cai em outra instância.

---

### P1-03 — IDOR em consultas e inscrição de E-mail Marketing

**Evidência:**

- `engagementByTaskIds` (`emailMarketing.ts:1541-1577`);
- `enrollmentsByTaskIds` (`:1583-1626`);
- `enrollTasksInSequence` (`:971-1007`).

As três recebem IDs arbitrários e não aplicam `userTaskFilter`. A flag `emailMarketingEnabled` autoriza usar o recurso, não acessar a tarefa de outro atendente.

**Impacto:** atendente pode enumerar atividade/campanhas de leads alheios e inscrever lead de colega em sequência. IDs numéricos facilitam enumeração.

**Correção:** filtrar as tarefas permitidas no servidor e retornar resultado apenas para IDs autorizados; para mutação, rejeitar o lote inteiro se houver ID fora do escopo. Managers/admin seguem política explícita.

**Aceite:** usuário A recebe `FORBIDDEN` ao consultar/inscrever task de B; lote misto não processa parcialmente; admin/manager autorizado continua funcionando.

---

### P1-04 — Variáveis controladas por usuário entram sem escape em HTML de e-mail

**Evidência:**

- pedido: `server/routers/faturamento.ts:295-315`;
- reset de senha: `server/routers/auth.ts:164-183`;
- placeholders: `server/email/marketing.ts:761-767`.

**Impacto:** HTML arbitrário/formatação maliciosa em e-mail assinado pelo domínio corporativo. Scripts costumam ser bloqueados por clientes de e-mail, mas links, imagens, layout enganoso e HTML continuam relevantes.

**Correção:** helper único `escapeHtml` para toda variável textual; URL construída/validada separadamente; renderização tipada de template. Sanitizar o template não substitui escapar valores inseridos depois.

**Aceite:** `<img src=x onerror=...>`, `<a href=...>` e caracteres `&<>"'` aparecem como texto; templates legítimos continuam renderizando.

---

### P1-05 — Migração pode falhar ou declarar schema incompleto como pronto

**Evidência:** `server/db/migrate.ts:19-46,192-208,405-420,758-770`; `server/db/schema.ts:69-110,157-168`.  
**Falhas:**

1. `INSERT ... unnest(tasks.tags)` ocorre antes de `ALTER TABLE tasks ADD COLUMN tags`;
2. o cleanup/índice único usa `email_sequence_sends.retry_number` antes do `ALTER` que cria a coluna (`migrate.ts:446-471,585-590`);
3. `tasks.reminder_enabled` existe no ORM e é lido/escrito, mas não é criada/garantida;
4. `work_sessions.updated_at` existe no ORM e é escrita, mas não é criada/garantida;
5. a versão `2026-08-12b` permite fast path sem verificar essas colunas;
6. startup captura erro de migração e continua servindo (`api/index.ts`), podendo operar com schema parcial.

**Impacto:** banco novo/restaurado pode falhar na migração e procedures de tarefas/sessões quebram com `column does not exist`.

**Correção:** corrigir ordem, adicionar colunas, elevar `SCHEMA_VERSION`, tornar a migração fail-closed e criar teste de banco vazio + upgrade de snapshot antigo. Não marcar versão até todos os passos passarem.

**Aceite:** migração em banco vazio passa; segunda execução é idempotente; upgrade de versão antiga passa; probe final compara colunas críticas; API não sobe se a migração falhar.

---

### P1-06 — “Limpar dados” permite perda ampla e não atômica no faturamento

**Evidência:** `ProductManager.tsx:124-129,207-208`; `Faturamento.tsx:27-83`; store `:150-154,225-229`.  
**Causa:** admin e manager veem todos os pedidos; um `confirm()` inicia N deletes independentes, atualiza a tela otimisticamente e exibe sucesso antes das respostas. Produtos não têm log de exclusão e pedidos não têm restauração.

**Impacto:** perda acidental de catálogo e histórico financeiro; falha de rede produz estado parcialmente apagado.

**Correção:** remover o botão até existir política de retenção. Se a função for necessária: admin-only, confirmação digitada + contagem, backup/soft delete, endpoint transacional único e job auditável.

**Aceite:** manager não apaga base global; operação parcial é impossível; rollback/restore testado; UI só informa sucesso após confirmação do servidor.

---

### P1-07 — Renomear/excluir atendente rompe identidade e deixa órfãos

**Evidência:** `server/routers/sellers.ts:74-131`; ausência de FKs/uniques em `schema.ts`.  
**Problemas:**

- rename não atualiza `users.name` nem snapshots do faturamento;
- telas que casam ownership por `assignedTo === seller.name` podem divergir;
- delete remove `users` e `sellers`, zera só `tasks.assignedTo`, mas mantém `tasks.userId`, sessões, comissão e pedidos;
- não há transação;
- `sellers.userId` e `sellers.name` não têm unicidade.

**Impacto:** tarefas invisíveis, relatórios inconsistentes, histórico sem ator resolvível e estado parcial em erro intermediário.

**Correção:** preferir desativação/soft delete; identidade por ID, nome só como display/snapshot; constraints e transação; política explícita de reatribuição. Atualizar `users.name` no rename e não reescrever snapshots históricos sem necessidade.

**Aceite:** desativar preserva histórico e bloqueia login; todas as tarefas continuam atribuíveis/visíveis; rename não muda ownership; não existe seller duplicado para o mesmo usuário.

---

### P1-08 — Importação CSV duplica leads ativos e não implementa CSV robusto

**Evidência:** `Tasks.tsx:969-1128`; `tasks.ts:153-217`; schema sem unique/idempotency em tarefas.  
**Falhas:**

- separador vírgula não é detectado;
- `split(sep)` não respeita campos entre aspas, vírgulas, quebras de linha ou aspas escapadas;
- encoding é fixo UTF-8;
- comparação ocorre apenas contra leads **excluídos**, não ativos;
- se `checkCancelledMatches` falha, importação prossegue (fail-open);
- ramo sem separador processa todas as linhas, podendo tratar cabeçalho como lead;
- reimportar o mesmo arquivo pode criar até 2.000 duplicatas por chamada.

**Impacto:** base duplicada/corrompida, acentos quebrados e operação difícil de reverter.

**Correção:** parser CSV real e pinado, detecção UTF-8/Windows-1252, preview com erros por linha, idempotency key de importação, dedup server-side conforme regra de negócio e modo explícito “atualizar/ignorar/criar duplicado”.

**Aceite:** fixtures cobrem vírgula/ponto-e-vírgula/tab, aspas, newline, BOM, UTF-8 e Windows-1252; segundo upload não duplica; falha na checagem bloqueia confirmação; importação retorna resumo atômico.

---

### P1-09 — `bulkCreate` pode deixar tarefas criadas com automações parciais

**Evidência:** `server/routers/tasks.ts:153-217`.  
**Causa:** um INSERT de até 2.000 tarefas é seguido por `await runTriggerNow` sequencial para cada e-mail. O efeito não é parte da transação e não há outbox/retry durável.

**Impacto:** timeout/cold termination após o INSERT deixa a base criada, parte dos e-mails/inscrições executada e parte perdida. Repetir a importação agrava duplicação.

**Correção:** transação para dados + outbox; worker/cron idempotente processa eventos em lotes com retry e dead-letter. Como mitigação curta, reduzir lote e limitar concorrência, mas isso não substitui durabilidade.

**Aceite:** interrupção após o INSERT não perde eventos; retry não duplica automação; progresso e falhas ficam observáveis; 2.000 linhas não dependem de uma única invocação longa.

---

### P1-10 — Lembrete não é confiável com aba fechada, suspensa ou offline

**Evidência:** consulta `tasks.reminders`, polling de 5 min, timers locais e dedupe em `sessionStorage`; zero uso de `PushManager`/Web Push no código do cliente. O service worker gerado é de precache, não um canal de lembrete.

**Impacto:** o produto pode deixar de avisar exatamente quando o usuário não está olhando para o CRM; múltiplas abas/dispositivos têm dedupe independente. Isso é uma limitação arquitetural, não um bug isolado no classificador.

**Correção:** criar scheduler server-side/outbox de lembrete e Web Push com consentimento; definir fallback (e-mail/WhatsApp apenas se legal e aprovado), idempotência, janela de retry e observabilidade. Manter toast local como complemento.

**Aceite:** lembrete de teste chega com app fechado; reinício do worker não duplica; timezone Brasília é determinístico; usuário pode revogar canal; falha aparece em painel/log.

---

### P1-11 — Sessões ativas iniciadas no dia anterior desaparecem

**Evidência:** `workSessions.ts:121-134`; `tv.ts:68-73`.  
**Causa:** busca exige status ativo/pausado **e** `startedAt >= todayStart`.

**Impacto:** após meia-noite, atendente trabalhando aparece offline e o tempo da sessão não compõe corretamente o dia atual.

**Correção:** incluir toda sessão ativa/pausada independentemente do início e calcular a fatia diária por interseção `[startedAt, endedAt/now]` com o dia de São Paulo.

**Aceite:** sessão 23:50–00:30 aparece online às 00:10 e computa 10 min no dia novo; teste cobre virada do mês/ano.

---

### P1-12 — Qualquer usuário autenticado recebe o dashboard global da equipe

**Evidência:** `server/routers/tv.ts:39-41,44-179`.  
**Causa:** `dashboard` é `protectedProcedure` e retorna dados de todos os sellers, atrasos, snippets de notas, leads quentes e alertas.

**Impacto:** atendente comum consulta informações comerciais de toda a equipe, contrariando o isolamento aplicado em `tasks`.

**Correção:** `staffProcedure` para dashboard global; se atendente precisa de TV, retornar projeção não sensível e explicitamente autorizada. Cache deve separar visibilidade/papel.

**Aceite:** user comum recebe `FORBIDDEN` ou payload próprio sem PII; manager/admin recebem dashboard global; teste garante que cache global não vaza resposta privilegiada.

---

### P1-13 — Lista de supressão compartilhada pode falhar aberta no banco errado

**Evidência:** `server/db/b2bMigrate.ts:125-138`; `server/email/marketingEngine.ts:206`; `server/email/sequenceEngine.ts:19-34`; `server/routers/unsubscribe.ts:37`.  
**Causa:** `suppression_list` é criada pela migração B2B no `ordersDb`, mas caminhos compartilhados a consultam/inserem via conexão principal. As consultas capturam erro e retornam “não suprimido”.

**Impacto:** endereço que pediu descadastro pode voltar a ser considerado elegível para campanha/sequência; risco direto de conformidade e reputação.

**Correção:** definir uma única fonte de verdade de supressão, criar/migrar a tabela no mesmo banco usado pelos engines, tornar erro fail-closed para envio e testar ambos os provedores/canais.

**Aceite:** após unsubscribe, toda consulta de supressão retorna true; indisponibilidade da tabela impede envio e gera alerta; migração não cria tabelas homônimas divergentes em dois bancos.

---

## 6. Achados confirmados — P2

### P2-01 — Proteções do `emergencyReset` são locais e incompletas

`server/routers/auth.ts:18,113-143` usa Map em memória por instância e comparação simples. Migrar tentativas para store durável com TTL, usar `timingSafeEqual` após validar tamanhos e registrar auditoria sem secret. O segredo mestre deve ser rotacionável e idealmente substituído por fluxo operacional de bootstrap/recovery.

### P2-02 — Login ainda expõe diferença temporal para e-mail inexistente

`DUMMY_HASH` usa o formato legado de 10.000 iterações (`server/auth.ts:64-69`), enquanto usuários atuais usam 310.000. E-mail inexistente pode responder muito mais rápido. Gerar dummy de 310.000 iterações e testar distribuição de tempo.

### P2-03 — Token de reset pode sofrer corrida de uso único

`auth.ts:195-221` faz SELECT do token, atualiza a senha e só depois marca `usedAt`, sem claim atômico/transação. Duas requisições concorrentes podem passar na leitura; a última senha vence. Fazer `UPDATE ... WHERE used_at IS NULL AND expires_at > now RETURNING` como claim e concluir em transação.

### P2-04 — Validação numérica financeira é permissiva

`faturamento.ts:18-66,353-365` usa `z.number()` sem `.finite()`, mínimo, máximo ou inteireza. O fix deve cobrir produtos, itens, frete, valor pago e percentuais, não só `comissaoPct`. `NaN` já é rejeitado; negativos e infinito são o problema real.

### P2-05 — Modelo de aprovação tem lacunas de segregação

`aprovarPedido` não verifica autoria; manager cria e aprova o próprio pedido. `pendingApproval` exclui pedidos criados por manager. Definir política: revisão independente, quais papéis aprovam, o que ocorre após edição, cancelamento e faturamento.

### P2-06 — Store de faturamento confirma antes do servidor e não faz rollback confiável

`client/src/lib/faturamento/store.ts:114-117,147-154,197-242` altera mirror e mostra toasts antes da mutation. Em erro, tenta reload; se offline, engole o erro e mantém dado não persistido na tela. Mutações devem retornar Promise, guardar snapshot, reverter ou mostrar estado pendente/conflito.

### P2-07 — Mirror global pode sobreviver à troca de usuário na mesma página

`mirror/loaded` vivem no módulo (`store.ts:55-59`) e não há `resetFatStore`. O logout normal do AppShell aparentemente recarrega/navega e mitiga o fluxo comum, por isso a confirmação é parcial. Ainda assim, sessão trocada sem reload pode mostrar dados anteriores. Limpar stores e cache em logout/401.

### P2-08 — Criação rápida não bloqueia múltiplos submits

`Tasks.tsx:549-569,1529-1557` não usa `createMutation.isPending` nos atalhos e submit. Duplo clique pode criar duas tarefas. Desabilitar enquanto pendente e, para robustez, aceitar chave de idempotência no servidor. Não é P0.

### P2-09 — Listagens baixam a base inteira

`AdminDashboard` e `ClientsManagement` usam `tasks.list` sem paginação; o dashboard faz várias passagens no array e o cliente renderiza todas as linhas. Com crescimento, aumenta transferência, memória e tempo de render. Criar paginação/cursor, busca server-side e agregações SQL.

### P2-10 — Busca, erros e ações destrutivas têm UX inconsistente

- busca de clientes só usa `toLowerCase()`, sem normalizar acentos;
- páginas confundem erro de rede com lista vazia;
- vários deletes/reset usam `window.confirm()` em vez de `AlertDialog` acessível;
- checkboxes e botões só-ícone carecem de rótulo em pontos auditados;
- Knowledge Base pode anunciar “deletado” quando o servidor não remove documento alheio.

Criar padrão de loading/error/empty, confirmação acessível e retorno de `affectedRows`.

### P2-11 — Retenção de sessões nunca apaga as linhas produzidas pelo router

A migração purga `status='completed'` (`migrate.ts:40,770`), enquanto o router encerra como `status='ended'` (`workSessions.ts:32,102`). A tabela cresce indefinidamente. Ajustar status e testar retenção. O purge de chat usa `CURRENT_DATE` do banco, potencialmente UTC, não o dia de São Paulo.

### P2-12 — Schema não protege relações e identidades críticas

O schema não declara foreign keys. Também faltam unicidades como `sellers.userId`; ownership ainda depende parcialmente de nomes. Introduzir constraints gradualmente, após relatório de órfãos/duplicatas, com política de `ON DELETE`. Não criar índice único de CNPJ/telefone sem decidir se um mesmo cliente pode existir em carteiras distintas.

### P2-13 — Dependências com advisories e pacotes de tooling em produção

`npm audit --omit=dev` encontrou 15 advisories. O crítico de `tar` entra porque `@capacitor/cli` está em `dependencies`; `react-router-dom` está instalado, não é usado e contraria a regra do Wouter. Atualizar com versões pinadas após teste, mover CLIs para `devDependencies` e remover dependências mortas. Não executar `npm audit fix --force` cegamente.

### P2-14 — Bundle do frontend é grande e sem code splitting relevante

Build gerou um chunk JS de 2.043,59 kB (531,17 kB gzip). Páginas grandes como E-mail Marketing e Documentos devem ser lazy-loaded por rota; bibliotecas de PDF/gráficos não devem entrar no primeiro carregamento do CRM.

### P2-15 — Ausência de testes nos domínios de maior risco

Os 49 testes cobrem lembretes e host do `index.html`. Não há teste de router/RBAC, migração, faturamento, e-mail, reset, concorrência ou importação. O verde atual não detectaria nenhum P0/P1 deste relatório.

### P2-16 — Erros de negócio viram 500 e reduzem observabilidade útil

Trocar `throw new Error` por `TRPCError` semântico (`NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, `BAD_REQUEST`). O objetivo não é apenas estética: evita alertas 500 falsos e permite UI de recuperação correta.

---

## 7. Lacunas de produto — não classificar como bugs já implementados

### FEATURE-01 — Recorrência de lembretes

Não há série, regra RRULE, exceção ou geração de próxima ocorrência. Definir recorrência diária/semanal/mensal, timezone, término, edição “esta/série”, dedupe e comportamento em atraso.

### FEATURE-02 — Snooze/adiar e conclusão/reabertura na UI

A API aceita estados, mas o fluxo de atendente não oferece um ciclo claro de concluir, reabrir e adiar. Implementar após fechar a máquina de estados e a auditoria.

### FEATURE-03 — Histórico completo de alterações

Hoje há logs de exclusão específicos, mas não uma trilha de criação/edição/atribuição/status/antes-depois. Criar event log append-only com ator, entidade, versão e metadados mínimos, respeitando retenção de PII.

### FEATURE-04 — Entrega multicanal de lembrete

Web Push é a primeira lacuna. E-mail/WhatsApp/SMS exigem decisão legal/comercial, consentimento e controle de frequência; não devem ser adicionados como disparo frio automático.

### FEATURE-05 — Recuperação/restore administrativo

Soft delete e restauração para tarefas, pedidos e documentos de negócio evitam que logs sejam apenas evidência sem capacidade de recuperação.

---

## 8. Hipóteses descartadas ou já corrigidas

1. **“E-mail Marketing inteiro público” — falso.** Zero procedures públicas no router atual.
2. **“Prompt injection comum chama tools globais como atendente” — falso no fluxo atual.** Ferramentas expostas são separadas; falta apenas defesa em profundidade no dispatcher.
3. **“CallHistory está quebrado em `/history`” — já removido/comentado.**
4. **“NaN passa em `z.number()`” — falso.** Negativo e infinito passam.
5. **“`processBatch` permite qualquer campanha a qualquer atendente” — falso no código atual.** Para user, há checagem de `createdByUserId` (`emailMarketing.ts:726-739`).
6. **“Tasks não protege ownership nas mutações principais” — falso.** `userTaskFilter` é aplicado em list/update/delete/bulkAssign/deleteMany e operações correlatas.
7. **“Assinatura de e-mail é renderizada sem sanitização” — falso para a assinatura.** `sanitizeSignatureHtml`/`renderSignature` existem; o problema está nas variáveis inseridas depois.
8. **“Build verde implica segurança” — falso como inferência.** Os domínios críticos não têm testes.

---

## 9. Plano completo de execução

A ordem abaixo minimiza risco. Cada lote deve sair em PR pequeno, com atualização do plano e evidência de validação. Não misturar correções financeiras, migração e redesign amplo na mesma entrega.

### Lote 0 — contenção e decisões operacionais

**Objetivo:** remover exposição imediata antes de refatoração.

- [ ] Verificar por procedimento administrativo, sem tentar credencial pública, se existe conta criada pelo seed.
- [ ] Rotacionar senhas de todos os admins e invalidar sessões.
- [ ] Remover `seedAdminIfNeeded()` do cold start.
- [ ] Bloquear exclusão/rebaixamento do último admin.
- [ ] Ocultar/remover “Limpar dados” até existir operação segura.
- [ ] Congelar mudança de comissão no cliente como fonte de verdade; documentar tabela/regra oficial.
- [ ] Definir se manager pode aprovar o próprio pedido.

**Saída:** PR de contenção + checklist operacional assinado pelo responsável.

### Lote 1 — autoridade financeira

- [ ] DTO de criação/edição contendo apenas inputs permitidos.
- [ ] Resolver seller pelo usuário autenticado.
- [ ] Buscar comissão e produtos no servidor.
- [ ] Recalcular totais/comissões/frete server-side.
- [ ] Faixas Zod finitas e coerentes.
- [ ] Versionamento otimista (`updatedAt`/versão).
- [ ] Invalidar aprovação em edição.
- [ ] Impedir hard delete de faturado e criar cancelamento/estorno.
- [ ] Auditoria antes/depois.
- [ ] Testes de manipulação de payload, concorrência e papel.

**Gate:** nenhum valor financeiro derivado do navegador é persistido sem recálculo.

### Lote 2 — autenticação, sessão e rate limiting

- [ ] Limiter tRPC consciente de batch.
- [ ] Limites persistentes por IP + conta para login, recovery e emergência.
- [ ] Rate limit e cooldown de e-mail no `requestPasswordReset`.
- [ ] `timingSafeEqual` e storage durável para emergência.
- [ ] Dummy PBKDF2 com 310.000 iterações.
- [ ] Claim atômico de token de reset.
- [ ] `sessionVersion` e revogação em senha/papel/status/exclusão.
- [ ] Remover dependência de cache local para decisão crítica ou usar invalidação distribuída.
- [ ] Testes de batches mistos e multi-instância simulada.

**Gate:** credencial/sessão antiga perde acesso imediatamente e toda operação sensível é limitada em qualquer posição do batch.

### Lote 3 — autorização e segurança de e-mail

- [ ] Aplicar ownership em `engagementByTaskIds`, `enrollmentsByTaskIds` e `enrollTasksInSequence`.
- [ ] Se lista manual continuar sendo requisito do `attendantBroadcast`, documentar finalidade/consentimento, adicionar rate limit e trilha de auditoria; não tratá-la como IDOR por si só.
- [ ] Tornar TV global `staffProcedure` ou reduzir payload por papel.
- [ ] Allowlist server-side de tools de IA por papel, independente do tool list enviado ao modelo.
- [ ] Escape único de variáveis em pedido, reset e templates.
- [ ] Consolidar webhook Resend e adicionar testes de assinatura/replay/efeitos.
- [ ] Unificar `suppression_list` no banco correto e tornar falha de consulta bloqueante para envio.
- [ ] Rate limit/auditoria de disparos.

**Gate:** matriz automatizada user A/user B/manager/admin para cada procedure sensível.

### Lote 4 — schema, migração e integridade relacional

- [ ] Corrigir ordem de `tags` e `retry_number`.
- [ ] Garantir `reminder_enabled` e `work_sessions.updated_at`.
- [ ] Elevar `SCHEMA_VERSION`.
- [ ] Startup fail-closed em erro de migração.
- [ ] Teste de banco vazio, reexecução e upgrade.
- [ ] Relatório read-only de órfãos/duplicatas no banco real antes de constraints.
- [ ] `UNIQUE sellers.user_id` e FKs com política definida.
- [ ] Soft delete/desativação de seller; reatribuição explícita.
- [ ] Rename consistente sem ownership por nome.
- [ ] Corrigir purge `ended` e dia de São Paulo.

**Gate:** schema Drizzle e banco criado pela migração têm as mesmas colunas/constraints críticas.

### Lote 5 — importação e automações duráveis

- [ ] Parser CSV conforme RFC, versão pinada.
- [ ] UTF-8/BOM/Windows-1252 com diagnóstico.
- [ ] Preview e relatório por linha.
- [ ] Definir chave de dedup por carteira/empresa.
- [ ] Idempotency key de arquivo/lote.
- [ ] Dedup e validação obrigatórios no servidor.
- [ ] Outbox transacional para `lead_created`.
- [ ] Worker/cron com retry idempotente, orçamento de tempo e progresso.
- [ ] Bloquear reenvio de um lote concluído.

**Gate:** reimportar o mesmo arquivo não altera a contagem; interrupção não perde nem duplica automações.

### Lote 6 — confiabilidade de lembretes e sessões

- [ ] Corrigir sessões que atravessam meia-noite.
- [ ] Centralizar timezone `America/Sao_Paulo` em cliente/servidor.
- [ ] Scheduler/outbox de lembretes.
- [ ] Web Push e gerenciamento de subscriptions.
- [ ] Dedupe global por ocorrência/canal.
- [ ] Retry, expiração e observabilidade.
- [ ] Definir recorrência, snooze, conclusão e reabertura.
- [ ] Testes de virada de dia/mês/ano e aba fechada.

**Gate:** lembrete chega com app fechado e uma ocorrência gera no máximo uma entrega por canal.

### Lote 7 — UX, performance, dependências e testes

- [ ] Rollback/estado pendente no store de faturamento.
- [ ] Limpar stores/query cache no logout.
- [ ] Paginação e agregações server-side.
- [ ] Normalização de acentos e busca server-side.
- [ ] Estados de erro/retry distintos de vazio.
- [ ] `AlertDialog` acessível e labels.
- [ ] Lazy load de páginas pesadas.
- [ ] Mover CLIs para dev, remover `react-router-dom`, atualizar advisories com versões pinadas.
- [ ] Criar lint script/configuração.
- [ ] Cobertura de routers, migração e concorrência.

**Gate:** bundle inicial menor, auditoria de produção sem crítico aplicável e testes dos P0/P1 no CI.

---

## 10. Matriz mínima de testes a criar

| Domínio | Casos obrigatórios |
|---|---|
| Auth | login válido/inválido/inexistente; batch em qualquer ordem; limiter; reset concorrente; revogação; último admin |
| RBAC | user A × task B; manager; admin; cache por papel; TV global |
| Faturamento | comissão forjada; preço/frete forjado; negativo/infinito; edição pós-aprovação; autorrevisão; cancelamento |
| Migração | banco vazio; segunda execução; snapshot antigo; falha no meio; schema diff |
| CSV | separadores, aspas, newline, BOM, UTF-8, CP1252, cabeçalho, duplicata, lote repetido |
| Automação | outbox; retry; crash após commit; idempotência; limite de tempo |
| E-mail | escape; ownership; confirmado; supressão; frequency cap; assinatura/replay do webhook |
| Lembretes | aba aberta/fechada; offline; dois dispositivos; dedupe; virada de dia; recorrência |
| Sessões | ativa/pausada/encerrada; 23:50–00:30; purge; usuário desativado |
| UX | duplo submit; erro de rede; rollback; confirmação destrutiva; acessibilidade básica |

---

## 11. Decisões do produto necessárias antes de alguns fixes

1. **Deduplicação:** CNPJ/telefone é único globalmente ou pode existir em carteiras diferentes?
2. **Aprovação:** manager pode aprovar o próprio pedido? Alteração após aprovação sempre reabre revisão?
3. **Exclusão de atendente:** reatribuir carteira a quem, ou manter owner inativo?
4. **Retenção/LGPD:** quanto tempo guardar tarefas, notas, sessões, eventos de e-mail e logs?
5. **Lembretes:** Web Push basta ou haverá e-mail/WhatsApp com consentimento explícito?
6. **Recorrência:** regras suportadas e comportamento ao editar uma ocorrência.
7. **Importação:** duplicatas devem ser ignoradas, atualizadas ou apresentadas para decisão?

Essas decisões não impedem Lotes 0–3; apenas evitam codificar política de negócio por suposição nos lotes seguintes.

---

## 12. Portões de entrega por PR

Todo PR de correção deve executar e registrar:

1. testes direcionados novos que falham antes e passam depois;
2. `npm run check`;
3. `npm test`;
4. `npm run build:client` quando afetar frontend;
5. `npm run build:api` quando afetar backend;
6. teste de autorização por papéis quando houver dados sensíveis;
7. teste de migração em banco descartável quando alterar schema;
8. `npm audit --omit=dev` e justificativa de qualquer advisory remanescente;
9. validação no preview sem tocar dados reais;
10. plano/progresso atualizado no repositório.

Nenhum item deve ser marcado como corrigido apenas porque compila. Segurança e integridade exigem teste negativo: demonstrar que o payload/usuário concorrente é rejeitado.

---

## 13. Ordem recomendada final

1. **Conter seed administrativo e botão de limpeza.**
2. **Tornar faturamento autoritativo no servidor.**
3. **Fechar batching/rate limit e revogação de sessão.**
4. **Fechar IDOR, HTML de e-mail, supressão e política/auditoria de broadcast.**
5. **Consolidar webhook e corrigir migração.**
6. **Sanear identidade de sellers e integridade relacional.**
7. **Tornar importação/automação idempotentes.**
8. **Tornar lembrete realmente entregável com app fechado.**
9. **Paginação, UX, bundle, dependências e cobertura ampla.**

O projeto compila e o PR #15 adiciona proteção útil à lógica de lembretes e ao isolamento do Pixel, mas o CRM ainda não deve ser considerado auditado/corrigido enquanto os P0/P1 acima não tiverem testes negativos e validação de produção controlada.
