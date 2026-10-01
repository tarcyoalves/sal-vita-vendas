/**
 * Preenche `tasks.phone` das tarefas que têm telefone escrito no título ou nas anotações mas a
 * coluna vazia (shared/phone.ts). Roda no build de PRODUÇÃO da Vercel (`npm run backfill:phones`).
 *
 * Idempotente e conservador: só preenche coluna NULL/vazia; nunca sobrescreve um valor existente
 * (nem lixo) e não mexe em `updated_at`. Nunca quebra o build: erro vira `[backfill:phones] FALHOU`
 * e o processo sai com 0. Só imprime contagens e `error.message`; nunca connection string.
 *
 * Uso:
 *   tsx scripts/backfill-task-phones.ts            só com VERCEL_ENV=production
 *   tsx scripts/backfill-task-phones.ts --force    roda fora da Vercel
 *   tsx scripts/backfill-task-phones.ts --dry-run  conecta, conta e NÃO grava
 */
import { neon } from '@neondatabase/serverless';
import { phoneOfTask } from '../shared/phone';

const TAG = '[backfill:phones]';
const TIMEOUT_MS = 3 * 60 * 1000;
const BATCH = 500;
const log = (m: string) => console.log(`${TAG} ${m}`);

async function backfill(): Promise<void> {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const dry = argv.includes('--dry-run');
  const env = process.env.VERCEL_ENV;
  const run = env === 'production' || (force && !env);
  log(`decisão: ${run ? 'RODAR' : 'PULAR'} (VERCEL_ENV=${env ?? '(vazio)'}${force ? ', --force' : ''})`);
  if (!run) return;

  const url = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) { log('sem DATABASE_URL; nada a fazer.'); return; }
  const sql = neon(url);

  const rows = (await sql`
    SELECT id, title, notes FROM tasks
    WHERE (phone IS NULL OR phone = '')
      AND (coalesce(title, '') ~ '[0-9]{4}' OR coalesce(notes, '') ~ '[0-9]{4}')
  `) as Array<{ id: number; title: string | null; notes: string | null }>;

  const ids: number[] = [];
  const phones: string[] = [];
  for (const r of rows) {
    const p = phoneOfTask({ title: r.title, notes: r.notes });
    if (p) { ids.push(r.id); phones.push(p); }
  }
  log(`tarefas sem telefone na coluna e com dígitos: ${rows.length} · telefone encontrado em: ${ids.length}`);
  if (dry || ids.length === 0) { if (dry) log('--dry-run: nada gravado.'); return; }

  let gravadas = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const res = (await sql`
      WITH v AS (SELECT unnest(${ids.slice(i, i + BATCH)}::int[]) AS id, unnest(${phones.slice(i, i + BATCH)}::text[]) AS phone),
      u AS (
        UPDATE tasks t SET phone = v.phone FROM v
        WHERE t.id = v.id AND (t.phone IS NULL OR t.phone = '')
        RETURNING 1)
      SELECT count(*)::int AS n FROM u
    `) as Array<{ n: number }>;
    gravadas += Number(res[0]?.n ?? 0);
  }
  log(`telefones gravados na coluna: ${gravadas}`);
}

async function main() {
  let timer: NodeJS.Timeout | undefined;
  const estourou = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), TIMEOUT_MS); });
  try {
    const r = await Promise.race([backfill().then(() => 'ok' as const), estourou]);
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
