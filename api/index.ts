import 'dotenv/config';
import crypto from 'crypto';
import postgres from 'postgres';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '../server/routers';
import { createContext } from '../server/trpc';
import { ensureTablesExist } from '../server/db/migrate';
import { ensureOrdersTablesExist } from '../server/db/ordersMigrate';
import { ordersDb } from '../server/db/ordersDb';
import { sql as sqlClient, db } from '../server/db/index';
import {
  siteOrders, abandonedCarts, automationRuns, msgTemplates, coupons, emailCampaignRecipients, emailSuppressions, clients,
  emailSequences, emailSequenceEnrollments, emailSequenceSteps, emailSequenceSends, emailEvents,
} from '../server/db/schema';
import { eq, and, sql, lte, gte, isNull, isNotNull, inArray, desc, asc, lt } from 'drizzle-orm';
import { sendEmail, abandonedCartHtml, unpaidOrderHtml, orderConfirmedHtml } from '../server/email/resend';
import { createPixPaymentForOrder } from '../server/lib/mercadopago';
import { renderTemplate, brl, bumpCouponUsage, sendCapiPurchase, sendWhatsApp, confirmOrderPaid } from '../server/lib/orderConfirmation';
import {
  verifyResendWebhook, pickAccount, sendBatch, layout, computeNextSendAt,
  enrollmentEngagementBatch, conditionMet,
  renderTemplate as renderMktTemplate, type BatchMessage,
} from '../server/email/marketing';
import { evaluateInactiveDaysRules, flagEngagementByMessageId } from '../server/email/automations';

function isBusinessHours(): boolean {
  const brHour = (new Date().getUTCHours() - 3 + 24) % 24;
  return brHour >= 8 && brHour < 21;
}

// Best active coupon for automated recovery messages: prefers the admin-flagged
// recovery coupon, else the newest active/valid one. Returns '' when none.
async function getActiveRecoveryCouponCode(): Promise<string> {
  try {
    const rows = await ordersDb.select().from(coupons).where(eq(coupons.active, true)).orderBy(desc(coupons.createdAt));
    const now = new Date();
    const usable = (c: typeof rows[number]) =>
      (!c.expiresAt || now < new Date(c.expiresAt)) && (!c.maxUses || c.usedCount < c.maxUses);
    return (rows.find(c => c.useForRecovery && usable(c)) ?? rows.find(usable))?.code ?? '';
  } catch { return ''; }
}

const app = express();

// Vercel sits behind a proxy — trust first hop so rate limiters see real client IPs
app.set('trust proxy', 1);

// Resolve after ms regardless of whether the promise settled, to avoid hanging cold starts
function withTimeout(p: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([p, new Promise<void>(resolve => setTimeout(resolve, ms))]);
}

const dbReady = Promise.all([
  withTimeout(ensureTablesExist(), 20_000).catch(err => console.error('DB init error:', err)),
  withTimeout(ensureOrdersTablesExist(), 10_000).catch(err => console.error('Orders DB init error:', err)),
]);

// Set once dbReady settles so the guard middleware only blocks the very first request
let migrationSettled = false;
dbReady.then(() => { migrationSettled = true; });

// CRM data auto-migration: only runs if a source DB with a 'sellers' table is available.
// ORDERS_DATABASE_URL is the e-commerce DB (no CRM tables) so it is skipped automatically.
// To restore CRM data from an old Neon DB, call POST /api/migrate-from-neon with neonUrl + secret.
async function autoMigrateIfNeeded(): Promise<void> {
  const dstUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL!;
  const candidates: [string, string | undefined][] = [
    ['CRM_DATABASE_URL',    process.env.CRM_DATABASE_URL],
    ['SALLOG_DATABASE_URL', process.env.SALLOG_DATABASE_URL],
    ['NEON_DATABASE_URL',   process.env.NEON_DATABASE_URL],
  ];
  const srcEntry = candidates.find(([, v]) => v && v !== dstUrl);
  if (!srcEntry) return;

  const [srcKey, srcUrl] = srcEntry;
  // Use isolated pools — never touch the shared main pool (sqlClient) so
  // real user requests are never blocked waiting for migration connections.
  let dst: ReturnType<typeof postgres> | null = null;
  let src: ReturnType<typeof postgres> | null = null;
  try {
    dst = postgres(dstUrl, { max: 1, prepare: false, ssl: 'require', connect_timeout: 8 });

    const dstRows = await Promise.race([
      dst`SELECT COUNT(*)::int AS cnt FROM sellers`,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('dst_timeout')), 10_000)),
    ]) as unknown as Array<{ cnt: number }>;
    if ((dstRows[0]?.cnt ?? 0) > 0) return;

    // Neon free-tier may take up to 10 s to wake from auto-suspend
    src = postgres(srcUrl!, { max: 1, prepare: false, ssl: 'require', connect_timeout: 10 });

    const srcRows = await Promise.race([
      src`SELECT COUNT(*)::int AS cnt FROM sellers`,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('src_timeout')), 12_000)),
    ]) as unknown as Array<{ cnt: number }>;
    const srcCount = srcRows[0]?.cnt ?? 0;
    if (srcCount === 0) return;

    console.log(`[auto-migrate] migrating ${srcCount} sellers from ${srcKey}...`);
    const [usrs, slrs, clts, tsks, rmds] = await Promise.all([
      src`SELECT * FROM users`,
      src`SELECT * FROM sellers`,
      src`SELECT * FROM clients`,
      src`SELECT * FROM tasks`,
      src`SELECT * FROM reminders`,
    ]);

    for (const u of usrs) {
      await dst`INSERT INTO users ${dst(u)} ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role, must_change_password = EXCLUDED.must_change_password`;
    }
    if (usrs.length) await dst`SELECT setval(pg_get_serial_sequence('users','id'), (SELECT MAX(id) FROM users))`;
    for (const r of slrs) await dst`INSERT INTO sellers ${dst(r)} ON CONFLICT DO NOTHING`;
    if (slrs.length) await dst`SELECT setval(pg_get_serial_sequence('sellers','id'), (SELECT MAX(id) FROM sellers))`;
    for (const r of clts) await dst`INSERT INTO clients ${dst(r)} ON CONFLICT DO NOTHING`;
    if (clts.length) await dst`SELECT setval(pg_get_serial_sequence('clients','id'), (SELECT MAX(id) FROM clients))`;
    for (const r of tsks) await dst`INSERT INTO tasks ${dst(r)} ON CONFLICT DO NOTHING`;
    if (tsks.length) await dst`SELECT setval(pg_get_serial_sequence('tasks','id'), (SELECT MAX(id) FROM tasks))`;
    for (const r of rmds) await dst`INSERT INTO reminders ${dst(r)} ON CONFLICT DO NOTHING`;
    if (rmds.length) await dst`SELECT setval(pg_get_serial_sequence('reminders','id'), (SELECT MAX(id) FROM reminders))`;

    console.log('[auto-migrate] done:', { users: usrs.length, sellers: slrs.length, clients: clts.length, tasks: tsks.length, reminders: rmds.length });
  } catch (err: any) {
    if (!(err?.message ?? '').includes('does not exist')) {
      console.error('[auto-migrate] error:', err?.message ?? err);
    }
  } finally {
    await dst?.end({ timeout: 3 }).catch(() => {});
    await src?.end({ timeout: 3 }).catch(() => {});
  }
}

