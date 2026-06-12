# Plano de Execução — E-mail Marketing FASE 3 (para o modelo Sonnet)

> **Contexto.** A Fase 2 já está em produção: sequências lineares (drip),
> automações (`lead_created` / `lead_converted` / `inactive_days`), tags em
> tarefas, estatísticas de abertura/clique, webhook do Resend e cron diário
> (`/api/cron/email-daily`, 11:00 UTC). Este documento descreve a Fase 3.
>
> **Objetivo de negócio.** Transformar o disparo linear em **fluxos
> inteligentes que reagem ao comportamento do lead** (abriu / não abriu /
> clicou), permitir **sequências recorrentes** (e-mail de marca todo mês),
> **destacar leads quentes** para o atendente ligar primeiro, e **exportar
> listas segmentadas em CSV** para campanhas externas / limpeza de base.
>
> **Restrição inegociável: tudo dentro dos planos gratuitos.**
> Neon (512 MB, retenção de eventos 90 dias já existe), Vercel Hobby
> (1 cron/dia, `maxDuration` 60s, já configurado), Resend (cota diária
> compartilhada de 90/conta). **Nada de novo cron, nada de fila externa,
> nada de serviço pago.** Reaproveitar o cron e o webhook que já existem.

---

## Visão geral — 4 pilares

| # | Pilar | Valor | Risco/Complexidade |
|---|-------|-------|--------------------|
| 1 | **Sequências condicionais** (ramificação abriu/clicou) | Réplica do "quem abriu / quem não abriu" do systeme.io | Médio |
| 2 | **Sequências recorrentes** (loop mensal) | "Todo mês um e-mail de marca" sem recriar inscrição | Baixo |
| 3 | **Lead scoring + alerta de lead quente** | Atendente liga primeiro em quem abriu/clicou | Baixo |
| 4 | **Exportar CSV com filtros avançados** | Segmentar base, limpar inativos, campanhas externas | Baixo |

Executar **nesta ordem** (1 → 2 → 3 → 4). Cada pilar é independente e pode ser
commitado/validado isoladamente. Não quebrar nada da Fase 2.

> **Princípio de não-regressão.** As sequências lineares atuais devem continuar
> funcionando idênticas. Todos os campos novos têm `DEFAULT` que reproduz o
> comportamento atual (`send_condition='always'`, `repeat=false`,
> `cycle_started_at = enrolled_at`, `hot_lead=false`).

---

## PILAR 1 — Sequências condicionais (ramificação por engajamento)

### 1.1 Conceito

Cada passo da sequência ganha uma **condição de envio** avaliada contra o que o
lead fez com os e-mails **anteriores da mesma inscrição**:

- `always` (padrão) — sempre envia.
- `if_opened` — só envia se o lead abriu **algum** e-mail anterior desta sequência.
- `if_not_opened` — só envia se **não** abriu nenhum anterior.
- `if_clicked` — só envia se clicou em algum link anterior.
- `if_not_clicked` — só envia se não clicou em nada.

