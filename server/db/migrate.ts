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

export async function ensureTablesExist() {
  // Always seed admin first in case DB has tables but lost the admin row
  try { await seedAdminIfNeeded(); } catch {}

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

  // Backfill: extract the first e-mail found in tasks.notes for tasks that don't have one yet
  await sql`
    UPDATE tasks
    SET email = lower(substring(notes from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'))
    WHERE email IS NULL
      AND notes ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'
  `;

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

  // Purge old data to stay within Neon free-tier limits (512 MB storage, ~5 GB transfer/month)
  // Chat: keep only today's messages — each session starts fresh, old history wastes storage+transfer
  try { await sql`DELETE FROM chat_messages WHERE created_at < CURRENT_DATE`; } catch {}
  // Work sessions: keep last 90 days of completed sessions
  try { await sql`DELETE FROM work_sessions WHERE status = 'completed' AND ended_at < NOW() - INTERVAL '90 days'`; } catch {}
}
