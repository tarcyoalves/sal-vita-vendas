import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// DATABASE_URL → CRM Neon project (users, sellers, tasks, clients, reminders, etc.)
// ORDERS_DATABASE_URL → Orders Neon project (site_orders, abandoned_carts, etc.)
// NEON_DATABASE_URL is kept as a legacy override for backwards compatibility.
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
