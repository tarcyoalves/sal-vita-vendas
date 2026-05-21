import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './api/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.SALLOG_DATABASE_URL! },
});
