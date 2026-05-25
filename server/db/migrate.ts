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
        daily_goal      INTEGER NOT NULL DEFAULT 10,
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

  // ── Incremental migrations (always run, idempotent) ───────────────────────
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS assigned_to       TEXT`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS order_value        NUMERIC(10,2)`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS order_id           TEXT`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS last_contacted_at  TIMESTAMP`;
  await sql`ALTER TABLE sellers   ADD COLUMN IF NOT EXISTS user_id            INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE sellers   ADD COLUMN IF NOT EXISTS work_hours_goal    INTEGER NOT NULL DEFAULT 8`;
  await sql`ALTER TABLE knowledge_documents ADD COLUMN IF NOT EXISTS file_url TEXT`;
  await sql`ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS daily_goal_hours INTEGER NOT NULL DEFAULT 8`;
  await sql`ALTER TABLE reminders ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMP DEFAULT NOW()`;
  await sql`ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMP DEFAULT NOW()`;

  // ── Indexes ───────────────────────────────────────────────────────────────
  await sql`CREATE INDEX IF NOT EXISTS tasks_user_id_idx        ON tasks(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_status_idx         ON tasks(status)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_reminder_date_idx     ON tasks(reminder_date)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_last_contacted_at_idx ON tasks(last_contacted_at)`;
  await sql`CREATE INDEX IF NOT EXISTS work_sessions_user_id_idx   ON work_sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS work_sessions_status_idx    ON work_sessions(status)`;
  await sql`CREATE INDEX IF NOT EXISTS work_sessions_started_at_idx ON work_sessions(started_at)`;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_user_id_idx   ON chat_messages(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS knowledge_docs_user_id_idx  ON knowledge_documents(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sellers_status_idx          ON sellers(status)`;
  await sql`CREATE INDEX IF NOT EXISTS sellers_user_id_idx         ON sellers(user_id)`;

  // Purge old data to stay within Neon free-tier limits (512 MB storage, ~5 GB transfer/month)
  try { await sql`DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '90 days'`; } catch {}
  try { await sql`DELETE FROM tasks WHERE status IN ('completed','cancelled') AND updated_at < NOW() - INTERVAL '180 days'`; } catch {}
  try { await sql`DELETE FROM reminders WHERE status = 'completed' AND scheduled_date < NOW() - INTERVAL '180 days'`; } catch {}
  try { await sql`DELETE FROM work_sessions WHERE status = 'completed' AND ended_at < NOW() - INTERVAL '90 days'`; } catch {}
}
