import 'dotenv/config';
import crypto from 'crypto';
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

// Vercel sits behind a proxy — trust first hop so rate limiters see real client IPs
app.set('trust proxy', 1);

ensureTablesExist();

// ── Allowed origins ────────────────────────────────────────────────────────────
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
      scriptSrc:  ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.groq.com', 'https://generativelanguage.googleapis.com'],
      fontSrc:    ["'self'", 'https:', 'data:'],
      objectSrc:  ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ───────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));

// Raw body must be captured before express.json() for HMAC verification
app.post('/api/mp-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = (req.body as Buffer).toString('utf8');
    let body: { type?: string; data?: { id?: string } };
    try { body = JSON.parse(rawBody); } catch { res.status(400).json({ error: 'Invalid JSON' }); return; }

    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (webhookSecret) {
      const xSig = req.headers['x-signature'] as string | undefined;
      const xReqId = req.headers['x-request-id'] as string | undefined;
      if (!xSig || !xReqId) { res.status(401).json({ error: 'Missing signature headers' }); return; }
      const parts = Object.fromEntries(xSig.split(',').map(p => { const [k,...v]=p.split('='); return [k,v.join('=')]; }));
      const { ts, v1 } = parts;
      if (!ts || !v1) { res.status(401).json({ error: 'Malformed x-signature' }); return; }
      const manifest = `id:${body?.data?.id ?? ''};request-id:${xReqId};ts:${ts}`;
      const expected = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) {
        res.status(401).json({ error: 'Invalid signature' }); return;
      }
    } else {
      console.warn('[mp-webhook] MERCADO_PAGO_WEBHOOK_SECRET not set — skipping signature check');
    }

    const { type, data } = body;
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

app.use(express.json({ limit: '2mb' }));

// ── Rate limiters ─────────────────────────────────────────────────────────────
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

const storeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de pedido. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/trpc/auth.login', authLimiter);
app.use('/api/trpc/auth.emergencyReset', authLimiter);
app.use('/api/trpc/shipping.calculate', storeLimiter);
app.use('/api/trpc/shipping.trackOrder', storeLimiter);
app.use('/api/trpc/shipping.createOrder', orderLimiter);
app.use('/api/trpc/shipping.createPayment', orderLimiter);

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
