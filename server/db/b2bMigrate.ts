import { neon } from '@neondatabase/serverless';

type Step = { name: string; ok: boolean; error?: string };

// Bump whenever the DDL below changes, to force exactly one full re-run.
const B2B_SCHEMA_VERSION = 'b2b-2026-07-03a';

/**
 * Ensures the B2B prospecting foundation tables exist (Sprint 1 scope only:
 * companies, contacts, public_sources, consent_records, suppression_list,
 * audit_logs — see PLANO-FINAL-EXECUCAO-B2B.md Seção 9). Lives in the same
 * `public` schema as the rest of the app — no new schema/DB needed.
 *
 * Mirrors ensureOrdersTablesExist() structurally: each statement runs in
 * isolation so a single failure never blocks the rest, and reuses the same
 * ORDERS_DATABASE_URL fallback since B2B leads belong to the premium
 * e-commerce subsystem (companies/contacts may later reference site_orders).
 * Same fast-path rationale too — skips all ~18 round-trips once the schema
 * marker matches, instead of paying them on every cold start.
 */
export async function ensureB2bTablesExist(force = false): Promise<Step[]> {
  const url = process.env.ORDERS_DATABASE_URL ?? process.env.DATABASE_URL;
  const steps: Step[] = [];
  if (!url) {
    steps.push({ name: 'config', ok: false, error: 'ORDERS_DATABASE_URL and DATABASE_URL are both unset' });
    return steps;
  }
  const sql = neon(url);

  async function run(name: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      steps.push({ name, ok: true });
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      steps.push({ name, ok: false, error: msg });
      console.error(`[b2b-migrate] step "${name}" failed:`, msg);
    }
  }

  if (!force) {
    try {
      const v = await sql`SELECT value FROM schema_meta WHERE key = 'b2b_schema_version' LIMIT 1`;
      if ((v as unknown as Array<{ value: string }>)[0]?.value === B2B_SCHEMA_VERSION) {
        return steps;
      }
    } catch { /* schema_meta missing → fall through and run the full migration */ }
  }

  await run('companies', () => sql`
    CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      trade_name TEXT,
      segment TEXT,
      subsegment TEXT,
      cnpj TEXT,
      company_validation_status TEXT NOT NULL DEFAULT 'unverified',
      website TEXT,
      instagram_url TEXT,
      city TEXT,
      state TEXT,
      country TEXT NOT NULL DEFAULT 'BR',
      source_type TEXT,
      source_url TEXT,
      pipeline_type TEXT NOT NULL DEFAULT 'inbound',
      pipeline_stage TEXT NOT NULL DEFAULT 'discovered',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await run('companies_status_idx', () => sql`CREATE INDEX IF NOT EXISTS companies_status_idx ON companies(status)`);
  await run('companies_segment_state_idx', () => sql`CREATE INDEX IF NOT EXISTS companies_segment_state_idx ON companies(segment, state)`);
  await run('companies_cnpj_idx', () => sql`CREATE INDEX IF NOT EXISTS companies_cnpj_idx ON companies(cnpj)`);
  await run('companies_pipeline_stage_idx', () => sql`CREATE INDEX IF NOT EXISTS companies_pipeline_stage_idx ON companies(pipeline_stage)`);

  await run('contacts', () => sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      name TEXT,
      role TEXT,
      email TEXT,
      phone TEXT,
      whatsapp TEXT,
      channel_type TEXT,
      is_public_business_contact BOOLEAN NOT NULL DEFAULT TRUE,
      source_url TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await run('contacts_company_id_idx', () => sql`CREATE INDEX IF NOT EXISTS contacts_company_id_idx ON contacts(company_id)`);
  await run('contacts_email_idx', () => sql`CREATE INDEX IF NOT EXISTS contacts_email_idx ON contacts(email)`);
  await run('contacts_phone_idx', () => sql`CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts(phone)`);

  await run('public_sources', () => sql`
    CREATE TABLE IF NOT EXISTS public_sources (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_url TEXT,
      captured_at TIMESTAMP DEFAULT NOW() NOT NULL,
      raw_excerpt TEXT,
      confidence INTEGER
    )
  `);
  await run('public_sources_company_id_idx', () => sql`CREATE INDEX IF NOT EXISTS public_sources_company_id_idx ON public_sources(company_id)`);

  await run('consent_records', () => sql`
    CREATE TABLE IF NOT EXISTS consent_records (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL,
      contact_id INTEGER,
      form_name TEXT,
      consent_text TEXT,
      consented_at TIMESTAMP DEFAULT NOW() NOT NULL,
      ip_hash TEXT,
      user_agent TEXT
    )
  `);
  await run('consent_records_company_id_idx', () => sql`CREATE INDEX IF NOT EXISTS consent_records_company_id_idx ON consent_records(company_id)`);

  await run('suppression_list', () => sql`
    CREATE TABLE IF NOT EXISTS suppression_list (
      id SERIAL PRIMARY KEY,
      email TEXT,
      phone TEXT,
      domain TEXT,
      company_id INTEGER,
      reason TEXT NOT NULL,
      source TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await run('suppression_list_email_idx', () => sql`CREATE INDEX IF NOT EXISTS suppression_list_email_idx ON suppression_list(email)`);
  await run('suppression_list_phone_idx', () => sql`CREATE INDEX IF NOT EXISTS suppression_list_phone_idx ON suppression_list(phone)`);

  await run('audit_logs', () => sql`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      metadata_json JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await run('audit_logs_entity_idx', () => sql`CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id)`);

  // Record the marker so subsequent cold starts take the fast path above
  // instead of re-running all ~18 round-trips.
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`;
    await sql`INSERT INTO schema_meta (key, value) VALUES ('b2b_schema_version', ${B2B_SCHEMA_VERSION})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  } catch {}

  const failed = steps.filter(s => !s.ok);
  console.log(`[b2b-migrate] done: ${steps.length - failed.length}/${steps.length} ok` + (failed.length ? `, failed: ${failed.map(f => f.name).join(', ')}` : ''));
  return steps;
}
