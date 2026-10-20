import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isForbiddenBatch, isRateLimitedProcedure } from '../server/lib/trpcBatchGuard';
import { comTempoMinimo } from '../server/lib/tempoUniforme';
import { SENHA_MINIMA } from '../shared/senha';

describe('rate limit da recuperação de senha', () => {
  it('as duas procedures são limitadas e não passam em lote', () => {
    expect(isRateLimitedProcedure('auth.requestPasswordReset')).toBe(true);
    expect(isRateLimitedProcedure('auth.resetPasswordWithToken')).toBe(true);
    expect(isForbiddenBatch('/tasks.list,auth.requestPasswordReset')).toBe(true);
    expect(isForbiddenBatch('/auth.resetPasswordWithToken,auth.me')).toBe(true);
  });
  it('api/index.ts monta limiters com IP; o limiter de reset não pula requisição bem-sucedida', () => {
    const api = readFileSync('api/index.ts', 'utf8');
    expect(api).toMatch(/app\.use\('\/api\/trpc\/auth\.requestPasswordReset', resetIpLimiter, authLimiter, authIpLimiter\)/);
    expect(api).toMatch(/app\.use\('\/api\/trpc\/auth\.resetPasswordWithToken', resetIpLimiter, authLimiter, authIpLimiter\)/);
    const bloco = api.slice(api.indexOf('const resetIpLimiter'), api.indexOf('const storeLimiter'));
    expect(bloco).not.toMatch(/skipSuccessfulRequests/);
  });
  it('requestPasswordReset usa tempo mínimo em todos os caminhos', () => {
    const auth = readFileSync('server/routers/auth.ts', 'utf8');
    expect(auth).toMatch(/comTempoMinimo\(RESET_TEMPO_MINIMO_MS/);
    expect(auth).not.toMatch(/setTimeout\(r, 300\)/);
  });
});

describe('comTempoMinimo', () => {
  function relogio() {
    let t = 1000;
    const esperas: number[] = [];
    return { agora: () => t, dormir: async (ms: number) => { esperas.push(ms); t += ms; }, avancar: (ms: number) => { t += ms; }, esperas };
  }
  it('completa até o piso quando a função é rápida', async () => {
    const r = relogio();
    await expect(comTempoMinimo(1500, async () => { r.avancar(20); return 'ok'; }, r.agora, r.dormir)).resolves.toBe('ok');
    expect(r.esperas).toEqual([1480]);
  });
  it('não espera de novo quando a função já passou do piso', async () => {
    const r = relogio();
    await comTempoMinimo(1500, async () => { r.avancar(2000); }, r.agora, r.dormir);
    expect(r.esperas).toEqual([]);
  });
  it('também iguala o tempo quando a função lança', async () => {
    const r = relogio();
    await expect(comTempoMinimo(1500, async () => { r.avancar(100); throw new Error('x'); }, r.agora, r.dormir)).rejects.toThrow('x');
    expect(r.esperas).toEqual([1400]);
  });
});

describe('senha mínima de 10 caracteres para senhas novas', () => {
  const auth = readFileSync('server/routers/auth.ts', 'utf8');
  it('as três entradas de senha nova exigem o mínimo; nenhuma ficou em 6', () => {
    expect(SENHA_MINIMA).toBe(10);
    expect(auth.match(/z\.string\(\)\.min\(SENHA_MINIMA, SENHA_MINIMA_MSG\)/g)).toHaveLength(3);
    expect(auth).not.toMatch(/min\(6,/);
  });
  it('o login não aplica o mínimo (senhas antigas continuam válidas)', () => {
    const login = auth.slice(auth.indexOf('  login:'), auth.indexOf('  logout:'));
    expect(login).not.toMatch(/SENHA_MINIMA/);
    expect(login).not.toMatch(/\.min\((6|10)\b/);
  });
  it('as telas pedem o mesmo mínimo', () => {
    for (const f of ['client/src/components/AppShell.tsx', 'client/src/pages/Home.tsx']) {
      const src = readFileSync(f, 'utf8');
      expect(src).not.toMatch(/minLength=\{6\}/);
      expect(src).toMatch(/minLength=\{10\}/);
    }
  });
});
