import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const h = vi.hoisted(() => {
  process.env.JWT_SECRET = 'teste-jwt-secret-apenas-para-vitest-0123456789';
  return {
    bloqueado: vi.fn(async (..._a: unknown[]) => false),
    registrar: vi.fn(async (..._a: unknown[]) => undefined),
    limpar: vi.fn(async (..._a: unknown[]) => undefined),
    dbSelect: vi.fn(() => { throw new Error('banco não deveria ser consultado'); }),
  };
});
vi.mock('../server/db', () => ({ db: { select: h.dbSelect }, sql: vi.fn() }));
vi.mock('../server/email/resend', () => ({ sendEmail: vi.fn() }));
vi.mock('../server/lib/authAttempts', async (orig) => {
  const real = await orig<typeof import('../server/lib/authAttempts')>();
  return { ...real, bloqueadoCompartilhado: h.bloqueado, registrarFalhaCompartilhada: h.registrar, limparCompartilhado: h.limpar };
});

import { PgDialect } from 'drizzle-orm/pg-core';
import { authRouter } from '../server/routers/auth';
import { premiumAuthRouter } from '../server/routers/premiumAuth';
import { hashPassword } from '../server/auth';
import * as real from '../server/lib/authAttempts';

const read = (f: string) => readFileSync(f, 'utf8');
const ctx = (ip = '203.0.113.9') => ({ req: { headers: {} }, res: { setHeader: () => {} }, user: null, premiumAdmin: null, clientIp: ip }) as never;

beforeEach(() => { h.bloqueado.mockReset().mockResolvedValue(false); h.registrar.mockReset().mockResolvedValue(undefined); h.limpar.mockClear(); h.dbSelect.mockClear(); });

