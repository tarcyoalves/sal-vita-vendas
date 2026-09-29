/**
 * Limpeza de e-mails de domínios bloqueados (shared/blockedEmailDomains.ts), executada no
 * build de PRODUÇÃO da Vercel (`npm run purge:blocked`), logo depois da migração.
 *
 * Idempotente: depois da primeira execução não há mais nada a apagar. Nunca quebra o build:
 * erro vira `[purge:blocked] FALHOU/ERRO` no log e o processo sai com 0.
 *
 * O que faz, em cada banco (CRM e Premium; tabela que não existe no banco é ignorada):
 *  - APAGA linhas de listas puras de e-mail: destinatários de campanha, inscrições em sequência,
 *    eventos de e-mail, contatos de marketing e carrinhos abandonados.
 *  - ESVAZIA o campo e-mail (NULL) onde o registro tem outros dados: clientes, tarefas, leads do
 *    Radar e contatos B2B. A tarefa/cliente continua; só o e-mail some.
 *  - SEMEIA o bloqueio: endereços em `email_suppressions` e o domínio em `suppression_list`.
 *  - SÓ CONTA (nunca altera): contas de login (users), atendentes (sellers) e pedidos da loja
 *    (site_orders). Se aparecer número maior que zero, é decisão do dono.
 *
 * Uso:
 *   tsx scripts/purge-blocked-emails.ts             só com VERCEL_ENV=production
 *   tsx scripts/purge-blocked-emails.ts --force     roda fora da Vercel (nunca em preview)
 *   tsx scripts/purge-blocked-emails.ts --dry-run   mostra o plano; não conecta
 *
 * Só imprime nomes de tabela, contagens e `error.message`; nunca connection string.
 */
import { neon } from '@neondatabase/serverless';
import { BLOCKED_EMAIL_ADDRESSES, BLOCKED_EMAIL_DOMAINS, blockedEmailPattern } from '../shared/blockedEmailDomains';

const TAG = '[purge:blocked]';
const TIMEOUT_MS = 3 * 60 * 1000;
const log = (m: string) => console.log(`${TAG} ${m}`);

type Sql = ReturnType<typeof neon>;
type Job = { label: string; run: (sql: Sql, re: string) => Promise<number> };

const n = (rows: unknown): number => Number((rows as Array<{ n: number }>)[0]?.n ?? 0);

