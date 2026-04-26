import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
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

// Rate limiting for auth endpoints — 10 attempts per 15 minutes per email/IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body as Record<string, unknown>;
    return (typeof body?.email === 'string' ? body.email : '') || req.ip || 'unknown';
  },
});

app.use('/api/trpc/auth.login', authLimiter);
app.use('/api/trpc/auth.emergencyReset', authLimiter);

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
