// Fronteiras de "dia" sempre no horário de Brasília — nunca no fuso do
// processo Node (Vercel roda em UTC). Sem isso, "hoje" no servidor vira
// meia-noite UTC, que é 21h em Brasília: qualquer contagem "hoje" parece
// zerar 3h antes da meia-noite local de verdade.
//
// Brasil não tem mais horário de verão desde fev/2019 — offset fixo -03:00,
// então não é preciso consultar a tz-database para calcular o offset vigente.
const SP_TZ = 'America/Sao_Paulo';

/** 'YYYY-MM-DD' como visto em São Paulo, não no fuso do processo. */
export function spDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/** Meia-noite (00:00:00.000 -03:00) do dia de calendário em São Paulo que contém `d`. */
export function spMidnight(d: Date = new Date()): Date {
  return new Date(`${spDateStr(d)}T00:00:00-03:00`);
}

/** Último instante (23:59:59.999 -03:00) do dia de calendário em São Paulo que contém `d`. */
export function spEndOfDay(d: Date = new Date()): Date {
  return new Date(spMidnight(d).getTime() + 86400000 - 1);
}

/** Meia-noite de São Paulo, `days` dias atrás. */
export function spDaysAgo(days: number, from: Date = new Date()): Date {
  return spMidnight(new Date(from.getTime() - days * 86400000));
}

/** Dia da semana em São Paulo (0 = domingo … 6 = sábado), não no fuso do processo. */
export function spWeekday(d: Date = new Date()): number {
  const [y, m, day] = spDateStr(d).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

/** Mesmo instante, um dia útil (seg–sex, em São Paulo) depois de `d`. */
export function spNextBusinessDay(d: Date): Date {
  const next = new Date(d.getTime() + 86400000);
  while (spWeekday(next) === 0 || spWeekday(next) === 6) next.setTime(next.getTime() + 86400000);
  return next;
}

/** 'HH:mm' em São Paulo. */
export function spHHmm(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: SP_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}

/** 'dd/MM' em São Paulo. */
export function spDDMM(d: Date): string {
  const [, m, day] = spDateStr(d).split('-');
  return `${day}/${m}`;
}
