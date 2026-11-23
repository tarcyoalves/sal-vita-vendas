import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';

const h = vi.hoisted(() => {
  process.env.JWT_SECRET = 'teste-jwt-secret-apenas-para-vitest-0123456789';
  const chamadas = {
    where: [] as unknown[], inseridos: [] as unknown[], ordem: [] as string[],
    encontradas: [] as Array<Record<string, unknown>>, apagadas: [] as Array<Record<string, unknown>>,
    tokenAtualizado: [] as Array<{ userId: number }>,
  };
  const db = {
    select: () => {
      const q: Record<string, unknown> = {
        from: () => q,
        where: () => q,
        then: (ok: (v: unknown) => unknown) => Promise.resolve(chamadas.encontradas).then(ok),
      };
      return q;
    },
    delete: () => ({ where: () => ({ returning: async () => { chamadas.ordem.push('delete'); return chamadas.apagadas; } }) }),
    update: () => ({
      set: () => ({
        where: (w: unknown) => {
          chamadas.where.push(w);
          return { returning: async () => chamadas.tokenAtualizado, then: (ok: (v: unknown) => unknown) => Promise.resolve([]).then(ok) };
        },
      }),
    }),
    insert: () => ({ values: async (v: unknown) => { chamadas.ordem.push('insert-log'); chamadas.inseridos.push(v); } }),
  };
  return { chamadas, db };
});
vi.mock('../server/db', () => ({ db: h.db, sql: vi.fn() }));
vi.mock('../server/email/resend', () => ({ sendEmail: vi.fn() }));
vi.mock('../server/email/automations', () => ({ cancelAllEnrollments: vi.fn(async () => undefined), runTriggerNow: vi.fn(), enrollInSequence: vi.fn() }));

import { cidrMask, ipMatchesEntry } from '../server/trpc';
import { hashResetToken, PREFIXO_HASH_RESET } from '../server/lib/resetToken';
import { autorizarDbStats } from '../server/lib/dbStatsAuth';
import { tokenDescadastroValido } from '../server/lib/unsubscribeToken';
import { authRouter } from '../server/routers/auth';
import { tasksRouter } from '../server/routers/tasks';

const read = (f: string) => readFileSync(f, 'utf8');
const render = (w: unknown) => new PgDialect().sqlToQuery(w as never);

beforeEach(() => { h.chamadas.where.length = 0; h.chamadas.inseridos.length = 0; h.chamadas.ordem.length = 0; h.chamadas.tokenAtualizado.length = 0; });