// Delay migration by 6 s so the first wave of cold-start requests gets
// DB connections before migration competes for the pool.
setTimeout(() => {
  autoMigrateIfNeeded().catch(err => console.error('[auto-migrate] uncaught:', err));
}, 6_000);

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

// DB connectivity probe — bypasses the dbReady wait intentionally
app.get('/api/db-health', async (_req, res) => {
  try {
    const t0 = Date.now();
    await sqlClient`SELECT 1`;
    res.json({ db: 'ok', ms: Date.now() - t0 });
  } catch (err: any) {
    res.status(500).json({ db: 'error', message: err.message });
  }
});

// ── Public unsubscribe link (e-mail marketing footer / List-Unsubscribe header) ──
function unsubscribePage(message: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sal Vita</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:system-ui,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;">
    <tr>
      <td align="center" style="padding:24px 8px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#0C3680;padding:24px 32px;text-align:center;">
              <span style="font-family:'Pacifico',system-ui,Arial,sans-serif;font-size:28px;color:#ffffff;letter-spacing:1px;">
                &#127754; Sal Vita
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;text-align:center;">
              <p style="margin:0;font-size:16px;color:#333;">${message}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function handleUnsubscribe(req: express.Request, res: express.Response) {
  const token = String(req.query.t ?? '').trim();
  if (!token) {
    res.status(400).send(unsubscribePage('Link de descadastro inválido.'));
    return;
  }
  try {
    const [recipient] = await db.select().from(emailCampaignRecipients)
      .where(eq(emailCampaignRecipients.unsubToken, token));
    if (!recipient) {
      res.status(404).send(unsubscribePage('Link de descadastro inválido ou expirado.'));
      return;
    }
    await db.insert(emailSuppressions)
      .values({ email: recipient.email, reason: 'unsubscribe' })
      .onConflictDoNothing();
    await db.update(clients).set({ unsubscribed: true }).where(eq(clients.email, recipient.email));
    res.send(unsubscribePage('Você foi descadastrado(a) com sucesso e não receberá mais e-mails da Sal Vita.'));
  } catch (err) {
    console.error('[unsubscribe] error:', err);
    res.status(500).send(unsubscribePage('Erro ao processar seu pedido. Tente novamente mais tarde.'));
  }
}

app.get('/api/unsubscribe', handleUnsubscribe);

// Run schema migration in background — do NOT block requests.
// Tables already exist from prior successful migration; new instances
// should not wait 10s for migration before serving any tRPC call.
dbReady.catch(err => console.error('Background dbReady failed:', err));

// DB storage and row-count monitor — admin only
app.get('/api/db-stats', async (req, res) => {
  const secret = process.env.ADMIN_RESET_SECRET;
  // Fail closed: if no secret is configured, deny (don't leak DB stats publicly).
  if (!secret || req.headers['x-admin-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const [sizes, counts] = await Promise.all([
      sqlClient`
        SELECT
          pg_size_pretty(pg_database_size(current_database())) AS total_db_size,
          pg_size_pretty(pg_total_relation_size('chat_messages'))    AS chat_messages,
          pg_size_pretty(pg_total_relation_size('tasks'))            AS tasks,
          pg_size_pretty(pg_total_relation_size('reminders'))        AS reminders,
          pg_size_pretty(pg_total_relation_size('work_sessions'))    AS work_sessions,
          pg_size_pretty(pg_total_relation_size('knowledge_documents')) AS knowledge_documents,
          pg_size_pretty(pg_total_relation_size('clients'))          AS clients,
          pg_size_pretty(pg_total_relation_size('sellers'))          AS sellers,
          pg_size_pretty(pg_total_relation_size('users'))            AS users
      `,
      sqlClient`
        SELECT
          (SELECT COUNT(*) FROM chat_messages)      AS chat_messages,
          (SELECT COUNT(*) FROM tasks)              AS tasks,
          (SELECT COUNT(*) FROM reminders)          AS reminders,
          (SELECT COUNT(*) FROM work_sessions)      AS work_sessions,
          (SELECT COUNT(*) FROM knowledge_documents) AS knowledge_documents,
          (SELECT COUNT(*) FROM clients)            AS clients,
          (SELECT COUNT(*) FROM sellers)            AS sellers
      `,
    ]);
    res.json({ sizes: (sizes as any[])[0], rows: (counts as any[])[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Mercado Pago retries notifications, but never at high volume from a single
// IP for a small store — this only blocks abuse/floods, not legitimate retries.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  validate: { xForwardedForHeader: false },
});

// Raw body must be captured before express.json() for HMAC verification
app.post('/api/mp-webhook', webhookLimiter, express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = (req.body as Buffer).toString('utf8');
    let body: { type?: string; data?: { id?: string } };
    try { body = JSON.parse(rawBody); } catch { res.status(400).json({ error: 'Invalid JSON' }); return; }

    const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (webhookSecret) {
      const xSig = req.headers['x-signature'] as string | undefined;
      const xReqId = req.headers['x-request-id'] as string | undefined;
      // Signature headers only present when webhook is configured in MP developer panel.
      // When notification_url is used in preferences, MP may not send x-signature yet —
      // in that case we skip validation and rely on the payment lookup to confirm legitimacy.
      if (xSig && xReqId) {
        const parts = Object.fromEntries(xSig.split(',').map(p => { const [k,...v]=p.split('='); return [k,v.join('=')]; }));
        const { ts, v1 } = parts;
        if (ts && v1) {
          const manifest = `id:${body?.data?.id ?? ''};request-id:${xReqId};ts:${ts}`;
          const expected = crypto.createHmac('sha256', webhookSecret).update(manifest).digest('hex');
          if (expected.length !== v1.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) {
            console.warn('[mp-webhook] Invalid HMAC signature — ignoring notification');
            res.status(401).json({ error: 'Invalid signature' }); return;
          }
        }
      } else {
        console.log('[mp-webhook] No x-signature headers — processing without HMAC (IPN-style notification)');
      }
    } else {
      console.log('[mp-webhook] MERCADO_PAGO_WEBHOOK_SECRET not set — skipping signature check');
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

    const orderRows = await ordersDb.select().from(siteOrders).where(eq(siteOrders.id, orderId));
    const order = orderRows[0];
    if (!order) { res.json({ ok: true }); return; }

    // Always persist the payment id (even while pending) so PIX follow-up can fetch the QR code later
    const mpId = String(payment.id ?? '');

    if (payment.status === 'approved') {
      // Idempotency: don't reprocess an already-confirmed order (avoids duplicate side effects)
      if (order.paymentStatus === 'confirmed') { res.json({ ok: true, already: true }); return; }
      // Validate payment amount before marking as paid
      if (payment.transaction_amount !== undefined) {
        const expectedTotal = parseFloat(order.totalPrice ?? '0');
        if (expectedTotal > 0 && Math.abs(payment.transaction_amount - expectedTotal) > 0.01) {
          console.warn(`[mp-webhook] Amount mismatch for order ${orderId}: expected ${expectedTotal}, got ${payment.transaction_amount}`);
          // Return 200 (not 400) so MP doesn't retry forever; flag for manual review.
          res.json({ ok: true, mismatch: true }); return;
        }
      }
      // Mark BOTH status and paymentStatus so the admin panel shows the order as paid + ready to ship
      await ordersDb.update(siteOrders)
        .set({ status: 'confirmed', paymentStatus: 'confirmed', mpPaymentId: mpId, updatedAt: new Date() })
        .where(eq(siteOrders.id, orderId));

      // Coupon bump, CAPI Purchase, automation cancellation, abandoned-cart
      // conversion, and WhatsApp/email confirmation — shared with the
      // reconciliation cron and the admin's manual confirm action.
      await confirmOrderPaid(order);

    } else if (payment.status === 'pending' || payment.status === 'in_process' || payment.status === 'authorized') {
      // PIX/boleto awaiting payment — keep awaiting but persist the payment id for follow-up
      await ordersDb.update(siteOrders)
        .set({ mpPaymentId: mpId, updatedAt: new Date() })
        .where(eq(siteOrders.id, orderId));
    } else if (payment.status === 'rejected' || payment.status === 'cancelled') {
      // Payment attempt failed/expired — order stays recoverable for a retry.
      await ordersDb.update(siteOrders)
        .set({ paymentStatus: 'failed', mpPaymentId: mpId, updatedAt: new Date() })
        .where(eq(siteOrders.id, orderId));
    } else if (payment.status === 'refunded' || payment.status === 'charged_back') {
      // Money reversed after payment — cancel the order and return the coupon use.
      const wasConfirmed = order.paymentStatus === 'confirmed';
      await ordersDb.update(siteOrders)
        .set({ status: 'cancelled', paymentStatus: 'failed', mpPaymentId: mpId, updatedAt: new Date() })
        .where(eq(siteOrders.id, orderId));
      if (wasConfirmed) await bumpCouponUsage(order.couponCode, -1);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('MP webhook error:', err);
    res.json({ ok: true }); // Always 200 so MP doesn't retry endlessly
  }
});

// ── Resend webhook (e-mail marketing — delivered/opened/clicked/bounced/complained) ──
// Raw body must be captured before express.json() for Svix signature verification.
const resendWebhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  validate: { xForwardedForHeader: false },
});

app.post('/api/resend-webhook', resendWebhookLimiter, express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = (req.body as Buffer).toString('utf8');
    const valid = verifyResendWebhook(rawBody, {
      'svix-id': req.headers['svix-id'] as string | undefined,
      'svix-timestamp': req.headers['svix-timestamp'] as string | undefined,
      'svix-signature': req.headers['svix-signature'] as string | undefined,
    });
    if (!valid) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    let payload: { type?: string; data?: { email_id?: string; to?: string[] } };
    try { payload = JSON.parse(rawBody); } catch { res.status(200).json({ ok: true }); return; }

    const eventType = payload.type ?? '';
    const messageId = payload.data?.email_id ?? '';
    const recipientEmail = (payload.data?.to?.[0] ?? '').toLowerCase().trim();

    // Always respond 200 fast — Resend retries on non-2xx.
    res.status(200).json({ ok: true });

    if (!recipientEmail) return;

    switch (eventType) {
      case 'email.bounced':
      case 'email.complained': {
        const reason = eventType === 'email.bounced' ? 'bounce' : 'complaint';
        await db.insert(emailSuppressions).values({ email: recipientEmail, reason }).onConflictDoNothing();
        await db.update(clients).set({ unsubscribed: true }).where(eq(clients.email, recipientEmail));
        break;
      }
      case 'email.delivered':
      case 'email.opened':
      case 'email.clicked': {
        if (!messageId) return;
        const shortType = eventType.replace('email.', '');
        await db.insert(emailEvents).values({
          messageId,
          recipientEmail,
          eventType: shortType,
        });
        // E-mail Marketing Fase 3 — lead scoring: flag the linked task as a hot
        // lead on click (opens only bump lastEngagementAt). The 200 response
        // was already sent above; this never throws (try/catch inside).
        if (shortType === 'opened' || shortType === 'clicked') {
          await flagEngagementByMessageId(messageId, shortType as 'opened' | 'clicked');
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('[resend-webhook] error:', err);
    if (!res.headersSent) res.status(200).json({ ok: true });
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
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    return email || ipKeyGenerator(req.ip ?? 'unknown');
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
});

const couponCheckLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  validate: { xForwardedForHeader: false },
});

// PIX status is polled every 5s while the QR is shown — allow up to ~the 15-min poll cap.
const pixStatusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 220,
  validate: { xForwardedForHeader: false },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  message: { error: 'Muitas mensagens. Aguarde um momento.' },
  validate: { xForwardedForHeader: false },
});