describe('D — chaves e SQL do contador', async () => {
  const actual = await vi.importActual<typeof import('../server/lib/authAttempts')>('../server/lib/authAttempts');
  const sqlDe = (q: unknown) => new PgDialect().sqlToQuery(q as never);

  it('chave é hash opaco: nem e-mail nem IP aparecem, e é estável e sensível ao escopo', () => {
    const k = actual.chaveHash('login:ipemail', '203.0.113.9', 'Maria@Exemplo.com');
    expect(k).toMatch(/^login:ipemail:[0-9a-f]{40}$/);
    expect(k).not.toMatch(/maria|exemplo|203/i);
    expect(actual.chaveHash('login:ipemail', '203.0.113.9', ' maria@exemplo.com ')).toBe(k);
    expect(actual.chaveHash('login:ip', '203.0.113.9', 'maria@exemplo.com')).not.toBe(k);
  });

  it('registrarFalhas: UPSERT atômico numa única instrução, janela vencida recomeça em 1', async () => {
    const exec = vi.fn(async () => ({ rows: [] }));
    await actual.registrarFalhas({ execute: exec } as never, ['a:1', 'b:2'], 900_000);
    expect(exec).toHaveBeenCalledTimes(1);
    const { sql, params } = sqlDe((exec.mock.calls as unknown as unknown[][])[0][0]);
    expect(sql).toMatch(/INSERT INTO auth_attempts \(chave, janela_inicio, tentativas\) VALUES \(\$1, now\(\), 1\), \(\$2, now\(\), 1\)/);
    expect(sql).toMatch(/ON CONFLICT \(chave\) DO UPDATE SET/);
    expect(sql).toMatch(/tentativas = CASE WHEN .*THEN 1 ELSE auth_attempts\.tentativas \+ 1 END/);
    expect(params).toContain('a:1');
    expect(params).toContain(900);
  });

  it('estaBloqueado: bloqueia só ao atingir o máximo da chave', async () => {
    const exec = vi.fn(async () => ({ rows: [{ chave: 'k1', tentativas: 9 }, { chave: 'k2', tentativas: 3 }] }));
    const db = { execute: exec } as never;
    expect(await actual.estaBloqueado(db, [{ chave: 'k1', max: 10 }, { chave: 'k2', max: 30 }])).toBe(false);
    expect(await actual.estaBloqueado(db, [{ chave: 'k1', max: 9 }])).toBe(true);
    expect(await actual.estaBloqueado(db, [{ chave: 'sem-linha', max: 1 }])).toBe(false);
    expect(sqlDe((exec.mock.calls as unknown as unknown[][])[0][0]).sql).toMatch(/janela_inicio > now\(\) - make_interval/);
  });

  it('falha do banco: aberta por padrão (log sem dados), fechada com falhaFechada', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const quebrado = async () => ({ execute: async () => { throw new Error('conexão com senha=segredo'); } }) as never;
    expect(await actual.bloqueadoCompartilhado(quebrado, [{ chave: 'k', max: 1 }])).toBe(false);
    await expect(actual.registrarFalhaCompartilhada(quebrado, ['k'])).resolves.toBeUndefined();
    await expect(actual.limparCompartilhado(quebrado, ['k'])).resolves.toBeUndefined();
    await expect(actual.bloqueadoCompartilhado(quebrado, [{ chave: 'k', max: 1 }], { falhaFechada: true })).rejects.toBeInstanceOf(actual.ContadorIndisponivel);
    await expect(actual.registrarFalhaCompartilhada(quebrado, ['k'], { falhaFechada: true })).rejects.toBeInstanceOf(actual.ContadorIndisponivel);
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/segredo/);
    warn.mockRestore();
  });

  it('getDb que lança (ex.: ORDERS_DATABASE_URL ausente) também respeita a política', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const semBanco = async () => { throw new Error('sem url'); };
    expect(await actual.bloqueadoCompartilhado(semBanco, [{ chave: 'k', max: 1 }])).toBe(false);
    await expect(actual.bloqueadoCompartilhado(semBanco, [{ chave: 'k', max: 1 }], { falhaFechada: true })).rejects.toThrow();
    warn.mockRestore();
  });

  it('expurgo oportunista só roda no sorteio', async () => {
    const exec = vi.fn(async () => ({ rows: [] }));
    await actual.registrarFalhaCompartilhada(async () => ({ execute: exec }) as never, ['k'], { sorteio: () => 0.5 });
    expect(exec).toHaveBeenCalledTimes(1);
    await actual.registrarFalhaCompartilhada(async () => ({ execute: exec }) as never, ['k'], { sorteio: () => 0.001 });
    expect(exec).toHaveBeenCalledTimes(3);
    expect(sqlDe((exec.mock.calls as unknown as unknown[][])[2][0]).sql).toMatch(/DELETE FROM auth_attempts WHERE janela_inicio < now\(\) - interval '1 day'/);
  });
});

