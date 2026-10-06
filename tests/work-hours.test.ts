import { describe, it, expect } from 'vitest';
import {
  sessionWorkedMs, todayWorkedMs, closeSessionValues, workedMsInDay, effectiveEndMs,
} from '../server/lib/workHours';

const H = 3600000;
// 2026-10-06 12:00 UTC = 09:00 em São Paulo (dia 06)
const now = new Date('2026-10-06T12:00:00Z');
const sp = (iso: string) => new Date(`${iso}-03:00`);

describe('work hours', () => {
  it('soma sessão encerrada descontando a pausa', () => {
    const s = { status: 'ended', startedAt: sp('2026-10-06T06:00:00'), endedAt: sp('2026-10-06T08:00:00'), totalPausedMs: H / 2 };
    expect(sessionWorkedMs(s, now)).toBe(1.5 * H);
  });

  it('pausa em curso conta até agora e não é descartada', () => {
    const s = { status: 'paused', startedAt: sp('2026-10-06T06:00:00'), pausedAt: sp('2026-10-06T08:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-06T08:00:00') };
    expect(sessionWorkedMs(s, now)).toBe(2 * H);
    expect(closeSessionValues(s, now).totalPausedMs).toBe(H);
  });

  it('hoje = manhã encerrada + sessão nova (encerrar e reiniciar não zera)', () => {
    const manha = { status: 'ended', startedAt: sp('2026-10-06T06:00:00'), endedAt: sp('2026-10-06T07:00:00'), totalPausedMs: 0 };
    const nova = { status: 'active', startedAt: sp('2026-10-06T08:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-06T08:00:00') };
    expect(todayWorkedMs([manha, nova], now)).toBe(2 * H);
  });

  it('sessão que cruzou a meia-noite de SP só conta a parte de hoje', () => {
    const s = { status: 'ended', startedAt: sp('2026-10-05T22:00:00'), endedAt: sp('2026-10-06T02:00:00'), totalPausedMs: 0 };
    expect(todayWorkedMs([s], now)).toBe(2 * H);
    expect(sessionWorkedMs(s, now)).toBe(4 * H);
  });

  it('vira o dia pelo fuso de SP e não pelo UTC (23h SP ainda é o mesmo dia)', () => {
    const late = new Date('2026-10-07T02:30:00Z'); // 23:30 SP do dia 06
    const s = { status: 'ended', startedAt: sp('2026-10-06T21:00:00'), endedAt: sp('2026-10-06T23:00:00'), totalPausedMs: 0 };
    expect(todayWorkedMs([s], late)).toBe(2 * H);
  });

  it('pausa é rateada na parte de hoje', () => {
    const s = { status: 'ended', startedAt: sp('2026-10-05T22:00:00'), endedAt: sp('2026-10-06T02:00:00'), totalPausedMs: 2 * H };
    // 4h de sessão, 2h de pausa, metade dentro de hoje: 2h - 1h
    expect(todayWorkedMs([s], now)).toBe(H);
  });

  it('sessão esquecida aberta há dias não acumula horas até agora', () => {
    const s = { status: 'active', startedAt: sp('2026-10-01T08:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-01T08:00:00') };
    expect(effectiveEndMs(s, now)).toBe(sp('2026-10-01T08:00:00').getTime());
    expect(sessionWorkedMs(s, now)).toBe(0);
    expect(todayWorkedMs([s], now)).toBe(0);
    const v = closeSessionValues(s, now);
    expect(v.endedAt.getTime()).toBe(sp('2026-10-01T08:00:00').getTime());
  });

  it('sessão aberta de ontem com último sinal hoje conta só até esse sinal', () => {
    const s = { status: 'active', startedAt: sp('2026-10-05T22:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-06T01:00:00') };
    expect(todayWorkedMs([s], now)).toBe(H);
  });

  it('sessão aberta de hoje corre até agora', () => {
    const s = { status: 'active', startedAt: sp('2026-10-06T07:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-06T07:00:00') };
    expect(workedMsInDay(s, now, sp('2026-10-06T00:00:00'), sp('2026-10-07T00:00:00'))).toBe(2 * H);
  });
});
