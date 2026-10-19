import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { expedienteAberto, EXPEDIENTE_PADRAO } from '../shared/expediente';

// Fortaleza = UTC-3 o ano todo (sem horário de verão).
const fz = (hhmm: string, dia = '2026-10-19') => new Date(`${dia}T${hhmm}:00-03:00`);

describe('expedienteAberto (padrão 07:00-19:00)', () => {
  it('padrão documentado', () => expect(EXPEDIENTE_PADRAO).toBe('07:00-19:00'));

  it.each([
    ['00:00', false], ['06:59', false], ['07:00', true], ['12:00', true],
    ['18:59', true], ['19:00', false], ['23:59', false],
  ])('%s => %s', (h, esperado) => {
    expect(expedienteAberto(fz(h))).toBe(esperado);
  });

  it('meia-noite local é fechado', () => {
    expect(expedienteAberto(new Date('2026-10-20T00:00:00-03:00'))).toBe(false);
  });

  it('usa a hora LOCAL: 02:00 UTC de 20/10 ainda é 23:00 de 19/10 em Fortaleza', () => {
    expect(expedienteAberto(new Date('2026-10-20T02:00:00Z'))).toBe(false);
    // 10:00 UTC = 07:00 local abre; 21:59 UTC = 18:59 local aberto; 22:00 UTC = 19:00 fechado
    expect(expedienteAberto(new Date('2026-10-19T10:00:00Z'))).toBe(true);
    expect(expedienteAberto(new Date('2026-10-19T21:59:00Z'))).toBe(true);
    expect(expedienteAberto(new Date('2026-10-19T22:00:00Z'))).toBe(false);
  });

  it('vazio/undefined/null = padrão', () => {
    for (const c of [undefined, null, '', '   ']) {
      expect(expedienteAberto(fz('06:59'), c)).toBe(false);
      expect(expedienteAberto(fz('07:00'), c)).toBe(true);
    }
  });

  it('config própria e várias faixas', () => {
    expect(expedienteAberto(fz('08:00'), '08:00-12:00,14:00-18:00')).toBe(true);
    expect(expedienteAberto(fz('13:00'), '08:00-12:00,14:00-18:00')).toBe(false);
  });

  it('"sempre" nunca pausa (qualquer caixa)', () => {
    expect(expedienteAberto(fz('03:00'), 'sempre')).toBe(true);
    expect(expedienteAberto(fz('03:00'), 'SEMPRE')).toBe(true);
  });

  it('config inválida => fail open', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const c of ['lixo-exp', '25:00-26:00', '19:00-07:00', '07:00']) {
      expect(expedienteAberto(fz('03:00'), c)).toBe(true);
    }
    warn.mockRestore();
  });

  it('todos os dias por padrão (sábado e domingo)', () => {
    expect(expedienteAberto(fz('09:00', '2026-10-17'))).toBe(true); // sábado
    expect(expedienteAberto(fz('09:00', '2026-10-18'))).toBe(true); // domingo
  });

  it('parâmetro de dias: só seg-sex fecha o fim de semana', () => {
    const util = [1, 2, 3, 4, 5];
    expect(expedienteAberto(fz('09:00', '2026-10-19'), undefined, util)).toBe(true);  // segunda
    expect(expedienteAberto(fz('09:00', '2026-10-17'), undefined, util)).toBe(false); // sábado
    expect(expedienteAberto(fz('09:00', '2026-10-18'), undefined, util)).toBe(false); // domingo
    expect(expedienteAberto(fz('09:00', '2026-10-18'), 'sempre', util)).toBe(true);   // sem portão
  });

  it('dia da semana vem do fuso local, não do UTC', () => {
    const t = new Date('2026-10-18T02:30:00Z'); // sáb 23:30 local, dom 02:30 UTC
    expect(expedienteAberto(t, '23:00-23:59', [6])).toBe(true);
    expect(expedienteAberto(t, '23:00-23:59', [0])).toBe(false);
  });
});

// Fixa os pontos de polling: quem remover o portão do expediente reprova o build.
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('pontos de polling usam o expediente', () => {
  it.each([
    ['client/src/components/faturamento/SmbiRoboPanel.tsx', /refetchInterval: expediente \? 60_000 : false/],
    ['client/src/components/AppShell.tsx', /refetchInterval: expediente \? 120_000 : false/],
    ['client/src/components/AppShell.tsx', /refetchInterval: expediente \? 60_000 : false/],
    ['client/src/pages/AdminDashboard.tsx', /refetchInterval: expediente \? 60_000 : false/],
    ['client/src/components/ActiveTimer.tsx', /refetchInterval: expediente \? 180_000 : false/],
    ['client/src/_core/hooks/useReminderNotifications.ts', /refetchInterval: expediente \? 300_000 : 900_000/],
    ['client/src/pages/TvDashboard.tsx', /refetchInterval: consulta \? 120_000 : false/],
    ['client/src/pages/TvDashboard.tsx', /refetchInterval: consulta \? 600_000 : false/],
  ])('%s', (arq, re) => {
    expect(src(arq)).toMatch(re);
    expect(src(arq)).toContain('useExpediente');
  });

  it('heartbeat do ActiveTimer NÃO é pausado pelo expediente (protege sessão ativa)', () => {
    const t = src('client/src/components/ActiveTimer.tsx');
    expect(t).toMatch(/setInterval\(beat, 5 \* 60_000\)/);
    expect(t).toMatch(/if \(sessionStatus !== 'active'\) return;/);
  });

  it('Painel TV é desligado por padrão (só VITE_TV_PAINEL_ATIVO=1 liga)', () => {
    expect(src('client/src/lib/tvPainel.ts')).toMatch(/=== '1'/);
    expect(src('client/src/pages/TvDashboard.tsx')).toContain('Painel TV desligado');
  });
});
