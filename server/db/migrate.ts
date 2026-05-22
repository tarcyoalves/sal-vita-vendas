import { neon } from '@neondatabase/serverless';

export async function ensureTablesExist() {
  const sql = neon(process.env.DATABASE_URL!);

  // Attempt seed immediately — silently skips if users table doesn't exist yet.
  // Handles the case where a prior Lambda freeze created tables but skipped the seed.
  await seedAdminIfNeeded(sql).catch(() => {});

  try {
    // Fast probe: skip full DDL only when all 5 core tables exist
    const check = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('users', 'sellers', 'tasks', 'clients', 'reminders')
    `;
    const found = (check[0] as { cnt: number })?.cnt ?? 0;
    if (found >= 5) {
      await runIncrementalMigrations(sql);
      await seedAdminIfNeeded(sql);
      console.log('✅ DB incremental migrations done');
      return;
    }
    console.log(`⚠️ Only ${found}/5 core tables — running full DDL`);

    // ── Core CRM tables ──────────────────────────────────────────────────────
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        must_change_password BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS sellers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        department TEXT,
        daily_goal INTEGER DEFAULT 10,
        work_hours_goal INTEGER DEFAULT 8 NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        company TEXT,
        city TEXT,
        state TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL DEFAULT 0,
        client_id INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL,
        description TEXT,
        notes TEXT,
        reminder_date TIMESTAMP,
        reminder_enabled BOOLEAN DEFAULT true,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        assigned_to TEXT,
        last_contacted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS reminders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        client_name TEXT NOT NULL,
        client_phone TEXT,
        notes TEXT,
        scheduled_date TIMESTAMP NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

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

    // ── Indexes ───────────────────────────────────────────────────────────────
    await sql`CREATE INDEX IF NOT EXISTS tasks_user_id_idx           ON tasks(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx       ON tasks(assigned_to)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_status_idx            ON tasks(status)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_reminder_date_idx     ON tasks(reminder_date)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_last_contacted_at_idx ON tasks(last_contacted_at)`;
    await sql`CREATE INDEX IF NOT EXISTS work_sessions_user_id_idx   ON work_sessions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS work_sessions_status_idx    ON work_sessions(status)`;
    await sql`CREATE INDEX IF NOT EXISTS work_sessions_started_at_idx ON work_sessions(started_at)`;
    await sql`CREATE INDEX IF NOT EXISTS chat_messages_user_id_idx   ON chat_messages(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_docs_user_id_idx  ON knowledge_documents(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS sellers_status_idx          ON sellers(status)`;
    await sql`CREATE INDEX IF NOT EXISTS sellers_user_id_idx         ON sellers(user_id)`;

    // ── RLS ───────────────────────────────────────────────────────────────────
    for (const t of ['users','sellers','tasks','clients','reminders',
                     'chat_messages','knowledge_documents','work_sessions']) {
      try { await sql`ALTER TABLE ${sql(t)} ENABLE ROW LEVEL SECURITY`; } catch {}
    }

    console.log('✅ Full schema created successfully');
  } catch (err) {
    console.error('❌ Migration error:', err);
    throw err;
  }

  // Seed runs after BOTH full DDL and incremental paths so Lambda-freeze
  // mid-migration never leaves the DB without the admin account.
  await seedAdminIfNeeded(sql);
}

async function seedAdminIfNeeded(sql: ReturnType<typeof neon>) {
  try {
    const existing = await sql`SELECT id FROM users LIMIT 1`;
    if ((existing as unknown[]).length === 0) {
      await sql`
        INSERT INTO users (name, email, password_hash, role, must_change_password)
        VALUES (
          'Tarcyo Alves',
          'tarcyo.alves@gmail.com',
          '310000:2c6091da2f871bc42a2f6e7cd1db163a:7517d9b6504b6ec5df8c191e43eb8327936c94291b9be10171eced505978089116dd7f31d5f6f0b4a3b79e5d173ba7e2eabec5a1adf33239d8cb41724a546e52',
          'admin',
          false
        )
      `;
      console.log('✅ Admin seeded: tarcyo.alves@gmail.com / admin123');
    }
  } catch { /* users table may not exist yet on partial migration */ }
}

async function runIncrementalMigrations(sql: ReturnType<typeof neon>) {
  await sql`ALTER TABLE sellers ADD COLUMN IF NOT EXISTS work_hours_goal INTEGER NOT NULL DEFAULT 8`;
  await sql`ALTER TABLE tasks   ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMP`;
  await sql`ALTER TABLE tasks   ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN DEFAULT true`;
  await sql`ALTER TABLE users   ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false NOT NULL`;

  await sql`CREATE INDEX IF NOT EXISTS tasks_user_id_idx           ON tasks(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx       ON tasks(assigned_to)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_status_idx            ON tasks(status)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_reminder_date_idx     ON tasks(reminder_date)`;
  await sql`CREATE INDEX IF NOT EXISTS tasks_last_contacted_at_idx ON tasks(last_contacted_at)`;
  await sql`CREATE INDEX IF NOT EXISTS work_sessions_user_id_idx   ON work_sessions(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS work_sessions_status_idx    ON work_sessions(status)`;
  await sql`CREATE INDEX IF NOT EXISTS work_sessions_started_at_idx ON work_sessions(started_at)`;
  await sql`CREATE INDEX IF NOT EXISTS chat_messages_user_id_idx   ON chat_messages(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS knowledge_docs_user_id_idx  ON knowledge_documents(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS sellers_status_idx          ON sellers(status)`;
  await sql`CREATE INDEX IF NOT EXISTS sellers_user_id_idx         ON sellers(user_id)`;

  // Purge chat history > 90 days to keep Neon free-tier storage in check
  try { await sql`DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '90 days'`; } catch {}
}
