import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './routers';
import { createContext } from './trpc';
import { ensureTablesExist } from './db/migrate';

const app = express();

const allowedOrigins = (process.env.SALLOG_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

app.use('/api/trpc', createExpressMiddleware({ router: appRouter, createContext }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'sallog' }));

const PORT = parseInt(process.env.PORT ?? '3001');

async function start() {
  await ensureTablesExist();
  app.listen(PORT, () => console.log(`SalLog API running on :${PORT}`));
}

start().catch(console.error);

export default app;
