import { describe, it, expect } from 'vitest';
import { isStale, shouldRefetchOnFocus, shouldNotify, shouldToastQueryError, trpcPathOf, FOCUS_REFETCH_MS } from '../client/src/lib/refetchPolicy';

describe('isStale', () => {
  it('sem busca anterior conta como velho', () => {
    expect(isStale(0, 1_000, 60_000)).toBe(true);
    expect(isStale(undefined, 1_000, 60_000)).toBe(true);
    expect(isStale(NaN, 1_000, 60_000)).toBe(true);
  });
  it('só é velho depois de passar o limite', () => {
    expect(isStale(1_000, 1_000 + 60_000, 60_000)).toBe(false);
    expect(isStale(1_000, 1_000 + 60_001, 60_000)).toBe(true);
  });
});

describe('shouldRefetchOnFocus', () => {
  const now = 10_000_000;
  it('tasks.list refaz só depois de 5 min', () => {
    const key = [['tasks', 'list'], { type: 'query' }];
    expect(trpcPathOf(key)).toBe('tasks.list');
    expect(shouldRefetchOnFocus(key, now - FOCUS_REFETCH_MS + 1, now)).toBe(false);
    expect(shouldRefetchOnFocus(key, now - FOCUS_REFETCH_MS - 1, now)).toBe(true);
  });
  it('workSessions.* segue a mesma regra', () => {
    expect(shouldRefetchOnFocus([['workSessions', 'current'], {}], 1, now)).toBe(true);
    expect(shouldRefetchOnFocus([['workSessions', 'allActiveToday'], {}], now - 1000, now)).toBe(false);
  });
  it('outras queries nunca refazem ao voltar o foco', () => {
    expect(shouldRefetchOnFocus([['tasks', 'reminders'], {}], 1, now)).toBe(false);
    expect(shouldRefetchOnFocus([['sellers', 'list'], {}], 1, now)).toBe(false);
    expect(shouldRefetchOnFocus(['qualquer'], 1, now)).toBe(false);
  });
});

describe('shouldNotify (um toast por janela de 10 s)', () => {
  it('bloqueia dentro da janela e libera depois', () => {
    expect(shouldNotify(0, 5_000)).toBe(false);
    expect(shouldNotify(1_000, 11_000)).toBe(true);
    expect(shouldNotify(1_000, 10_999)).toBe(false);
  });
});

describe('shouldToastQueryError', () => {
  const base = { pathname: '/tasks', hostname: 'lembretes.salvitarn.com.br' };
  it('avisa em falha comum com retry padrão', () => {
    expect(shouldToastQueryError({ ...base })).toBe(true);
    expect(shouldToastQueryError({ ...base, errorCode: 'INTERNAL_SERVER_ERROR', retry: 1 })).toBe(true);
  });
  it('erros esperados não avisam', () => {
    for (const errorCode of ['NOT_FOUND', 'FORBIDDEN', 'BAD_REQUEST', 'UNAUTHORIZED']) {
      expect(shouldToastQueryError({ ...base, errorCode })).toBe(false);
    }
  });
  it('retry===false não avisa', () => {
    expect(shouldToastQueryError({ ...base, retry: false })).toBe(false);
  });
  it('rotas públicas da loja não avisam', () => {
    expect(shouldToastQueryError({ ...base, pathname: '/sal-vita' })).toBe(false);
    expect(shouldToastQueryError({ ...base, pathname: '/track/abc' })).toBe(false);
    expect(shouldToastQueryError({ pathname: '/', hostname: 'premium.salvitarn.com.br' })).toBe(false);
  });
});
