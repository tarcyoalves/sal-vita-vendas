import { describe, it, expect } from 'vitest';
import {
  sessionWorkedMs, todayWorkedMs, closeSessionValues, workedMsInDay, effectiveEndMs, isForgottenSession,
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

  it('sessão esquecida sem batimento não zera: fim = início + 8h (REG-2)', () => {
    const s = { status: 'active', startedAt: sp('2026-10-01T08:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-01T08:00:00') };
    expect(effectiveEndMs(s, now)).toBe(sp('2026-10-01T16:00:00').getTime());
    expect(sessionWorkedMs(s, now)).toBe(8 * H);
    expect(todayWorkedMs([s], now)).toBe(0);
    expect(closeSessionValues(s, now).endedAt.getTime()).toBe(sp('2026-10-01T16:00:00').getTime());
  });

  it('sessão esquecida com batimento às 16:40 termina em 16:40', () => {
    const s = { status: 'active', startedAt: sp('2026-10-01T08:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-01T16:40:00') };
    expect(effectiveEndMs(s, now)).toBe(sp('2026-10-01T16:40:00').getTime());
  });

  it('com batimento cedo (10:00) não infla até 8h', () => {
    const s = { status: 'active', startedAt: sp('2026-10-01T08:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-01T10:00:00') };
    expect(sessionWorkedMs(s, now)).toBe(2 * H);
  });

  it('sem sinal, o fim é limitado ao fim do dia de SP em que começou', () => {
    const s = { status: 'active', startedAt: sp('2026-10-01T20:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-01T20:00:00') };
    expect(effectiveEndMs(s, now)).toBe(sp('2026-10-02T00:00:00').getTime());
    expect(sessionWorkedMs(s, now)).toBe(4 * H);
  });

  it('sem sinal, meta diária maior que 8h estende o teto', () => {
    const s = { status: 'active', startedAt: sp('2026-10-01T06:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-01T06:00:00'), dailyGoalHours: 10 };
    expect(effectiveEndMs(s, now)).toBe(sp('2026-10-01T16:00:00').getTime());
  });

  it('sessão esquecida pausada termina na pausa e não soma pausa em curso', () => {
    const s = { status: 'paused', startedAt: sp('2026-10-01T08:00:00'), pausedAt: sp('2026-10-01T12:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-01T12:00:00') };
    expect(sessionWorkedMs(s, now)).toBe(4 * H);
    expect(closeSessionValues(s, now).totalPausedMs).toBe(0);
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

describe('isForgottenSession (REG-6)', () => {
  it('aberta de ontem sem sinal recente é esquecida; encerrada ou de hoje, não', () => {
    const ontem = { status: 'active', startedAt: sp('2026-10-05T08:00:00'), updatedAt: sp('2026-10-05T08:00:00') };
    expect(isForgottenSession(ontem, now)).toBe(true);
    expect(isForgottenSession({ ...ontem, status: 'paused' }, now)).toBe(true);
    expect(isForgottenSession({ ...ontem, status: 'ended' }, now)).toBe(false);
    expect(isForgottenSession({ ...ontem, endedAt: sp('2026-10-05T17:00:00') }, now)).toBe(false);
    expect(isForgottenSession({ status: 'active', startedAt: sp('2026-10-06T07:00:00') }, now)).toBe(false);
  });
  it('virou a meia-noite trabalhando (batimento recente): não é esquecida e conta até agora', () => {
    const s = { status: 'active', startedAt: sp('2026-10-05T22:00:00'), totalPausedMs: 0, updatedAt: sp('2026-10-06T08:55:00') };
    expect(isForgottenSession(s, now)).toBe(false);
    expect(effectiveEndMs(s, now)).toBe(now.getTime());
  });
});
