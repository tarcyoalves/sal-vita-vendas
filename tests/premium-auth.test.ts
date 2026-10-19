import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

// Login e sessão da loja Premium: sem banco. Tudo abaixo roda com o banco do CRM mockado e
// contando chamadas — onde o teste diz "zero chamadas", o servidor não pode ter tocado nele.
const dbCalls = vi.hoisted(() => {
  process.env.JWT_SECRET = 'teste-jwt-secret-apenas-para-vitest-0123456789';
  return { select: vi.fn(() => { throw new Error('banco do CRM não deveria ser consultado'); }) };
});
vi.mock('../server/db', () => ({ db: { select: dbCalls.select }, sql: vi.fn() }));

import { TRPCError } from '@trpc/server';
import { hashPassword, signToken } from '../server/auth';
import { createContext, router, premiumStaffProcedure, premiumAdminProcedure } from '../server/trpc';
import { premiumAuthRouter } from '../server/routers/premiumAuth';
import { signPremiumToken, isPremiumOnlyRequest } from '../server/lib/premiumSession';
import { COOKIE_NAME, PREMIUM_COOKIE_NAME } from '../shared/const';

const EMAIL = 'dono@loja.example';
const SENHA = 'senha-correta-de-teste-9';
let HASH = '';

let ipSeq = 0;
function fakeRes() {
  const headers: Record<string, string> = {};
  return { headers, setHeader: (k: string, v: string) => { headers[k] = v; } };
}
function novoCtx(over: Record<string, unknown> = {}) {
  const res = fakeRes();
  ipSeq++;
  const ctx = {
    req: { headers: {} }, res, user: null, premiumAdmin: null, clientIp: `10.0.0.${ipSeq}`, ...over,
  };
  return { ctx: ctx as never, res };
}
const login = (email: string, password: string, over: Record<string, unknown> = {}) => {
  const { ctx, res } = novoCtx(over);
  return { res, p: premiumAuthRouter.createCaller(ctx).login({ email, password }) };
};
const reqComCookie = (cookie: string, url = '/api/trpc/shipping.listOrders') =>
  ({ req: { headers: { cookie }, url, originalUrl: url }, res: fakeRes() }) as never;
const tokenDoCookie = (setCookie: string) => decodeURIComponent(setCookie.split(';')[0].split('=').slice(1).join('='));

beforeAll(() => { HASH = hashPassword(SENHA); });
beforeEach(() => {
  process.env.PREMIUM_ADMIN_EMAIL = EMAIL;
  process.env.PREMIUM_ADMIN_PASSWORD_HASH = HASH;
  dbCalls.select.mockClear();
});

describe('premiumAuth.login', () => {
  it('aceita a credencial certa, emite cookie próprio e não toca no banco', async () => {
    const { res, p } = login('  DONO@loja.example ', SENHA);
    expect(await p).toEqual({ email: EMAIL, role: 'admin' });
    const c = res.headers['Set-Cookie'];
    expect(c.startsWith(`${PREMIUM_COOKIE_NAME}=`)).toBe(true);
    expect(PREMIUM_COOKIE_NAME).not.toBe(COOKIE_NAME);
    expect(c).toMatch(/HttpOnly/);
    expect(c).toMatch(/SameSite=Lax/);
    expect(c).toMatch(/Max-Age=604800/);
    expect(dbCalls.select).not.toHaveBeenCalled();
  });

  it('rejeita senha errada com mensagem genérica', async () => {
    await expect(login(EMAIL, 'senha-errada').p).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'Email ou senha inválidos' });
  });

  it('rejeita e-mail errado com a MESMA mensagem (não revela se o e-mail existe)', async () => {
    await expect(login('outro@loja.example', SENHA).p).rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'Email ou senha inválidos' });
  });

  it('responde "Login da loja não configurado" quando falta qualquer variável', async () => {
    delete process.env.PREMIUM_ADMIN_PASSWORD_HASH;
    await expect(login(EMAIL, SENHA).p).rejects.toThrow('Login da loja não configurado');
    process.env.PREMIUM_ADMIN_PASSWORD_HASH = HASH;
    process.env.PREMIUM_ADMIN_EMAIL = '   ';
    await expect(login(EMAIL, SENHA).p).rejects.toThrow('Login da loja não configurado');
    delete process.env.PREMIUM_ADMIN_EMAIL;
    await expect(login(EMAIL, SENHA).p).rejects.toThrow('Login da loja não configurado');
  });

  it('nunca aceita senha vazia, mesmo com env ausente ou hash vazio', async () => {
    await expect(login(EMAIL, '').p).rejects.toBeInstanceOf(TRPCError);
    process.env.PREMIUM_ADMIN_PASSWORD_HASH = '';
    await expect(login(EMAIL, '').p).rejects.toBeInstanceOf(TRPCError);
    process.env.PREMIUM_ADMIN_PASSWORD_HASH = 'lixo-sem-formato';
    await expect(login(EMAIL, 'qualquer').p).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    process.env.PREMIUM_ADMIN_PASSWORD_HASH = '0:abc:def'; // iterações inválidas não viram 500
    await expect(login(EMAIL, 'qualquer').p).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('bloqueia por um tempo depois de uma falha (throttle), mesmo com a senha certa, só para aquele IP', async () => {
    const over = { clientIp: '203.0.113.77' };
    await expect(login(EMAIL, 'x1', over).p).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(login(EMAIL, SENHA, over).p).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    // outro IP não é afetado: ninguém tranca o dono para fora errando a senha de outro lugar
    await expect(login(EMAIL, SENHA).p).resolves.toMatchObject({ email: EMAIL });
  });
});

