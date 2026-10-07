import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import { passwordVersion, tokenMatchesPassword, PV_DEPLOY_TS, PV_LEGACY_GRACE_S } from '../server/lib/sessionToken';
import { csrfRejection } from '../server/lib/csrfGuard';

const ORIGINS = ['https://lembretes.salvitarn.com.br', 'http://localhost:5173'];

describe('pv do JWT (SEC2-4)', () => {
  it('pv é estável, curto e depende do hash e do segredo', () => {
    const a = passwordVersion('s1', 'hashA');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(passwordVersion('s1', 'hashA')).toBe(a);
    expect(passwordVersion('s1', 'hashB')).not.toBe(a);
    expect(passwordVersion('s2', 'hashA')).not.toBe(a);
  });

  it('token com pv correto passa; senha trocada recusa', () => {
    const pv = passwordVersion('s', 'old');
    expect(tokenMatchesPassword({ pv, iat: PV_DEPLOY_TS + 10 * 86400 }, pv)).toBe(true);
    expect(tokenMatchesPassword({ pv, iat: PV_DEPLOY_TS + 10 * 86400 }, passwordVersion('s', 'new'))).toBe(false);
  });

  it('token legado (sem pv) passa antes do prazo e é recusado depois', () => {
    const pv = passwordVersion('s', 'x');
    expect(tokenMatchesPassword({ iat: PV_DEPLOY_TS - 3600 }, pv)).toBe(true);
    expect(tokenMatchesPassword({ iat: PV_DEPLOY_TS + PV_LEGACY_GRACE_S - 1 }, pv)).toBe(true);
    expect(tokenMatchesPassword({ iat: PV_DEPLOY_TS + PV_LEGACY_GRACE_S }, pv)).toBe(false);
    expect(tokenMatchesPassword({}, pv)).toBe(false);
    expect(tokenMatchesPassword({ pv: 123, iat: 1 }, pv)).toBe(false);
    expect(tokenMatchesPassword(null, pv)).toBe(false);
  });

  describe('emissão real (server/auth.ts)', () => {
    let auth: typeof import('../server/auth');
    beforeAll(async () => {
      process.env.JWT_SECRET ||= 'test-secret';
      auth = await import('../server/auth');
    });

    it('signToken carrega o pv da senha e verifyToken devolve o mesmo', () => {
      const t = auth.signToken({ id: 1, email: 'a@b.c', name: 'A', role: 'user' }, 'hash-1');
      const d = auth.verifyToken(t);
      expect(d.pv).toBe(auth.currentPasswordVersion('hash-1'));
      expect(tokenMatchesPassword(d, auth.currentPasswordVersion('hash-1'))).toBe(true);
      expect(tokenMatchesPassword(d, auth.currentPasswordVersion('hash-2'))).toBe(false);
    });

    it('verifyToken só aceita HS256', () => {
      const t = jwt.sign({ id: 1 }, process.env.JWT_SECRET!, { algorithm: 'HS512' });
      expect(() => auth.verifyToken(t)).toThrow();
    });

    it('cookie com %-malformado não lança (vira sem cookie)', () => {
      expect(auth.getCookieFromRequest('sal-vita-session=%E0%A4%A', 'sal-vita-session')).toBeUndefined();
      expect(auth.getCookieFromRequest('x=1; sal-vita-session=abc%20d', 'sal-vita-session')).toBe('abc d');
    });

    it('sessionCookieHeader: HttpOnly, 7 dias, SameSite=Lax', () => {
      const h = auth.sessionCookieHeader('tok');
      expect(h).toContain('HttpOnly');
      expect(h).toContain('Max-Age=604800');
      expect(h).toContain('SameSite=Lax');
    });
  });

  it('fluxo real: login e as duas trocas de senha reemitem o cookie com a senha NOVA', () => {
    const src = readFileSync('server/routers/auth.ts', 'utf8');
    // login: assina com o hash do banco
    expect(src).toMatch(/signToken\(\{[^}]*\}, user\.passwordHash\)/);
    // changePassword e forceChangePassword: assinam com o hash novo e gravam o cookie
    const reissues = src.match(/signToken\(\{[^}]*\}, newHash\)/g) ?? [];
    expect(reissues).toHaveLength(2);
    expect(src.match(/setHeader\('Set-Cookie', sessionCookieHeader\(token\)\)/g)).toHaveLength(3);
    // login bloqueia atendente inativo
    expect(src).toMatch(/isSellerBlocked\(user\.role, seller\?\.status\)/);
    expect(src).toContain('Conta desativada. Fale com o administrador.');
  });

  it('createContext compara pv e guarda só o pv no cache', () => {
    const src = readFileSync('server/trpc.ts', 'utf8');
    expect(src).toContain('tokenMatchesPassword(decoded, dbUser.pv)');
    expect(src).toMatch(/const \{ passwordHash, \.\.\.rest \} = row;/);
  });
});

describe('csrfRejection (SEC2-5)', () => {
  const base = { method: 'POST', contentType: 'application/json', origin: 'https://lembretes.salvitarn.com.br' };
  it('GET/HEAD/OPTIONS passam sempre', () => {
    expect(csrfRejection({ method: 'GET', secFetchSite: 'cross-site' }, ORIGINS)).toBeNull();
    expect(csrfRejection({ method: 'OPTIONS' }, ORIGINS)).toBeNull();
  });
  it('POST JSON da própria origem passa (com charset também)', () => {
    expect(csrfRejection(base, ORIGINS)).toBeNull();
    expect(csrfRejection({ ...base, contentType: 'application/json; charset=utf-8', secFetchSite: 'same-origin' }, ORIGINS)).toBeNull();
    expect(csrfRejection({ method: 'POST', contentType: 'application/json' }, ORIGINS)).toBeNull();
  });
  it('multipart, text/plain e sem content-type são recusados', () => {
    expect(csrfRejection({ ...base, contentType: 'multipart/form-data; boundary=x' }, ORIGINS)).not.toBeNull();
    expect(csrfRejection({ ...base, contentType: 'text/plain' }, ORIGINS)).not.toBeNull();
    expect(csrfRejection({ ...base, contentType: undefined }, ORIGINS)).not.toBeNull();
  });
  it('cross-site e Origin fora da lista são recusados', () => {
    expect(csrfRejection({ ...base, secFetchSite: 'cross-site' }, ORIGINS)).not.toBeNull();
    expect(csrfRejection({ ...base, origin: 'https://evil.example' }, ORIGINS)).not.toBeNull();
  });
});
