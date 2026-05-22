import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Prefer NEON_DATABASE_URL when set — allows switching from Supabase to Neon
// by adding a single env var without removing DATABASE_URL.
const dbUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL!;

const client = postgres(dbUrl, {
  max: 2,
  idle_timeout: 20,
  prepare: false,
  ssl: 'require',
  connect_timeout: 15,
});

// Pre-warm the connection pool on Lambda cold start so the first request
// doesn't have to wait for the TCP handshake + TLS + auth round-trip.
client`SELECT 1`.catch(() => {});

export const db = drizzle(client, { schema });
export { client as sql };
