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
 *  - ARQUIVA em `blocked_contacts` e EXCLUI: tarefas (não convertidas e sem pedido), clientes sem
 *    tarefa ligada e contatos de marketing. Tarefa excluída também entra em task_deletion_logs.
 *  - ESVAZIA o campo e-mail (NULL) em leads do Radar (base pública da Receita) e contatos B2B.
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
import { BLOCKED_EMAIL_ADDRESSES, BLOCKED_EMAIL_DOMAINS, BLOCKED_EMAIL_KEYWORDS, blockedEmailPattern, protectedEmailPattern } from '../shared/blockedEmailDomains';

const TAG = '[purge:blocked]';
const TIMEOUT_MS = 3 * 60 * 1000;
const log = (m: string) => console.log(`${TAG} ${m}`);

type Sql = ReturnType<typeof neon>;
type Job = { label: string; run: (sql: Sql, re: string, pro: string) => Promise<number> };

const n = (rows: unknown): number => Number((rows as Array<{ n: number }>)[0]?.n ?? 0);

const jobs: Job[] = [
  // ── APAGA ──
  { label: 'DELETE email_campaign_recipients', run: async (s, re, pro) => n(await s`WITH d AS (DELETE FROM email_campaign_recipients WHERE email ~* ${re} AND email !~* ${pro} RETURNING 1) SELECT count(*)::int AS n FROM d`) },
  { label: 'DELETE email_sequence_enrollments', run: async (s, re, pro) => n(await s`WITH d AS (DELETE FROM email_sequence_enrollments WHERE email ~* ${re} AND email !~* ${pro} RETURNING 1) SELECT count(*)::int AS n FROM d`) },
  { label: 'DELETE email_events', run: async (s, re, pro) => n(await s`WITH d AS (DELETE FROM email_events WHERE recipient_email ~* ${re} AND recipient_email !~* ${pro} RETURNING 1) SELECT count(*)::int AS n FROM d`) },
  {
    label: 'ARQUIVA+EXCLUI marketing_contacts',
    run: async (s, re, pro) => n(await s`
      WITH del AS (DELETE FROM marketing_contacts WHERE email ~* ${re} AND email !~* ${pro} RETURNING id, email, name, phone, company, city, state),
      arq AS (
        INSERT INTO blocked_contacts (origem, origem_id, email, domain, nome, telefone, detalhes)
        SELECT 'contato_marketing', id::text, lower(email), lower(split_part(email, '@', 2)), name, phone,
               jsonb_build_object('empresa', company, 'cidade', city, 'uf', state)
        FROM del ON CONFLICT DO NOTHING RETURNING 1)
      SELECT (SELECT count(*) FROM del)::int AS n`),
  },
  { label: 'DELETE abandoned_carts', run: async (s, re, pro) => n(await s`WITH d AS (DELETE FROM abandoned_carts WHERE customer_email ~* ${re} AND customer_email !~* ${pro} RETURNING 1) SELECT count(*)::int AS n FROM d`) },
  // ── ESVAZIA o campo e-mail ──
  {
    label: 'ARQUIVA+EXCLUI clients (sem tarefa ligada)',
    run: async (s, re, pro) => n(await s`
      WITH del AS (
        DELETE FROM clients c WHERE c.email ~* ${re} AND c.email !~* ${pro}
          AND NOT EXISTS (SELECT 1 FROM tasks x WHERE x.client_id = c.id)
        RETURNING c.id, c.email, c.name, c.phone, c.company, c.city, c.state),
      arq AS (
        INSERT INTO blocked_contacts (origem, origem_id, email, domain, nome, telefone, detalhes)
        SELECT 'cliente', id::text, lower(email), lower(split_part(email, '@', 2)), name, phone,
               jsonb_build_object('empresa', company, 'cidade', city, 'uf', state)
        FROM del ON CONFLICT DO NOTHING RETURNING 1)
      SELECT (SELECT count(*) FROM del)::int AS n`),
  },
  // Tarefa inteira: arquiva (nome, telefone, CNPJ, atendente, notas), registra em task_deletion_logs
  // (o Radar e a importação passam a tratar o lead como excluído) e só então exclui. Uma instrução:
  // se o arquivo falhar, nada é apagado. NÃO exclui tarefa já convertida em cliente nem com pedido.
  {
    label: 'ARQUIVA+EXCLUI tasks (não convertidas, sem pedido)',
    run: async (s, re, pro) => n(await s`
      WITH del AS (
        DELETE FROM tasks t WHERE t.email ~* ${re} AND t.email !~* ${pro}
          AND t.converted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM fat_orders o WHERE o.task_id = t.id)
        RETURNING t.id, t.title, t.description, t.notes, t.email, t.phone, t.cnpj, t.assigned_to, t.created_at),
      arq AS (
        INSERT INTO blocked_contacts (origem, origem_id, email, domain, nome, telefone, cnpj, detalhes)
        SELECT 'tarefa', id::text, lower(email), lower(split_part(email, '@', 2)), title, phone, cnpj,
               jsonb_build_object('descricao', description, 'notas', notes, 'atendente', assigned_to, 'criadaEm', created_at)
        FROM del ON CONFLICT DO NOTHING RETURNING 1),
      logx AS (
        INSERT INTO task_deletion_logs (task_id, task_title, task_notes, deleted_by_user_id, deleted_by_name, reason, reviewed_by_admin, cnpj, phone)
        SELECT id, title, notes, 0, 'Sistema (domínio bloqueado)', 'E-mail de domínio bloqueado pelo dono', true, cnpj, phone FROM del RETURNING 1)
      SELECT (SELECT count(*) FROM del)::int AS n`),
  },
  {
    label: 'IGNORADAS tasks bloqueadas mas convertidas/com pedido (não excluídas)',
    run: async (s, re, pro) => n(await s`
      SELECT count(*)::int AS n FROM tasks t WHERE t.email ~* ${re} AND t.email !~* ${pro}
        AND (t.converted_at IS NOT NULL OR EXISTS (SELECT 1 FROM fat_orders o WHERE o.task_id = t.id))`),
  },
  { label: 'NULL radar_establishments.email', run: async (s, re, pro) => n(await s`WITH u AS (UPDATE radar_establishments SET email = NULL WHERE email ~* ${re} AND email !~* ${pro} RETURNING 1) SELECT count(*)::int AS n FROM u`) },
  { label: 'NULL contacts.email (B2B)', run: async (s, re, pro) => n(await s`WITH u AS (UPDATE contacts SET email = NULL WHERE email ~* ${re} AND email !~* ${pro} RETURNING 1) SELECT count(*)::int AS n FROM u`) },
  // ── SÓ CONTA (nunca altera) ──
  { label: 'CONTA users (login) — não alterado', run: async (s, re, pro) => n(await s`SELECT count(*)::int AS n FROM users WHERE email ~* ${re} AND email !~* ${pro}`) },
  { label: 'CONTA sellers (atendentes) — não alterado', run: async (s, re, pro) => n(await s`SELECT count(*)::int AS n FROM sellers WHERE email ~* ${re} AND email !~* ${pro}`) },
  { label: 'CONTA site_orders (pedidos da loja) — não alterado', run: async (s, re, pro) => n(await s`SELECT count(*)::int AS n FROM site_orders WHERE customer_email ~* ${re} AND customer_email !~* ${pro}`) },
  // ── Lista "Bloqueados" do E-mail Marketing: todo e-mail arquivado entra (endereço único por linha) ──
  { label: 'SEMEIA email_suppressions a partir do arquivo', run: async (s) => n(await s`
      WITH i AS (INSERT INTO email_suppressions (email, reason)
        SELECT DISTINCT lower(email), 'dominio_bloqueado' FROM blocked_contacts WHERE email IS NOT NULL AND email !~ '[;, ]'
        ON CONFLICT (email) DO NOTHING RETURNING 1) SELECT count(*)::int AS n FROM i`) },
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


/** Só relatório (nada é alterado): domínios com "sal" que existem nos dados, fora o da própria casa. */
const REPORT_SAL = '@[^@]*sal';
async function relatorioDominios(sql: Sql, pro: string, banco: string): Promise<void> {
  const fontes: Array<{ nome: string; q: () => Promise<unknown> }> = [
    { nome: 'tasks.email', q: () => sql`SELECT lower(split_part(email, '@', 2)) AS d, count(*)::int AS n FROM tasks WHERE email ~* ${REPORT_SAL} AND email !~* ${pro} GROUP BY 1 ORDER BY n DESC LIMIT 25` },
    { nome: 'clients.email', q: () => sql`SELECT lower(split_part(email, '@', 2)) AS d, count(*)::int AS n FROM clients WHERE email ~* ${REPORT_SAL} AND email !~* ${pro} GROUP BY 1 ORDER BY n DESC LIMIT 25` },
    { nome: 'marketing_contacts.email', q: () => sql`SELECT lower(split_part(email, '@', 2)) AS d, count(*)::int AS n FROM marketing_contacts WHERE email ~* ${REPORT_SAL} AND email !~* ${pro} GROUP BY 1 ORDER BY n DESC LIMIT 25` },
    { nome: 'email_campaign_recipients.email', q: () => sql`SELECT lower(split_part(email, '@', 2)) AS d, count(*)::int AS n FROM email_campaign_recipients WHERE email ~* ${REPORT_SAL} AND email !~* ${pro} GROUP BY 1 ORDER BY n DESC LIMIT 25` },
    { nome: 'contacts.email (B2B)', q: () => sql`SELECT lower(split_part(email, '@', 2)) AS d, count(*)::int AS n FROM contacts WHERE email ~* ${REPORT_SAL} AND email !~* ${pro} GROUP BY 1 ORDER BY n DESC LIMIT 25` },
    { nome: 'radar_establishments.email', q: () => sql`SELECT lower(split_part(email, '@', 2)) AS d, count(*)::int AS n FROM radar_establishments WHERE email ~* ${REPORT_SAL} AND email !~* ${pro} GROUP BY 1 ORDER BY n DESC LIMIT 25` },
  ];
  for (const f of fontes) {
    try {
      const rows = (await f.q()) as Array<{ d: string; n: number }>;
      if (rows.length) log(`${banco}: RELATÓRIO domínios com "sal" em ${f.nome}: ${rows.map((r) => `${r.d} (${r.n})`).join(', ')}`);
    } catch {
      /* tabela/coluna inexistente neste banco */
    }
  }
}

/**
 * Só relatório: tarefas que podem ser das empresas bloqueadas mas já tiveram o e-mail esvaziado (a
 * limpeza anterior só apagava o campo). Nada é excluído aqui: o dono confere e decide.
 */
async function relatorioCandidatas(sql: Sql, banco: string): Promise<void> {
  const rotulos = BLOCKED_EMAIL_DOMAINS.map((d) => d.split('.')[0]).filter((l) => l.length >= 5);
  const rx = rotulos.join('|');
  const consultas: Array<{ nome: string; q: () => Promise<unknown> }> = [
    {
      nome: 'tarefas sem e-mail mas com e-mail confirmado antes (provável e-mail esvaziado)',
      q: () => sql`SELECT id, left(title, 60) AS t FROM tasks WHERE email IS NULL AND email_confirmed = true AND converted_at IS NULL ORDER BY id LIMIT 40`,
    },
    {
      nome: `tarefas que citam ${rotulos.join('/')} no título, descrição ou notas`,
      q: () => sql`SELECT id, left(title, 60) AS t FROM tasks WHERE (title ~* ${rx} OR coalesce(description, '') ~* ${rx} OR coalesce(notes, '') ~* ${rx}) AND converted_at IS NULL ORDER BY id LIMIT 40`,
    },
  ];
  for (const c of consultas) {
    try {
      const rows = (await c.q()) as Array<{ id: number; t: string }>;
      if (rows.length) log(`${banco}: CANDIDATAS (${c.nome}) ${rows.length} (ex.: ${rows.slice(0, 3).map((r) => `#${r.id} ${r.t.slice(0, 40)}`).join(' | ')})`);
      else log(`${banco}: CANDIDATAS (${c.nome}) 0`);
    } catch {
      /* tabela/coluna inexistente neste banco */
    }
  }
}

/** Só leitura: o que já está arquivado em blocked_contacts, por origem e domínio (para o dono conferir). */
async function relatorioArquivo(sql: Sql, banco: string): Promise<void> {
  try {
    const rows = (await sql`SELECT origem, coalesce(domain, '(sem e-mail)') AS d, count(*)::int AS n FROM blocked_contacts GROUP BY 1, 2 ORDER BY n DESC LIMIT 60`) as Array<{ origem: string; d: string; n: number }>;
    log(`${banco}: ARQUIVO blocked_contacts (${rows.reduce((s, r) => s + r.n, 0)}): ${rows.map((r) => `${r.origem}:${r.d} (${r.n})`).join(', ') || 'vazio'}`);
  } catch {
    /* tabela inexistente neste banco */
  }
}

async function purge(): Promise<void> {
  const argv = process.argv.slice(2);
  const force = argv.includes('--force');
  const dry = argv.includes('--dry-run');
  const env = process.env.VERCEL_ENV;
  const run = env === 'production' || (force && !env);

  const re = blockedEmailPattern();
  const pro = protectedEmailPattern();
  log(`domínios: ${BLOCKED_EMAIL_DOMAINS.join(', ')} · palavras: ${BLOCKED_EMAIL_KEYWORDS.join(', ')}`);
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
    await relatorioDominios(sql, pro, db.name);
    await relatorioCandidatas(sql, db.name);
    await relatorioArquivo(sql, db.name);
    for (const job of jobs) {
      try {
        const count = await job.run(sql, re, pro);
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
