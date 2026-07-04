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
