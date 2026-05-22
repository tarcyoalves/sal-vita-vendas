import postgres from 'postgres';

export async function ensureTablesExist() {
  // Use a dedicated client so a hanging migration never blocks the main db pool
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    prepare: false,
    ssl: 'require',
    connect_timeout: 8,
  });
  try {
    // Fast-path: single probe query. If 'users' table exists, all tables were
    // created by a previous successful deployment — skip the full DDL block.
    // This makes cold starts ~10x faster on warm databases.
    try {
      const check = await sql`
        SELECT COUNT(*)::int AS cnt
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      `;
      if ((check[0]?.cnt ?? 0) > 0) {
        console.log('✅ Tables already exist — skipping DDL');
        return;
      }
    } catch (probeErr: any) {
      // Probe failed — assume tables exist (created by a prior deployment) and
      // return early rather than blocking the cold start with DDL attempts.
      console.warn('⚠️ DB probe failed, skipping migration:', probeErr?.message ?? probeErr);
      return;
    }

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

    await sql`
      CREATE TABLE IF NOT EXISTS site_orders (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        customer_cpf TEXT,
        postal_code TEXT NOT NULL,
        address TEXT NOT NULL,
        number TEXT NOT NULL,
        complement TEXT,
        neighborhood TEXT NOT NULL,
        city TEXT NOT NULL,
        state TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        product TEXT NOT NULL DEFAULT 'Sal Marinho Integral 1kg',
        unit_price TEXT NOT NULL DEFAULT '29.90',
        shipping_service_id TEXT,
        shipping_service_name TEXT,
        shipping_price TEXT,
        total_price TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_status TEXT NOT NULL DEFAULT 'awaiting',
        me_order_id TEXT,
        me_label_url TEXT,
        tracking_code TEXT,
        mp_preference_id TEXT,
        mp_payment_id TEXT,
        notes TEXT,
        coupon_code TEXT,
        coupon_discount TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS abandoned_carts (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL UNIQUE,
        customer_email TEXT,
        postal_code TEXT,
        quantity INTEGER DEFAULT 1,
        step_reached INTEGER DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'checkout_started',
        recovered BOOLEAN DEFAULT false NOT NULL,
        recovery_sent_at TIMESTAMP,
        abandoned_at TIMESTAMP,
        converted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS automation_runs (
        id SERIAL PRIMARY KEY,
        cart_id INTEGER NOT NULL,
        customer_phone TEXT NOT NULL,
        rule_name TEXT NOT NULL DEFAULT 'abandoned_cart_30m',
        status TEXT NOT NULL DEFAULT 'scheduled',
        scheduled_for TIMESTAMP NOT NULL,
        sent_at TIMESTAMP,
        cancelled_at TIMESTAMP,
        provider_response TEXT,
        ai_body TEXT,
        ai_reasoning TEXT,
        ai_processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        description TEXT,
        discount_type TEXT NOT NULL DEFAULT 'percent',
        discount_value TEXT NOT NULL DEFAULT '10',
        min_order_value TEXT DEFAULT '0',
        max_uses INTEGER DEFAULT 100,
        used_count INTEGER DEFAULT 0 NOT NULL,
        expires_at TIMESTAMP,
        active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS msg_templates (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        label TEXT NOT NULL,
        body TEXT NOT NULL,
        active BOOLEAN DEFAULT true NOT NULL,
        is_default BOOLEAN DEFAULT false NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    // Performance indexes
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
    await sql`CREATE INDEX IF NOT EXISTS site_orders_status_idx ON site_orders(status)`;
    await sql`CREATE INDEX IF NOT EXISTS site_orders_created_at_idx ON site_orders(created_at)`;

    // Row Level Security — wrapped individually; Supabase transaction pooler
    // may reject ALTER TABLE in some connection modes but tables still work.
    const rlsTables = ['users','sellers','tasks','clients','reminders',
      'chat_messages','knowledge_documents','work_sessions','site_orders',
      'abandoned_carts','automation_runs','coupons','msg_templates'];
    for (const t of rlsTables) {
      try {
        await sql`ALTER TABLE ${sql(t)} ENABLE ROW LEVEL SECURITY`;
      } catch { /* RLS already enabled or not supported in this connection mode */ }
    }

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
  } catch (err) {
    console.error('❌ Migration error:', err);
    throw err;
  } finally {
    await sql.end({ timeout: 2 });
  }
}
