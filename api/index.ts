import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../server/routers';
import { createContext } from '../server/trpc';
import { ensureTablesExist } from '../server/db/migrate';

const app = express();

// Run DB migrations on startup (idempotent - IF NOT EXISTS)
ensureTablesExist();

const ALLOWED_ORIGINS = [
  'https://sal-vita-vendas.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  ...(process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : []),
];

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.includes(origin)),
  credentials: true,
}));

app.use(express.json());

app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

export default app;
