// As tabelas de vendas e B2B vivem SÓ no banco da loja (ORDERS_DATABASE_URL). Sem a variável, a
// migração falha em vez de cair para o banco do CRM Lembretes (outra conta, outro produto).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { ensureSalesTablesExist } from '../server/db/salesMigrate';
import { ensureB2bTablesExist } from '../server/db/b2bMigrate';

describe('migrações da loja não caem para o banco do CRM', () => {
  const salvo = { orders: process.env.ORDERS_DATABASE_URL, crm: process.env.DATABASE_URL };
  beforeEach(() => {
    delete process.env.ORDERS_DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://crm.invalid/crm';
  });
  afterEach(() => {
    if (salvo.orders === undefined) delete process.env.ORDERS_DATABASE_URL; else process.env.ORDERS_DATABASE_URL = salvo.orders;
    if (salvo.crm === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = salvo.crm;
  });

  it('vendas: sem ORDERS_DATABASE_URL falha sem conectar, mesmo com DATABASE_URL definida', async () => {
    const passos = await ensureSalesTablesExist(true);
    expect(passos).toEqual([{ name: 'config', ok: false, error: expect.stringMatching(/ORDERS_DATABASE_URL/) }]);
  });

  it('B2B: idem', async () => {
    const passos = await ensureB2bTablesExist(true);
    expect(passos).toEqual([{ name: 'config', ok: false, error: expect.stringMatching(/ORDERS_DATABASE_URL/) }]);
  });

  it('o código não tem mais o atalho para DATABASE_URL', () => {
    for (const f of ['server/db/salesMigrate.ts', 'server/db/b2bMigrate.ts']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/ORDERS_DATABASE_URL\s*\?\?\s*process\.env\.DATABASE_URL/);
    }
  });
});
