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

    console.log('✅ Database tables and indexes ensured');
  } catch (err) {
    console.error('❌ Migration error:', err);
    throw err;
  }
}
