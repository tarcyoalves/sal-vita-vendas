import { describe, it, expect, beforeAll, afterEach } from 'vitest';

describe('cookie de sessão', () => {
  let auth: typeof import('../server/auth');
  const envAntes = process.env.NODE_ENV;
  beforeAll(async () => {
    process.env.JWT_SECRET ||= 'test-secret';
    auth = await import('../server/auth');
  });
  afterEach(() => { process.env.NODE_ENV = envAntes; });

  it('emissão: HttpOnly, SameSite=Lax e Secure em produção', () => {
    process.env.NODE_ENV = 'production';
    const c = auth.sessionCookieHeader('tok');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
  });

  it('logout apaga com os mesmos atributos (Secure e SameSite em produção)', () => {
    process.env.NODE_ENV = 'production';
    const c = auth.clearSessionCookieHeader();
    expect(c).toContain('Max-Age=0');
    expect(c).toContain('HttpOnly');
    expect(c).toContain('Secure');
    expect(c).toContain('SameSite=Lax');
    expect(c).toContain('Path=/');
  });

  it('fora de produção não exige Secure (dev em http)', () => {
    process.env.NODE_ENV = 'development';
    expect(auth.clearSessionCookieHeader()).not.toContain('Secure');
  });
});
