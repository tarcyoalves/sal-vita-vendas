import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!, {
  max: 2,
  idle_timeout: 20,
  prepare: false,
  ssl: 'require',
  connect_timeout: 15,
});

export const db = drizzle(client, { schema });
export { client as sql };