describe('sessão da loja x sessão do CRM', () => {
  it('createContext coloca premiumAdmin no contexto sem preencher user nem tocar no banco', async () => {
    const { p, res } = login(EMAIL, SENHA);
    await p;
    const tok = tokenDoCookie(res.headers['Set-Cookie']);
    const ctx = await createContext(reqComCookie(`${PREMIUM_COOKIE_NAME}=${encodeURIComponent(tok)}`));
    expect(ctx.premiumAdmin).toEqual({ email: EMAIL });
    expect(ctx.user).toBeNull();
    expect(dbCalls.select).not.toHaveBeenCalled();
  });

  it('o token da loja colocado no cookie do CRM NÃO vira usuário do CRM (exige id numérico)', async () => {
    const tok = signPremiumToken({ email: EMAIL, passwordHash: HASH });
    const ctx = await createContext(reqComCookie(`${COOKIE_NAME}=${encodeURIComponent(tok)}`, '/api/trpc/tasks.list'));
    expect(ctx.user).toBeNull();
    expect(ctx.premiumAdmin).toBeNull();
    expect(dbCalls.select).not.toHaveBeenCalled();
  });

  it('o token do CRM colocado no cookie da loja é recusado (sem aud premium)', async () => {
    const crm = signToken({ id: 1, email: EMAIL, name: 'x', role: 'admin' }, HASH);
    const ctx = await createContext(reqComCookie(`${PREMIUM_COOKIE_NAME}=${encodeURIComponent(crm)}`, '/api/trpc/tasks.list'));
    expect(ctx.premiumAdmin).toBeNull();
  });

  it('trocar a senha/e-mail nas variáveis derruba as sessões antigas', async () => {
    const tok = signPremiumToken({ email: EMAIL, passwordHash: HASH });
    process.env.PREMIUM_ADMIN_PASSWORD_HASH = hashPassword('outra-senha-qualquer-1');
    const ctx = await createContext(reqComCookie(`${PREMIUM_COOKIE_NAME}=${encodeURIComponent(tok)}`));
    expect(ctx.premiumAdmin).toBeNull();
  });

  it('com a env removida, o cookie antigo deixa de valer', async () => {
    const tok = signPremiumToken({ email: EMAIL, passwordHash: HASH });
    delete process.env.PREMIUM_ADMIN_EMAIL;
    const ctx = await createContext(reqComCookie(`${PREMIUM_COOKIE_NAME}=${encodeURIComponent(tok)}`));
    expect(ctx.premiumAdmin).toBeNull();
  });
});

describe('premiumStaffProcedure / premiumAdminProcedure', () => {
  const teste = router({
    staff: premiumStaffProcedure.query(({ ctx }) => ctx.actor),
    admin: premiumAdminProcedure.query(({ ctx }) => ctx.actor),
  });
  const crmUser = (role: string) => ({ id: 7, email: 'a@b.c', name: 'Fulano', role, mustChangePassword: false });

  it('aceita o cookie da loja sem chamar o banco do CRM (mesmo com cookie do CRM junto)', async () => {
    const prem = encodeURIComponent(signPremiumToken({ email: EMAIL, passwordHash: HASH }));
    const crm = encodeURIComponent(signToken({ id: 7, email: 'a@b.c', name: 'x', role: 'admin' }, 'h'));
    const ctx = await createContext(reqComCookie(`${PREMIUM_COOKIE_NAME}=${prem}; ${COOKIE_NAME}=${crm}`, '/api/trpc/shipping.listOrders'));
    const r = await teste.createCaller(ctx).staff();
    expect(r).toMatchObject({ kind: 'premium', id: null });
    expect(await teste.createCaller(ctx).admin()).toMatchObject({ kind: 'premium' });
    expect(dbCalls.select).toHaveBeenCalledTimes(0);
  });

  it('rejeita o usuário do CRM com role = user', async () => {
    const { ctx } = novoCtx({ user: crmUser('user') });
    await expect(teste.createCaller(ctx).staff()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(teste.createCaller(ctx).admin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('transição: admin do CRM entra nos dois; gerente só no staff', async () => {
    const adm = novoCtx({ user: crmUser('admin') }).ctx;
    expect(await teste.createCaller(adm).staff()).toMatchObject({ kind: 'crm', id: 7 });
    expect(await teste.createCaller(adm).admin()).toMatchObject({ kind: 'crm' });
    const ger = novoCtx({ user: crmUser('manager') }).ctx;
    expect(await teste.createCaller(ger).staff()).toMatchObject({ kind: 'crm' });
    await expect(teste.createCaller(ger).admin()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('sem nenhuma sessão: UNAUTHORIZED', async () => {
    await expect(teste.createCaller(novoCtx().ctx).staff()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('isPremiumOnlyRequest', () => {
  it('só considera da loja quando TODAS as procedures são da loja', () => {
    expect(isPremiumOnlyRequest('/api/trpc/shipping.listOrders?batch=1')).toBe(true);
    expect(isPremiumOnlyRequest('/api/trpc/premiumAuth.me,recovery.listAbandoned?batch=1')).toBe(true);
    expect(isPremiumOnlyRequest('/api/trpc/auth.me,shipping.listOrders?batch=1')).toBe(false);
    expect(isPremiumOnlyRequest('/api/trpc/tasks.list')).toBe(false);
    expect(isPremiumOnlyRequest(undefined)).toBe(false);
  });
});
