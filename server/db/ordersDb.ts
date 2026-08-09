import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Fail loudly instead of silently falling back to the CRM database. The old
// `ORDERS_DATABASE_URL ?? DATABASE_URL` meant that if the orders variable ever
// went missing, the storefront would happily write real orders into the CRM
// database and nobody would notice until the admin panel came up empty.
const url = process.env.ORDERS_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('ORDERS_DATABASE_URL is not set (and neither is DATABASE_URL) — refusing to start without an orders database.');
}
if (!process.env.ORDERS_DATABASE_URL) {
  console.warn('[ordersDb] ORDERS_DATABASE_URL is unset — falling back to DATABASE_URL. Orders will be written to the CRM database.');
}
const sql = neon(url);
export const ordersDb = drizzle(sql, { schema });
