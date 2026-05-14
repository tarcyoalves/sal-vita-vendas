import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../auth';

export async function ensureTablesExist() {
  const sql = neon(process.env.SALLOG_DATABASE_URL!);

  await sql`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'driver',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS drivers (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, cpf TEXT NOT NULL UNIQUE,
    plate TEXT NOT NULL, phone TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS freights (
    id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT,
    cargo_type TEXT NOT NULL DEFAULT 'bigbag',
    origin_city TEXT NOT NULL, origin_state TEXT NOT NULL,
    destination_city TEXT NOT NULL, destination_state TEXT NOT NULL,
    distance REAL, value INTEGER NOT NULL DEFAULT 0, weight REAL,
    status TEXT NOT NULL DEFAULT 'available',
    created_by INTEGER NOT NULL, assigned_driver_id INTEGER,
    validated_at TIMESTAMP, paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS freight_interests (
    id SERIAL PRIMARY KEY, freight_id INTEGER NOT NULL, driver_id INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT freight_interests_uniq UNIQUE (freight_id, driver_id)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS driver_locations (
    id SERIAL PRIMARY KEY, driver_id INTEGER NOT NULL, freight_id INTEGER NOT NULL,
    lat REAL NOT NULL, lng REAL NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS freight_chats (
    id SERIAL PRIMARY KEY, freight_id INTEGER NOT NULL, sender_id INTEGER NOT NULL,
    sender_role TEXT NOT NULL, content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`;

  await sql`CREATE TABLE IF NOT EXISTS freight_documents (
    id SERIAL PRIMARY KEY, freight_id INTEGER NOT NULL, driver_id INTEGER NOT NULL,
    file_url TEXT NOT NULL, uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`;

  await sql`CREATE INDEX IF NOT EXISTS drivers_status_idx ON drivers(status)`;
  await sql`CREATE INDEX IF NOT EXISTS freights_status_idx ON freights(status)`;
  await sql`CREATE INDEX IF NOT EXISTS freights_driver_idx ON freights(assigned_driver_id)`;
  await sql`CREATE INDEX IF NOT EXISTS locations_freight_idx ON driver_locations(freight_id, recorded_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS chats_freight_idx ON freight_chats(freight_id, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS interests_driver_idx ON freight_interests(driver_id)`;

  // Add new columns (idempotent)
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`;
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS vehicle_type TEXT`;
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pix_key TEXT`;
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS score REAL DEFAULT 0`;
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS total_freights INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE freights ADD COLUMN IF NOT EXISTS load_date TEXT`;
  await sql`ALTER TABLE freights ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'ida'`;
  await sql`ALTER TABLE freight_interests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'`;
  await sql`ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'comprovante'`;
  await sql`ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS validated BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS validated_at TIMESTAMP`;
  await sql`ALTER TABLE freight_documents ADD COLUMN IF NOT EXISTS validated_by INTEGER`;
  await sql`ALTER TABLE freights ADD COLUMN IF NOT EXISTS delivery_date TEXT`;
  await sql`ALTER TABLE freights ADD COLUMN IF NOT EXISTS freight_type TEXT NOT NULL DEFAULT 'completo'`;
  await sql`ALTER TABLE freights ADD COLUMN IF NOT EXISTS vehicle_types TEXT`;
  await sql`ALTER TABLE freights ADD COLUMN IF NOT EXISTS needs_tarp BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE freights ADD COLUMN IF NOT EXISTS needs_tracker BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE freights ADD COLUMN IF NOT EXISTS has_insurance BOOLEAN NOT NULL DEFAULT TRUE`;
  await sql`ALTER TABLE freights ADD COLUMN IF NOT EXISTS payment_method TEXT`;
  await sql`ALTER TABLE freights ADD COLUMN IF NOT EXISTS value_negotiable BOOLEAN NOT NULL DEFAULT FALSE`;

  // Bootstrap admin user — two-step to avoid ON CONFLICT WHERE edge cases
  {
    const adminEmail = 'tarcyo.alves@gmail.com';
    const adminHash = hashPassword('01020304');
    const existing = await sql`SELECT id, role FROM users WHERE email = ${adminEmail} LIMIT 1`;
    if (existing.length === 0) {
      await sql`INSERT INTO users (name, email, password_hash, role) VALUES ('Tarcyo', ${adminEmail}, ${adminHash}, 'admin')`;
      console.log('✅ Admin user created');
    } else {
      await sql`UPDATE users SET password_hash = ${adminHash}, role = 'admin' WHERE email = ${adminEmail}`;
      console.log(`✅ Admin password reset (was role=${existing[0].role})`);
    }
  }

  console.log('✅ SalLog DB tables ensured');
}
