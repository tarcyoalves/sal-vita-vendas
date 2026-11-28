import { neon } from '@neondatabase/serverless';

type Step = { name: string; ok: boolean; error?: string };

// Suba a cada mudança do DDL abaixo (e rode `npm run schema:lock`), senão o caminho rápido pula a migração.
const SALES_SCHEMA_VERSION = 'sales-2026-11-28d';

/**
 * Tabelas do Sal Vita Sales AI (venda B2B da caixa de 10 kg) no banco do PREMIUM
 * (ORDERS_DATABASE_URL, e SÓ ele: sem a variável, falha em vez de usar o banco do CRM). Só CREATE ... IF NOT EXISTS:
 * nenhuma tabela existente é alterada. Contrato em shared/sales.ts.
 *
 * Mesma estrutura de ensureB2bTablesExist(): cada comando roda isolado (uma falha não
 * bloqueia o resto) e o marcador em schema_meta faz o cold start pular tudo depois da 1ª vez.
 */
export async function ensureSalesTablesExist(force = false): Promise<Step[]> {
  // SÓ o banco da loja. Sem ORDERS_DATABASE_URL a migração FALHA: cair para DATABASE_URL criaria
  // estas tabelas (e depois os dados) no banco do CRM Lembretes, que é outra conta e outro produto.
  const url = process.env.ORDERS_DATABASE_URL?.trim();
  const steps: Step[] = [];
  if (!url) {
    steps.push({ name: 'config', ok: false, error: 'ORDERS_DATABASE_URL is not set — refusing to fall back to the CRM database' });
    return steps;
  }
  const sql = neon(url);

  async function run(name: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      steps.push({ name, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      steps.push({ name, ok: false, error: msg });
      console.error(`[sales-migrate] step "${name}" failed:`, msg);
    }
  }

  if (!force) {
    try {
      const v = await sql`SELECT value FROM schema_meta WHERE key = 'sales_schema_version' LIMIT 1`;
      if ((v as unknown as Array<{ value: string }>)[0]?.value === SALES_SCHEMA_VERSION) {
        return steps;
      }
    } catch { /* schema_meta ausente → roda a migração inteira */ }
  }

  await run('sales_settings', () => sql`
    CREATE TABLE IF NOT EXISTS sales_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_by TEXT
    )
  `);

  await run('sales_journeys', () => sql`
    CREATE TABLE IF NOT EXISTS sales_journeys (
      id SERIAL PRIMARY KEY,
      contact_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'IDENTIFIED',
      state_version INTEGER NOT NULL DEFAULT 1,
      cadence_step INTEGER NOT NULL DEFAULT 0,
      next_action_at TIMESTAMP,
      paused_reason TEXT,
      score INTEGER,
      score_reasons JSONB,
      segments JSONB,
      eligibility JSONB,
      priority INTEGER NOT NULL DEFAULT 0,
      last_contacted_at TIMESTAMP,
      last_event_at TIMESTAMP,
      closed_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await run('sales_journeys_contact_uq', () => sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_journeys_contact_uq ON sales_journeys(contact_id)`);
  await run('sales_journeys_email_uq', () => sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_journeys_email_uq ON sales_journeys(email)`);
  // Token de descadastro por jornada (o link reusa /api/unsubscribe). Preenche as jornadas antigas.
  await run('sales_journeys.unsub_token', () => sql`ALTER TABLE sales_journeys ADD COLUMN IF NOT EXISTS unsub_token TEXT`);
  await run('sales_journeys.unsub_token_fill', () => sql`UPDATE sales_journeys SET unsub_token = gen_random_uuid()::text WHERE unsub_token IS NULL`);
  await run('sales_journeys_unsub_token_uq', () => sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_journeys_unsub_token_uq ON sales_journeys(unsub_token)`);
  await run('sales_journeys_state_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_journeys_state_idx ON sales_journeys(state, next_action_at)`);
  await run('sales_journeys_company_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_journeys_company_idx ON sales_journeys(company_id)`);

  await run('sales_batches', () => sql`
    CREATE TABLE IF NOT EXISTS sales_batches (
      id SERIAL PRIMARY KEY,
      batch_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      size INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      approved_at TIMESTAMP,
      approved_by TEXT,
      cancelled_at TIMESTAMP
    )
  `);
  await run('sales_batches_date_uq', () => sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_batches_date_uq ON sales_batches(batch_date)`);

  await run('sales_messages', () => sql`
    CREATE TABLE IF NOT EXISTS sales_messages (
      id SERIAL PRIMARY KEY,
      logical_key TEXT NOT NULL,
      journey_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      batch_id INTEGER,
      channel TEXT NOT NULL DEFAULT 'prospeccao_smtp',
      step INTEGER NOT NULL,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      message_id_header TEXT NOT NULL,
      template_version TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      approved_at TIMESTAMP,
      approved_by TEXT,
      reserved_by TEXT,
      reserved_until TIMESTAMP,
      reservation_token_hash TEXT,
      fence INTEGER NOT NULL DEFAULT 0,
      dispatch_token_hash TEXT,
      dispatch_expires_at TIMESTAMP,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_retry_at TIMESTAMP,
      last_attempt_at TIMESTAMP,
      last_error TEXT,
      accepted_at TIMESTAMP,
      failed_at TIMESTAMP,
      cancelled_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await run('sales_messages_logical_key_uq', () => sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_messages_logical_key_uq ON sales_messages(logical_key)`);
  await run('sales_messages_message_id_uq', () => sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_messages_message_id_uq ON sales_messages(message_id_header)`);
  await run('sales_messages_status_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_messages_status_idx ON sales_messages(status, reserved_until)`);
  await run('sales_messages_contact_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_messages_contact_idx ON sales_messages(contact_id)`);
  await run('sales_messages_email_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_messages_email_idx ON sales_messages(to_email, accepted_at)`);

  await run('sales_message_attempts', () => sql`
    CREATE TABLE IF NOT EXISTS sales_message_attempts (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL,
      fence INTEGER NOT NULL,
      executor TEXT NOT NULL,
      started_at TIMESTAMP DEFAULT NOW() NOT NULL,
      outcome TEXT,
      smtp_response TEXT,
      finished_at TIMESTAMP
    )
  `);
  await run('sales_message_attempts_msg_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_message_attempts_msg_idx ON sales_message_attempts(message_id)`);

  await run('sales_events', () => sql`
    CREATE TABLE IF NOT EXISTS sales_events (
      id SERIAL PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      email TEXT,
      contact_id INTEGER,
      message_id INTEGER,
      payload JSONB,
      received_at TIMESTAMP DEFAULT NOW() NOT NULL,
      processed_at TIMESTAMP,
      result TEXT
    )
  `);
  await run('sales_events_key_uq', () => sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_events_key_uq ON sales_events(idempotency_key)`);
  await run('sales_events_email_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_events_email_idx ON sales_events(email, received_at)`);

  await run('sales_exceptions', () => sql`
    CREATE TABLE IF NOT EXISTS sales_exceptions (
      id SERIAL PRIMARY KEY,
      idempotency_key TEXT,
      kind TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'normal',
      title TEXT NOT NULL,
      detail TEXT,
      evidence JSONB,
      company_id INTEGER,
      contact_id INTEGER,
      conversation_id TEXT,
      proposed_action JSONB,
      created_by TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      resolved_by TEXT,
      resolved_at TIMESTAMP,
      resolution TEXT,
      crm_task_op_id INTEGER,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await run('sales_exceptions_key_uq', () => sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_exceptions_key_uq ON sales_exceptions(idempotency_key)`);
  await run('sales_exceptions_status_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_exceptions_status_idx ON sales_exceptions(status, created_at)`);

  await run('sales_sync_ops', () => sql`
    CREATE TABLE IF NOT EXISTS sales_sync_ops (
      id SERIAL PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload JSONB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      result JSONB,
      claimed_until TIMESTAMP,
      done_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await run('sales_sync_ops_key_uq', () => sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_sync_ops_key_uq ON sales_sync_ops(idempotency_key)`);
  await run('sales_sync_ops_status_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_sync_ops_status_idx ON sales_sync_ops(status, claimed_until)`);

  await run('sales_opt_ins', () => sql`
    CREATE TABLE IF NOT EXISTS sales_opt_ins (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      scope TEXT NOT NULL,
      consent_version TEXT NOT NULL,
      consent_text TEXT NOT NULL,
      source TEXT NOT NULL,
      proof JSONB,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      revoked_at TIMESTAMP
    )
  `);
  await run('sales_opt_ins_email_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_opt_ins_email_idx ON sales_opt_ins(email, scope)`);

  await run('sales_agent_kb', () => sql`
    CREATE TABLE IF NOT EXISTS sales_agent_kb (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      key TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      approved_by TEXT,
      approved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await run('sales_agent_kb_key_uq', () => sql`CREATE UNIQUE INDEX IF NOT EXISTS sales_agent_kb_key_uq ON sales_agent_kb(key)`);

  await run('sales_agent_conversations', () => sql`
    CREATE TABLE IF NOT EXISTS sales_agent_conversations (
      id TEXT PRIMARY KEY,
      visitor_hash TEXT,
      profile TEXT,
      contact_email TEXT,
      company_name TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      flagged BOOLEAN NOT NULL DEFAULT FALSE,
      flag_reason TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      started_at TIMESTAMP DEFAULT NOW() NOT NULL,
      last_at TIMESTAMP DEFAULT NOW() NOT NULL,
      expires_at TIMESTAMP
    )
  `);
  await run('sales_agent_conversations_last_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_agent_conversations_last_idx ON sales_agent_conversations(last_at)`);

  await run('sales_agent_messages', () => sql`
    CREATE TABLE IF NOT EXISTS sales_agent_messages (
      id SERIAL PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_name TEXT,
      tool_payload JSONB,
      blocked BOOLEAN NOT NULL DEFAULT FALSE,
      block_reason TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await run('sales_agent_messages_conv_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_agent_messages_conv_idx ON sales_agent_messages(conversation_id, id)`);

  await run('sales_heartbeats', () => sql`
    CREATE TABLE IF NOT EXISTS sales_heartbeats (
      executor TEXT PRIMARY KEY,
      version TEXT,
      last_seen_at TIMESTAMP DEFAULT NOW() NOT NULL,
      payload JSONB
    )
  `);

  // A retenção de 90 dias das conversas do agente (V3, seção 7.3) roda no ciclo (ciclo.ts,
  // passo 'retencao_agente'): aqui o caminho rápido do cold start a pulava sempre. Índice para ela:
  await run('sales_agent_conversations_expires_idx', () => sql`CREATE INDEX IF NOT EXISTS sales_agent_conversations_expires_idx ON sales_agent_conversations(expires_at)`);

  const failed = steps.filter((s) => !s.ok);
  // Marcador só quando TUDO passou: com falha, a próxima chamada tenta de novo (o DDL é idempotente).
  if (failed.length === 0) {
    try {
      await sql`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`;
      await sql`INSERT INTO schema_meta (key, value) VALUES ('sales_schema_version', ${SALES_SCHEMA_VERSION})
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    } catch { /* sem marcador: a próxima chamada roda de novo */ }
  }

  console.log(`[sales-migrate] done: ${steps.length - failed.length}/${steps.length} ok` + (failed.length ? `, failed: ${failed.map((f) => f.name).join(', ')}` : ''));
  return steps;
}
