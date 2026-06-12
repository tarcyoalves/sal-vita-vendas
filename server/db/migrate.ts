import postgres from 'postgres';

export async function ensureTablesExist() {
  const dbUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL!;
  // Use a dedicated client so a hanging migration never blocks the main db pool
  const sql = postgres(dbUrl, {
    max: 1,
    prepare: false,
    ssl: 'require',
    connect_timeout: 20,  // Neon auto-suspend wake-up can take up to 15 s
  });
  try {
    // Fast-path: probe all critical tables. Only skip the full DDL block when
    // ALL 5 core tables exist — guards against Lambda-freeze mid-migration
    // leaving a partial schema (e.g. 'users' created but 'sellers' not).
    // All DDL uses CREATE TABLE IF NOT EXISTS so re-running is always safe.
    let skipDDL = false;
    try {
      const check = await sql`
        SELECT COUNT(*)::int AS cnt
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'sellers', 'tasks', 'clients', 'reminders')
      `;
      if ((check[0]?.cnt ?? 0) >= 5) {
        skipDDL = true;
        console.log('✅ Core tables already exist — skipping full DDL');
      } else {
        console.log(`⚠️ Only ${check[0]?.cnt ?? 0}/5 core tables found — running DDL`);
      }
    } catch (probeErr: any) {
      // Probe failed — log but do NOT skip. On a fresh Neon DB the compute may
      // still be waking up when the probe fires; skipping here would
      // permanently leave the DB with no tables.
      console.warn('⚠️ DB probe failed, proceeding to DDL:', probeErr?.message ?? probeErr);
    }

    if (!skipDDL) {
    // Full schema migration only runs on fresh databases
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

    // Performance indexes (CRM tables only)
    await sql`CREATE INDEX IF NOT EXISTS tasks_user_id_idx ON tasks(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON tasks(assigned_to)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(status)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_reminder_date_idx ON tasks(reminder_date)`;
    await sql`CREATE INDEX IF NOT EXISTS tasks_last_contacted_at_idx ON tasks(last_contacted_at)`;
    await sql`CREATE INDEX IF NOT EXISTS work_sessions_user_id_idx ON work_sessions(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS work_sessions_status_idx ON work_sessions(status)`;
    await sql`CREATE INDEX IF NOT EXISTS work_sessions_started_at_idx ON work_sessions(started_at)`;
    await sql`CREATE INDEX IF NOT EXISTS chat_messages_user_id_idx ON chat_messages(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS knowledge_docs_user_id_idx ON knowledge_documents(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS sellers_status_idx ON sellers(status)`;
    await sql`CREATE INDEX IF NOT EXISTS sellers_user_id_idx ON sellers(user_id)`;

    // Orders tables (site_orders, abandoned_carts, etc.) live in ORDERS_DATABASE_URL
    // and are managed by server/db/ordersMigrate.ts — do NOT create them here.

    const rlsTables = ['users','sellers','tasks','clients','reminders',
      'chat_messages','knowledge_documents','work_sessions'];
    for (const t of rlsTables) {
      try {
        await sql`ALTER TABLE ${sql(t)} ENABLE ROW LEVEL SECURITY`;
      } catch { /* RLS already enabled or not supported in this connection mode */ }
    }

    // Purge chat history older than 90 days to keep storage under Neon free-tier limit
    try {
      await sql`DELETE FROM chat_messages WHERE created_at < NOW() - INTERVAL '90 days'`;
    } catch { /* table may not exist yet on first run */ }

    // Seed admin user on fresh database
    const existing = await sql`SELECT id FROM users LIMIT 1`;
    if (existing.length === 0) {
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
      console.log('✅ Admin user created: tarcyo.alves@gmail.com / admin123');
    }

    console.log('✅ Database tables, indexes, and RLS ensured');
    }

    // ── Incremental migrations (always run, idempotent) ──────────────────────
    await sql`ALTER TABLE tasks   ADD COLUMN IF NOT EXISTS email TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS unsubscribed BOOLEAN NOT NULL DEFAULT false`;

    // Backfill: extract the first e-mail found in tasks.notes for tasks that don't have one yet
    await sql`
      UPDATE tasks
      SET email = lower(substring(notes from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'))
      WHERE email IS NULL
        AND notes ~* '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}'
    `;

    // ── E-mail Marketing tables (Lembretes CRM) ───────────────────────────────
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
    await sql`CREATE INDEX IF NOT EXISTS tasks_email_idx ON tasks(email)`;

  } catch (err) {
    console.error('❌ Migration error:', err);
    throw err;
  } finally {
    await sql.end({ timeout: 2 });
  }
}
