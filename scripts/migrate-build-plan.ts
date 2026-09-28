/**
 * Decisão pura do scripts/migrate-build.ts — sem banco, sem import de server/db.
 * Fica separada para o teste (tests/migrate-build.test.ts) importar sem executar nada.
 *
 * Só NOMES de variáveis aparecem aqui; nunca valores.
 */

export type Env = Record<string, string | undefined>;

export interface DbPlan {
  /** Nome amigável para o log. */
  name: string;
  /** Variável(is) de ambiente lidas pelas funções de migração, na ordem de prioridade. */
  envVars: string[];
  /** Funções de migração executadas nesse banco, em sequência. */
  migrations: string[];
  /** false = a variável não existe no build; esse banco é pulado (só ele). */
  enabled: boolean;
  skipReason?: string;
}

export interface BuildMigrationPlan {
  run: boolean;
  reason: string;
  dryRun: boolean;
  databases: DbPlan[];
}

function decide(env: Env, argv: string[]): { run: boolean; reason: string } {
  const vercelEnv = env.VERCEL_ENV;
  if (vercelEnv === 'preview' || vercelEnv === 'development') {
    // Nem --force vence isto: quem quer forçar num preview roda com VERCEL_ENV limpo.
    return { run: false, reason: `VERCEL_ENV=${vercelEnv} (só produção migra no build)` };
  }
  if (vercelEnv === 'production') return { run: true, reason: 'VERCEL_ENV=production' };
  if (argv.includes('--force')) return { run: true, reason: '--force (fora da Vercel)' };
  return { run: false, reason: 'VERCEL_ENV não é production e --force não foi passado' };
}

/**
 * Roda a migração no build só em produção da Vercel (VERCEL_ENV=production) ou com --force.
 * Preview/development nunca migram sozinhos: preview costuma apontar para o mesmo banco de
 * produção, e migrar a partir de um branch não revisado seria arriscado.
 */
export function shouldRunBuildMigration(env: Env, argv: string[] = []): boolean {
  return decide(env, argv).run;
}

const has = (env: Env, name: string) => !!env[name]?.trim();

/**
 * Espelha api/index.ts, que chama os três no startup:
 *  - CRM: `ensureTablesExist()` lê NEON_DATABASE_URL ?? DATABASE_URL.
 *  - Premium: `ensureOrdersTablesExist()` e `ensureB2bTablesExist()` leem
 *    ORDERS_DATABASE_URL ?? DATABASE_URL. No build exigimos ORDERS_DATABASE_URL de
 *    verdade: sem ela o fallback criaria as tabelas do Premium dentro do banco do CRM
 *    (o mesmo motivo de server/db/ordersDb.ts recusar subir em produção).
 *
 * Variável ausente NÃO muda a decisão de rodar: só marca aquele banco como pulado.
 */
export function planBuildMigration(env: Env, argv: string[] = []): BuildMigrationPlan {
  const { run, reason } = decide(env, argv);
  const crmOk = has(env, 'NEON_DATABASE_URL') || has(env, 'DATABASE_URL');
  const premiumOk = has(env, 'ORDERS_DATABASE_URL');
  return {
    run,
    reason,
    dryRun: argv.includes('--dry-run'),
    databases: [
      {
        name: 'CRM',
        envVars: ['NEON_DATABASE_URL', 'DATABASE_URL'],
        migrations: ['ensureTablesExist'],
        enabled: crmOk,
        skipReason: crmOk ? undefined : 'DATABASE_URL não definida no ambiente do build',
      },
      {
        name: 'Premium',
        envVars: ['ORDERS_DATABASE_URL'],
        migrations: ['ensureOrdersTablesExist', 'ensureB2bTablesExist'],
        enabled: premiumOk,
        skipReason: premiumOk ? undefined : 'ORDERS_DATABASE_URL não definida no ambiente do build',
      },
    ],
  };
}
