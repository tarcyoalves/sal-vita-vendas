import { neon } from '@neondatabase/serverless';

export async function ensureTablesExist() {
  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Create knowledge_documents table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT,
        file_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      ALTER TABLE sellers ADD COLUMN IF NOT EXISTS work_hours_goal INTEGER NOT NULL DEFAULT 8
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS work_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        ended_at TIMESTAMP,
        paused_at TIMESTAMP,
        total_paused_ms INTEGER DEFAULT 0 NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        daily_goal_hours INTEGER DEFAULT 8 NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Performance indexes — idempotent, zero downtime
    await sql`CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON tasks(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON tasks(assigned_to)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_reminder_date_idx ON tasks(reminder_date)`;
    await sql`CREATE INDEX IF NOT EXISTS work_sessions_user_id_idx ON work_sessions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS work_sessions_status_idx ON work_sessions(status)`;
    await sql`CREATE INDEX IF NOT EXISTS work_sessions_started_at_idx ON work_sessions(started_at)`;
    await sql`CREATE INDEX IF NOT EXISTS chat_messages_user_id_idx ON chat_messages(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_docs_user_id_idx ON knowledge_documents(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS sellers_status_idx ON sellers(status)`;
    await sql`CREATE INDEX IF NOT EXISTS sellers_user_id_idx ON sellers(user_id)`;

    // last_contacted_at: tracks when attendant actually edited a task with notes
    // (different from updatedAt which changes on any touch incl. bulk reschedule)
    await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_last_contacted_at_idx ON tasks(last_contacted_at)`;

    // Row Level Security — defense-in-depth
    // Table owner (service role) bypasses RLS automatically; other roles are blocked
    await sql`ALTER TABLE users               ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE sellers             ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE tasks               ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE clients             ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE reminders           ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE chat_messages       ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY`;
    await sql`ALTER TABLE work_sessions       ENABLE ROW LEVEL SECURITY`;

    console.log('✅ Database tables, indexes, and RLS ensured');
  } catch (err) {
    console.error('❌ Migration error:', err);
    throw err;
  }
}
