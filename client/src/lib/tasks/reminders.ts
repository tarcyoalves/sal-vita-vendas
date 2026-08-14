// Lógica de lembretes do CRM — pura, sem React e sem rede, para ser testável.
//
// O lembrete NÃO é uma entidade própria: é um campo da tarefa
// (`tasks.reminderDate` + `tasks.reminderEnabled`), servido por
// `tasks.reminders` e consumido pelo AdminDashboard e pelo
// useReminderNotifications. A tabela `reminders` do schema é legado sem tela
// (ver o comentário dela em server/db/schema.ts).
//
// Estas funções foram extraídas de dentro dos componentes justamente porque a
// suíte antiga (tests/reminders.test.ts) reimplementava os filtros em arrays
// locais: passava verde sem tocar em uma linha do código de produção. Agora o
// teste chama daqui, e mudar a regra no componente quebra o teste.

/** Forma mínima devolvida por `tasks.reminders` (o select é enxuto de propósito). */
export interface ReminderRow {
  id: number;
  title: string;
  reminderDate: Date | string | null;
  reminderEnabled?: boolean | null;
  status: string;
  notes?: string | null;
  assignedTo?: string | null;
}

/** Valor do dropdown do dashboard: tudo, só o que não tem responsável, ou um nome. */
export type ReminderFilter = 'all' | '__admin__' | (string & {});

export const ADMIN_FILTER = '__admin__';

/** Máximo exibido por categoria (atrasados / próximos) no dashboard. */
export const DASHBOARD_CATEGORY_LIMIT = 5;

/**
 * Converte o campo em Date, ou null se ausente/inválido.
 *
 * A API devolve Date (superjson) mas o cache pode entregar string; e um valor
 * corrompido não pode virar `Invalid Date` solto, senão toda comparação de
 * data vira false silenciosamente.
 */
export function parseReminderDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Data local a partir de "YYYY-MM-DD" + "HH:mm" — nunca via `toISOString()`.
 *
 * É a armadilha que já mordeu este projeto: `toISOString()` converte para UTC,
 * e em UTC-3 o lembrete das 00h de um dia reaparece no dia anterior. O
 * construtor `new Date('2026-04-20T14:30:00')` (sem sufixo Z) é interpretado
 * como hora local, que é o que o atendente digitou.
 */
export function buildLocalReminderDate(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return isNaN(d.getTime()) ? null : d;
}

/** Inverso de buildLocalReminderDate: Date → campos do formulário, em hora local. */
export function toReminderFormFields(
  value: Date | string | null | undefined,
  fallbackTime = '09:00',
): { reminderDate: string; reminderTime: string } {
  const d = parseReminderDate(value);
  if (!d) return { reminderDate: '', reminderTime: fallbackTime };
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    reminderDate: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    reminderTime: `${p(d.getHours())}:${p(d.getMinutes())}`,
  };
}

/** Filtro do dropdown do dashboard. `__admin__` = sem responsável definido. */
export function matchesReminderFilter(r: ReminderRow, filter: ReminderFilter): boolean {
  if (filter === 'all') return true;
  if (filter === ADMIN_FILTER) return !r.assignedTo || r.assignedTo.trim() === '';
  return r.assignedTo === filter;
}

/** Aplica o filtro e ordena por data crescente (sem data vai para o fim). */
export function filterAndSortReminders(rows: ReminderRow[], filter: ReminderFilter): ReminderRow[] {
  return rows
    .filter((r) => matchesReminderFilter(r, filter))
    .sort((a, b) => {
      const da = parseReminderDate(a.reminderDate);
      const db = parseReminderDate(b.reminderDate);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da.getTime() - db.getTime();
    });
}

/**
 * Atrasado: venceu e ainda está pendente. Concluído nunca é atrasado.
 * O limite é `<= now` (e não `<`) para casar com o dashboard.
 */
export function isOverdue(r: ReminderRow, now: Date = new Date()): boolean {
  const d = parseReminderDate(r.reminderDate);
  return d != null && d.getTime() <= now.getTime() && r.status === 'pending';
}

/** Próximo: ainda vai vencer e está pendente. */
export function isUpcoming(r: ReminderRow, now: Date = new Date()): boolean {
  const d = parseReminderDate(r.reminderDate);
  return d != null && d.getTime() > now.getTime() && r.status === 'pending';
}