describe('E1 — token de redefinição de senha em SHA-256', () => {
  it('hash tem prefixo, 64 hex e é determinístico; não revela o token', () => {
    const h1 = hashResetToken('abc');
    expect(h1).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashResetToken('abc')).toBe(h1);
    expect(h1).not.toContain('abc');
  });

  it('requestPasswordReset grava o hash, e o link do e-mail continua com o token em claro', () => {
    const src = read('server/routers/auth.ts');
    expect(src).toMatch(/token: hashResetToken\(token\),/);
    expect(src).toMatch(/const resetLink = `\$\{baseUrl\}\/\?reset=\$\{token\}`;/);
  });

  it('resetPasswordWithToken aceita os dois formatos, mas o legado nunca casa com linha sha256:', async () => {
    h.chamadas.tokenAtualizado.push({ userId: 5 });
    h.chamadas.encontradas = [{ id: 5, name: 'Ana' }];
    await authRouter.createCaller({ req: { headers: {} }, res: {} } as never)
      .resetPasswordWithToken({ token: 'tok-em-claro', newPassword: 'uma-senha-bem-longa-123' });
    const { sql, params } = render(h.chamadas.where[0]);
    expect(sql).toMatch(/\("password_reset_tokens"\."token" = \$\d+ or \("password_reset_tokens"\."token" = \$\d+ and "password_reset_tokens"\."token" not like \$\d+\)\)/);
    expect(params).toContain(hashResetToken('tok-em-claro'));
    expect(params).toContain('tok-em-claro');
    expect(params).toContain(`${PREFIXO_HASH_RESET}%`);
  });

  it('token inexistente/usado: BAD_REQUEST', async () => {
    await expect(authRouter.createCaller({ req: { headers: {} }, res: {} } as never)
      .resetPasswordWithToken({ token: 'x', newPassword: 'uma-senha-bem-longa-123' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('E2 — /api/unsubscribe', () => {
  it('só UUID passa', () => {
    expect(tokenDescadastroValido('3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f')).toBe(true);
    expect(tokenDescadastroValido('3F2B8C1E-5D4A-4E7B-9C6D-1A2B3C4D5E6F')).toBe(true);
    for (const ruim of ['', 'abc', "' OR 1=1 --", '3f2b8c1e5d4a4e7b9c6d1a2b3c4d5e6f', '3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6f ', '3f2b8c1e-5d4a-4e7b-9c6d-1a2b3c4d5e6g', undefined, null, 42]) {
      expect(tokenDescadastroValido(ruim)).toBe(false);
    }
  });
  it('rotas têm limitador por IP e o filtro de formato vem ANTES de acordar o banco', () => {
    const api = read('api/index.ts');
    expect(api).toMatch(/app\.get\('\/api\/unsubscribe', unsubscribeLimiter, unsubscribeFormatoMw, aguardarSchemasMw, handleUnsubscribe\)/);
    expect(api).toMatch(/app\.post\('\/api\/unsubscribe', unsubscribeLimiter, express\.urlencoded\(\{ extended: false \}\), unsubscribeFormatoMw, aguardarSchemasMw, handleUnsubscribe\)/);
    const bloco = api.slice(api.indexOf('const unsubscribeLimiter'), api.indexOf("app.get('/api/unsubscribe'"));
    expect(bloco).toMatch(/keyGenerator: \(req\) => ipKeyGenerator\(getClientIp\(req\)\)/);
  });
  it('o handler valida o formato antes de qualquer SELECT', () => {
    expect(read('server/routers/unsubscribe.ts')).toMatch(/tokenDescadastroValido\(token\) \? await resolveEmailByToken\(token\) : null/);
  });
});

describe('E3 — CIDR de IPs permitidos', () => {
  it('máscaras: /0 = tudo, /32 = exato, valores intermediários', () => {
    expect(cidrMask('0')).toBe(0);
    expect(cidrMask('8')).toBe(0xff000000);
    expect(cidrMask('24')).toBe(0xffffff00);
    expect(cidrMask('32')).toBe(0xffffffff);
  });
  it('bits fora de 0-32 ou mal formados são inválidos', () => {
    for (const b of ['33', '64', '-1', '', '24abc', '2.5', ' 24', '+8', undefined]) expect(cidrMask(b as string | undefined)).toBeNull();
  });
  it('/0 casa qualquer IPv4 (antes virava /32)', () => {
    expect(ipMatchesEntry('203.0.113.9', '0.0.0.0/0')).toBe(true);
    expect(ipMatchesEntry('10.1.2.3', '192.168.0.0/0')).toBe(true);
  });
  it('/24, /16, /32', () => {
    expect(ipMatchesEntry('203.0.113.200', '203.0.113.0/24')).toBe(true);
    expect(ipMatchesEntry('203.0.114.1', '203.0.113.0/24')).toBe(false);
    expect(ipMatchesEntry('172.16.5.5', '172.16.0.0/16')).toBe(true);
    expect(ipMatchesEntry('172.17.0.1', '172.16.0.0/16')).toBe(false);
    expect(ipMatchesEntry('203.0.113.9', '203.0.113.9/32')).toBe(true);
    expect(ipMatchesEntry('203.0.113.10', '203.0.113.9/32')).toBe(false);
  });
  it('prefixo inválido não casa ninguém (nem vira /0 por acidente)', () => {
    expect(ipMatchesEntry('203.0.113.9', '203.0.113.0/33')).toBe(false);
    expect(ipMatchesEntry('203.0.113.9', '203.0.113.0/-1')).toBe(false);
    expect(ipMatchesEntry('203.0.113.9', '203.0.113.0/abc')).toBe(false);
    expect(ipMatchesEntry('203.0.113.9', '203.0.113.0/')).toBe(false);
  });
  it('IP exato e ::ffff: continuam funcionando', () => {
    expect(ipMatchesEntry('::ffff:203.0.113.9', '203.0.113.9')).toBe(true);
    expect(ipMatchesEntry('203.0.113.9', '203.0.113.8')).toBe(false);
  });
});

describe('E4 — /api/db-stats com CRON_SECRET', () => {
  it('CRON_SECRET vale; ADMIN_RESET_SECRET ainda vale (legado, com aviso); o resto não', () => {
    const s = { cron: 'cron-secret-x', legado: 'reset-secret-y' };
    expect(autorizarDbStats('cron-secret-x', s)).toBe('cron');
    expect(autorizarDbStats('reset-secret-y', s)).toBe('legado');
    expect(autorizarDbStats('outro', s)).toBeNull();
    expect(autorizarDbStats(undefined, s)).toBeNull();
    expect(autorizarDbStats('', { cron: '', legado: '' })).toBeNull();
  });
  it('segredo ausente no ambiente nunca autoriza (falha fechado)', () => {
    expect(autorizarDbStats('qualquer', {})).toBeNull();
    expect(autorizarDbStats('cron-secret-x', { legado: 'reset-secret-y' })).toBeNull();
  });
  it('a rota usa o helper e avisa no log quando o legado é usado', () => {
    const api = read('api/index.ts');
    const rota = api.slice(api.indexOf("app.get('/api/db-stats'"), api.indexOf("app.get('/api/db-stats'") + 1500);
    expect(rota).toMatch(/autorizarDbStats\(providedSecret, \{ cron: process\.env\.CRON_SECRET, legado: process\.env\.ADMIN_RESET_SECRET \}\)/);
    expect(rota).toMatch(/console\.warn\('\[db-stats\] autenticado com ADMIN_RESET_SECRET/);
  });
});

describe('E5 — tasks.deleteMany', () => {
  const admin = () => tasksRouter.createCaller({ user: { id: 1, name: 'Admin', email: 'a@x.com', role: 'admin', mustChangePassword: false } } as never);

  it('limita a 2000 ids', async () => {
    const ids = Array.from({ length: 2001 }, (_, i) => i + 1);
    await expect(admin().deleteMany({ ids, reason: 'x' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(h.chamadas.ordem).toEqual([]);
  });

  it('apaga ANTES de logar e loga só o que foi realmente apagado', async () => {
    h.chamadas.encontradas = [
      { id: 1, title: 'A', notes: null, cnpj: null, phone: '1', email: null },
      { id: 2, title: 'B', notes: null, cnpj: null, phone: '2', email: null },
    ];
    h.chamadas.apagadas = [{ id: 1, title: 'A', notes: null, cnpj: null, phone: '1' }]; // outra requisição já apagou a 2
    const r = await admin().deleteMany({ ids: [1, 2], reason: 'duplicada' });
    expect(h.chamadas.ordem).toEqual(['delete', 'insert-log']);
    expect(r).toEqual({ ok: true, count: 1 });
    const logs = h.chamadas.inseridos[0] as Array<Record<string, unknown>>;
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ taskId: 1, deletedByUserId: 1, reason: 'duplicada', reviewedByAdmin: true });
  });

  it('nada apagado por corrida: não grava log', async () => {
    h.chamadas.encontradas = [{ id: 1, title: 'A', notes: null, cnpj: null, phone: '1', email: null }];
    h.chamadas.apagadas = [];
    await admin().deleteMany({ ids: [1] });
    expect(h.chamadas.ordem).toEqual(['delete']);
  });

  it('falha no log depois de apagar não derruba a resposta (fica no log do servidor)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.chamadas.encontradas = [{ id: 1, title: 'A', notes: null, cnpj: null, phone: '1', email: null }];
    h.chamadas.apagadas = [{ id: 1, title: 'A', notes: null, cnpj: null, phone: '1' }];
    const original = h.db.insert;
    h.db.insert = () => ({ values: async () => { throw new Error('log fora do ar'); } }) as never;
    try {
      expect(await admin().deleteMany({ ids: [1] })).toEqual({ ok: true, count: 1 });
      expect(err).toHaveBeenCalled();
    } finally { h.db.insert = original; err.mockRestore(); }
  });
});
