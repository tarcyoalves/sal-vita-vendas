import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.ORDERS_DATABASE_URL ?? process.env.DATABASE_URL!;
const client = postgres(url, { max: 5, idle_timeout: 60, prepare: false, ssl: 'require', connect_timeout: 15 });
export const ordersDb = drizzle(client, { schema });

// Pre-warm the connection pool on module load so the first user request isn't slow
client`SELECT 1`.catch(() => {});