/**
 * O que o card de lembretes do dashboard mostra: as duas listas já ordenadas,
 * com as contagens completas (o badge conta tudo, a lista mostra até 5).
 */
export function splitDashboardReminders(
  rows: ReminderRow[],
  filter: ReminderFilter,
  now: Date = new Date(),
  limit: number = DASHBOARD_CATEGORY_LIMIT,
) {
  const sorted = filterAndSortReminders(rows, filter);
  const overdue = sorted.filter((r) => isOverdue(r, now));
  const upcoming = sorted.filter((r) => isUpcoming(r, now));
  return {
    filtered: sorted,
    overdue: overdue.slice(0, limit),
    upcoming: upcoming.slice(0, limit),
    overdueCount: overdue.length,
    upcomingCount: upcoming.length,
  };
}

/**
 * Quem pode gerar alerta sonoro/notificação para este usuário.
 *
 * Atendente recebe o que a query já devolveu (o servidor filtra por
 * `userTaskFilter`). Admin vê tudo na query, então recebe alerta só do que está
 * atribuído a ele — senão o admin seria bombardeado pelos lembretes da equipe.
 */
export function alertableReminders(
  rows: ReminderRow[],
  userName: string,
  isAdmin: boolean,
): ReminderRow[] {
  if (!isAdmin) return rows;
  return rows.filter((r) => r.assignedTo === userName);
}

export type ReminderAlertKind = 'overdue' | 'warn' | 'fire' | null;

/** Janelas de disparo, em milissegundos de diferença até o lembrete. */
export const ALERT_WINDOWS = {
  /** Mais de 1 min no passado → atrasado. */
  overdueBefore: -60_000,
  /** Entre 1 e 5 min no futuro → aviso prévio. */
  warnFrom: 60_000,
  warnTo: 300_000,
  /**
   * Limite inferior nominal da janela "é a hora".
   *
   * ATENÇÃO: os -2 min nunca são alcançados. `overdue` é checado primeiro e
   * captura tudo abaixo de -60s, então a janela efetiva de `fire` é
   * -60s..+60s. O comentário original no hook dizia "janela de ±2 minutos para
   * não perder", o que descreve uma intenção que o código não cumpre: um
   * lembrete 90s atrasado sai como "Atrasada", não como "Lembrete".
   *
   * Mantido como está para não mudar o que o atendente vê hoje. Para valer de
   * verdade, `overdueBefore` teria de ir para -120_000.
   */
  fireFrom: -120_000,
  fireTo: 60_000,
} as const;

/**
 * Que alerta este lembrete merece agora, se algum.
 *
 * Espelha a cascata do useReminderNotifications: desabilitado, não-pendente ou
 * sem data nunca alerta; atrasado tem prioridade; depois a hora exata; por
 * fim o aviso prévio.
 */
export function classifyAlert(r: ReminderRow, now: Date = new Date()): ReminderAlertKind {
  if (r.reminderEnabled === false) return null;
  if (r.status !== 'pending') return null;
  const d = parseReminderDate(r.reminderDate);
  if (!d) return null;

  const diff = d.getTime() - now.getTime();
  if (diff < ALERT_WINDOWS.overdueBefore) return 'overdue';
  if (diff >= ALERT_WINDOWS.fireFrom && diff <= ALERT_WINDOWS.fireTo) return 'fire';
  if (diff > ALERT_WINDOWS.warnFrom && diff <= ALERT_WINDOWS.warnTo) return 'warn';
  return null;
}

/**
 * Chave de dedupe do alerta — o que impede o mesmo lembrete de tocar em loop.
 *
 * Atrasado usa o dia (toca uma vez por dia enquanto não for resolvido); os
 * outros usam o timestamp do lembrete (reagendar gera chave nova e volta a
 * poder tocar).
 */
export function alertKey(r: ReminderRow, kind: Exclude<ReminderAlertKind, null>, now: Date = new Date()): string {
  if (kind === 'overdue') return `${r.id}-overdue-${now.toDateString()}`;
  const d = parseReminderDate(r.reminderDate);
  return `${r.id}-${kind}-${d ? d.getTime() : 'na'}`;
}
