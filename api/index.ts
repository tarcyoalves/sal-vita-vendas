import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../server/routers';
import { createContext } from '../server/trpc';
import { ensureTablesExist } from '../server/db/migrate';
import { db } from '../server/db';
import { siteOrders } from '../server/db/schema';
import { eq } from 'drizzle-orm';

const app = express();

// Run DB migrations on startup (idempotent - IF NOT EXISTS)
ensureTablesExist();

// ── Allowed origins ────────────────────────────────────────────────────────────
// In production, allow only the Vercel domain + any extra via env var
const PROD_ORIGINS = [
  'https://sal-vita-vendas.vercel.app',
  'https://lembretes.salvitarn.com.br',
  'https://www.premium.salvitarn.com.br',
  'https://premium.salvitarn.com.br',
  ...(process.env.ALLOWED_ORIGIN  ? [process.env.ALLOWED_ORIGIN]  : []),
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : []),
];
const IS_PROD = process.env.NODE_ENV === 'production';
const ALLOWED_ORIGINS = IS_PROD
  ? PROD_ORIGINS
  : [...PROD_ORIGINS, 'http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'];

// ── Security headers (Helmet) ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // Vite/React needs eval in dev; tighten in future
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.groq.com', 'https://generativelanguage.googleapis.com'],
      fontSrc:    ["'self'", 'https:', 'data:'],
      objectSrc:  ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Breaks some browser APIs if true
}));

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server (no origin) and whitelisted origins only
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));

app.use(express.json({ limit: '2mb' }));

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

// Mercado Pago webhook — called when payment status changes
app.post('/api/mp-webhook', async (req, res) => {
  try {
    const { type, data } = req.body as { type?: string; data?: { id?: string } };
    if (type !== 'payment' || !data?.id) { res.json({ ok: true }); return; }

    const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!token) { res.status(500).json({ error: 'no token' }); return; }

    const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!payRes.ok) { res.json({ ok: true }); return; }

    const payment = await payRes.json() as { status: string; external_reference?: string; id?: number };
    const orderId = parseInt(payment.external_reference ?? '');
    if (!orderId) { res.json({ ok: true }); return; }

    if (payment.status === 'approved') {
      await db.update(siteOrders)
        .set({ paymentStatus: 'confirmed', mpPaymentId: String(payment.id), updatedAt: new Date() })
        .where(eq(siteOrders.id, orderId));
    } else if (payment.status === 'rejected') {
      await db.update(siteOrders)
        .set({ paymentStatus: 'failed', mpPaymentId: String(payment.id), updatedAt: new Date() })
        .where(eq(siteOrders.id, orderId));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('MP webhook error:', err);
    res.json({ ok: true }); // Always 200 so MP doesn't retry endlessly
  }
});

export default app;
