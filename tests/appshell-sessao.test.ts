// Início de sessão: consulta que falhou não oferece "Registrar entrada"; o modal rola em telas baixas.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const f = readFileSync('client/src/components/AppShell.tsx', 'utf8');

describe('AppShell: modal de início de sessão', () => {
  it('needsStartup respeita a falha da consulta (isError sem dado)', () => {
    expect(f).toMatch(/const sessionCheckFailed = [^;]*sessionError && currentSession === undefined/);
    const i = f.indexOf('const needsStartup');
    expect(f.slice(i, i + 200)).toContain('!sessionCheckFailed');
  });
  it('mostra a mensagem e "Tentar de novo" ligado ao refetch', () => {
    expect(f).toContain('Não consegui verificar sua sessão');
    expect(f).toMatch(/refetchSession\(\);[^}]*\}\}[^>]*disabled=\{sessionFetching\}/);
    expect(f).toContain('Tentar de novo');
  });
  it('os dois modais rolam: overflow-y-auto no fundo e max-h em dvh no cartão', () => {
    const i = f.indexOf('{sessionCheckFailed && ');
    const trecho = f.slice(i, f.indexOf('{/* ── Alterar senha ── */}'));
    expect(trecho.match(/overflow-y-auto p-4|p-4 overflow-y-auto/g)?.length).toBe(2);
    expect(trecho.match(/max-h-\[90dvh\] overflow-y-auto/g)?.length).toBe(2);
  });
});
