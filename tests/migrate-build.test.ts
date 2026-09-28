/**
 * Decisão do scripts/migrate-build.ts (migração no build de produção da Vercel).
 * Só lógica pura: nenhum acesso a banco. Ver HANDOFF-HERMES.md, seção 7, caso N.
 */
import { describe, it, expect } from 'vitest';
import { shouldRunBuildMigration, planBuildMigration } from '../scripts/migrate-build-plan';

const URLS = { DATABASE_URL: 'x', ORDERS_DATABASE_URL: 'y' };

describe('shouldRunBuildMigration', () => {
  it('produção da Vercel roda', () => {
    expect(shouldRunBuildMigration({ VERCEL_ENV: 'production' })).toBe(true);
  });
  it('preview e development nunca rodam', () => {
    expect(shouldRunBuildMigration({ VERCEL_ENV: 'preview' })).toBe(false);
    expect(shouldRunBuildMigration({ VERCEL_ENV: 'development' })).toBe(false);
  });
  it('preview/development não são forçados nem com --force', () => {
    expect(shouldRunBuildMigration({ VERCEL_ENV: 'preview' }, ['--force'])).toBe(false);
    expect(shouldRunBuildMigration({ VERCEL_ENV: 'development' }, ['--force'])).toBe(false);
  });
  it('sem VERCEL_ENV pula, a não ser com --force', () => {
    expect(shouldRunBuildMigration({})).toBe(false);
    expect(shouldRunBuildMigration({}, [])).toBe(false);
    expect(shouldRunBuildMigration({}, ['--force'])).toBe(true);
  });
  it('produção com --force continua rodando', () => {
    expect(shouldRunBuildMigration({ VERCEL_ENV: 'production' }, ['--force'])).toBe(true);
  });
});

describe('planBuildMigration', () => {
  it('produção com as duas variáveis: migra CRM e Premium', () => {
    const p = planBuildMigration({ VERCEL_ENV: 'production', ...URLS });
    expect(p.run).toBe(true);
    expect(p.databases.map((d) => [d.name, d.enabled])).toEqual([
      ['CRM', true],
      ['Premium', true],
    ]);
    expect(p.databases[1].migrations).toEqual(['ensureOrdersTablesExist', 'ensureB2bTablesExist']);
  });
  it('produção sem DATABASE_URL: decisão continua "rodar", só o CRM é pulado', () => {
    const p = planBuildMigration({ VERCEL_ENV: 'production', ORDERS_DATABASE_URL: 'y' });
    expect(p.run).toBe(true);
    expect(p.databases[0]).toMatchObject({ name: 'CRM', enabled: false });
    expect(p.databases[0].skipReason).toContain('DATABASE_URL');
    expect(p.databases[1].enabled).toBe(true);
  });
  it('sem ORDERS_DATABASE_URL o Premium é pulado (sem fallback para o banco do CRM)', () => {
    const p = planBuildMigration({ VERCEL_ENV: 'production', DATABASE_URL: 'x' });
    expect(p.run).toBe(true);
    expect(p.databases[0].enabled).toBe(true);
    expect(p.databases[1]).toMatchObject({ name: 'Premium', enabled: false });
    expect(p.databases[1].skipReason).toContain('ORDERS_DATABASE_URL');
  });
  it('NEON_DATABASE_URL também habilita o CRM (é a que migrate.ts lê primeiro)', () => {
    const p = planBuildMigration({ VERCEL_ENV: 'production', NEON_DATABASE_URL: 'x' });
    expect(p.databases[0].enabled).toBe(true);
  });
  it('variável vazia conta como ausente', () => {
    const p = planBuildMigration({ VERCEL_ENV: 'production', DATABASE_URL: '  ', ORDERS_DATABASE_URL: '' });
    expect(p.databases.every((d) => !d.enabled)).toBe(true);
  });
  it('--dry-run é reportado e não altera a decisão', () => {
    expect(planBuildMigration({ VERCEL_ENV: 'production', ...URLS }, ['--dry-run'])).toMatchObject({
      run: true,
      dryRun: true,
    });
    expect(planBuildMigration({}, ['--dry-run'])).toMatchObject({ run: false, dryRun: true });
  });
  it('a decisão nunca contém o valor das variáveis', () => {
    const p = planBuildMigration({ VERCEL_ENV: 'production', DATABASE_URL: 'postgres://segredo', ORDERS_DATABASE_URL: 'postgres://outro' });
    expect(JSON.stringify(p)).not.toContain('segredo');
    expect(JSON.stringify(p)).not.toContain('outro');
  });
});