const jobs: Job[] = [
  // ── APAGA ──
  { label: 'DELETE email_campaign_recipients', run: async (s, re) => n(await s`WITH d AS (DELETE FROM email_campaign_recipients WHERE email ~* ${re} RETURNING 1) SELECT count(*)::int AS n FROM d`) },
  { label: 'DELETE email_sequence_enrollments', run: async (s, re) => n(await s`WITH d AS (DELETE FROM email_sequence_enrollments WHERE email ~* ${re} RETURNING 1) SELECT count(*)::int AS n FROM d`) },
  { label: 'DELETE email_events', run: async (s, re) => n(await s`WITH d AS (DELETE FROM email_events WHERE recipient_email ~* ${re} RETURNING 1) SELECT count(*)::int AS n FROM d`) },
  { label: 'DELETE marketing_contacts', run: async (s, re) => n(await s`WITH d AS (DELETE FROM marketing_contacts WHERE email ~* ${re} RETURNING 1) SELECT count(*)::int AS n FROM d`) },
  { label: 'DELETE abandoned_carts', run: async (s, re) => n(await s`WITH d AS (DELETE FROM abandoned_carts WHERE customer_email ~* ${re} RETURNING 1) SELECT count(*)::int AS n FROM d`) },
  // ── ESVAZIA o campo e-mail ──
  { label: 'NULL clients.email', run: async (s, re) => n(await s`WITH u AS (UPDATE clients SET email = NULL WHERE email ~* ${re} RETURNING 1) SELECT count(*)::int AS n FROM u`) },
  { label: 'NULL tasks.email', run: async (s, re) => n(await s`WITH u AS (UPDATE tasks SET email = NULL WHERE email ~* ${re} RETURNING 1) SELECT count(*)::int AS n FROM u`) },
  { label: 'NULL radar_establishments.email', run: async (s, re) => n(await s`WITH u AS (UPDATE radar_establishments SET email = NULL WHERE email ~* ${re} RETURNING 1) SELECT count(*)::int AS n FROM u`) },
  { label: 'NULL contacts.email (B2B)', run: async (s, re) => n(await s`WITH u AS (UPDATE contacts SET email = NULL WHERE email ~* ${re} RETURNING 1) SELECT count(*)::int AS n FROM u`) },
  // ── SÓ CONTA (nunca altera) ──
  { label: 'CONTA users (login) — não alterado', run: async (s, re) => n(await s`SELECT count(*)::int AS n FROM users WHERE email ~* ${re}`) },
  { label: 'CONTA sellers (atendentes) — não alterado', run: async (s, re) => n(await s`SELECT count(*)::int AS n FROM sellers WHERE email ~* ${re}`) },
  { label: 'CONTA site_orders (pedidos da loja) — não alterado', run: async (s, re) => n(await s`SELECT count(*)::int AS n FROM site_orders WHERE customer_email ~* ${re}`) },
  // ── SEMEIA o bloqueio ──
  ...BLOCKED_EMAIL_ADDRESSES.map<Job>((addr) => ({
    label: `SEMEIA email_suppressions ${addr}`,
    run: async (s) => n(await s`WITH i AS (INSERT INTO email_suppressions (email, reason) VALUES (${addr.toLowerCase()}, 'manual') ON CONFLICT (email) DO NOTHING RETURNING 1) SELECT count(*)::int AS n FROM i`),
  })),
  ...BLOCKED_EMAIL_DOMAINS.map<Job>((dom) => ({
    label: `SEMEIA suppression_list domínio ${dom}`,
    run: async (s) => n(await s`WITH i AS (INSERT INTO suppression_list (domain, reason, source) SELECT ${dom.toLowerCase()}, 'manual', 'blocked_domain' WHERE NOT EXISTS (SELECT 1 FROM suppression_list WHERE lower(domain) = ${dom.toLowerCase()}) RETURNING 1) SELECT count(*)::int AS n FROM i`),
  })),
];

async function purge(): Promise<void> {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const dry = argv.includes('--dry-run');
  const env = process.env.VERCEL_ENV;
  const run = env === 'production' || (force && !env);

  const re = blockedEmailPattern();
  log(`domínios: ${BLOCKED_EMAIL_DOMAINS.join(', ')}`);
  log(`decisão: ${run ? 'RODAR' : 'PULAR'} — ${run ? (env === 'production' ? 'VERCEL_ENV=production' : '--force') : `VERCEL_ENV=${env ?? '(vazio)'}; use --force fora da Vercel`}`);
  if (dry) { log('--dry-run: nada foi conectado.'); for (const j of jobs) log(`  planejado: ${j.label}`); return; }
  if (!run) return;

  const dbs: Array<{ name: string; url?: string }> = [
    { name: 'CRM', url: process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL },
    { name: 'Premium', url: process.env.ORDERS_DATABASE_URL },
  ];
  const seen = new Set<string>();
  for (const db of dbs) {
    if (!db.url) { log(`${db.name}: PULAR — variável de conexão ausente`); continue; }
    if (seen.has(db.url)) { log(`${db.name}: PULAR — mesmo banco de outro já processado`); continue; }
    seen.add(db.url);
    const sql = neon(db.url);
    for (const job of jobs) {
      try {
        const count = await job.run(sql, re);
        log(`${db.name}: ${job.label} → ${count}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // tabela/coluna inexistente neste banco é esperado (CRM e Premium têm tabelas diferentes)
        log(`${db.name}: ${job.label} → ignorado (${/does not exist/i.test(msg) ? 'tabela ou coluna não existe neste banco' : `ERRO: ${msg}`})`);
      }
    }
  }
}

async function main() {
  let timer: NodeJS.Timeout | undefined;
  const estourou = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), TIMEOUT_MS); });
  try {
    const r = await Promise.race([purge().then(() => 'ok' as const), estourou]);
    if (r === 'timeout') console.error(`${TAG} FALHOU: passou de ${TIMEOUT_MS / 60000} min; abandonando (o build segue).`);
    else log('fim');
  } catch (err) {
    console.error(`${TAG} FALHOU: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
  process.exit(0);
}

void main();
