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
import { ensureOrdersTablesExist } from '../server/db/ordersMigrate';
import { ordersDb } from '../server/db/ordersDb';
import { siteOrders } from '../server/db/schema';
import { eq } from 'drizzle-orm';

const app = express();

// Vercel sits behind a proxy — trust first hop so rate limiters see real client IPs
app.set('trust proxy', 1);

const dbReady = Promise.all([
  ensureTablesExist().catch(err => console.error('DB init error:', err)),
  ensureOrdersTablesExist().catch(err => console.error('Orders DB init error:', err)),
]);

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
      scriptSrc:  ["'self'", "'unsafe-inline'", 'https://connect.facebook.net'],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.groq.com', 'https://generativelanguage.googleapis.com', 'https://www.facebook.com', 'https://connect.facebook.net'],
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
    if (!origin) return cb(null, true); // server-to-server or Vercel internal routing
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));

// Wait for DB tables to be ready before processing any request
app.use(async (_req, _res, next) => {
  await dbReady;
  next();
});

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
      if (IS_PROD) {
        console.error('[mp-webhook] MERCADO_PAGO_WEBHOOK_SECRET not set in production — rejecting request');
        res.status(401).json({ error: 'Webhook secret not configured' }); return;
      }
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

    const payment = await payRes.json() as { status: string; external_reference?: string; id?: number; transaction_amount?: number };
    const orderId = parseInt(payment.external_reference ?? '');
    if (!orderId) { res.json({ ok: true }); return; }

    if (payment.status === 'approved') {
      // Fetch order to validate payment amount before marking as paid
      const orderRows = await ordersDb.select().from(siteOrders).where(eq(siteOrders.id, orderId));
      const order = orderRows[0];
      if (order && payment.transaction_amount !== undefined) {
        const expectedTotal = parseFloat(order.totalPrice ?? '0');
        if (Math.abs(payment.transaction_amount - expectedTotal) > 0.01) {
          console.warn(`[mp-webhook] Amount mismatch for order ${orderId}: expected ${expectedTotal}, got ${payment.transaction_amount}`);
          res.status(400).json({ error: 'Payment amount does not match order total' }); return;
        }
      }
    }

    if (payment.status === 'approved') {
      await ordersDb.update(siteOrders)
        .set({ paymentStatus: 'confirmed', mpPaymentId: String(payment.id), updatedAt: new Date() })
        .where(eq(siteOrders.id, orderId));
    } else if (payment.status === 'rejected') {
      await ordersDb.update(siteOrders)
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
    const key = (typeof body?.email === 'string' ? body.email.trim() : '') || req.ip || 'unknown';
    return key || 'unknown';
  },
  validate: { xForwardedForHeader: false },
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

const cartTrackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => req.ip || 'unknown',
});

const couponCheckLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => req.ip || 'unknown',
});

app.use('/api/trpc/auth.login', authLimiter);
app.use('/api/trpc/auth.emergencyReset', authLimiter);
app.use('/api/trpc/shipping.calculate', storeLimiter);
app.use('/api/trpc/shipping.trackOrder', storeLimiter);
app.use('/api/trpc/shipping.createOrder', orderLimiter);
app.use('/api/trpc/shipping.createPayment', orderLimiter);
app.use('/api/trpc/recovery.trackCart', cartTrackLimiter);
app.use('/api/trpc/recovery.validateCoupon', couponCheckLimiter);

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
