# Lembretes do CRM — como funciona

Atualizado em 13/08/2026. Antes deste arquivo existia uma versão que descrevia
código que já não existia (um `tasks.reminders` com `tasks.reminderDate.isNotNull()`,
que não é a API do Drizzle) e apontava para
`.claude/skills/reminder-management.md`, que nunca esteve no repositório. Se algo
aqui divergir do código, o código manda.

## O modelo: lembrete é campo da tarefa

Não existe entidade "lembrete". O que existe é a tarefa com data:

- `tasks.reminderDate` — quando avisar (timestamp, hora local)
- `tasks.reminderEnabled` — se avisa (tarefa pode existir sem lembrete ativo)
- `tasks.status` — só `pending` alerta
- `tasks.assignedTo` — nome do atendente responsável (texto, não FK)

> A tabela `reminders` no schema é **legado sem tela**. O router que a servia
> (`trpc.reminders.*`) não tinha um único consumidor e foi removido em 13/08. A
> tabela ficou porque pode ter linhas antigas em produção. Não escreva nela;
> para criar funcionalidade de lembrete, estenda `tasks`.

## Onde está cada coisa

| Arquivo | Papel |
|---|---|
| `client/src/lib/tasks/reminders.ts` | **Toda a lógica**: parse de data, filtro, classificação, janelas de alerta, dedupe. Puro, sem React nem rede. |
| `server/routers/tasks.ts` → `reminders` | Query. Admin vê todos; atendente vê os seus (via `userTaskFilter`). Só de ontem em diante, teto de 300 linhas. |
| `client/src/pages/AdminDashboard.tsx` | Card "Lembretes" com dropdown de filtro. Chama `splitDashboardReminders`. |
| `client/src/_core/hooks/useReminderNotifications.ts` | Efeitos: toast, beep, `Notification`. Chama `classifyAlert` / `alertKey`. |
| `client/src/pages/Tasks.tsx` | Formulário. Chama `buildLocalReminderDate` / `toReminderFormFields`. |
| `tests/reminders.test.ts` | 42 casos sobre o módulo acima. |

A lógica foi extraída para o módulo justamente porque, quando morava dentro dos
componentes, o teste não conseguia alcançá-la — e a suíte antiga acabou testando
uma reimplementação dela.

## Data local — a armadilha

`toISOString()` converte para UTC. Em UTC-3, o lembrete de `2026-04-20T00:00`
volta como dia 19. Use sempre as funções do módulo:

```ts
buildLocalReminderDate('2026-04-20', '14:30')  // formulário → Date local
toReminderFormFields(task.reminderDate)        // Date → { reminderDate, reminderTime }
```

O construtor `new Date('2026-04-20T14:30:00')` (sem `Z`) já interpreta como hora
local — é isso que as funções usam por dentro. O teste cobre a ida e volta em
`00:00`, `23:59` e dias/meses de um dígito.

## Classificação no dashboard

```
atrasado  = reminderDate <= agora  &&  status === 'pending'
próximo   = reminderDate >  agora  &&  status === 'pending'
```

`<=` (e não `<`) para o lembrete do minuto exato não ficar fora das duas listas.
Concluído e cancelado não entram em nenhuma. Cada categoria lista no máximo 5,
mas o badge mostra a contagem completa — são valores diferentes de propósito
(`overdue` vs `overdueCount`).

Filtro do dropdown: `all` (tudo), `__admin__` (sem responsável), ou o nome do
atendente (comparação exata, sensível a caixa).

## Janelas de alerta

| Diferença até o lembrete | Alerta |
|---|---|
| < -60s | `overdue` — "Atrasada", uma vez por dia |
| -60s a +60s | `fire` — "Lembrete", com beep |
| +60s a +5min | `warn` — aviso prévio |
| > +5min | nenhum |

**`ALERT_WINDOWS.fireFrom` é -120s, mas nunca é alcançado:** `overdue` é
avaliado primeiro e captura tudo abaixo de -60s. O comentário original no hook
dizia "janela de ±2 minutos para não perder", o que descreve uma intenção que o
código não cumpre — 90s atrasado sai como "Atrasada", não como "Lembrete". O
comportamento foi mantido; mudar é decisão de produto (`overdueBefore` teria de
ir para -120_000).

Quem recebe: atendente recebe tudo que a query devolveu (o servidor já filtrou);
admin recebe só o que está atribuído a ele, senão levaria os alertas da equipe
toda.

Dedupe por `sessionStorage` (`sv_notified_v3`): `overdue` usa a chave do dia
(toca uma vez por dia); `warn`/`fire` usam o timestamp do lembrete, então
reagendar libera o alerta de novo.

## Rodar os testes

```bash
npm test
```

`TZ` está fixo em `America/Sao_Paulo` no `vitest.config.ts` — sem isso o CI
(que roda em UTC) daria resultado diferente nos testes de data. Os testes rodam
no workflow `Typecheck e Testes`, que é pré-requisito do `deploy-vercel.yml`.

## Limitações conhecidas

1. **Um fuso só.** A hora é gravada sem offset; se o usuário viajar, o lembrete
   toca no horário do fuso de origem. Resolver exige guardar UTC + offset.
2. **Notificação só com a aba aberta.** Precisaria de service worker com push
   para alertar em background — o PWA já tem SW, mas não faz push.
3. **Beep depende de interação.** O browser bloqueia autoplay até o usuário
   clicar em algo na página.
4. **`assignedTo` é texto livre.** Renomear um atendente órfã os lembretes dele;
   não há FK (ver pendência 9 do `ESTADO-DO-PROJETO.md`).