app.use('/api/trpc/auth.login', authLimiter);
app.use('/api/trpc/auth.emergencyReset', authLimiter);
app.use('/api/trpc/shipping.calculate', storeLimiter);
app.use('/api/trpc/shipping.trackOrder', storeLimiter);
app.use('/api/trpc/shipping.createOrder', orderLimiter);
app.use('/api/trpc/shipping.createPayment', orderLimiter);
app.use('/api/trpc/shipping.createPixPayment', orderLimiter);
app.use('/api/trpc/shipping.pixStatus', pixStatusLimiter);
app.use('/api/trpc/recovery.trackCart', cartTrackLimiter);
app.use('/api/trpc/recovery.validateCoupon', couponCheckLimiter);
app.use('/api/trpc/recovery.chat', chatLimiter);
app.use('/api/trpc/ai.chat', chatLimiter);
app.use('/api/trpc/ai.testConnection', authLimiter);

// On the very first request after a cold start, wait for migration to settle
// so the admin seed and schema exist before any login attempt.
// After the first request, migrationSettled=true and all subsequent requests skip the wait.
app.use('/api/trpc', async (_req, _res, next) => {
  if (!migrationSettled) await dbReady;
  next();
});

app.use(
  '/api/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

// Fetch a PIX copy-paste code from Mercado Pago for an order: tries the stored
// payment, then searches by external_reference, and finally generates a brand-new
// PIX payment if none exists yet — so follow-up messages always have a working code.
async function fetchPixCode(order: typeof siteOrders.$inferSelect): Promise<string | null> {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (token) {
    try {
      if (order.mpPaymentId) {
        const r = await fetch(`https://api.mercadopago.com/v1/payments/${order.mpPaymentId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (r.ok) {
          const p = await r.json() as any;
          const qr = p?.point_of_interaction?.transaction_data?.qr_code ?? null;
          if (qr) return qr;
        }
      }
      const r = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${order.id}&sort=date_created&criteria=desc`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (r.ok) {
        const results = ((await r.json()) as any)?.results ?? [];
        for (const p of results) {
          const qr = p?.point_of_interaction?.transaction_data?.qr_code;
          if (qr) return qr;
        }
      }
    } catch {
      // fall through to generating a fresh PIX below
    }
  }
  if (order.paymentStatus !== 'confirmed') {
    const created = await createPixPaymentForOrder(order);
    if (created) return created.qrCode;
  }
  return null;
}

// One-shot WhatsApp follow-up for unpaid (awaiting PIX/boleto) and failed (rejected) orders.
// Free-tier safe: small LIMIT, marks unpaid_followup_sent_at on attempt so it never reprocesses.
async function processUnpaidFollowups(): Promise<{ sent: number }> {
  let sent = 0;
  if (!isBusinessHours()) return { sent };
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const orders = await ordersDb.select().from(siteOrders).where(and(
      inArray(siteOrders.paymentStatus, ['awaiting', 'failed']),
      isNull(siteOrders.unpaidFollowupSentAt),
      lte(siteOrders.createdAt, twoHoursAgo),
      gte(siteOrders.createdAt, threeDaysAgo),
    )).limit(2); // max 2 per cron run — keeps execution within Hobby 10s budget
    if (orders.length === 0) return { sent };

    const tpls = await ordersDb.select().from(msgTemplates).where(inArray(msgTemplates.type, ['unpaid', 'failed']));
    const defaultByType = (type: string) => tpls.find(t => t.type === type && t.isDefault) ?? tpls.find(t => t.type === type);
    const pixTpl = tpls.find(t => t.slug === 'unpaid_pix');

    for (const o of orders) {
      // Mark first so a transient WA outage never causes reprocessing / repeated MP calls.
      await ordersDb.update(siteOrders).set({ unpaidFollowupSentAt: new Date(), updatedAt: new Date() })
        .where(eq(siteOrders.id, o.id));

      // Honor "responda PARAR" opt-outs — never send automated follow-ups to these customers.
      const phoneDigits = o.customerPhone.replace(/\D/g, '');
      const [cartRecord] = await ordersDb.select({ optedOut: abandonedCarts.optedOut })
        .from(abandonedCarts).where(eq(abandonedCarts.customerPhone, phoneDigits)).limit(1);
      if (cartRecord?.optedOut) continue;

      const link = `https://premium.salvitarn.com.br/meu-pedido?pedido=${o.id}&tel=${o.customerPhone.replace(/\D/g, '').slice(-4)}`;
      let tpl = o.paymentStatus === 'failed' ? defaultByType('failed') : defaultByType('unpaid');
      let pix = '';
      if (o.paymentStatus === 'awaiting') {
        const code = await fetchPixCode(o);
        if (code && pixTpl) { tpl = pixTpl; pix = code; }
      }
      // Leave {pix} as the raw copy-paste code in the main message — WhatsApp
      // copies messages as literal text, so wrapping it in ``` would put those
      // backtick characters into whatever the customer pastes into their bank app.
      const vars = { nome: o.customerName, pedido: String(o.id), valor: brl(o.totalPrice), link, pix };
      const msg = tpl
        ? renderTemplate(tpl.body, vars)
        : (o.paymentStatus === 'failed'
            ? `Olá *${o.customerName}*! 😕 Houve um problema no pagamento do pedido *#${o.id}*. Tente novamente: ${link}`
            : `Olá *${o.customerName}*! 💸 Seu pedido *#${o.id}* (R$ ${brl(o.totalPrice)}) ainda está aguardando pagamento. Finalize: ${link}`);
      const ok = await sendWhatsApp(o.customerPhone, msg);
      if (ok) sent++;
      // Follow up with the PIX code as its own message — lets the customer
      // long-press → copy and get exactly the code, nothing else.
      if (ok && pix) {
        await new Promise(r => setTimeout(r, 1000));
        await sendWhatsApp(o.customerPhone, pix);
      }
      // Best-effort email follow-up (non-blocking)
      if (o.customerEmail) {
        const emailHtml = unpaidOrderHtml(
          o.customerName,
          o.id,
          brl(o.totalPrice),
          link,
          pix || undefined,
          o.paymentStatus === 'failed',
        );
        const emailSubject = o.paymentStatus === 'failed'
          ? `Problema no pagamento do pedido #${o.id} — tente novamente`
          : `Pedido #${o.id} aguardando pagamento — R$ ${brl(o.totalPrice)}`;
        sendEmail(o.customerEmail, emailSubject, emailHtml).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) { console.error('[cron] unpaid-followup error:', e); }
  return { sent };
}

// Reconcile awaiting orders whose webhook may never have arrived: ask Mercado Pago directly.
// Free-tier safe: small LIMIT, narrow time window (1h–3d old).
async function reconcileAwaitingOrders(): Promise<{ confirmed: number }> {
  let confirmed = 0;
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) return { confirmed };
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    // Widened from 3 to 30 days: boleto/late-PIX payments can land days after the
    // order, and a missed webhook must still be reconciled or the paid order is
    // stuck "awaiting" forever (never ships, no confirmation sent).
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const orders = await ordersDb.select().from(siteOrders).where(and(
      eq(siteOrders.paymentStatus, 'awaiting'),
      lte(siteOrders.createdAt, oneHourAgo),
      gte(siteOrders.createdAt, thirtyDaysAgo),
    )).limit(5); // lightweight DB/API check only — no WA sends

    for (const o of orders) {
      try {
        // Find an approved payment for this order (by saved id, else search by reference).
        let approved = false;
        let payId = o.mpPaymentId ?? '';
        if (payId) {
          const r = await fetch(`https://api.mercadopago.com/v1/payments/${payId}`, { headers: { 'Authorization': `Bearer ${token}` } });
          if (r.ok) approved = ((await r.json()) as any)?.status === 'approved';
        } else {
          const r = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${o.id}&sort=date_created&criteria=desc`, { headers: { 'Authorization': `Bearer ${token}` } });
          if (r.ok) {
            const results = ((await r.json()) as any)?.results ?? [];
            const ap = results.find((p: any) => p.status === 'approved');
            if (ap) { approved = true; payId = String(ap.id); }
          }
        }
        if (!approved) continue;

        await ordersDb.update(siteOrders)
          .set({ status: 'confirmed', paymentStatus: 'confirmed', mpPaymentId: payId, updatedAt: new Date() })
          .where(eq(siteOrders.id, o.id));
        // Coupon bump, CAPI Purchase, automation cancellation, abandoned-cart
        // conversion, and WhatsApp/email confirmation — same as the mp-webhook path
        await confirmOrderPaid(o);
        confirmed++;
      } catch { /* skip this order */ }
    }
  } catch (e) { console.error('[cron] reconcile error:', e); }
  return { confirmed };
}

// Retention: nudge past customers to buy again once a 1kg order is likely
// running low (~45 days). One-shot per order via reorder_reminded_at — never
// reprocesses. Free-tier safe: small LIMIT, runs only during business hours.
async function processReorderReminders(): Promise<{ sent: number }> {
  let sent = 0;
  if (!isBusinessHours()) return { sent };
  try {
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const orders = await ordersDb.select().from(siteOrders).where(and(
      eq(siteOrders.paymentStatus, 'confirmed'),
      isNull(siteOrders.reorderRemindedAt),
      lte(siteOrders.createdAt, fortyFiveDaysAgo),
      gte(siteOrders.createdAt, ninetyDaysAgo),
    )).limit(2); // max 2 per cron run — keeps execution within Hobby 10s budget
    if (orders.length === 0) return { sent };

    const [tpl] = await ordersDb.select().from(msgTemplates)
      .where(and(eq(msgTemplates.type, 'reorder'), eq(msgTemplates.active, true)));
    const activeCoupon = await getActiveRecoveryCouponCode();

    for (const o of orders) {
      // Mark first so a transient WA outage never causes reprocessing.
      await ordersDb.update(siteOrders).set({ reorderRemindedAt: new Date(), updatedAt: new Date() })
        .where(eq(siteOrders.id, o.id));

      // Honor "responda PARAR" opt-outs.
      const phoneDigits = o.customerPhone.replace(/\D/g, '');
      const [cartRecord] = await ordersDb.select({ optedOut: abandonedCarts.optedOut })
        .from(abandonedCarts).where(eq(abandonedCarts.customerPhone, phoneDigits)).limit(1);
      if (cartRecord?.optedOut) continue;

      const link = activeCoupon ? `https://premium.salvitarn.com.br?cupom=${activeCoupon}` : 'https://premium.salvitarn.com.br';
      const cupomTexto = activeCoupon ? `Use o cupom *${activeCoupon}* e ganhe desconto especial!\n\n` : '';
      const vars = { nome: o.customerName, pedido: String(o.id), link, cupom_texto: cupomTexto };
      const msg = tpl
        ? renderTemplate(tpl.body, vars)
        : `Olá *${o.customerName}*! 🌊\n\nJá faz um tempinho desde o seu pedido *#${o.id}* do *Sal Marinho Integral Sal Vita* — será que está na hora de repor? 🧂\n\n${cupomTexto}👉 Faça seu novo pedido: ${link}\n\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_`;
      const ok = await sendWhatsApp(o.customerPhone, msg);
      if (ok) sent++;
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (e) { console.error('[cron] reorder-reminder error:', e); }
  return { sent };
}

// Cron endpoint — Vercel Cron sends GET; external callers may use POST
app.all('/api/cron/abandoned-cart', express.json(), async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'] ?? req.headers['authorization']?.replace('Bearer ', '');
  if (secret && provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const { lte } = await import('drizzle-orm');
    const { automationRuns: runs, abandonedCarts: carts } = await import('../server/db/schema');
    const now = new Date();
    // Limit to 3 per cron run — keeps total execution under Vercel Hobby 10s budget
    const due = await ordersDb.select().from(runs).where(
      and(eq(runs.status, 'scheduled'), lte(runs.scheduledFor, now))
    ).limit(3);

    // Load all abandoned templates once (small table) and index by slug for the cadence.
    const abandonedTpls = await ordersDb.select().from(msgTemplates).where(eq(msgTemplates.type, 'abandoned'));
    const tplBySlug: Record<string, typeof abandonedTpls[number]> = {};
    for (const t of abandonedTpls) tplBySlug[t.slug] = t;
    // Map each cadence touch to a template + whether it carries a coupon (coupon only on last touch).
    // Resolve a REAL active coupon from the coupons table for the last touch —
    // never the old hardcoded 'VOLTA10' that may not exist/be active at checkout.
    const activeCoupon = await getActiveRecoveryCouponCode();
    const RULE_MAP: Record<string, { slug: string; coupon: string }> = {
      abandoned_t1: { slug: 'abandoned_simples',  coupon: '' },
      abandoned_t2: { slug: 'abandoned_urgencia', coupon: '' },
      abandoned_t3: { slug: 'abandoned_cupom',    coupon: activeCoupon },
    };
    const fallbackTpl = tplBySlug['abandoned_simples'] ?? abandonedTpls.find(t => t.isDefault);

    // ── Always run these regardless of business hours ────────────────────────
    const unpaid = await processUnpaidFollowups();      // has its own hours check
    const reconciled = await reconcileAwaitingOrders(); // no WA sends, pure DB/API
    const reorder = await processReorderReminders();    // has its own hours check

    // ── Abandoned cart automation: only during business hours ─────────────────
    let sent = 0, cancelled = 0, failed = 0;
    if (!isBusinessHours()) {
      res.json({ ok: true, processed: 0, sent: 0, cancelled: 0, failed: 0, skipped: 'outside business hours', unpaid, reconciled, reorder });
      return;
    }
    for (const run of due) {
      const [cart] = await ordersDb.select().from(carts).where(eq(carts.id, run.cartId)).limit(1);
      if (!cart || cart.status === 'converted' || cart.recovered || cart.optedOut) {
        await ordersDb.update(runs).set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
          .where(eq(runs.id, run.id));
        cancelled++;
        continue;
      }
      const name = cart.customerName;
      const ruleCfg = RULE_MAP[run.ruleName] ?? { slug: 'abandoned_simples', coupon: '' };
      // Append ?cupom= so the storefront pre-fills and auto-applies the code.
      const link = ruleCfg.coupon ? `https://premium.salvitarn.com.br?cupom=${ruleCfg.coupon}` : 'https://premium.salvitarn.com.br';
      const tpl = tplBySlug[ruleCfg.slug] ?? fallbackTpl;
      let msg: string;
      if (run.aiBody) {
        msg = run.aiBody; // AI-generated personalized message takes priority
      } else if (tpl) {
        msg = renderTemplate(tpl.body, { nome: name, link, cupom: ruleCfg.coupon, produto: 'Sal Marinho Integral 1kg' });
      } else {
        msg = `Olá *${name}*! 🌊\n\nNotamos que você se interessou pelo *Sal Marinho Integral Sal Vita* mas não finalizou o pedido.\n\n👉 Finalize agora: ${link}\n\nQualquer dúvida é só chamar! 😊\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_`;
      }
      try {
        const ok = await sendWhatsApp(run.customerPhone, msg);
        if (ok) {
          await ordersDb.update(runs).set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
            .where(eq(runs.id, run.id));
          await ordersDb.update(carts).set({ recoverySentAt: new Date(), updatedAt: new Date() })
            .where(eq(carts.id, run.cartId));
          sent++;
          // Email only on 3rd touch (cupom) to save Resend daily quota for confirmations
          if (cart.customerEmail && ruleCfg.coupon) {
            const emailHtml = abandonedCartHtml(cart.customerName, 'https://premium.salvitarn.com.br', ruleCfg.coupon);
            sendEmail(cart.customerEmail, `Seu cupom ${ruleCfg.coupon} — finalize seu pedido Sal Vita`, emailHtml).catch(() => {});
          }
        } else {
          await ordersDb.update(runs).set({ status: 'failed', updatedAt: new Date() }).where(eq(runs.id, run.id));
          failed++;
        }
      } catch {
        await ordersDb.update(runs).set({ status: 'failed', updatedAt: new Date() }).where(eq(runs.id, run.id));
        failed++;
      }
    }

    res.json({ ok: true, processed: due.length, sent, cancelled, failed, unpaid, reconciled, reorder });
  } catch (err) {
    console.error('[cron] abandoned-cart error:', err);
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ── E-mail Marketing Fase 2 — motor diário (sequências + automações) ────────
// Protected by CRON_SECRET: Vercel injects `Authorization: Bearer <CRON_SECRET>`
// automatically for configured crons. Refuses (401) if CRON_SECRET is unset —
// never run this unprotected.
app.get('/api/cron/email-daily', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const provided = (req.headers['authorization'] as string | undefined)?.replace('Bearer ', '');
  if (!secret || provided !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const summary = {
    inactiveDaysRules: 0,
    inactiveDaysEnrolled: 0,
    enrollmentsDue: 0,
    sent: 0,
    failed: 0,
    completed: 0,
    skipped: 0,
    quotaExhausted: false,
    eventsDeleted: 0,
  };

  try {
    // 1. Avalia automações inactive_days → cria novos enrollments.
    try {
      const result = await evaluateInactiveDaysRules();
      summary.inactiveDaysRules = result.rulesEvaluated;
      summary.inactiveDaysEnrolled = result.enrolled;
    } catch (err) {
      console.error('[cron/email-daily] evaluateInactiveDaysRules error:', err);
    }

    // 2. Busca enrollments ativos com next_send_at <= now(), limit 300.
    const now = new Date();
    const dueEnrollments = await db.select().from(emailSequenceEnrollments)
      .where(and(
        eq(emailSequenceEnrollments.status, 'active'),
        isNotNull(emailSequenceEnrollments.nextSendAt),
        lte(emailSequenceEnrollments.nextSendAt, now),
      ))
      .orderBy(asc(emailSequenceEnrollments.nextSendAt))
      .limit(300);
    summary.enrollmentsDue = dueEnrollments.length;

    if (dueEnrollments.length > 0) {
      // Pré-carrega os passos de todas as sequências envolvidas (evita N+1).
      const sequenceIds = [...new Set(dueEnrollments.map(e => e.sequenceId))];
      const allSteps = await db.select().from(emailSequenceSteps)
        .where(inArray(emailSequenceSteps.sequenceId, sequenceIds))
        .orderBy(asc(emailSequenceSteps.stepOrder));
      const stepsBySequence = new Map<number, typeof allSteps>();
      for (const step of allSteps) {
        const list = stepsBySequence.get(step.sequenceId) ?? [];
        list.push(step);
        stepsBySequence.set(step.sequenceId, list);
      }

      // E-mail Marketing Fase 3 — pré-carrega as sequências (repeat/repeatIntervalDays)
      // para o loop de recorrência, sem N+1.
      const allSequences = await db.select().from(emailSequences)
        .where(inArray(emailSequences.id, sequenceIds));
      const sequenceById = new Map(allSequences.map(s => [s.id, s]));

      const unsubBase = process.env.PUBLIC_APP_URL ?? 'https://lembretes.salvitarn.com.br';

      // E-mail Marketing Fase 3 — sequências condicionais: avalia o engajamento
      // prévio de TODAS as inscrições devidas numa única query (sem N+1).
      const engMap = await enrollmentEngagementBatch(dueEnrollments.map(e => e.id));

      // Skip-loop: para cada inscrição devida, avança por passos cuja condição
      // não bate (registrando 'skipped', sem gastar cota) até achar um passo que
      // deva ser enviado, ou até a inscrição ser concluída/reiniciar o ciclo
      // (sequência recorrente). Cap de 10 iterações por segurança.
      type Enrollment = typeof dueEnrollments[number];
      const sendable: { enrollment: Enrollment; step: typeof allSteps[number] }[] = [];

      for (const original of dueEnrollments) {
        let enrollment: Enrollment = original;
        const steps = stepsBySequence.get(enrollment.sequenceId) ?? [];
        const seq = sequenceById.get(enrollment.sequenceId);

        for (let iter = 0; iter < 10; iter++) {
          const step = steps[enrollment.currentStep];

          if (!step) {
            // Sem próximo passo.
            if (seq?.repeat && seq.repeatIntervalDays) {
              // Sequência recorrente: reinicia o ciclo após repeatIntervalDays.
              const newCycleStart = new Date(now.getTime() + seq.repeatIntervalDays * 24 * 60 * 60 * 1000);
              const nextSendAt = computeNextSendAt(newCycleStart, steps, 0);
              enrollment = {
                ...enrollment,
                currentStep: 0,
                cycleStartedAt: newCycleStart,
                nextSendAt,
                status: 'active',
              };
              await db.update(emailSequenceEnrollments)
                .set({ currentStep: 0, cycleStartedAt: newCycleStart, nextSendAt, status: 'active', updatedAt: new Date() })
                .where(eq(emailSequenceEnrollments.id, enrollment.id));
              continue; // re-avalia a condição do novo passo 0
            }
            // Não é recorrente — marca como concluída e segue.
            await db.update(emailSequenceEnrollments)
              .set({ status: 'completed', nextSendAt: null, updatedAt: new Date() })
              .where(eq(emailSequenceEnrollments.id, enrollment.id));
            summary.completed++;
            break;
          }

          const eng = engMap.get(enrollment.id) ?? { opened: false, clicked: false };
          if (conditionMet(step.sendCondition, eng)) {
            sendable.push({ enrollment, step });
            break;
          }

          // Condição não satisfeita — pula este passo sem gastar cota.
          await db.insert(emailSequenceSends).values({
            enrollmentId: enrollment.id,
            stepId: step.id,
            status: 'skipped',
            messageId: null,
          });
          summary.skipped++;

          const newCurrentStep = enrollment.currentStep + 1;
          const cycleStart = enrollment.cycleStartedAt ?? enrollment.enrolledAt;
          const nextSendAt = computeNextSendAt(cycleStart, steps, newCurrentStep);
          const newStatus = nextSendAt ? 'active' : 'completed';
          enrollment = { ...enrollment, currentStep: newCurrentStep, nextSendAt, status: newStatus };
          await db.update(emailSequenceEnrollments)
            .set({ currentStep: newCurrentStep, nextSendAt, status: newStatus, updatedAt: new Date() })
            .where(eq(emailSequenceEnrollments.id, enrollment.id));
          // continua o laço — avalia o próximo passo no mesmo run
        }
      }

      // Processa em lotes de até 100, respeitando a cota diária compartilhada.
      let i = 0;
      while (i < sendable.length) {
        const picked = await pickAccount();
        if (!picked) {
          summary.quotaExhausted = true;
          break;
        }

        const batchSize = Math.min(100, picked.remaining, sendable.length - i);
        const batch = sendable.slice(i, i + batchSize);
        i += batchSize;

        // Monta as mensagens do passo já resolvido pelo skip-loop para cada inscrição do lote.
        const messages: BatchMessage[] = [];
        const batchMeta: { enrollment: Enrollment; step: typeof allSteps[number] }[] = [];

        for (const { enrollment, step } of batch) {
          const unsubUrl = `${unsubBase}/api/unsubscribe?t=${enrollment.unsubToken}`;
          messages.push({
            to: enrollment.email,
            subject: renderMktTemplate(step.subject, { nome: enrollment.name ?? '' }),
            html: layout(renderMktTemplate(step.htmlBody, { nome: enrollment.name ?? '', unsubscribe: unsubUrl }), unsubUrl),
            replyTo: enrollment.replyTo ?? undefined,
            unsubToken: enrollment.unsubToken,
          });
          batchMeta.push({ enrollment, step });
        }

        if (messages.length > 0) {
          const results = await sendBatch(picked.account, messages);
          for (let j = 0; j < batchMeta.length; j++) {
            const { enrollment, step } = batchMeta[j];
            const result = results[j];
            const steps = stepsBySequence.get(enrollment.sequenceId) ?? [];
            const newCurrentStep = enrollment.currentStep + 1;
            const cycleStart = enrollment.cycleStartedAt ?? enrollment.enrolledAt;
            const nextSendAt = computeNextSendAt(cycleStart, steps, newCurrentStep);
            const newStatus = nextSendAt ? 'active' : 'completed';

            if (result.ok) {
              summary.sent++;
            } else {
              summary.failed++;
            }
            if (newStatus === 'completed') summary.completed++;

            await db.update(emailSequenceEnrollments)
              .set({ currentStep: newCurrentStep, nextSendAt, status: newStatus, updatedAt: new Date() })
              .where(eq(emailSequenceEnrollments.id, enrollment.id));

            await db.insert(emailSequenceSends).values({
              enrollmentId: enrollment.id,
              stepId: step.id,
              status: result.ok ? 'sent' : 'failed',
              accountKey: picked.account.key,
              messageId: result.messageId,
              error: result.error,
            });
          }
        }

        // Se o lote não esgotou a cota da conta, ainda há mais a enviar? continua;
        // se pickAccount ficar null no próximo loop, paramos com early-exit acima.
        if (i >= sendable.length) break;
      }
    }

    // 6. Limpeza: remove email_events com mais de 90 dias.
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const deleted = await db.delete(emailEvents).where(lt(emailEvents.createdAt, ninetyDaysAgo)).returning({ id: emailEvents.id });
      summary.eventsDeleted = deleted.length;
    } catch (err) {
      console.error('[cron/email-daily] cleanup error:', err);
    }

    console.log('[cron/email-daily] summary:', summary);
    res.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[cron/email-daily] error:', err);
    res.status(500).json({ error: String(err), ...summary });
  }
});

// Diagnostic: runs the orders-DB migration and reports per-step status + which
// tables exist. Helps debug the recovery panel when tables are missing.
app.get('/api/orders-health', async (_req, res) => {
  try {
    const steps = await ensureOrdersTablesExist();
    const { neon } = await import('@neondatabase/serverless');
    const url = process.env.ORDERS_DATABASE_URL ?? process.env.DATABASE_URL!;
    const sql = neon(url);
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('site_orders','abandoned_carts','automation_runs','coupons','msg_templates')
      ORDER BY table_name
    `;
    res.json({
      ok: steps.every((s: any) => s.ok),
      usingOrdersUrl: !!process.env.ORDERS_DATABASE_URL,
      tablesPresent: (tables as any[]).map(t => t.table_name),
      steps,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? String(err) });
  }
});

// One-time migration: copy all data from Neon → Supabase
// Protected by ADMIN_RESET_SECRET. Remove after migration is done.
app.post('/api/migrate-from-neon', express.json(), async (req, res) => {
  const secret = process.env.ADMIN_RESET_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Migration endpoint disabled: configure ADMIN_RESET_SECRET to enable' });
  }
  if (req.body?.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const neonUrl = req.body?.neonUrl as string | undefined;
  if (!neonUrl) {
    return res.status(400).json({ error: 'neonUrl required' });
  }

  const src = postgres(neonUrl, { max: 1, prepare: false, ssl: 'require' });
  const dstUrl = process.env.NEON_DATABASE_URL ?? process.env.DATABASE_URL!;
  const dst = postgres(dstUrl, { max: 1, prepare: false, ssl: 'require' });

  try {
    const counts: Record<string, number> = {};

    // users
    const users = await src`SELECT * FROM users`;
    if (users.length > 0) {
      await dst`DELETE FROM users WHERE true`;
      for (const u of users) {
        await dst`INSERT INTO users ${dst(u)} ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
          role = EXCLUDED.role, must_change_password = EXCLUDED.must_change_password`;
      }
      await dst`SELECT setval(pg_get_serial_sequence('users','id'), (SELECT MAX(id) FROM users))`;
      counts.users = users.length;
    }

    // sellers
    const sellers = await src`SELECT * FROM sellers`;
    if (sellers.length > 0) {
      await dst`DELETE FROM sellers WHERE true`;
      for (const r of sellers) await dst`INSERT INTO sellers ${dst(r)} ON CONFLICT DO NOTHING`;
      await dst`SELECT setval(pg_get_serial_sequence('sellers','id'), (SELECT MAX(id) FROM sellers))`;
      counts.sellers = sellers.length;
    }

    // clients
    const clients = await src`SELECT * FROM clients`;
    if (clients.length > 0) {
      await dst`DELETE FROM clients WHERE true`;
      for (const r of clients) await dst`INSERT INTO clients ${dst(r)} ON CONFLICT DO NOTHING`;
      await dst`SELECT setval(pg_get_serial_sequence('clients','id'), (SELECT MAX(id) FROM clients))`;
      counts.clients = clients.length;
    }

    // tasks
    const tasks = await src`SELECT * FROM tasks`;
    if (tasks.length > 0) {
      await dst`DELETE FROM tasks WHERE true`;
      for (const r of tasks) await dst`INSERT INTO tasks ${dst(r)} ON CONFLICT DO NOTHING`;
      await dst`SELECT setval(pg_get_serial_sequence('tasks','id'), (SELECT MAX(id) FROM tasks))`;
      counts.tasks = tasks.length;
    }

    // reminders
    const reminders = await src`SELECT * FROM reminders`;
    if (reminders.length > 0) {
      await dst`DELETE FROM reminders WHERE true`;
      for (const r of reminders) await dst`INSERT INTO reminders ${dst(r)} ON CONFLICT DO NOTHING`;
      await dst`SELECT setval(pg_get_serial_sequence('reminders','id'), (SELECT MAX(id) FROM reminders))`;
      counts.reminders = reminders.length;
    }

    // knowledge_documents
    const docs = await src`SELECT * FROM knowledge_documents`;
    if (docs.length > 0) {
      await dst`DELETE FROM knowledge_documents WHERE true`;
      for (const r of docs) await dst`INSERT INTO knowledge_documents ${dst(r)} ON CONFLICT DO NOTHING`;
      await dst`SELECT setval(pg_get_serial_sequence('knowledge_documents','id'), (SELECT MAX(id) FROM knowledge_documents))`;
      counts.knowledge_documents = docs.length;
    }

    // work_sessions
    const sessions = await src`SELECT * FROM work_sessions`;
    if (sessions.length > 0) {
      await dst`DELETE FROM work_sessions WHERE true`;
      for (const r of sessions) await dst`INSERT INTO work_sessions ${dst(r)} ON CONFLICT DO NOTHING`;
      await dst`SELECT setval(pg_get_serial_sequence('work_sessions','id'), (SELECT MAX(id) FROM work_sessions))`;
      counts.work_sessions = sessions.length;
    }

    res.json({ success: true, migrated: counts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    await src.end();
    await dst.end();
  }
});

export default app;
