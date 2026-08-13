import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// Fail loudly instead of silently falling back to the CRM database. The old
// `ORDERS_DATABASE_URL ?? DATABASE_URL` meant that if the orders variable ever
// went missing, the storefront would happily write real orders into the CRM
// database and nobody would notice until the admin panel came up empty.
//
// In production the fallback is refused outright: a missing variable is a
// deploy/config bug, and writing real orders and B2B leads into the CRM
// database mixes two datasets in a way that is painful to unpick afterwards.
// Locally the fallback stays, so a dev only needs one connection string.
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.ORDERS_DATABASE_URL) {
  throw new Error(
    'ORDERS_DATABASE_URL is not set in production — refusing to start. ' +
    'Set it in the Vercel project settings; falling back to DATABASE_URL would write orders into the CRM database.'
  );
}

const url = process.env.ORDERS_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('ORDERS_DATABASE_URL is not set (and neither is DATABASE_URL) — refusing to start without an orders database.');
}
if (!process.env.ORDERS_DATABASE_URL) {
  console.warn('[ordersDb] ORDERS_DATABASE_URL is unset — falling back to DATABASE_URL (dev only). Orders will be written to the CRM database.');
}
const sql = neon(url);
export const ordersDb = drizzle(sql, { schema });
