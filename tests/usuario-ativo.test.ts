import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { usuarioAtivo, INATIVIDADE_LIMITE_MS, QUERIES_REFETCH_AO_REATIVAR } from '../shared/usuarioAtivo';
import { STALE_SIGNAL_MS } from '../server/lib/workHours';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const T0 = 1_000_000_000;

describe('usuarioAtivo (decisão pura)', () => {
  it('limite padrão é 10 min', () => expect(INATIVIDADE_LIMITE_MS).toBe(600_000));
  it('atividade recente com aba visível = ativo', () => {
    expect(usuarioAtivo(T0, T0 + 1_000, true)).toBe(true);
    expect(usuarioAtivo(T0, T0 + INATIVIDADE_LIMITE_MS, true)).toBe(true);
  });
  it('mais de 10 min sem atividade = inativo', () => {
    expect(usuarioAtivo(T0, T0 + INATIVIDADE_LIMITE_MS + 1, true)).toBe(false);
  });
  it('aba oculta = inativo, mesmo com atividade recente', () => {
    expect(usuarioAtivo(T0, T0 + 1_000, false)).toBe(false);
  });
  it('timestamp inválido = inativo', () => {
    expect(usuarioAtivo(NaN, T0, true)).toBe(false);
  });
});

describe('hook useUsuarioAtivo (código-fonte)', () => {
  const h = src('client/src/lib/useUsuarioAtivo.ts');
  it('escuta mouse, teclado, toque, scroll e foco, e a visibilidade', () => {
    for (const ev of ['mousemove', 'keydown', 'touchstart', 'scroll', "'focus'", 'visibilitychange']) expect(h).toContain(ev);
  });
  it('ao reativar invalida as queries principais', () => {
    expect(h).toContain('invalidateQueries');
    for (const q of ['faturamento.pendingApproval', 'tasks.deletionLogs', 'tasks.reminders', 'workSessions.current', 'tasks.list'])
      expect(QUERIES_REFETCH_AO_REATIVAR).toContain(q);
  });
});

describe('intervalos e heartbeat', () => {
  it('limiar do servidor para sessão sem sinal é 25 min (> 2x o heartbeat de 10 min)', () => {
    expect(STALE_SIGNAL_MS).toBe(25 * 60_000);
    expect(STALE_SIGNAL_MS).toBeGreaterThan(2 * 10 * 60_000);
  });
  it('todo refetchInterval do CRM (fora Premium/Radar/TV) usa ativo && expediente', () => {
    for (const arq of ['client/src/components/AppShell.tsx', 'client/src/pages/AdminDashboard.tsx',
      'client/src/components/faturamento/SmbiRoboPanel.tsx', 'client/src/components/ActiveTimer.tsx',
      'client/src/_core/hooks/useReminderNotifications.ts', 'client/src/components/faturamento/SmbiCadastroClienteDialog.tsx']) {
      for (const linha of src(arq).split('\n')) {
        if (/refetchInterval:(?! \()/.test(linha) && !linha.trim().startsWith('//')) expect(linha, arq).toContain('ativo && expediente');
      }
    }
  });
});
