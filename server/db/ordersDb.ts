import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = process.env.ORDERS_DATABASE_URL ?? process.env.DATABASE_URL!;
const client = postgres(url, { max: 1, idle_timeout: 20, prepare: false, ssl: 'require', connect_timeout: 15 });
export const ordersDb = drizzle(client, { schema });