**Como o usuário monta uma ramificação real** (ex.: "abriu → agradecimento;
não abriu → reengajamento"): cria **dois passos consecutivos com o mesmo
`delayDays`**, um com `if_opened` e outro com `if_not_opened`. O cron envia o
que casa e **pula** (sem gastar cota) o que não casa. Documentar isso no tooltip
da UI.

### 1.2 Schema — `server/db/schema.ts`

Em `emailSequenceSteps` adicionar:

```ts
sendCondition: text('send_condition').notNull().default('always'),
// always | if_opened | if_not_opened | if_clicked | if_not_clicked
```

### 1.3 Migração — `server/db/migrate.ts`

```sql
ALTER TABLE email_sequence_steps
  ADD COLUMN IF NOT EXISTS send_condition TEXT NOT NULL DEFAULT 'always';
```

### 1.4 Helper de engajamento por inscrição — `server/email/marketing.ts`

Adicionar função **batched** (evita N+1 no cron): dado um array de
`enrollmentId`, retorna por inscrição se houve `opened` e se houve `clicked`
em qualquer envio daquela inscrição. Reutilizar o padrão de join já usado em
`engagementByTaskIds` (sends → events via `message_id`).

```ts
// Retorna Map<enrollmentId, { opened: boolean; clicked: boolean }>
export async function enrollmentEngagementBatch(
  enrollmentIds: number[],
): Promise<Map<number, { opened: boolean; clicked: boolean }>>
```

Implementação (SQL único, usando o `sql` exportado de `../db`):

```sql
SELECT sd.enrollment_id,
  bool_or(e.event_type = 'opened')  AS opened,
  bool_or(e.event_type = 'clicked') AS clicked
FROM email_sequence_sends sd
INNER JOIN email_events e ON e.message_id = sd.message_id
WHERE sd.enrollment_id IN (...)
GROUP BY sd.enrollment_id
```

Inscrições sem nenhum evento não aparecem no resultado → tratar como
`{opened:false, clicked:false}`.

Função auxiliar pura (testável, sem DB):

```ts
export function conditionMet(
  condition: string,
  eng: { opened: boolean; clicked: boolean },
): boolean {
  switch (condition) {
    case 'if_opened':      return eng.opened;
    case 'if_not_opened':  return !eng.opened;
    case 'if_clicked':     return eng.clicked;
    case 'if_not_clicked': return !eng.clicked;
    case 'always':
    default:               return true;
  }
}
```

### 1.5 Cron — `api/index.ts` (`/api/cron/email-daily`)

Hoje, para cada inscrição devida, o cron pega `step = steps[currentStep]` e
envia **um** passo. Alterar para **avançar pulando passos cujas condições não
batem**, registrando-os como `skipped`, **sem gastar cota**:

1. Após carregar `dueEnrollments` e `stepsBySequence`, chamar **uma vez**
   `enrollmentEngagementBatch(dueEnrollments.map(e => e.id))` → `engMap`.
2. Para cada inscrição devida, **antes de montar a mensagem**, rodar um laço de
   "skip" (máx. 10 iterações p/ segurança):
   - `step = steps[enrollment.currentStep]`
   - se `!step` → marcar `completed` (ou loop, ver Pilar 2) e sair do laço.
   - `eng = engMap.get(enrollment.id) ?? {opened:false, clicked:false}`
   - se `conditionMet(step.sendCondition, eng)` → **enviar este passo** (segue o
     fluxo normal de montar `messages`/`batchMeta`).
   - senão → **pular**: inserir em `email_sequence_sends` uma linha
     `status='skipped'` (`messageId=null`), avançar `currentStep++`, recomputar
     `nextSendAt` (Pilar 2 usa `cycleStartedAt`), **continuar o laço** (avalia o
     próximo passo no mesmo run, sem consumir cota).
3. Só os passos efetivamente enviados entram em `messages`/`batchMeta` e
   contam para `pickAccount()`/`sendBatch`.

> **Importante:** o skip **não** chama Resend e **não** decrementa cota. Só
> passos com condição satisfeita disparam e-mail. Manter o early-exit por
> `quotaExhausted` exatamente como está para os envios reais.

Adicionar ao `summary`: `skipped` (contador de passos pulados).

### 1.6 Backend router — `server/routers/emailMarketing.ts`

- `upsertSequenceStep`: aceitar `sendCondition` no input (zod enum dos 5 valores,
  default `'always'`) e gravar.
- `listSequenceSteps`: já retorna `select()` completo → `sendCondition` vem junto.
- `sequenceStats`: adicionar coluna `skipped` por passo
  (`COUNT(*) FILTER (WHERE s.status='skipped')`).

### 1.7 Frontend — `client/src/pages/EmailMarketing.tsx`

No editor de passo (dentro de `SequenceDetailDialog`):
- `<Select>` "Condição de envio" com os 5 valores e rótulos PT:
  `Sempre` / `Se abriu algum anterior` / `Se NÃO abriu nenhum` /
  `Se clicou em algum` / `Se NÃO clicou em nenhum`.
- Tooltip/aviso explicando o padrão "dois passos com mesmo delay = ramificação".
- Na timeline de passos, badge da condição quando `!= always`
  (ex.: `🔀 se abriu`).
- Nos stats por passo, mostrar `pulados: N` ao lado de `enviados/abertos/clicados`.

---

## PILAR 2 — Sequências recorrentes (loop mensal)

### 2.1 Conceito

Uma sequência pode **repetir**: ao terminar o último passo, reinicia do passo 1
após um intervalo. Caso de uso: "todo mês um e-mail diferente de
conscientização de marca" — basta uma sequência com passos em `delayDays`
0/30/60/90… e `repeat=true`; ao acabar, recomeça.

### 2.2 Schema — `server/db/schema.ts`

Em `emailSequences` adicionar:

```ts
repeat: boolean('repeat').notNull().default(false),
repeatIntervalDays: integer('repeat_interval_days'), // gap antes de reiniciar o ciclo (nullable)
```

Em `emailSequenceEnrollments` adicionar:

```ts
cycleStartedAt: timestamp('cycle_started_at'), // base p/ computeNextSendAt; default = enrolledAt
```

### 2.3 Migração — `server/db/migrate.ts`

```sql
ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS repeat BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE email_sequences
  ADD COLUMN IF NOT EXISTS repeat_interval_days INTEGER;
ALTER TABLE email_sequence_enrollments
  ADD COLUMN IF NOT EXISTS cycle_started_at TIMESTAMP;
-- Backfill: inscrições antigas usam enrolled_at como base do ciclo.
UPDATE email_sequence_enrollments SET cycle_started_at = enrolled_at WHERE cycle_started_at IS NULL;
```

### 2.4 Base de tempo — `computeNextSendAt`

Hoje `computeNextSendAt(enrolledAt, steps, currentStep)` usa `enrolledAt` como
base. Passar a usar **`cycleStartedAt`** (que para inscrições novas e antigas é
inicializado = `enrolledAt`). **Não mudar a assinatura** — apenas passar
`enrollment.cycleStartedAt ?? enrollment.enrolledAt` no cron e em
`enrollInSequence` (onde hoje passa `enrolledAt`). Em `enrollInSequence`
(`server/email/automations.ts`), gravar `cycleStartedAt: enrolledAt` no insert.

### 2.5 Cron — lógica de loop

No ponto em que uma inscrição **não tem próximo passo** (`!step`), em vez de
sempre `completed`:

```ts
const seq = sequenceById.get(enrollment.sequenceId);
if (seq?.repeat) {
  const gap = seq.repeatIntervalDays ?? 0;
  const newCycleStart = new Date(now.getTime() + gap * 86400000);
  const nextSendAt = computeNextSendAt(newCycleStart, steps, 0);
  await db.update(emailSequenceEnrollments).set({
    currentStep: 0,
    cycleStartedAt: newCycleStart,
    nextSendAt,
    status: 'active',
    updatedAt: now,
  }).where(eq(emailSequenceEnrollments.id, enrollment.id));
} else {
  // marca completed (comportamento atual)
}
```

> Pré-carregar as sequências (`sequenceById`) junto com os passos, para saber
> `repeat`/`repeatIntervalDays` sem N+1. Um `select` por `inArray(sequenceIds)`.

> **Cota:** o loop respeita a mesma cota diária. Como o intervalo típico é
> 30 dias, o volume extra é desprezível. Manter `LIMIT 300` por execução.

### 2.6 Backend router

- `upsertSequence`: aceitar `repeat?: boolean` e `repeatIntervalDays?: number`
  (zod `.int().min(1).max(365).optional()`). Validar: se `repeat=true`,
  `repeatIntervalDays` deve estar definido (senão BAD_REQUEST).
- `listSequences`: já faz `select()` → novos campos vêm juntos.

### 2.7 Frontend — `EmailMarketing.tsx`

No formulário de criar/editar sequência (`SequencesTab` / dialog de sequência):
- `<Switch>` "Repetir continuamente (loop)".
- Quando ligado, `<Input type=number>` "Reiniciar a cada N dias" (default 30).
- Texto de ajuda: "Útil para e-mails recorrentes de marca. Ao terminar o último
  passo, a sequência recomeça do início após o intervalo."
- Na lista de sequências, badge `🔁 mensal` quando `repeat`.

---

## PILAR 3 — Lead scoring + alerta de lead quente

### 3.1 Conceito

Quando um lead **abre muito ou clica**, ele é um lead quente: o atendente deve
ligar **primeiro**. O webhook do Resend já recebe `opened`/`clicked` em tempo
real — vamos usar isso para **marcar a tarefa** automaticamente, sem cron e sem
custo.

**Regra de "quente":**
- **Clicou** em qualquer link → quente (sinal forte). 
- **Abriu ≥ 3 vezes** → quente (sinal médio; abertura é ruidosa por causa do
  Apple Mail Privacy, por isso o limiar 3).

**Ações ao virar quente:**
1. `tasks.hot_lead = true`
2. `tasks.last_engagement_at = now`
3. `priority = 'high'` (sobe no topo das listas)
4. Adicionar tag `🔥 quente` (reutilizar `addTagToTask`)
5. Se `reminder_date` for nulo ou já passou → `reminder_date = now`
   (faz a tarefa aparecer nos lembretes do atendente hoje)

### 3.2 Schema — `server/db/schema.ts`

Em `tasks` adicionar:

```ts
hotLead: boolean('hot_lead').notNull().default(false),
lastEngagementAt: timestamp('last_engagement_at'),
```

### 3.3 Migração — `server/db/migrate.ts`

```sql
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hot_lead BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_engagement_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS tasks_hot_lead_idx ON tasks (hot_lead) WHERE hot_lead = TRUE;
```

### 3.4 Helper — `server/email/automations.ts`

```ts
/**
 * Resolve o taskId de um message_id (campanha OU sequência) e, se o evento
 * indicar engajamento, marca a tarefa como lead quente. Nunca lança.
 */
export async function flagEngagementByMessageId(
  messageId: string,
  eventType: 'opened' | 'clicked',
): Promise<void>
```

Implementação:
1. Resolver `taskId` via o mesmo UNION de `engagementByTaskIds`, mas no sentido
   inverso (a partir de `message_id`):
   - `email_campaign_recipients` onde `message_id = ?` → `task_id`
   - UNION `email_sequence_sends sd JOIN email_sequence_enrollments en` onde
     `sd.message_id = ?` → `en.task_id`
   - Pegar o primeiro `task_id` não-nulo. Se nenhum → retornar (e-mail avulso).
2. Sempre setar `last_engagement_at = now`.
3. Determinar se deve marcar quente:
   - `eventType === 'clicked'` → quente.
   - `eventType === 'opened'` → contar opens da task (reusar join) `>= 3` → quente.
     Para não fazer query cara, contar via `email_events` desse messageId +
     histórico: simplificar — só `clicked` marca quente **na hora**; opens só
     atualizam `last_engagement_at`. (Decisão: clique = quente; abertura = morno.
     Mais simples, menos query, e clique é o sinal que importa pro telefonema.)
     → **Implementar apenas: `clicked` marca quente; `opened` só atualiza
     `last_engagement_at`.** (Limiar de opens fica como melhoria futura.)
4. Se quente: `update tasks set hot_lead=true, priority='high',
   last_engagement_at=now, reminder_date = COALESCE(NULLIF(reminder_date>now), now)`
   — em Drizzle, fazer em 2 passos se necessário; e chamar `addTagToTask(taskId,'🔥 quente')`.

> Tudo em `try/catch` silencioso. O webhook **já responde 200 antes** de
> processar, então isso roda "fire and forget" — nunca bloqueia o Resend.

### 3.5 Webhook — `api/index.ts` (`/api/resend-webhook`)

No `case 'email.opened'` / `'email.clicked'`, após inserir em `email_events`,
chamar (sem `await` que bloqueie a resposta — a resposta 200 já foi enviada):

```ts
await flagEngagementByMessageId(messageId, shortType as 'opened' | 'clicked');
```

(Como o handler já fez `res.status(200)` antes, manter o `await` aqui é ok —
estamos depois da resposta; envолver em try/catch próprio.)

### 3.6 Backend router

- `engagementByTaskIds` (já existe) — sem mudança; a UI continua usando.
- Adicionar `hotLeadsCount: protectedProcedure` → retorna `{ count }` de
  `tasks` com `hot_lead=true` visíveis ao usuário (respeitar `userTaskFilter`
  para não-admin, igual aos outros procedimentos de tasks). Usado no header.
- `tasks.list` já retorna `select()` completo → `hotLead`/`lastEngagementAt`
  vêm juntos para o frontend ordenar/filtrar.

### 3.7 Frontend — `client/src/pages/Tasks.tsx`

- **Destaque visual**: linha/card de tarefa com `hotLead` ganha selo
  `🔥 Lead quente` e leve realce (ex.: borda/fundo âmbar).
- **Filtro** "🔥 Só quentes" na barra de filtros.
- **Ordenação**: quando o filtro de quentes está ativo (ou sempre), tarefas
  `hotLead` aparecem primeiro. Reusar/estender a ordenação atual.
- **Contador no topo**: usar `hotLeadsCount` → "🔥 N leads quentes para
  contatar". Clicar aplica o filtro.
- Manter o badge de engajamento (`👁/🔗`) que já existe.

---

## PILAR 4 — Exportar CSV com filtros avançados

### 4.1 Conceito

Exportar e-mails/leads filtrados para CSV (campanhas externas, limpeza de base).
Filtros voltados ao fluxo de "contato recorrente": quem **não abriu**, quem
**não respondeu** (sem contato recente), quem é **quente**, por **tag**, por
**convertido ou não**, por **inatividade**.

> **Sem novo endpoint, sem storage.** O procedure retorna as linhas; o
> **frontend monta o CSV** (string) e dispara o download via `Blob`. Cap de
> `LIMIT 5000` para caber no tempo/memória da função Hobby.

### 4.2 Backend router — `server/routers/emailMarketing.ts`

```ts
exportLeads: adminProcedure
  .input(z.object({
    tags: z.array(z.string()).optional(),
    converted: z.enum(['yes','no']).optional(),
    engagement: z.enum(['opened','not_opened','clicked','not_clicked']).optional(),
    engagementWindowDays: z.number().int().min(1).max(365).optional().default(90),
    inactiveDays: z.number().int().min(1).max(365).optional(), // sem contato há N dias
    hotOnly: z.boolean().optional(),
    assignedTo: z.string().optional(),
    limit: z.number().int().min(1).max(5000).optional().default(5000),
  }))
  .query(async ({ input }) => { /* ... */ })
```

Retorno: array de
`{ name, email, phone?, tags, assignedTo, lastContactedAt, convertedAt, opens, clicks, lastEventAt }`.

Implementação (eficiência):
- Base: `select` de `tasks` com `WHERE email IS NOT NULL AND email <> ''`.
- `tags` → operador overlap `&&` (igual `buildAudience`).
- `converted` → `convertedAt IS NOT NULL` / `IS NULL`.
- `inactiveDays` → `COALESCE(last_contacted_at, created_at) < now - N`.
- `hotOnly` → `hot_lead = true`.
- `assignedTo` → `lower(assigned_to) = lower(?)`.
- Engajamento: fazer **uma** subconsulta agregando opens/clicks por `task_id`
  (mesmo UNION de `engagementByTaskIds`) com `LEFT JOIN`, e filtrar:
  - `opened` → `opens > 0`; `not_opened` → `COALESCE(opens,0)=0`
  - `clicked` → `clicks > 0`; `not_clicked` → `COALESCE(clicks,0)=0`
  - janela: events com `created_at >= now - engagementWindowDays`.
- `LIMIT input.limit`.

> O caso **"não abriu / não clicou"** é o filtro-chave para **limpeza de lista**
> (candidatos a remover) e para **reengajamento**. O caso **quente/clicou** é
> para priorizar telefonema.

### 4.3 Frontend — `client/src/pages/EmailMarketing.tsx`

Nova aba **"Exportar"** (ou seção dentro de Tags/Estatísticas):
- Formulário de filtros (tags multiselect, converted, engajamento + janela,
  inatividade, só quentes, atendente).
- Botão **"Pré-visualizar"** → mostra contagem + amostra (primeiras 20 linhas).
- Botão **"Baixar CSV"** → chama o procedure, monta CSV no cliente:
  ```ts
  const csv = [header, ...rows.map(toCsvLine)].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  // ﻿ = BOM p/ acento correto no Excel PT-BR
  // download via <a download> temporário
  ```
- Escapar campos com `"`/`;`/quebra de linha. Separador `;` (Excel PT-BR) ou `,`
  — usar `;` para abrir direto no Excel brasileiro.

---

## Arquivos tocados (resumo)

| Arquivo | Pilares | Mudança |
|---------|---------|---------|
| `server/db/schema.ts` | 1,2,3 | colunas novas em steps/sequences/enrollments/tasks |
| `server/db/migrate.ts` | 1,2,3 | `ALTER TABLE … ADD COLUMN IF NOT EXISTS` + 1 índice + backfill |
| `server/email/marketing.ts` | 1,2 | `enrollmentEngagementBatch`, `conditionMet`; base do `computeNextSendAt` |
| `server/email/automations.ts` | 2,3 | `cycleStartedAt` no insert; `flagEngagementByMessageId` |
| `api/index.ts` | 1,2,3 | cron: skip-loop condicional + loop de repeat; webhook: chamar flag |
| `server/routers/emailMarketing.ts` | 1,2,3,4 | inputs novos em upsertStep/upsertSequence; `sequenceStats.skipped`; `hotLeadsCount`; `exportLeads` |
| `client/src/pages/EmailMarketing.tsx` | 1,2,4 | condição no editor de passo; loop no form de sequência; aba Exportar |
| `client/src/pages/Tasks.tsx` | 3 | selo/filtro/ordenação de lead quente + contador |

**Não tocar:** nada do projeto Premium (`server/email/resend.ts`, landing,
`siteOrders`, `abandonedCarts`, recovery, shipping). `api/bundle.js` é gerado
pela Vercel — não commitar build local.

---

## Checklist de execução (ordem para o Sonnet)

- [ ] **1.** Schema: `send_condition` (steps); `repeat`+`repeat_interval_days`
      (sequences); `cycle_started_at` (enrollments); `hot_lead`+
      `last_engagement_at` (tasks) + types.
- [ ] **2.** `migrate.ts`: todos os `ALTER TABLE … IF NOT EXISTS`, índice
      `tasks_hot_lead_idx`, backfill de `cycle_started_at`.
- [ ] **3.** `marketing.ts`: `enrollmentEngagementBatch`, `conditionMet`; usar
      `cycleStartedAt` como base.
- [ ] **4.** `automations.ts`: gravar `cycleStartedAt` em `enrollInSequence`;
      implementar `flagEngagementByMessageId`.
- [ ] **5.** `api/index.ts` cron: pré-carregar sequências; skip-loop condicional
      (registra `skipped`, sem gastar cota); loop de repeat; `summary.skipped`.
- [ ] **6.** `api/index.ts` webhook: chamar `flagEngagementByMessageId` em
      opened/clicked (após o insert do evento, dentro de try/catch).
- [ ] **7.** `emailMarketing.ts`: `sendCondition` em upsertStep;
      `repeat`/`repeatIntervalDays` em upsertSequence (+ validação);
      `skipped` em sequenceStats; `hotLeadsCount`; `exportLeads`.
- [ ] **8.** `EmailMarketing.tsx`: condição no editor de passo + badges; loop no
      form de sequência; aba **Exportar** (filtros + preview + download CSV).
- [ ] **9.** `Tasks.tsx`: selo/realce de lead quente, filtro "🔥 só quentes",
      ordenação, contador no topo.
- [ ] **10.** `npx tsc --noEmit -p .` sem novos erros (baseline atual ~213 erros
      pré-existentes em `tests/`; não aumentar).
- [ ] **11.** `node node_modules/vite/bin/vite.js build client -c vite.config.ts`
      compila sem erro. **Reverter** `api/bundle.js` se o esbuild local mexer nele.
- [ ] **12.** Commit na branch `claude/busy-ritchie-WU8fG` + push.

### Validação antes do commit

- Sequência sem condições (tudo `always`) e sem `repeat` comporta-se **idêntica**
  à Fase 2 (não-regressão).
- Passo pulado por condição **não** chama Resend e **não** decrementa cota.
- Loop de repeat só dispara quando `repeat=true` e respeita `repeatIntervalDays`.
- Webhook continua respondendo 200 rápido; `flagEngagementByMessageId` nunca
  derruba o handler (try/catch).
- `exportLeads` respeita `LIMIT` e não faz N+1 (1 query com subconsulta agregada).
- CSV abre no Excel PT-BR com acentos corretos (BOM + separador `;`).
- Nenhum arquivo do Premium tocado.

---

## Riscos & mitigações (planos free)

| Risco | Mitigação |
|-------|-----------|
| Skip-loop infinito se dados inconsistentes | Cap de 10 iterações por inscrição/run |
| Avaliar condição por inscrição = N+1 no cron | `enrollmentEngagementBatch` = 1 query para todas as devidas |
| `email_events` podado em 90 dias afeta condições antigas | Sequências reais têm < 90 dias; condições olham engajamento recente — aceitável |
| Loop mensal cresce volume de envio | Limitado pela cota 90/conta/dia + `LIMIT 300`/run; intervalo típico 30d → volume desprezível |
| Aberturas ruidosas (Apple Mail) inflam "quente" | Só **clique** marca quente; abertura só atualiza `last_engagement_at` |
| Webhook fazendo update de task a cada evento | Volume baixo; 1 query de resolução + 1 update; após `res.status(200)`; try/catch |
| Export grande estoura função Hobby | `LIMIT 5000`, CSV montado no cliente, 1 query agregada |
| Migração em produção | Tudo `ADD COLUMN IF NOT EXISTS` + `DEFAULT` seguro; backfill idempotente |

---

## Fora de escopo (não fazer agora — evitar exagero)

- Construtor visual de fluxo (drag-and-drop tipo systeme.io) — alto custo, baixo
  retorno; o modelo "dois passos com condição" cobre a ramificação.
- Ramificar para **outra sequência** automaticamente — já é possível via
  automações + tag; não criar engine de salto entre sequências agora.
- A/B testing de assunto, agendamento por fuso por lead, score numérico
  multifatorial — melhorias futuras, não essenciais ao fluxo de telefonar para
  quem está quente.
