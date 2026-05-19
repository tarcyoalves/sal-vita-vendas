import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

const url = process.env.ORDERS_DATABASE_URL ?? process.env.DATABASE_URL!;
const sql = neon(url);
export const ordersDb = drizzle(sql, { schema });
