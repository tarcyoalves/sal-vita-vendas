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

    console.log('✅ Database tables ensured');
  } catch (err) {
    console.error('❌ Migration error:', err);
    throw err;
  }
}
