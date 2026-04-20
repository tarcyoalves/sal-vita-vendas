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

    console.log('✅ Database tables ensured');
  } catch (err) {
    console.error('❌ Migration error:', err);
  }
}
