import { sql } from './index';

// Cria as tabelas se ainda não existirem. Roda automaticamente no startup do serviço.
export async function ensureTablesExist() {
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      wa_number TEXT NOT NULL UNIQUE,
      name TEXT,
      interest_type TEXT NOT NULL DEFAULT 'unknown',
      region TEXT,
      intended_volume TEXT,
      purpose TEXT,
      source TEXT NOT NULL DEFAULT 'whatsapp_ad',
      qualified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      lead_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'bot',
      assigned_user_id INTEGER,
      handoff_reason TEXT,
      last_message_at TIMESTAMP,
      bot_paused_until TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      wa_message_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS handoff_events (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL,
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      triggered_by TEXT NOT NULL,
      user_id INTEGER,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS webhook_log (
      id SERIAL PRIMARY KEY,
      payload TEXT NOT NULL,
      processed BOOLEAN NOT NULL DEFAULT FALSE,
      error TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;
}
