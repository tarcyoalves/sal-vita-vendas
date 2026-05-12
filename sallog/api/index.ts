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
    if (!origin) return cb(null, true);
    if (process.env.NODE_ENV !== 'production') return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (/\.vercel\.app$/.test(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// Ensure DB is initialized before handling any request (fixes race condition on cold start)
const initPromise = ensureTablesExist().catch(console.error);
app.use(async (_req, _res, next) => { await initPromise; next(); });

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
    const { hashPassword } = await import('./auth');
    const hash = hashPassword(password);
    const existing = await sql`SELECT id FROM users WHERE email = ${email} AND role = 'admin' LIMIT 1`;
    let user;
    if (existing.length > 0) {
      [user] = await sql`
        UPDATE users SET password_hash = ${hash}, name = ${name}
        WHERE email = ${email} AND role = 'admin'
        RETURNING id, name, email, role
      `;
    } else {
      [user] = await sql`
        INSERT INTO users (name, email, password_hash, role)
        VALUES (${name}, ${email}, ${hash}, 'admin')
        RETURNING id, name, email, role
      `;
    }
    return res.json({ ok: true, user });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default app;
