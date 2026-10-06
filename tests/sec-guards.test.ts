import { describe, it, expect } from 'vitest';
import { isForbiddenBatch, emailFromTrpcBody, isRateLimitedProcedure } from '../server/lib/trpcBatchGuard';
import { canProceed, isSellerBlocked } from '../server/lib/authGate';
import { isToolAllowed } from '../server/lib/aiToolGuard';

describe('trpcBatchGuard', () => {
  it('bloqueia lote que contém procedure com limiter', () => {
    expect(isForbiddenBatch('/auth.login,auth.login')).toBe(true);
    expect(isForbiddenBatch('/tasks.list,auth.login')).toBe(true);
    expect(isForbiddenBatch('/tasks.list%2Cai.chat')).toBe(true);
    expect(isForbiddenBatch('/AUTH.LOGIN,tasks.list')).toBe(true);
  });
  it('deixa passar lote só de queries normais', () => {
    expect(isForbiddenBatch('/tasks.list,auth.me')).toBe(false);
  });
  it('chamada única passa pelo limiter normal', () => {
    expect(isForbiddenBatch('/auth.login')).toBe(false);
    expect(isForbiddenBatch('/shipping.calculate')).toBe(false);
    expect(isRateLimitedProcedure('auth.login')).toBe(true);
    expect(isRateLimitedProcedure('auth.me')).toBe(false);
  });
});

describe('emailFromTrpcBody', () => {
  it('lê os formatos de corpo tRPC', () => {
    expect(emailFromTrpcBody({ json: { email: ' A@b.com ' } })).toBe('a@b.com');
    expect(emailFromTrpcBody({ '0': { json: { email: 'x@y.com' } } })).toBe('x@y.com');
    expect(emailFromTrpcBody({ email: 'z@y.com' })).toBe('z@y.com');
    expect(emailFromTrpcBody(undefined)).toBe('');
    expect(emailFromTrpcBody({ json: {} })).toBe('');
  });
});

describe('authGate', () => {
  it('atendente inativo é barrado; admin nunca', () => {
    expect(isSellerBlocked('user', 'inactive')).toBe(true);
    expect(isSellerBlocked('manager', 'inactive')).toBe(true);
    expect(isSellerBlocked('admin', 'inactive')).toBe(false);
    expect(isSellerBlocked('user', 'active')).toBe(false);
    expect(isSellerBlocked('user', undefined)).toBe(false);
  });
  it('mustChangePassword só libera o fluxo de troca de senha', () => {
    const u = { mustChangePassword: true };
    expect(canProceed(u, 'auth.changePassword')).toBe(true);
    expect(canProceed(u, 'auth.forceChangePassword')).toBe(true);
    expect(canProceed(u, 'auth.me')).toBe(true);
    expect(canProceed(u, 'auth.logout')).toBe(true);
    expect(canProceed(u, 'tasks.list')).toBe(false);
    expect(canProceed(u, 'auth.adminResetPassword')).toBe(false);
    expect(canProceed({ mustChangePassword: false }, 'tasks.list')).toBe(true);
  });
});

describe('isToolAllowed', () => {
  const attendant = [{ function: { name: 'my_priorities' } }, { function: { name: 'search_knowledge' } }];
  it('só aceita ferramentas oferecidas ao papel', () => {
    expect(isToolAllowed('my_priorities', attendant)).toBe(true);
    expect(isToolAllowed('reschedule_tasks', attendant)).toBe(false);
    expect(isToolAllowed('list_tasks', attendant)).toBe(false);
    expect(isToolAllowed(undefined, attendant)).toBe(false);
  });
});