describe('D — auth.login', () => {
  it('bloqueado pelo contador compartilhado: TOO_MANY_REQUESTS sem tocar no banco de usuários', async () => {
    h.bloqueado.mockResolvedValue(true);
    await expect(authRouter.createCaller(ctx()).login({ email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(h.dbSelect).not.toHaveBeenCalled();
    // limita IP+e-mail em 10 e IP em 30, ambas chaves opacas
    const limites = h.bloqueado.mock.calls[0][1] as Array<{ chave: string; max: number }>;
    expect(limites.map(l => l.max)).toEqual([10, 30]);
    expect(limites.every(l => !/a@b\.co|203\.0\.113\.9/.test(l.chave))).toBe(true);
  });

  it('o limitador compartilhado é consultado ANTES da senha e o contador falha aberta (login segue)', () => {
    const src = read('server/routers/auth.ts');
    const i = src.indexOf('login: publicProcedure');
    const corpo = src.slice(i, src.indexOf('logout:', i));
    expect(corpo.indexOf('bloqueadoCompartilhado(crmAttemptsDb')).toBeLessThan(corpo.indexOf('verifyPassword'));
    expect(corpo).toMatch(/if \(!valid\) \{\s*await registrarFalhaCompartilhada\(crmAttemptsDb, \[chavesLogin\.ipEmail, chavesLogin\.ip\]\);/);
    expect(corpo).not.toMatch(/falhaFechada/);
    expect(corpo).toMatch(/limparCompartilhado\(crmAttemptsDb, \[chavesLogin\.ipEmail\]\)/);
  });
});

describe('D — auth.emergencyReset falha fechado', () => {
  beforeAll(() => { process.env.ADMIN_RESET_SECRET = 'segredo-de-emergencia-teste'; });

  it('contador indisponível: recusa (500 genérico) e nunca chega a comparar o segredo/tocar usuários', async () => {
    h.bloqueado.mockRejectedValue(new real.ContadorIndisponivel());
    await expect(authRouter.createCaller(ctx()).emergencyReset({ email: 'adm@b.co', secret: 'segredo-de-emergencia-teste' }))
      .rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    expect(h.dbSelect).not.toHaveBeenCalled();
    expect((h.bloqueado.mock.calls[0][2] as { falhaFechada?: boolean }).falhaFechada).toBe(true);
  });

  it('bloqueado: TOO_MANY_REQUESTS', async () => {
    h.bloqueado.mockResolvedValue(true);
    await expect(authRouter.createCaller(ctx('198.51.100.1')).emergencyReset({ email: 'adm@b.co', secret: 'x' }))
      .rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('segredo errado: registra a falha (falhaFechada) nas duas chaves e responde 401 genérico', async () => {
    await expect(authRouter.createCaller(ctx('198.51.100.2')).emergencyReset({ email: 'adm@b.co', secret: 'errado' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED', message: 'Credenciais de recuperação inválidas' });
    expect(h.registrar).toHaveBeenCalledTimes(1);
    const [, chaves, opts] = h.registrar.mock.calls[0] as unknown as [unknown, string[], { falhaFechada?: boolean }];
    expect(chaves).toHaveLength(2);
    expect(opts.falhaFechada).toBe(true);
    expect(chaves.join(' ')).not.toMatch(/adm@b\.co|198\.51/);
  });

  it('falha ao registrar a falha também recusa (fechado)', async () => {
    h.registrar.mockRejectedValueOnce(new real.ContadorIndisponivel());
    await expect(authRouter.createCaller(ctx('198.51.100.3')).emergencyReset({ email: 'outro@b.co', secret: 'errado' }))
      .rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});

describe('D — premiumAuth.login', () => {
  const EMAIL = 'dono@loja.example';
  const SENHA = 'senha-correta-de-teste-9';
  beforeAll(() => {
    process.env.PREMIUM_ADMIN_EMAIL = EMAIL;
    process.env.PREMIUM_ADMIN_PASSWORD_HASH = hashPassword(SENHA);
  });

  it('bloqueado no contador da LOJA: TOO_MANY_REQUESTS antes de verificar a senha', async () => {
    h.bloqueado.mockResolvedValue(true);
    await expect(premiumAuthRouter.createCaller(ctx('192.0.2.50')).login({ email: EMAIL, password: SENHA })).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
    expect(h.registrar).not.toHaveBeenCalled();
  });

  it('senha errada registra no contador; senha certa limpa', async () => {
    await expect(premiumAuthRouter.createCaller(ctx('192.0.2.51')).login({ email: EMAIL, password: 'errada' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(h.registrar).toHaveBeenCalledTimes(1);
    await premiumAuthRouter.createCaller(ctx('192.0.2.52')).login({ email: EMAIL, password: SENHA });
    expect(h.limpar).toHaveBeenCalledTimes(1);
  });

  it('usa o banco da loja (não o do CRM) e o login nunca consulta o banco de usuários do CRM', () => {
    const src = read('server/routers/premiumAuth.ts');
    expect(src).toMatch(/lojaAttemptsDb/);
    expect(src).not.toMatch(/crmAttemptsDb/);
    expect(h.dbSelect).not.toHaveBeenCalled();
  });
});

describe('D — migrações e versão do schema', () => {
  it('tabela auth_attempts nos dois bancos', () => {
    expect(read('server/db/migrate.ts')).toMatch(/CREATE TABLE IF NOT EXISTS auth_attempts/);
    expect(read('server/db/ordersMigrate.ts')).toMatch(/CREATE TABLE IF NOT EXISTS auth_attempts/);
    expect(read('server/db/schema.ts')).toMatch(/pgTable\('auth_attempts'/);
  });
});
