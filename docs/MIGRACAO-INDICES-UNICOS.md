# Migração: índices únicos (roteiro manual — NADA aqui roda sozinho)

Objetivo: trocar "checar antes de inserir" (corrida entre duas requisições) por garantia do banco.
**Este documento e os arquivos de `scripts/db/indices-unicos/` não são executados pelo build nem por
`migrate.ts`.** O dono (ou quem ele indicar) roda à mão, no `psql`/console do Neon, em horário calmo.
Nomes de coluna conferidos em `server/db/schema.ts` em 07/10/2026.

| # | Índice | Banco | Arquivos |
|---|--------|-------|----------|
| 1 | `tasks_cnpj_uniq` — `tasks(cnpj) WHERE length(cnpj)=14` | CRM (`DATABASE_URL`) | 01, 02, 03 |
| 2 | `email_campaign_recipients_campaign_email_uniq` — `(campaign_id, lower(email))` | CRM | 04, 05, 06 |
| 3 | `automation_runs_cart_rule_scheduled_uniq` — `(cart_id, rule_name) WHERE status='scheduled'` | **Premium** (`ORDERS_DATABASE_URL`) | 07, 08, 09 |
| 4 | `work_sessions_one_open_per_user_uniq` — `(user_id) WHERE status IN ('active','paused')` | CRM | 10, 11, 12 |
| 5 | `sellers_user_id_uniq` — `(user_id) WHERE user_id > 0` | CRM | 13, 14, 15 |

`16-validar-indices-invalidos.sql` serve para os cinco.

## Ordem de trabalho (para cada índice)

1. **Contagem** (`*-contagem.sql`, só leitura). Se der 0 linhas, pule a limpeza.
2. **Backup do banco** (branch do Neon / `pg_dump`) antes de qualquer limpeza.
3. **Limpeza** (`*-limpeza.sql`): uma transação que copia o que sai para uma tabela `bkp_*`, reaponta
   referências, remove/encerra as duplicatas e **mostra a verificação final antes do `COMMIT`**.
   - Sobrevivente de `tasks` por CNPJ: **convertida** (`converted_at` preenchido) > **maior `contact_count`** > **menor `id`**.
   - `task_id` reapontado em `email_campaign_recipients`, `email_sequence_enrollments`, `fat_orders` (e `radar_lead_events`).
     Essas colunas não têm chave estrangeira no schema: nada cascateia, por isso o reapontamento é obrigatório.
   - Conferido: `task_deletion_logs.task_id` é só log e não é alterado.
4. **Criar o índice** (`*-indice.sql`): `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS`, **um arquivo por
   comando e sem `BEGIN`** (CONCURRENTLY não roda em transação; no `psql` use `-f` sem `-1`). Não bloqueia
   escrita, mas pode levar minutos em tabela grande.
5. **Validar** com `16-validar-indices-invalidos.sql`: todos com `indisvalid = true`.

## Índice INVALID: como detectar e refazer

`CREATE INDEX CONCURRENTLY` que falha no meio (duplicata nova criada durante a construção, queda de
conexão, timeout) **deixa o índice criado porém INVÁLIDO**: ele atrapalha a escrita e **não garante
unicidade**. E o `IF NOT EXISTS` do comando seguinte vê o nome e **não refaz** — por isso a checagem é obrigatória.

1. Rode `16-validar-indices-invalidos.sql` (em cada banco). `indisvalid = false` → inválido.
2. `DROP INDEX CONCURRENTLY IF EXISTS <nome>;` (sem transação).
3. Refaça contagem + limpeza (apareceram duplicatas novas) e depois o arquivo `*-indice.sql`.
4. Valide de novo.

## Ajuste de código DEPOIS que o índice existir (e só depois)

Com o índice no ar, o INSERT que perde a corrida passa a falhar com **SQLSTATE `23505`** (unique_violation).
Sem tratar, vira erro 500. Faça em um commit à parte, depois de validar o índice:

- **`tasks.cnpj`** (`create`, `bulkCreate`, conversão do Radar `conditionalRadarTaskInsert`, importações):
  usar `.onConflictDoNothing()` (o índice é parcial: `onConflictDoNothing({ target: tasks.cnpj, where: sql\`length(cnpj) = 14\` })`)
  e tratar "0 linhas inseridas" como duplicada (já é o conceito de `duplicadas` em `bulkCreate`); no `create`, devolver
  CONFLICT "Já existe tarefa para este CNPJ" em vez de 500.
- **`email_campaign_recipients`**: inserção de destinatários com `onConflictDoNothing()` (alvo `(campaign_id, lower(email))`
  exige o `sql` da expressão no `target`); contar só as linhas realmente inseridas.
- **`automation_runs`** (`recovery.trackCart`, banco Premium): `onConflictDoNothing` — o agendamento de cadência já é
  "agendar se não existe"; com o índice a corrida some.
- **`work_sessions`**: o `INSERT ... WHERE NOT EXISTS` de `workSessions.start` continua certo; adicionar `ON CONFLICT DO NOTHING`
  e, se `ins.rows` vier vazio, reler a sessão aberta (já é o comportamento atual).
- **`sellers`**: criação de atendente (`sellers.create`/vínculo com usuário): capturar `23505` e responder
  "Este usuário já é atendente".
- Padrão para capturar: `const code = (e as { code?: string; cause?: { code?: string } }); code.code === '23505' || code.cause?.code === '23505'`
  (o driver neon-http pode embrulhar o erro em `cause`).

## Reverter

`DROP INDEX CONCURRENTLY IF EXISTS <nome>;`. As tabelas `bkp_*` ficam como seguro; apague-as só quando tiver certeza
(`DROP TABLE bkp_...`). **Não** altere `server/db/migrate.ts` para criar esses índices sem antes rodar a limpeza:
`CREATE UNIQUE INDEX` com duplicata existente falha e, no build, seria engolido silenciosamente.
