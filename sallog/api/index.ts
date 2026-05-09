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

// One-time setup: creates the first admin user. Disabled after first use.
app.post('/api/setup', async (req, res) => {
  try {
    const { name, email, password, secret } = req.body ?? {};
    const setupSecret = process.env.SALLOG_SETUP_SECRET;
    if (!setupSecret || secret !== setupSecret) {
      return res.status(403).json({ error: 'Segredo inválido' });
    }
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email e password são obrigatórios' });
    }
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.SALLOG_DATABASE_URL!);
    const existing = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Admin já existe. Endpoint desativado.' });
    }
    const { hashPassword } = await import('./auth');
    const hash = hashPassword(password);
    const [user] = await sql`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (${name}, ${email}, ${hash}, 'admin')
      RETURNING id, name, email, role
    `;
    return res.json({ ok: true, user });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

const PORT = parseInt(process.env.PORT ?? '3001');

async function start() {
  await ensureTablesExist();
  app.listen(PORT, () => console.log(`SalLog API running on :${PORT}`));
}

start().catch(console.error);

export default app;
