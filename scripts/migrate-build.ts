/**
 * Migração do banco durante o build de PRODUÇÃO na Vercel (`npm run migrate:build`).
 *
 * Por quê: `ensureTablesExist()` tem ~175 comandos em sequência (cada um uma ida ao Neon
 * por HTTP) e no cold start é abandonada aos 20 s por `withTimeout` em api/index.ts —
 * colunas e tabelas do fim da migração nunca chegavam ao banco (HANDOFF-HERMES.md, casos
 * M e N). No build não há limite de tempo: a migração roda uma vez e o marcador
 * `schema_meta` passa a bater, então o cold start só faz o caminho rápido.
 *
 * Política de falha: NUNCA quebra o build. Erro vira `[migrate:build] FALHOU: ...` no log
 * do build (procure por essa linha depois de mudar o schema) e o processo sai com 0; a
 * `ensureRecentSchema()` em runtime continua como rede de segurança.
 *
 * Uso:
 *   tsx scripts/migrate-build.ts             roda só com VERCEL_ENV=production
 *   tsx scripts/migrate-build.ts --force     roda fora da Vercel (nunca em preview/development)
 *   tsx scripts/migrate-build.ts --dry-run   mostra a decisão e os bancos; não conecta
 *
 * Só imprime NOMES de variáveis e `error.message`; nunca connection string.
 */
import { planBuildMigration } from './migrate-build-plan';

const TAG = '[migrate:build]';
const TIMEOUT_MS = 10 * 60 * 1000; // trava de segurança: conexão pendurada nunca prende o build

const log = (msg: string) => console.log(`${TAG} ${msg}`);
const secs = (t0: number) => ((Date.now() - t0) / 1000).toFixed(1);

type Step = { name: string; ok: boolean; error?: string };

/** ensureOrders/B2b devolvem um relatório por passo em vez de lançar; passo com erro é falha. */
function failedSteps(steps: Step[] | void): string[] {
  return Array.isArray(steps)
    ? steps.filter((s) => !s.ok).map((s) => `${s.name}: ${s.error ?? 'erro'}`)
    : [];
}

async function migrate(): Promise<boolean> {
  const argv = process.argv.slice(2);
  const plan = planBuildMigration(process.env, argv);

  log(`decisão: ${plan.run ? 'RODAR' : 'PULAR'} — ${plan.reason}`);
  for (const db of plan.databases) {
    log(
      `${db.name} (${db.envVars.join(' ?? ')}): ` +
        (db.enabled ? `migraria via ${db.migrations.join(' + ')}` : `PULAR — ${db.skipReason}`),
    );
  }

  if (plan.dryRun) {
    log('--dry-run: nada foi conectado.');
    return true;
  }
  if (!plan.run) return true;

  let ok = true;
  const soft = (msg: string) => {
    ok = false;
    console.error(`${TAG} FALHOU: ${msg}`);
  };

  // Import DINÂMICO: server/db/* lê a variável de ambiente ao ser importado; só depois de
  // decidir rodar é que isso é seguro (dry-run e o caminho "pular" funcionam sem env).
  const [crm, orders, b2b] = await Promise.all([
    import('../server/db/migrate'),
    import('../server/db/ordersMigrate'),
    import('../server/db/b2bMigrate'),
  ]);
  const jobs: Array<{ db: string; name: string; run: () => Promise<Step[] | void> }> = [
    { db: 'CRM', name: 'ensureTablesExist', run: () => crm.ensureTablesExist() },
    { db: 'Premium', name: 'ensureOrdersTablesExist', run: () => orders.ensureOrdersTablesExist() },
    { db: 'Premium', name: 'ensureB2bTablesExist', run: () => b2b.ensureB2bTablesExist() },
  ];

  // Sequencial; cada migração é independente: se uma falha, a próxima roda mesmo assim.
  for (const job of jobs) {
    const dbPlan = plan.databases.find((d) => d.name === job.db);
    if (!dbPlan?.enabled) continue; // já avisado acima
    const t0 = Date.now();
    log(`${job.db}: ${job.name} — início`);
    try {
      const bad = failedSteps(await job.run());
      if (bad.length) soft(`${job.name}: ${bad.length} passo(s) com erro — ${bad.join(' | ')}`);
    } catch (err) {
      soft(`${job.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    log(`${job.db}: ${job.name} — fim em ${secs(t0)}s`);
  }
  return ok;
}

async function main() {
  const t0 = Date.now();
  let timer: NodeJS.Timeout | undefined;
  const estourou = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([migrate(), estourou]);
    if (result === 'timeout') {
      console.error(`${TAG} FALHOU: passou de ${TIMEOUT_MS / 60000} min; abandonando (o build segue).`);
    } else if (result) {
      log(`total ${secs(t0)}s`);
      log('ok');
    }
  } catch (err) {
    console.error(`${TAG} FALHOU: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
  // exit explícito: conexões abertas não podem segurar o build; e nunca falha o deploy.
  process.exit(0);
}

void main();
