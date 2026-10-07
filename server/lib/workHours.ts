// Cálculo de horas trabalhadas (sessões de trabalho). Funções puras — sem banco —
// para poderem ser testadas na virada de dia de São Paulo, com pausas e com
// sessões esquecidas abertas por dias.
import { spMidnight } from './tz';

/** Folga para o relógio do banco vs. o do servidor: updatedAt <= início + isto não é sinal de vida. */
const SIGNAL_EPSILON_MS = 60_000;
/** Sem batimento (a cada 5 min) por este tempo, a sessão de dia anterior é tida como esquecida. */
const STALE_SIGNAL_MS = 15 * 60_000;

type D = Date | string | number;

export interface WorkSessionLike {
  startedAt: D;
  endedAt?: D | null;
  pausedAt?: D | null;
  totalPausedMs?: number | null;
  status: string;
  updatedAt?: D | null;
  dailyGoalHours?: number | null;
}

const ms = (d: D) => new Date(d).getTime();

export function isOpenSession(s: Pick<WorkSessionLike, 'status'>): boolean {
  return s.status === 'active' || s.status === 'paused';
}

/**
 * Sessão aberta de dia anterior (SP) sem sinal de vida recente: foi esquecida aberta.
 * Quem trabalha atravessando a meia-noite com a aba aberta mantém o batimento e não
 * é tido como esquecido.
 */
export function isForgottenSession(
  s: Pick<WorkSessionLike, 'status' | 'startedAt' | 'endedAt' | 'updatedAt'>, now: Date,
): boolean {
  if (s.endedAt || !isOpenSession(s)) return false;
  const start = ms(s.startedAt);
  if (start >= spMidnight(now).getTime()) return false;
  const last = s.updatedAt ? Math.max(start, ms(s.updatedAt)) : start;
  return now.getTime() - last > STALE_SIGNAL_MS;
}

/**
 * Fim efetivo da sessão. Sessão aberta cujo dia de início (São Paulo) já passou é
 * esquecida (a pessoa fechou a aba e foi embora) e não conta até "agora":
 *  - COM sinal de vida (`updatedAt` depois do início: batimento a cada 5 min enquanto
 *    a aba está visível, pausa ou retomada) o fim é esse último sinal;
 *  - SEM nenhum sinal (updatedAt == início; ex.: nunca clicou em "Finalizar" e a aba
 *    ficou oculta) o fim é o menor entre o fim do dia de SP em que começou e
 *    início + max(meta diária, 8) h. Nunca zera por falta de sinal e nunca fica
 *    abaixo do último sinal.
 */
export function effectiveEndMs(s: WorkSessionLike, now: Date): number {
  if (s.endedAt) return ms(s.endedAt);
  const start = ms(s.startedAt);
  if (isForgottenSession(s, now)) {
    const last = s.updatedAt ? Math.max(start, ms(s.updatedAt)) : start;
    if (last - start > SIGNAL_EPSILON_MS) return Math.min(now.getTime(), last);
    const dayEnd = spMidnight(new Date(start)).getTime() + 86400000;
    const maxMs = Math.max(s.dailyGoalHours ?? 8, 8) * 3600000;
    return Math.min(now.getTime(), Math.max(last, Math.min(dayEnd, start + maxMs)));
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
