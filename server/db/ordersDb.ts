import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

function createOrdersDb() {
  const url = process.env.ORDERS_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error('No database URL configured');
  return drizzle(neon(url), { schema });
}

let _ordersDb: ReturnType<typeof createOrdersDb> | null = null;
export function getOrdersDb() {
  if (!_ordersDb) _ordersDb = createOrdersDb();
  return _ordersDb;
}

// Backwards-compat default export used by shipping router
export const ordersDb = new Proxy({} as ReturnType<typeof createOrdersDb>, {
  get(_target, prop) {
    return (getOrdersDb() as Record<string | symbol, unknown>)[prop];
  },
});
