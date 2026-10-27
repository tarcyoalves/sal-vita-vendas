import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { expedienteAberto, EXPEDIENTE_PADRAO } from '../shared/expediente';

// Fortaleza = UTC-3 o ano todo (sem horário de verão).
const fz = (hhmm: string, dia = '2026-10-19') => new Date(`${dia}T${hhmm}:00-03:00`);

describe('expedienteAberto (padrão seg-sex 07:30-18:30, sáb 08:00-12:00, dom fechado)', () => {
  it('padrão documentado', () => expect(EXPEDIENTE_PADRAO).toContain('07:30-18:30'));

  it.each([
    ['00:00', false], ['07:29', false], ['07:30', true], ['12:00', true],
    ['18:29', true], ['18:30', false], ['19:00', false], ['23:59', false],
  ])('segunda %s => %s', (h, esperado) => {
    expect(expedienteAberto(fz(h))).toBe(esperado);
  });

  it.each([
    ['07:59', false], ['08:00', true], ['11:59', true], ['12:00', false], ['15:00', false],
  ])('sábado %s => %s', (h, esperado) => {
    expect(expedienteAberto(fz(h, '2026-10-17'))).toBe(esperado);
  });

  it('domingo fechado o dia todo', () => {
    for (const h of ['00:00', '08:00', '10:00', '15:00']) expect(expedienteAberto(fz(h, '2026-10-18'))).toBe(false);
  });

  it('meia-noite local é fechado', () => {
    expect(expedienteAberto(new Date('2026-10-20T00:00:00-03:00'))).toBe(false);
  });

  it('usa a hora LOCAL: 02:00 UTC de 20/10 ainda é 23:00 de 19/10 em Fortaleza', () => {
    expect(expedienteAberto(new Date('2026-10-20T02:00:00Z'))).toBe(false);
    // 10:30 UTC = 07:30 local abre; 21:29 UTC = 18:29 local aberto; 21:30 UTC = 18:30 fechado
    expect(expedienteAberto(new Date('2026-10-19T10:30:00Z'))).toBe(true);
    expect(expedienteAberto(new Date('2026-10-19T21:29:00Z'))).toBe(true);
    expect(expedienteAberto(new Date('2026-10-19T21:30:00Z'))).toBe(false);
  });

  it('vazio/undefined/null = padrão', () => {
    for (const c of [undefined, null, '', '   ']) {
      expect(expedienteAberto(fz('07:29'), c)).toBe(false);
      expect(expedienteAberto(fz('07:30'), c)).toBe(true);
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

  it('VITE_EXPEDIENTE com faixas vale todos os dias (sobrescreve o padrão)', () => {
    expect(expedienteAberto(fz('09:00', '2026-10-18'), '07:00-19:00')).toBe(true); // domingo
    expect(expedienteAberto(fz('18:45', '2026-10-19'), '07:00-19:00')).toBe(true);
  });

  it('parâmetro de dias: só seg-sex fecha o fim de semana', () => {
    const util = [1, 2, 3, 4, 5];
    expect(expedienteAberto(fz('09:00', '2026-10-19'), '07:00-19:00', util)).toBe(true);  // segunda
    expect(expedienteAberto(fz('09:00', '2026-10-17'), '07:00-19:00', util)).toBe(false); // sábado
    expect(expedienteAberto(fz('09:00', '2026-10-18'), '07:00-19:00', util)).toBe(false); // domingo
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

describe('pontos de polling usam usuário ativo E expediente', () => {
  it.each([
    ['client/src/components/faturamento/SmbiRoboPanel.tsx', /refetchInterval: ativo && expediente \? 300_000 : false/],
    ['client/src/components/AppShell.tsx', /refetchInterval: ativo && expediente \? 600_000 : false/],
    ['client/src/components/AppShell.tsx', /refetchInterval: ativo && expediente \? 300_000 : false/],
    ['client/src/pages/AdminDashboard.tsx', /refetchInterval: ativo && expediente \? 300_000 : false/],
    ['client/src/components/ActiveTimer.tsx', /refetchInterval: ativo && expediente \? 600_000 : false/],
    ['client/src/_core/hooks/useReminderNotifications.ts', /refetchInterval: ativo && expediente \? 600_000 : false/],
    ['client/src/components/faturamento/SmbiCadastroClienteDialog.tsx', /refetchInterval: open && ativo && expediente \? 15_000 : false/],
  ])('%s', (arq, re) => {
    const f = src(arq);
    expect(f).toMatch(re);
    expect(f).toContain('useExpediente');
    expect(f).toContain('useUsuarioAtivo');
  });

  it('TV segue o expediente próprio (desligada por padrão)', () => {
    expect(src('client/src/pages/TvDashboard.tsx')).toMatch(/refetchInterval: consulta \? 120_000 : false/);
  });

  it('nenhum polling do CRM abaixo de 5 min (exceto diálogo de cadastro aberto, 15 s)', () => {
    for (const arq of ['client/src/components/AppShell.tsx', 'client/src/pages/AdminDashboard.tsx',
      'client/src/components/faturamento/SmbiRoboPanel.tsx', 'client/src/components/ActiveTimer.tsx',
      'client/src/_core/hooks/useReminderNotifications.ts']) {
      for (const m of src(arq).matchAll(/refetchInterval: ativo && expediente \? ([\d_]+)/g)) {
        expect(Number(m[1].replace(/_/g, ''))).toBeGreaterThanOrEqual(300_000);
      }
    }
  });

  it('AppShell monta o refetch imediato ao reativar', () => {
    expect(src('client/src/components/AppShell.tsx')).toContain('useRefetchAoReativar()');
  });

  it('tasks.list e faturamento.getAll não rodam em polling', () => {
    const todos = ['client/src/pages/Tasks.tsx', 'client/src/pages/AdminDashboard.tsx', 'client/src/pages/ClientsManagement.tsx',
      'client/src/pages/AttendantProgress.tsx', 'client/src/components/faturamento/AttendantBilling.tsx'];
    for (const arq of todos) {
      for (const linha of src(arq).split('\n')) {
        if (/tasks\.list\.useQuery|faturamento\.getAll\.useQuery/.test(linha)) expect(linha).not.toContain('refetchInterval');
      }
    }
  });

  it('heartbeat do ActiveTimer a cada 10 min, só com sessão ativa e aba visível, sem exigir expediente', () => {
    const t = src('client/src/components/ActiveTimer.tsx');
    expect(t).toMatch(/const HEARTBEAT_MS = 10 \* 60_000/);
    expect(t).toMatch(/setInterval\(beat, HEARTBEAT_MS\)/);
    expect(t).toMatch(/if \(sessionStatus !== 'active'\) return;/);
    expect(t).toMatch(/if \(document\.visibilityState !== 'visible'\) return;/);
  });

  it('Painel TV é desligado por padrão (só VITE_TV_PAINEL_ATIVO=1 liga)', () => {
    expect(src('client/src/lib/tvPainel.ts')).toMatch(/=== '1'/);
    expect(src('client/src/pages/TvDashboard.tsx')).toContain('Painel TV desligado');
  });
});
