// Cálculo de horas trabalhadas (sessões de trabalho). Funções puras — sem banco —
// para poderem ser testadas na virada de dia de São Paulo, com pausas e com
// sessões esquecidas abertas por dias.
import { spMidnight } from './tz';

type D = Date | string | number;

export interface WorkSessionLike {
  startedAt: D;
  endedAt?: D | null;
  pausedAt?: D | null;
  totalPausedMs?: number | null;
  status: string;
  updatedAt?: D | null;
}

const ms = (d: D) => new Date(d).getTime();

export function isOpenSession(s: Pick<WorkSessionLike, 'status'>): boolean {
  return s.status === 'active' || s.status === 'paused';
}

/**
 * Fim efetivo da sessão. Sessão aberta cujo dia de início (São Paulo) já passou é
 * esquecida (a pessoa fechou a aba e foi embora): não conta até "agora", só até o
 * último sinal de vida registrado (`updatedAt` = início/pausa/retomada).
 */
export function effectiveEndMs(s: WorkSessionLike, now: Date): number {
  if (s.endedAt) return ms(s.endedAt);
  const start = ms(s.startedAt);
  if (isOpenSession(s) && start < spMidnight(now).getTime()) {
    const last = s.updatedAt ? ms(s.updatedAt) : start;
    return Math.min(now.getTime(), Math.max(start, last));
  }
  return now.getTime();
}

/** Pausa total da sessão: acumulada + a pausa em curso (até o fim efetivo). */
export function totalPausedMsOf(s: WorkSessionLike, now: Date): number {
  let paused = s.totalPausedMs ?? 0;
  if (s.status === 'paused' && s.pausedAt) {
    paused += Math.max(0, effectiveEndMs(s, now) - ms(s.pausedAt));
  }
  return paused;
}

/** Tempo trabalhado da sessão inteira (independente do dia). */
export function sessionWorkedMs(s: WorkSessionLike, now: Date): number {
  const end = effectiveEndMs(s, now);
  return Math.max(0, end - ms(s.startedAt) - totalPausedMsOf(s, now));
}

/**
 * Parte da sessão que cai no dia [dayStart, dayEnd). A pausa é rateada pela
 * proporção do tempo da sessão que está dentro do dia (não há registro de em que
 * momento cada pausa ocorreu).
 */
export function workedMsInDay(s: WorkSessionLike, now: Date, dayStart: Date, dayEnd: Date): number {
  const start = ms(s.startedAt);
  const end = effectiveEndMs(s, now);
  const total = end - start;
  if (total <= 0) return 0;
  const overlap = Math.min(end, dayEnd.getTime()) - Math.max(start, dayStart.getTime());
  if (overlap <= 0) return 0;
  const paused = totalPausedMsOf(s, now);
  return Math.max(0, overlap - paused * (overlap / total));
}

/** Soma das horas de hoje (dia de São Paulo) de todas as sessões, inclusive encerradas. */
export function todayWorkedMs(sessions: WorkSessionLike[], now: Date): number {
  const dayStart = spMidnight(now);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  return Math.round(sessions.reduce((sum, s) => sum + workedMsInDay(s, now, dayStart, dayEnd), 0));
}

/**
 * Valores para encerrar uma sessão aberta: soma a pausa em curso (que antes era
 * descartada) e, se a sessão é de dia anterior, limita o fim ao último sinal de vida.
 */
export function closeSessionValues(s: WorkSessionLike, now: Date): { endedAt: Date; totalPausedMs: number } {
  const end = effectiveEndMs({ ...s, endedAt: null }, now);
  return { endedAt: new Date(end), totalPausedMs: totalPausedMsOf(s, now) };
}
