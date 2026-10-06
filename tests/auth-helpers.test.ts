import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { safeEqual } from '../server/lib/safeEqual';
import { emailEquals, normalizeEmail } from '../server/lib/userEmail';
import { users } from '../server/db/schema';

describe('safeEqual', () => {
  it('compara em tempo constante e rejeita tamanhos diferentes', () => {
    expect(safeEqual('segredo', 'segredo')).toBe(true);
    expect(safeEqual('segredo', 'segredO')).toBe(false);
    expect(safeEqual('segredo', 'segredo2')).toBe(false);
    expect(safeEqual('', 'x')).toBe(false);
  });
});

describe('userEmail', () => {
  it('normaliza para minúsculas sem espaços', () => {
    expect(normalizeEmail('  Ana@Sal.COM ')).toBe('ana@sal.com');
  });
  it('compara com lower() dos dois lados', () => {
    const q = new PgDialect().sqlToQuery(emailEquals(users.email, 'Ana@Sal.COM'));
    expect(q.sql).toMatch(/lower\("users"\."email"\) = \$1/);
    expect(q.params).toEqual(['ana@sal.com']);
  });
});

describe('getDummyHash', () => {
  it('usa as mesmas iterações dos usuários reais (anti-enumeração por tempo)', async () => {
    process.env.JWT_SECRET ||= 'test-secret';
    const { getDummyHash, hashPassword } = await import('../server/auth');
    const realIterations = hashPassword('x').split(':')[0];
    const dummy = getDummyHash();
    expect(dummy.split(':')[0]).toBe(realIterations);
    expect(getDummyHash()).toBe(dummy); // calculado uma vez
  });
});
