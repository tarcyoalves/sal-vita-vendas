import { neon } from '@neondatabase/serverless';

export async function ensureOrdersTablesExist() {
  const url = process.env.ORDERS_DATABASE_URL;
  if (!url) return; // Not configured yet — skip silently
  try {
    const sql = neon(url);

    await sql`
      CREATE TABLE IF NOT EXISTS site_orders (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
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
        notes TEXT,
        tracking_code TEXT,
        mp_preference_id TEXT,
        mp_payment_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS site_orders_status_idx ON site_orders(status)`;
    await sql`CREATE INDEX IF NOT EXISTS site_orders_created_at_idx ON site_orders(created_at)`;
    await sql`ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS customer_cpf TEXT`;
    await sql`ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS coupon_code TEXT`;
    await sql`ALTER TABLE site_orders ADD COLUMN IF NOT EXISTS coupon_discount TEXT`;

    // Start order IDs at 10000 for new installs (safe to run multiple times)
    await sql`SELECT setval(pg_get_serial_sequence('site_orders','id'), GREATEST(last_value, 9999), true) FROM site_orders_id_seq`;

    await sql`
      CREATE TABLE IF NOT EXISTS abandoned_carts (
        id SERIAL PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        postal_code TEXT,
        quantity INTEGER DEFAULT 1,
        step_reached INTEGER DEFAULT 1,
        recovered BOOLEAN NOT NULL DEFAULT FALSE,
        recovery_sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS abandoned_carts_phone_idx ON abandoned_carts(customer_phone)`;
    await sql`CREATE INDEX IF NOT EXISTS abandoned_carts_recovered_idx ON abandoned_carts(recovered)`;

    await sql`
      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        description TEXT,
        discount_type TEXT NOT NULL DEFAULT 'percent',
        discount_value TEXT NOT NULL DEFAULT '10',
        min_order_value TEXT DEFAULT '0',
        max_uses INTEGER DEFAULT 100,
        used_count INTEGER NOT NULL DEFAULT 0,
        expires_at TIMESTAMP,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `;

    console.log('✅ Orders database tables ensured');
  } catch (err) {
    console.error('❌ Orders migration error:', err);
    throw err;
  }
}
