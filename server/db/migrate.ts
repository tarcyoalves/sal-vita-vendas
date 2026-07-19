import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../auth';

const DATABASE_URL = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL!;
export const sql = neon(DATABASE_URL);

async function seedAdminIfNeeded() {
  const rows = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
  if (rows.length > 0) return;
  const hash = hashPassword('admin123');
  await sql`
    INSERT INTO users (name, email, password_hash, role, must_change_password)
    VALUES ('Admin', 'tarcyo.alves@gmail.com', ${hash}, 'admin', false)
    ON CONFLICT (email) DO NOTHING
  `;
  console.log('[migrate] admin user seeded');
}

// Bump this whenever the migrations below change to force exactly one re-run
// across all serverless instances. Format: date + optional suffix.
const SCHEMA_VERSION = '2026-07-19a';

export async function ensureTablesExist() {
  // Always seed admin first in case DB has tables but lost the admin row
  try { await seedAdminIfNeeded(); } catch {}

  // Fast path: if the schema marker matches, the DB is already fully migrated.
  // Skip the ~58 idempotent DDL/ALTER/CREATE INDEX round-trips that would
  // otherwise run on EVERY cold start and burn Neon free-tier compute. The
  // cheap daily purges still run to respect the storage limit.
  try {
    const v = await sql`SELECT value FROM schema_meta WHERE key = 'schema_version' LIMIT 1`;
    if ((v as unknown as Array<{ value: string }>)[0]?.value === SCHEMA_VERSION) {
      // These 4 are independent (no shared state) — firing them together instead
      // of sequentially awaiting each one cuts the cold-start critical path from
      // ~4 network round-trips to ~1, since neon-http pays a fresh HTTP+TLS hop
      // per query with no connection reuse.
      await Promise.allSettled([
        sql`DELETE FROM chat_messages WHERE created_at < CURRENT_DATE`,
        sql`DELETE FROM work_sessions WHERE status = 'completed' AND ended_at < NOW() - INTERVAL '90 days'`,
        sql`CREATE TABLE IF NOT EXISTS email_template_categories (id SERIAL PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
        sql`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS category_ids JSONB`,
      ]);
      return;
    }
  } catch { /* schema_meta missing → fall through and run the full migration */ }

  // Fast probe: if all 5 core tables already exist, skip DDL and go straight to
  // incremental migrations (ALTER TABLE ADD COLUMN IF NOT EXISTS + indexes).
  let skipDDL = false;
  try {
    const probe = await sql`
      SELECT COUNT(*)::int AS cnt FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users','sellers','tasks','clients','reminders')
    `;
    const found = (probe as unknown as Array<{ cnt: number }>)[0]?.cnt ?? 0;
    if (found === 5) {
      skipDDL = true;
    } else {
      console.log(`[migrate] probe found ${found}/5 core tables — running full DDL`);
    }
  } catch (err) {
    console.log('[migrate] probe failed, running full DDL:', (err as Error).message);
  }

  if (!skipDDL) {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id               SERIAL PRIMARY KEY,
        name             TEXT NOT NULL,
        email            TEXT NOT NULL UNIQUE,
        password_hash    TEXT NOT NULL,
        role             TEXT NOT NULL DEFAULT 'user',
        must_change_password BOOLEAN NOT NULL DEFAULT true,
        created_at       TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS sellers (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL DEFAULT 0,
        name            TEXT NOT NULL,
        email           TEXT NOT NULL,
        phone           TEXT,
        department      TEXT,
        daily_goal      INTEGER NOT NULL DEFAULT 100,
        work_hours_goal INTEGER NOT NULL DEFAULT 8,
        status          TEXT NOT NULL DEFAULT 'active',
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS clients (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        email      TEXT,
        phone      TEXT,
        company    TEXT,
        city       TEXT,
        state      TEXT,
        status     TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER,
        client_id       INTEGER,
        title           TEXT NOT NULL,
        description     TEXT,
        notes           TEXT,
        reminder_date   TIMESTAMP,
        status          TEXT NOT NULL DEFAULT 'pending',
        priority        TEXT NOT NULL DEFAULT 'medium',
        assigned_to     TEXT,
        order_value     NUMERIC(10,2),
        order_id        TEXT,
        last_contacted_at TIMESTAMP,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS reminders (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER,
        client_name    TEXT NOT NULL,
        client_phone   TEXT,
        notes          TEXT,
        scheduled_date TIMESTAMP NOT NULL,
        status         TEXT NOT NULL DEFAULT 'pending',
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER,
        content    TEXT NOT NULL,
        role       TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL,
        category   TEXT,
        file_url   TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS work_sessions (
        id               SERIAL PRIMARY KEY,
        user_id          INTEGER NOT NULL,
        started_at       TIMESTAMP NOT NULL DEFAULT NOW(),
        ended_at         TIMESTAMP,
        paused_at        TIMESTAMP,
        total_paused_ms  INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL DEFAULT 'active',
        daily_goal_hours INTEGER NOT NULL DEFAULT 8,
        created_at       TIMESTAMP DEFAULT NOW()
      )
    `;
  }

  // app_settings: small global key/value toggles (e.g. TV panel on/off)
  await sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // tags: admin-curated catalog so attendants pick from a fixed list instead
  // of free-typing tags on tasks
  await sql`
    CREATE TABLE IF NOT EXISTS tags (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL UNIQUE,
      color      TEXT NOT NULL DEFAULT '#6366f1',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
  // Seed from tags already used on tasks, so existing tags keep working as
  // admin-curated entries from the start.
  await sql`
    INSERT INTO tags (name)
    SELECT DISTINCT unnest(tags) FROM tasks WHERE array_length(tags, 1) > 0
    ON CONFLICT (name) DO NOTHING
  `;

  // task_deletion_logs: audit trail for task deletions made by attendants
  await sql`
    CREATE TABLE IF NOT EXISTS task_deletion_logs (
      id                   SERIAL PRIMARY KEY,
      task_id              INTEGER NOT NULL,
      task_title           TEXT NOT NULL,
      task_notes           TEXT,
      deleted_by_user_id   INTEGER NOT NULL,
      deleted_by_name      TEXT NOT NULL,
      reason               TEXT NOT NULL,
      reviewed_by_admin    BOOLEAN NOT NULL DEFAULT false,
      created_at           TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS task_del_logs_reviewed_idx ON task_deletion_logs(reviewed_by_admin)`;
  await sql`CREATE INDEX IF NOT EXISTS task_del_logs_user_idx     ON task_deletion_logs(deleted_by_user_id)`;

  // ── E-mail Marketing tables (Lembretes CRM) ────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS email_templates (
      id         SERIAL PRIMARY KEY,
      slug       TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      subject    TEXT NOT NULL,
      html_body  TEXT NOT NULL,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_campaigns (
      id                  SERIAL PRIMARY KEY,
      name                TEXT NOT NULL,
      subject             TEXT NOT NULL,
      html_body           TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'draft',
      total_recipients    INTEGER NOT NULL DEFAULT 0,
      sent_count          INTEGER NOT NULL DEFAULT 0,
      failed_count        INTEGER NOT NULL DEFAULT 0,
      created_by_user_id  INTEGER NOT NULL,
      created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_campaign_recipients (
      id           SERIAL PRIMARY KEY,
      campaign_id  INTEGER NOT NULL,
      email        TEXT NOT NULL,
      name         TEXT,
      reply_to     TEXT,
      task_id      INTEGER,
      status       TEXT NOT NULL DEFAULT 'pending',
      account_key  TEXT,
      message_id   TEXT,
      unsub_token  TEXT NOT NULL,
      error        TEXT,
      sent_at      TIMESTAMP,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_suppressions (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL UNIQUE,
      reason     TEXT NOT NULL DEFAULT 'unsubscribe',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_send_counters (
      id          SERIAL PRIMARY KEY,
      account_key TEXT NOT NULL,
      day         TEXT NOT NULL,
      sent        INTEGER NOT NULL DEFAULT 0
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS email_recipients_campaign_idx ON email_campaign_recipients(campaign_id, status)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS email_counter_key_day_idx ON email_send_counters(account_key, day)`;

  // ── E-mail Marketing Fase 2 — Sequências, Automações, Tags, Eventos ────────
  await sql`
    CREATE TABLE IF NOT EXISTS email_sequences (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      description TEXT,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_sequence_steps (
      id          SERIAL PRIMARY KEY,
      sequence_id INTEGER NOT NULL,
      step_order  INTEGER NOT NULL,
      delay_days  INTEGER NOT NULL,
      subject     TEXT NOT NULL,
      html_body   TEXT NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_sequence_enrollments (
      id           SERIAL PRIMARY KEY,
      sequence_id  INTEGER NOT NULL,
      email        TEXT NOT NULL,
      name         TEXT,
      reply_to     TEXT,
      task_id      INTEGER,
      current_step INTEGER NOT NULL DEFAULT 0,
      status       TEXT NOT NULL DEFAULT 'active',
      unsub_token  TEXT NOT NULL,
      enrolled_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      next_send_at TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_sequence_sends (
      id            SERIAL PRIMARY KEY,
      enrollment_id INTEGER NOT NULL,
      step_id       INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'sent',
      account_key   TEXT,
      message_id    TEXT,
      error         TEXT,
      sent_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS email_events (
      id              SERIAL PRIMARY KEY,
      message_id      TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      event_type      TEXT NOT NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS automation_rules (
      id             SERIAL PRIMARY KEY,
      name           TEXT NOT NULL,
      trigger_type   TEXT NOT NULL,
      trigger_config TEXT,
      action_type    TEXT NOT NULL,
      action_config  TEXT NOT NULL,
      active         BOOLEAN NOT NULL DEFAULT true,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  // ── Marketing Lists & Contacts (standalone CSV-imported leads) ──────────────
  await sql`
    CREATE TABLE IF NOT EXISTS marketing_lists (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      description   TEXT,
      contact_count INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS marketing_contacts (
      id         SERIAL PRIMARY KEY,
      email      TEXT NOT NULL,
      name       TEXT,
      phone      TEXT,
      company    TEXT,
      city       TEXT,
      state      TEXT,
      list_id    INTEGER,
      tags       TEXT[] NOT NULL DEFAULT '{}',
      source     TEXT NOT NULL DEFAULT 'csv_import',
      status     TEXT NOT NULL DEFAULT 'active',
      notes      TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;

  // ── Incremental migrations (always run, idempotent) ───────────────────────
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS assigned_to       TEXT`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS order_value        NUMERIC(10,2)`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS order_id           TEXT`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS last_contacted_at  TIMESTAMP`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS email              TEXT`;
  await sql`ALTER TABLE sellers   ADD COLUMN IF NOT EXISTS user_id            INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE sellers   ADD COLUMN IF NOT EXISTS work_hours_goal    INTEGER NOT NULL DEFAULT 8`;
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS file_url TEXT`;
  await sql`ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS daily_goal_hours INTEGER NOT NULL DEFAULT 8`;
  await sql`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMP DEFAULT NOW()`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMP DEFAULT NOW()`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS converted_at       TIMESTAMP`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS contact_count      INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE clients   ADD COLUMN IF NOT EXISTS unsubscribed       BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS tags               TEXT[] NOT NULL DEFAULT '{}'`;

  // ── Assinatura de e-mail por atendente (E-mail Marketing — Fase 1) ─────────
  await sql`ALTER TABLE sellers   ADD COLUMN IF NOT EXISTS email_signature_html       TEXT`;
  await sql`ALTER TABLE sellers   ADD COLUMN IF NOT EXISTS email_signature_image_url  TEXT`;
  await sql`ALTER TABLE sellers   ADD COLUMN IF NOT EXISTS email_signature_enabled    BOOLEAN NOT NULL DEFAULT true`;
  await sql`ALTER TABLE sellers   ADD COLUMN IF NOT EXISTS email_marketing_enabled   BOOLEAN NOT NULL DEFAULT false`;

  // ── E-mail Marketing Fase 3 — sequências condicionais, recorrentes, lead scoring ──
  await sql`ALTER TABLE email_sequence_steps ADD COLUMN IF NOT EXISTS send_condition TEXT NOT NULL DEFAULT 'always'`;
  await sql`ALTER TABLE email_sequences ADD COLUMN IF NOT EXISTS repeat BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE email_sequences ADD COLUMN IF NOT EXISTS repeat_interval_days INTEGER`;
  await sql`ALTER TABLE email_sequence_enrollments ADD COLUMN IF NOT EXISTS cycle_started_at TIMESTAMP`;
  // Backfill: inscrições antigas usam enrolled_at como base do ciclo.
  await sql`UPDATE email_sequence_enrollments SET cycle_started_at = enrolled_at WHERE cycle_started_at IS NULL`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hot_lead BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_engagement_at TIMESTAMP`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_hot_lead_idx ON tasks (hot_lead) WHERE hot_lead = TRUE`;
  // Lembrete automático de lead quente (F4): marcador de dedupe (janela de 48h).
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hot_lead_reminder_at TIMESTAMP`;

  // ── Envio duplicado de campanha — claim atômico ('sending') ────────────────
  // processBatch reserva destinatários flipando 'pending' → 'sending' com
  // RETURNING antes de enviar; claimed_at permite reciclar reservas órfãs.
  await sql`ALTER TABLE email_campaign_recipients ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMP`;

  // ── Envio duplicado de sequências — idempotência por índice único ──────────
  // cycle_started_at entra na chave única para que sequências recorrentes
  // (repeat=true) reenviem o mesmo passo em ciclos distintos sem colidir.
  await sql`ALTER TABLE email_sequence_sends ADD COLUMN IF NOT EXISTS cycle_started_at TIMESTAMP`;
  // Backfill: linhas antigas usam o ciclo da inscrição; se a inscrição sumiu,
  // caem para o próprio sent_at (cada linha vira sua própria "chave de ciclo").
  await sql`
    UPDATE email_sequence_sends s
    SET cycle_started_at = e.cycle_started_at
    FROM email_sequence_enrollments e
    WHERE s.enrollment_id = e.id AND s.cycle_started_at IS NULL
  `;
  await sql`UPDATE email_sequence_sends SET cycle_started_at = sent_at WHERE cycle_started_at IS NULL`;
  // Remove duplicatas históricas (mantém o menor id) para o CREATE UNIQUE INDEX
  // não falhar. IS NOT DISTINCT FROM trata NULLs como iguais por segurança.
  await sql`
    DELETE FROM email_sequence_sends a
    USING email_sequence_sends b
    WHERE a.enrollment_id = b.enrollment_id
      AND a.step_id       = b.step_id
      AND a.retry_number  = b.retry_number
      AND a.cycle_started_at IS NOT DISTINCT FROM b.cycle_started_at
      AND a.id > b.id
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS email_seq_sends_unique_idx
    ON email_sequence_sends(enrollment_id, step_id, retry_number, cycle_started_at)`;

  // ── Reimportação de leads excluídos — CNPJ/telefone normalizados ───────────
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cnpj TEXT`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS phone TEXT`;
  await sql`ALTER TABLE task_deletion_logs ADD COLUMN IF NOT EXISTS cnpj TEXT`;
  await sql`ALTER TABLE task_deletion_logs ADD COLUMN IF NOT EXISTS phone TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS task_deletion_logs_cnpj_idx  ON task_deletion_logs (cnpj)  WHERE cnpj  IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS task_deletion_logs_phone_idx ON task_deletion_logs (phone) WHERE phone IS NOT NULL`;

  // ── Disparo Rápido (Broadcast) — envio avulso com lista manual + anexos ────
  // ── Automações — filtro por tags e cancelamento de sequências ──────────────
  await sql`ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS required_tags TEXT[]`;
  await sql`ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS excluded_tags TEXT[]`;
  await sql`ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS cancel_other_sequences BOOLEAN NOT NULL DEFAULT FALSE`;

  await sql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS is_broadcast BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS attachments  JSONB`;
  await sql`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS attachments  JSONB`;

  // ── Agendamento de campanhas (E-mail Marketing F4) ─────────────────────────
  // scheduled_at futuro ⇒ status 'scheduled'; o cron diário promove p/ 'sending'
  // quando vence. Index parcial acelera a varredura de agendadas no cron.
  await sql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP`;
  await sql`CREATE INDEX IF NOT EXISTS email_campaigns_scheduled_idx ON email_campaigns (scheduled_at) WHERE status = 'scheduled'`;

  // ── Teste A/B de assunto ────────────────────────────────────────────────────
  // subject_b na campanha + variant ('A'/'B') por destinatário (split 50/50).
  await sql`ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS subject_b TEXT`;
  await sql`ALTER TABLE email_campaign_recipients ADD COLUMN IF NOT EXISTS variant TEXT`;

  // ── Controle de frequência (frequency capping) ─────────────────────────────
  // Config global em app_settings (key 'email_freq_cap', valor JSON). Sem tabela
  // nova — o histórico de envio já vive em email_campaign_recipients.sent_at e
  // email_sequence_sends.sent_at, contados por e-mail na janela configurada.

  // ── Restrição de IP por usuário ─────────────────────────────────────────────
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ip_restriction_enabled BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_ips TEXT[] NOT NULL DEFAULT '{}'`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`;

  // ── Confirmação manual de e-mail — só e-mails confirmados entram em disparo ─
  // Default FALSE: todos os e-mails existentes (importados) começam não-confirmados.
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS email_confirmed    BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS email_confirmed_at TIMESTAMP`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS email_confirmed_by TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_email_confirmed_idx ON tasks (email) WHERE email_confirmed = TRUE`;

  // Backfill: extract the first e-mail found in tasks.notes for tasks that don't have one yet
  await sql`
    UPDATE tasks
    SET email = lower(substring(notes from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'))
    WHERE email IS NULL
      AND notes ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'
  `;

  // ── Recuperação de senha via e-mail ────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      token      TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      used_at    TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;
  try { await sql`DELETE FROM password_reset_tokens WHERE expires_at < NOW() - INTERVAL '1 day'`; } catch {}

  // ── Indexes ───────────────────────────────────────────────────────────────
  await sql`CREATE INDEX IF NOT EXISTS tasks_user_id_idx        ON tasks(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_status_idx         ON tasks(status)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_reminder_date_idx     ON tasks(reminder_date)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_last_contacted_at_idx ON tasks(last_contacted_at)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_email_idx            ON tasks(email)`;
  await sql`CREATE INDEX IF NOT EXISTS work_sessions_user_id_idx   ON work_sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS work_sessions_status_idx    ON work_sessions(status)`;
  await sql`CREATE INDEX IF NOT EXISTS work_sessions_started_at_idx ON work_sessions(started_at)`;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_user_id_idx   ON chat_messages(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS knowledge_docs_user_id_idx  ON knowledge_documents(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sellers_status_idx          ON sellers(status)`;
  await sql`CREATE INDEX IF NOT EXISTS sellers_user_id_idx         ON sellers(user_id)`;

  // ── E-mail Marketing Fase 2 indexes ─────────────────────────────────────────
  await sql`CREATE INDEX IF NOT EXISTS tasks_tags_idx ON tasks USING GIN (tags)`;
  await sql`CREATE INDEX IF NOT EXISTS email_seq_steps_seq_idx ON email_sequence_steps(sequence_id, step_order)`;
  await sql`CREATE INDEX IF NOT EXISTS email_seq_enroll_due_idx ON email_sequence_enrollments(status, next_send_at)`;
  // Replaced: allow same email in same sequence from different tasks (different attendants)
  await sql`DROP INDEX IF EXISTS email_seq_enroll_unique_idx`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS email_seq_enroll_unique_v2_idx ON email_sequence_enrollments(sequence_id, email, COALESCE(task_id, 0))`;
  await sql`CREATE INDEX IF NOT EXISTS email_seq_sends_enrollment_idx ON email_sequence_sends(enrollment_id)`;
  await sql`CREATE INDEX IF NOT EXISTS email_events_message_idx ON email_events(message_id)`;
  await sql`CREATE INDEX IF NOT EXISTS email_events_created_idx ON email_events(created_at)`;
  await sql`DELETE FROM email_events WHERE id NOT IN (
    SELECT MIN(id) FROM email_events GROUP BY message_id, event_type
  )`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS email_events_dedup_idx ON email_events(message_id, event_type)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_assigned_to_lower_idx ON tasks (lower(assigned_to))`;

  // ── Template categories ────────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS email_template_categories (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;
  await sql`ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS category_ids JSONB`;
  // Migrate old single category_id to new category_ids array
  try { await sql`UPDATE email_templates SET category_ids = jsonb_build_array(category_id) WHERE category_id IS NOT NULL AND category_ids IS NULL`; } catch {}
  try { await sql`ALTER TABLE email_templates DROP COLUMN IF EXISTS category_id`; } catch {}

  // ── Reenvio condicional (retry if not opened) ─────────────────────────────
  await sql`ALTER TABLE email_sequence_steps ADD COLUMN IF NOT EXISTS retry_if_not_opened BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE email_sequence_steps ADD COLUMN IF NOT EXISTS retry_delay_hours INTEGER NOT NULL DEFAULT 24`;
  await sql`ALTER TABLE email_sequence_steps ADD COLUMN IF NOT EXISTS max_retries INTEGER NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE email_sequence_steps ADD COLUMN IF NOT EXISTS retry_subject TEXT`;
  await sql`ALTER TABLE email_sequence_sends ADD COLUMN IF NOT EXISTS retry_number INTEGER NOT NULL DEFAULT 0`;

  // ── Marketing Lists & Contacts indexes ──────────────────────────────────────
  await sql`ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS list_id INTEGER`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS marketing_contacts_email_idx ON marketing_contacts (lower(email))`;
  await sql`CREATE INDEX IF NOT EXISTS marketing_contacts_tags_idx ON marketing_contacts USING GIN (tags)`;
  await sql`CREATE INDEX IF NOT EXISTS marketing_contacts_status_idx ON marketing_contacts (status)`;
  await sql`CREATE INDEX IF NOT EXISTS marketing_contacts_list_idx ON marketing_contacts (list_id) WHERE list_id IS NOT NULL`;

  // ── Faturamento & Comissão (CRM) — migrado do localStorage → Neon ──────────
  // IDs gerados no cliente (text PK). `itens` em jsonb. Datas em text ISO
  // (filtro por mês é feito no cliente). Ver server/routers/faturamento.ts.
  await sql`
    CREATE TABLE IF NOT EXISTS fat_products (
      id                TEXT PRIMARY KEY,
      nome              TEXT NOT NULL,
      peso_unitario_kg  DOUBLE PRECISION NOT NULL DEFAULT 0,
      valor_unitario    DOUBLE PRECISION NOT NULL DEFAULT 0,
      ativo             BOOLEAN NOT NULL DEFAULT true,
      criado_em         TEXT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fat_orders (
      id                        TEXT PRIMARY KEY,
      task_id                   INTEGER,
      seller_id                 INTEGER,
      seller_name               TEXT NOT NULL DEFAULT '',
      cliente_nome              TEXT NOT NULL DEFAULT '',
      cnpj                      TEXT NOT NULL DEFAULT '',
      razao_social              TEXT NOT NULL DEFAULT '',
      cidade                    TEXT NOT NULL DEFAULT '',
      uf                        TEXT NOT NULL DEFAULT '',
      status                    TEXT NOT NULL DEFAULT 'estimado',
      comissao_pct              DOUBLE PRECISION NOT NULL DEFAULT 0,
      itens                     JSONB NOT NULL DEFAULT '[]'::jsonb,
      itens_estimado_snapshot   JSONB,
      prazo_pagamento_sal       TEXT NOT NULL DEFAULT '',
      prazo_pagamento_frete     TEXT NOT NULL DEFAULT '',
      valor_frete_por_unidade   DOUBLE PRECISION NOT NULL DEFAULT 0,
      observacoes               TEXT NOT NULL DEFAULT '',
      criado_em                 TEXT NOT NULL,
      faturado_em               TEXT
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS fat_commissions (
      seller_id INTEGER PRIMARY KEY,
      pct       DOUBLE PRECISION NOT NULL DEFAULT 0
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS fat_orders_seller_idx ON fat_orders(seller_id)`;
  await sql`CREATE INDEX IF NOT EXISTS fat_orders_status_idx ON fat_orders(status)`;

  // Auditoria de exclusão de pedidos — motivo obrigatório + snapshot dos dados.
  await sql`
    CREATE TABLE IF NOT EXISTS fat_order_deletion_logs (
      id                  SERIAL PRIMARY KEY,
      pedido_id           TEXT NOT NULL,
      cliente_nome        TEXT NOT NULL DEFAULT '',
      cnpj                TEXT NOT NULL DEFAULT '',
      valor_total         DOUBLE PRECISION NOT NULL DEFAULT 0,
      seller_id           INTEGER,
      seller_name         TEXT NOT NULL DEFAULT '',
      deleted_by_user_id  INTEGER NOT NULL,
      deleted_by_name     TEXT NOT NULL,
      reason              TEXT NOT NULL,
      created_at          TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS fat_order_deletion_logs_seller_idx ON fat_order_deletion_logs(seller_id)`;

  // ── Pedidos: aprovação do admin, valor pago, comissão/frete por produto ────
  await sql`ALTER TABLE fat_products ADD COLUMN IF NOT EXISTS comissao_fixa_pct DOUBLE PRECISION`;
  await sql`ALTER TABLE fat_products ADD COLUMN IF NOT EXISTS isento_frete BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE fat_orders ADD COLUMN IF NOT EXISTS valor_pago DOUBLE PRECISION NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE fat_orders ADD COLUMN IF NOT EXISTS aprovado_em TEXT`;
  await sql`ALTER TABLE fat_orders ADD COLUMN IF NOT EXISTS aprovado_por TEXT`;
  await sql`ALTER TABLE fat_orders ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER`;
  await sql`ALTER TABLE fat_orders ADD COLUMN IF NOT EXISTS created_by_role TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS fat_orders_pending_approval_idx ON fat_orders(created_by_role) WHERE aprovado_em IS NULL`;

  // SAL MARINHO MOIDO INTEGRAL VITA PREMIUM 10X1 KG: comissão sempre 10%, nunca
  // soma frete — regra de negócio fixa pedida pelo admin, independente de quem vende.
  await sql`
    UPDATE fat_products
    SET comissao_fixa_pct = 10, isento_frete = TRUE
    WHERE nome ILIKE '%VITA PREMIUM%' AND nome ILIKE '%10X1%'
  `;

  // Backfill: pedidos criados no mesmo instante em que o recurso foi ao ar podem
  // ter itens salvos com o navegador ainda mostrando o catálogo antigo (sem
  // comissao_fixa_pct/isento_frete carregados) — o item ficou sem o snapshot da
  // regra do produto. Sincroniza os itens existentes com o produto atual sempre
  // que o produto carregar uma regra fixa, sem mexer em pedidos sem produto ligado.
  await sql`
    UPDATE fat_orders o
    SET itens = sub.novos_itens
    FROM (
      SELECT o2.id, jsonb_agg(
        CASE
          WHEN p.id IS NOT NULL AND (p.comissao_fixa_pct IS NOT NULL OR p.isento_frete)
            THEN item || jsonb_build_object('comissaoFixaPct', p.comissao_fixa_pct, 'isentoFrete', p.isento_frete)
          ELSE item
        END
        ORDER BY ord
      ) AS novos_itens
      FROM fat_orders o2
      CROSS JOIN LATERAL jsonb_array_elements(o2.itens) WITH ORDINALITY AS t(item, ord)
      LEFT JOIN fat_products p ON p.id = item->>'produtoId'
      GROUP BY o2.id
    ) sub
    WHERE o.id = sub.id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(o.itens) AS item2
        JOIN fat_products p2 ON p2.id = item2->>'produtoId'
        WHERE (p2.comissao_fixa_pct IS NOT NULL OR p2.isento_frete)
          AND (item2->>'comissaoFixaPct') IS DISTINCT FROM (p2.comissao_fixa_pct)::text
      )
  `;

  // Tag auto-gerenciada por tasks.confirmEmail/update (ver EMAIL_CONFIRMED_TAG
  // em server/routers/tasks.ts) — precisa existir no catálogo para aparecer no
  // filtro "Filtrar por tag" mesmo antes de qualquer tarefa ter sido confirmada.
  await sql`INSERT INTO tags (name, color) VALUES ('Email Confirmado', '#16a34a') ON CONFLICT (name) DO NOTHING`;

  // Record the schema marker so every subsequent cold start takes the fast path
  // at the top of this function instead of re-running the whole battery above.
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT)`;
    await sql`INSERT INTO schema_meta (key, value) VALUES ('schema_version', ${SCHEMA_VERSION})
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  } catch {}

  // Purge old data to stay within Neon free-tier limits (512 MB storage, ~5 GB transfer/month)
  // Chat: keep only today's messages — each session starts fresh, old history wastes storage+transfer
  try { await sql`DELETE FROM chat_messages WHERE created_at < CURRENT_DATE`; } catch {}
  // Work sessions: keep last 90 days of completed sessions
  try { await sql`DELETE FROM work_sessions WHERE status = 'completed' AND ended_at < NOW() - INTERVAL '90 days'`; } catch {}
}
