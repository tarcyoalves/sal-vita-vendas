import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { ordersDb as db } from '../db/ordersDb';
import { siteOrders, coupons, msgTemplates } from '../db/schema';
import { desc, eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

const ME_BASE = 'https://melhorenvio.com.br';
const ORIGIN_CEP = process.env.MELHOR_ENVIO_ORIGIN_CEP ?? '59600000';
// Dimensions in cm — 1kg TBD by owner, 10kg box confirmed
const PKG_1KG  = { height: 7, width: 15, length: 24 };
const PKG_10KG = { height: 21, width: 24, length: 27 };

function getPkg(qty: number) { return qty >= 10 ? PKG_10KG : PKG_1KG; }

function renderTpl(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// Best-effort WhatsApp send via the Baileys wa-server on the VPS (non-throwing).
async function sendWhatsAppMsg(phone: string, message: string): Promise<boolean> {
  const url = process.env.WA_SERVER_URL || 'https://evolution.salvitarn.com.br';
  const key = process.env.WA_API_KEY || 'MinhaChaveSuperSegura123456';
  const digits = phone.replace(/\D/g, '');
  const fmt = digits.startsWith('55') ? digits : `55${digits}`;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(`${url}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key },
      body: JSON.stringify({ phone: fmt, message }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    return r.ok;
  } catch { return false; }
}

const correiosLink = (code: string) =>
  `https://rastreamento.correios.com.br/app/index.php?objeto=${encodeURIComponent(code)}`;

const STATIC_REGIONS: Record<string, { pac:[number,string]; sedex:[number,string] }> = {
  RN:{pac:[14,'3–5'],sedex:[27,'1–2']}, CE:{pac:[15,'3–5'],sedex:[28,'1–2']},
  PB:{pac:[15,'4–6'],sedex:[29,'1–3']}, PE:{pac:[16,'4–6'],sedex:[30,'2–3']},
  AL:{pac:[16,'4–7'],sedex:[31,'2–3']}, SE:{pac:[17,'5–7'],sedex:[32,'2–3']},
  BA:{pac:[18,'5–8'],sedex:[33,'2–3']}, MA:{pac:[18,'5–8'],sedex:[34,'2–3']},
  PI:{pac:[17,'4–7'],sedex:[32,'2–3']}, SP:{pac:[22,'6–9'],sedex:[40,'2–4']},
  RJ:{pac:[22,'6–9'],sedex:[40,'2–4']}, MG:{pac:[20,'5–8'],sedex:[38,'2–4']},
  ES:{pac:[21,'6–9'],sedex:[39,'2–4']}, PR:{pac:[24,'7–10'],sedex:[44,'3–5']},
  SC:{pac:[25,'8–11'],sedex:[46,'3–5']}, RS:{pac:[26,'8–12'],sedex:[48,'3–5']},
  DF:{pac:[22,'6–9'],sedex:[42,'2–4']}, GO:{pac:[21,'6–10'],sedex:[41,'2–4']},
  MT:{pac:[26,'8–12'],sedex:[48,'3–5']}, MS:{pac:[24,'7–11'],sedex:[45,'3–5']},
  AM:{pac:[36,'12–18'],sedex:[62,'5–8']}, PA:{pac:[32,'10–16'],sedex:[57,'4–7']},
  AC:{pac:[40,'14–20'],sedex:[68,'6–10']}, RO:{pac:[34,'11–17'],sedex:[60,'5–8']},
  RR:{pac:[40,'14–20'],sedex:[68,'6–10']}, AP:{pac:[37,'12–18'],sedex:[64,'5–9']},
  TO:{pac:[24,'9–13'],sedex:[46,'3–6']},
};

function staticCalc(uf: string, qty: number) {
  const r = STATIC_REGIONS[uf] ?? { pac:[28,'10–15'], sedex:[52,'4–7'] };
  const f = qty >= 10 ? 2.2 : qty >= 5 ? 1.4 : 1;
  return [
    { serviceId: '1', name: 'PAC', company: 'Correios', price: +(r.pac[0]*f).toFixed(2), days: `${r.pac[1]} dias úteis` },
    { serviceId: '2', name: 'SEDEX', company: 'Correios', price: +(r.sedex[0]*f).toFixed(2), days: `${r.sedex[1]} dias úteis` },
  ];
}

async function meCalculate(destCep: string, qty: number) {
  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) return null;
  try {
    const pkg = getPkg(qty);
    const weight = +(Math.max(1.2, qty * 1.05)).toFixed(2);
    const body = {
      from: { postal_code: ORIGIN_CEP },
      to:   { postal_code: destCep.replace(/\D/g, '') },
      package: { height: pkg.height, width: pkg.width, length: pkg.length, weight },
      options: { receipt: false, own_hand: false },
    };
    const res = await fetch(`${ME_BASE}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'User-Agent':    'SalVita/1.0 (contato@salvitarn.com.br)',
        'Accept':        'application/json',
      },
      body: JSON.stringify(body),
    });
    const rawText = await res.text();
    if (!res.ok) return null;
    let data: any;
    try { data = JSON.parse(rawText); } catch { return null; }
    if (!Array.isArray(data)) return null;
    const valid = data.filter((s: any) => s && !s.error && s.price);
    if (valid.length === 0) return null;
    return valid.map((s: any) => ({
      serviceId: String(s.id),
      name:      s.name,
      company:   s.company?.name ?? 'Correios',
      price:     parseFloat(s.custom_price ?? s.price),
      days:      s.delivery_range ? `${s.delivery_range.min}–${s.delivery_range.max} dias úteis` : '?',
    }));
  } catch {
    return null;
  }
}

export const shippingRouter = router({
  calculate: publicProcedure
    .input(z.object({ cep: z.string().min(8), quantity: z.number().min(1).max(100).default(1) }))
    .mutation(async ({ input }) => {
      const apiResult = await meCalculate(input.cep, input.quantity);
      if (apiResult && apiResult.length > 0) return { source: 'api' as const, options: apiResult };
      let uf = 'RN';
      try {
        const r = await fetch(`https://viacep.com.br/ws/${input.cep.replace(/\D/g,'')}/json/`);
        const d = await r.json();
        if (d.uf) uf = d.uf;
      } catch {}
      return { source: 'static' as const, options: staticCalc(uf, input.quantity) };
    }),

  createOrder: publicProcedure
    .input(z.object({
      customerName: z.string().min(2).max(100),
      customerPhone: z.string().min(10).max(20),
      customerEmail: z.string().email().optional().or(z.literal('')),
      customerCpf: z.string().min(11).max(14).optional(),
      postalCode: z.string().min(8).max(9),
      address: z.string().min(3).max(200),
      number: z.string().min(1).max(20),
      complement: z.string().max(100).optional().or(z.literal('')),
      neighborhood: z.string().min(2).max(100),
      city: z.string().min(2).max(100),
      state: z.string().length(2),
      quantity: z.number().int().min(1).max(100),
      productId: z.enum(['1kg', 'caixa']).optional().default('1kg'),
      shippingServiceId: z.string().optional(),
      shippingServiceName: z.string().optional(),
      shippingPrice: z.number().min(0).optional(),
      couponCode: z.string().max(20).optional(),
    }))
    .mutation(async ({ input }) => {
      // Server-authoritative price catalog. `quantity` is the number of 1kg units
      // (kg units): 1kg product = 1 unit each, box = 10 units each.
      const CATALOG: Record<string, { price: number; kgPerUnit: number }> = {
        '1kg':   { price: 29.90,  kgPerUnit: 1 },
        'caixa': { price: 149.90, kgPerUnit: 10 },
      };
      const prod = CATALOG[input.productId] ?? CATALOG['1kg'];
      const productCount = Math.max(1, Math.round(input.quantity / prod.kgPerUnit));
      const shipping = input.shippingPrice ?? 0;

      // Validate shipping price server-side
      if (input.shippingPrice !== undefined && (input.shippingPrice < 0 || input.shippingPrice > 200)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Valor de frete inválido.' });
      }

      let subtotal = +(prod.price * productCount).toFixed(2);
      let couponDiscount = 0;
      let appliedCoupon: string | null = null;
      let foundCouponId: number | null = null;

      // Apply coupon if provided (lookup only — increment happens inside transaction)
      if (input.couponCode) {
        const code = input.couponCode.toUpperCase().trim();
        const found = await db.select().from(coupons)
          .where(and(eq(coupons.code, code), eq(coupons.active, true)))
          .limit(1);
        if (found.length > 0) {
          const c = found[0];
          const notExpired = !c.expiresAt || new Date() < new Date(c.expiresAt);
          const notMaxed = !c.maxUses || c.usedCount < c.maxUses;
          if (notExpired && notMaxed) {
            if (c.discountType === 'percent') {
              couponDiscount = +(subtotal * parseFloat(c.discountValue) / 100).toFixed(2);
            } else {
              couponDiscount = Math.min(subtotal, parseFloat(c.discountValue));
            }
            subtotal = +(subtotal - couponDiscount).toFixed(2);
            appliedCoupon = code;
            foundCouponId = c.id;
          }
        }
      }

      const total = +(subtotal + shipping).toFixed(2);
      // neon-http driver has no transaction support — insert the order first,
      // then bump coupon usage only after the order is confirmed
      const [order] = await db.insert(siteOrders).values({
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail || null,
        customerCpf: input.customerCpf ? input.customerCpf.replace(/\D/g,'') : null,
        postalCode: input.postalCode.replace(/\D/g,''),
        address: input.address,
        number: input.number,
        complement: input.complement || null,
        neighborhood: input.neighborhood,
        city: input.city,
        state: input.state.toUpperCase(),
        quantity: input.quantity,
        shippingServiceId: input.shippingServiceId ?? null,
        shippingServiceName: input.shippingServiceName ?? null,
        shippingPrice: shipping > 0 ? String(shipping) : null,
        totalPrice: String(total),
        couponCode: appliedCoupon,
        couponDiscount: couponDiscount > 0 ? String(couponDiscount) : null,
      }).returning();
      if (!order?.id) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao criar pedido. Tente novamente.' });
      if (appliedCoupon && foundCouponId !== null) {
        await db.update(coupons).set({ usedCount: sql`used_count + 1` }).where(eq(coupons.id, foundCouponId));
      }
      return { id: order.id, total, couponDiscount, couponApplied: appliedCoupon };
    }),

  listOrders: protectedProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      // Exclude orders where client never initiated payment (no mpPreferenceId and still awaiting)
      // Those go to the recovery panel instead
      return db.select().from(siteOrders)
        .where(
          sql`NOT (${siteOrders.paymentStatus} = 'awaiting' AND ${siteOrders.mpPreferenceId} IS NULL)`
        )
        .orderBy(desc(siteOrders.createdAt));
    }),

  analyzeOrders: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'GROQ_API_KEY não configurado' });

      const orders = await db.select().from(siteOrders).orderBy(desc(siteOrders.createdAt));

      // Cancelled orders shouldn't count as revenue even if they were paid
      // before being cancelled/refunded.
      const paid = orders.filter(o => o.paymentStatus === 'confirmed' && o.status !== 'cancelled');
      const revenue = paid.reduce((s, o) => s + parseFloat(o.totalPrice ?? '0'), 0);
      const cityCount: Record<string, number> = {};
      orders.forEach(o => {
        if (!o.city || !o.state) return;
        cityCount[`${o.city}/${o.state}`] = (cityCount[`${o.city}/${o.state}`] ?? 0) + 1;
      });
      const topCities = Object.entries(cityCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
      const now = new Date();
      const last7 = orders.filter(o => (now.getTime()-new Date(o.createdAt).getTime()) < 7*86400000);
      const statusCounts = orders.reduce((acc, o) => { acc[o.status] = (acc[o.status]??0)+1; return acc; }, {} as Record<string,number>);
      const paymentCounts = orders.reduce((acc, o) => { acc[o.paymentStatus] = (acc[o.paymentStatus]??0)+1; return acc; }, {} as Record<string,number>);

      const prompt = `Você é analista de e-commerce. Analise estes dados de pedidos da Sal Vita (sal marinho premium de Mossoró/RN) e responda em português brasileiro com insights concisos e acionáveis.

Dados:
- Total de pedidos: ${orders.length}
- Pedidos últimos 7 dias: ${last7.length}
- Receita confirmada: R$ ${revenue.toFixed(2)}
- Status dos pedidos: ${JSON.stringify(statusCounts)}
- Pagamentos: ${JSON.stringify(paymentCounts)}
- Top cidades: ${topCities.map(([c,n])=>`${c}(${n})`).join(', ')}
- Ticket médio: R$ ${orders.length ? (revenue/Math.max(paid.length,1)).toFixed(2) : '0'}

Forneça:
1. 📊 Resumo executivo (2 frases)
2. 🔍 3 insights importantes
3. ⚠️ Alertas e riscos (se houver)
4. 💡 2 recomendações concretas para aumentar vendas

Seja direto e use emojis para facilitar leitura.`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 600, temperature: 0.7 }),
      });
      if (!res.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao chamar Groq' });
      const data = await res.json() as { choices: { message: { content: string } }[] };
      const insights = data.choices?.[0]?.message?.content ?? 'Sem resposta';

      return {
        insights,
        summary: { total: orders.length, revenue, paid: paid.length, pending: paymentCounts['awaiting']??0, last7: last7.length, topCities, ticketMedio: paid.length ? revenue/paid.length : 0 },
      };
    }),

  updateOrder: protectedProcedure
    .input(z.object({
      id: z.number(),
      customerName: z.string().min(2).optional(),
      customerPhone: z.string().min(10).optional(),
      customerEmail: z.string().email().optional().or(z.literal('')),
      customerCpf: z.string().optional(),
      address: z.string().optional(),
      number: z.string().optional(),
      complement: z.string().optional(),
      neighborhood: z.string().optional(),
      city: z.string().optional(),
      state: z.string().length(2).optional(),
      postalCode: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const { id, ...fields } = input;
      const updates: Record<string,unknown> = { updatedAt: new Date() };
      if (fields.customerName) updates.customerName = fields.customerName;
      if (fields.customerPhone) updates.customerPhone = fields.customerPhone;
      if (fields.customerEmail !== undefined) updates.customerEmail = fields.customerEmail || null;
      if (fields.customerCpf !== undefined) updates.customerCpf = fields.customerCpf.replace(/\D/g,'') || null;
      if (fields.address) updates.address = fields.address;
      if (fields.number) updates.number = fields.number;
      if (fields.complement !== undefined) updates.complement = fields.complement || null;
      if (fields.neighborhood) updates.neighborhood = fields.neighborhood;
      if (fields.city) updates.city = fields.city;
      if (fields.state) updates.state = fields.state.toUpperCase();
      if (fields.postalCode) updates.postalCode = fields.postalCode.replace(/\D/g,'');
      if (fields.notes !== undefined) updates.notes = fields.notes || null;
      const [updated] = await db.update(siteOrders).set(updates).where(eq(siteOrders.id, id)).returning();
      return updated;
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.number(),
      status: z.enum(['pending','confirmed','shipped','delivered','cancelled']).optional(),
      paymentStatus: z.enum(['awaiting','confirmed','failed']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const updates: Record<string,unknown> = { updatedAt: new Date() };
      if (input.status) updates.status = input.status;
      if (input.paymentStatus) updates.paymentStatus = input.paymentStatus;
      const [updated] = await db.update(siteOrders)
        .set(updates)
        .where(eq(siteOrders.id, input.id))
        .returning();
      return updated;
    }),

  trackOrder: publicProcedure
    .input(z.object({
      orderId: z.number().int().positive(),
      phone: z.string().min(4),
    }))
    .query(async ({ input }) => {
      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId));
      const order = orders[0];
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pedido não encontrado.' });
      // Verify phone matches (last 4 digits for privacy)
      const phone = order.customerPhone.replace(/\D/g, '');
      const inputPhone = input.phone.replace(/\D/g, '');
      if (!phone.endsWith(inputPhone.slice(-4))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Telefone não confere com o pedido.' });
      }
      return {
        id: order.id,
        customerName: order.customerName,
        product: order.product,
        quantity: order.quantity,
        totalPrice: order.totalPrice,
        shippingServiceName: order.shippingServiceName,
        city: order.city,
        state: order.state,
        status: order.status,
        paymentStatus: order.paymentStatus,
        trackingCode: order.trackingCode,
        shippedAt: order.status === 'shipped' || order.status === 'delivered' ? order.updatedAt : null,
        createdAt: order.createdAt,
      };
    }),

  updateTracking: protectedProcedure
    .input(z.object({
      id: z.number(),
      trackingCode: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const [updated] = await db.update(siteOrders)
        .set({ trackingCode: input.trackingCode, status: 'shipped', updatedAt: new Date() })
        .where(eq(siteOrders.id, input.id))
        .returning();

      // Auto-notify the customer of the tracking code via WhatsApp (best effort)
      if (updated) {
        try {
          const [tpl] = await db.select().from(msgTemplates)
            .where(and(eq(msgTemplates.type, 'shipped'), eq(msgTemplates.isDefault, true))).limit(1);
          const vars = {
            nome: updated.customerName,
            pedido: String(updated.id),
            rastreio: input.trackingCode,
            link: correiosLink(input.trackingCode),
          };
          const msg = tpl
            ? renderTpl(tpl.body, vars)
            : `Olá *${updated.customerName}*! 📦\n\nSeu pedido *#${updated.id}* foi *enviado*! 🚚\n\n🔎 Rastreio: *${input.trackingCode}*\n👉 ${correiosLink(input.trackingCode)}\n\n_Sal Vita — Mossoró/RN_`;
          await sendWhatsAppMsg(updated.customerPhone, msg);
        } catch (e) { console.error('[updateTracking] WA notify failed:', e); }
      }
      return updated;
    }),

  createPayment: publicProcedure
    .input(z.object({ orderId: z.number(), phone: z.string().min(4).optional() }))
    .mutation(async ({ input }) => {
      const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!token) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Configure MERCADO_PAGO_ACCESS_TOKEN no painel Vercel' });

      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId));
      const order = orders[0];
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      if (order.paymentStatus === 'confirmed') throw new TRPCError({ code: 'CONFLICT', message: 'Este pedido já foi pago.' });

      // Verify phone last-4-digits when provided (non-breaking incremental check)
      if (input.phone !== undefined) {
        const orderPhone = order.customerPhone.replace(/\D/g, '');
        const inputPhone = input.phone.replace(/\D/g, '');
        if (!orderPhone.endsWith(inputPhone.slice(-4))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Telefone não confere com o pedido.' });
        }
      }

      const preference = {
        items: [{
          id: `order-${order.id}`,
          title: `${order.product ?? 'Sal Vita'} × ${order.quantity}`,
          quantity: 1,
          unit_price: parseFloat(order.totalPrice ?? '30'),
          currency_id: 'BRL',
        }],
        payer: {
          name: order.customerName.split(' ')[0],
          surname: order.customerName.split(' ').slice(1).join(' ') || '-',
          email: order.customerEmail ?? 'cliente@salvitarn.com.br',
          phone: { number: order.customerPhone.replace(/\D/g,'') },
        },
        back_urls: {
          success: `https://premium.salvitarn.com.br/meu-pedido?pedido=${order.id}&status=pago`,
          failure: `https://premium.salvitarn.com.br/meu-pedido?pedido=${order.id}&status=falhou`,
          pending: `https://premium.salvitarn.com.br/meu-pedido?pedido=${order.id}&status=pendente`,
        },
        auto_return: 'approved',
        notification_url: `https://premium.salvitarn.com.br/api/mp-webhook`,
        external_reference: String(order.id),
        statement_descriptor: 'SAL VITA',
        payment_methods: { installments: 3 },
      };

      const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(preference),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro MP: ${txt}` });
      }
      const data = await res.json();

      await db.update(siteOrders)
        .set({ mpPreferenceId: data.id, updatedAt: new Date() })
        .where(eq(siteOrders.id, input.orderId));

      return { initPoint: data.init_point as string };
    }),

  // Create a PIX payment directly (inline QR + copy-paste) so the customer never leaves the site.
  createPixPayment: publicProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ input }) => {
      const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!token) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Configure MERCADO_PAGO_ACCESS_TOKEN' });
      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId));
      const order = orders[0];
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      if (order.paymentStatus === 'confirmed') throw new TRPCError({ code: 'CONFLICT', message: 'Este pedido já foi pago.' });

      const amount = parseFloat(order.totalPrice ?? '0');
      const email = (order.customerEmail && order.customerEmail.includes('@')) ? order.customerEmail : `cliente${order.id}@salvitarn.com.br`;
      const body: any = {
        transaction_amount: amount,
        description: `Pedido #${order.id} — Sal Vita`,
        payment_method_id: 'pix',
        payer: {
          email,
          first_name: order.customerName.split(' ')[0],
          last_name: order.customerName.split(' ').slice(1).join(' ') || '-',
        },
        external_reference: String(order.id),
        notification_url: 'https://premium.salvitarn.com.br/api/mp-webhook',
      };
      if (order.customerCpf) body.payer.identification = { type: 'CPF', number: order.customerCpf.replace(/\D/g, '') };

      const res = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `pix-${order.id}-${Date.now()}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro PIX MP: ${txt}` });
      }
      const data = await res.json();
      const td = data?.point_of_interaction?.transaction_data;
      if (!td?.qr_code) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'PIX não retornou QR code.' });

      await db.update(siteOrders).set({ mpPaymentId: String(data.id), updatedAt: new Date() }).where(eq(siteOrders.id, order.id));

      return {
        paymentId: String(data.id),
        qrCode: td.qr_code as string,                 // copy-paste code
        qrCodeBase64: (td.qr_code_base64 ?? '') as string, // PNG base64
        amount,
      };
    }),

  // Lightweight poll for the PIX/checkout payment status (read-only — webhook does the writes).
  pixStatus: publicProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ input }) => {
      const orders = await db.select({ id: siteOrders.id, paymentStatus: siteOrders.paymentStatus, mpPaymentId: siteOrders.mpPaymentId })
        .from(siteOrders).where(eq(siteOrders.id, input.orderId)).limit(1);
      const order = orders[0];
      if (!order) return { paid: false, status: 'not_found' };
      if (order.paymentStatus === 'confirmed') return { paid: true, status: 'approved' };
      const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!token || !order.mpPaymentId) return { paid: false, status: order.paymentStatus };
      try {
        const r = await fetch(`https://api.mercadopago.com/v1/payments/${order.mpPaymentId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!r.ok) return { paid: false, status: order.paymentStatus };
        const p = await r.json() as any;
        return { paid: p.status === 'approved', status: p.status as string };
      } catch {
        return { paid: false, status: order.paymentStatus };
      }
    }),

  generateLabel: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const token = process.env.MELHOR_ENVIO_TOKEN;
      if (!token) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Configure MELHOR_ENVIO_TOKEN no painel Vercel' });

      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId));
      const order = orders[0];
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });

      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SalVita/1.0 (contato@salvitarn.com.br)',
        'Accept': 'application/json',
      };

      const serviceIdNum = order.shippingServiceId ? parseInt(order.shippingServiceId, 10) : NaN;
      if (isNaN(serviceIdNum)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `ID de serviço de frete inválido: "${order.shippingServiceId}". Edite o pedido e selecione um serviço válido.` });
      }
      const serviceId = serviceIdNum;
      const weight = +(Math.max(1.2, order.quantity * 1.05)).toFixed(2);

      const cartBody = {
        service: serviceId,
        from: {
          name: 'Sal Vita',
          phone: '84214082120',
          email: 'contato@salvitarn.com.br',
          postal_code: ORIGIN_CEP,
          address: 'Av. Presidente Dutra',
          number: '1',
          city: 'Mossoró',
          state_abbr: 'RN',
          country_id: 'BR',
        },
        to: {
          name: order.customerName,
          phone: order.customerPhone.replace(/\D/g,''),
          email: order.customerEmail ?? 'cliente@salvitarn.com.br',
          document: order.customerCpf ? order.customerCpf.replace(/\D/g,'') : undefined,
          postal_code: order.postalCode,
          address: order.address,
          number: order.number,
          complement: order.complement ?? '',
          district: order.neighborhood,
          city: order.city,
          state_abbr: order.state,
          country_id: 'BR',
        },
        volumes: [{ ...getPkg(order.quantity), weight }],
        options: {
          insurance_value: parseFloat(order.totalPrice ?? '30'),
          receipt: false,
          own_hand: false,
          non_commercial: false,
        },
        products: [{
          name: 'Sal Marinho Integral 1kg',
          quantity: order.quantity,
          unitary_value: 29.90,
        }],
      };

      const cartRes = await fetch(`${ME_BASE}/api/v2/me/cart`, { method: 'POST', headers, body: JSON.stringify(cartBody) });
      if (!cartRes.ok) {
        const txt = await cartRes.text();
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro cart ME: ${txt}` });
      }
      const cartData = await cartRes.json();
      const meOrderId: string = cartData.id;

      let checkRes: Response;
      try {
        checkRes = await fetch(`${ME_BASE}/api/v2/me/shipment/checkout`, {
          method: 'POST', headers, body: JSON.stringify({ orders: [meOrderId] }),
        });
        if (!checkRes.ok) {
          const txt = await checkRes.text();
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro checkout ME: ${txt}` });
        }
      } catch (err) {
        // Attempt to cancel the dangling ME cart order (best-effort)
        try {
          await fetch(`${ME_BASE}/api/v2/me/cart/${meOrderId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'SalVita/1.0 (contato@salvitarn.com.br)' },
          });
        } catch {} // best-effort cancel
        throw err; // re-throw original error
      }

      // Persist meOrderId right after checkout succeeds (label is now paid) so it can be
      // cancelled/reprinted later even if generate/print below fails.
      await db.update(siteOrders).set({ meOrderId, updatedAt: new Date() }).where(eq(siteOrders.id, input.orderId));

      const genRes = await fetch(`${ME_BASE}/api/v2/me/shipment/generate`, {
        method: 'POST', headers, body: JSON.stringify({ orders: [meOrderId] }),
      });
      if (!genRes.ok) {
        const txt = await genRes.text();
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro gerar etiqueta ME: ${txt}` });
      }

      const printRes = await fetch(`${ME_BASE}/api/v2/me/shipment/print`, {
        method: 'POST', headers, body: JSON.stringify({ orders: [meOrderId], mode: 'private' }),
      });
      if (!printRes.ok) {
        const txt = await printRes.text();
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro imprimir etiqueta ME: ${txt}` });
      }
      const printData = await printRes.json();
      const labelUrl: string = printData.url;

      // Label generated but NOT yet physically posted — use 'label_generated' so the
      // "Pendentes Envio" admin tab works and we don't tell the customer it shipped early.
      const [updated] = await db.update(siteOrders)
        .set({ meOrderId, meLabelUrl: labelUrl, status: 'label_generated', updatedAt: new Date() })
        .where(eq(siteOrders.id, input.orderId))
        .returning();

      return { labelUrl, meOrderId, order: updated };
    }),

  cancelOrder: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });

      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.id));
      const order = orders[0];
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      if (order.status === 'cancelled') throw new TRPCError({ code: 'CONFLICT', message: 'Pedido já cancelado.' });

      const results: string[] = [];

      if (order.meOrderId) {
        const meToken = process.env.MELHOR_ENVIO_TOKEN;
        if (meToken) {
          try {
            const meRes = await fetch(`${ME_BASE}/api/v2/me/shipment/cancel`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${meToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'SalVita/1.0 (contato@salvitarn.com.br)',
                'Accept': 'application/json',
              },
              body: JSON.stringify({ orders: [order.meOrderId] }),
            });
            if (meRes.ok) results.push('Etiqueta ME cancelada');
            else results.push(`Aviso: ME retornou ${meRes.status} — verifique manualmente`);
          } catch {
            results.push('Aviso: falha ao cancelar etiqueta ME — verifique manualmente');
          }
        }
      }

      if (order.paymentStatus === 'confirmed' && order.mpPaymentId) {
        const mpToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
        if (mpToken) {
          try {
            const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${order.mpPaymentId}/refunds`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${mpToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            if (mpRes.ok) results.push('Reembolso MP solicitado');
            else {
              const txt = await mpRes.text();
              results.push(`Aviso: reembolso MP retornou ${mpRes.status}: ${txt.slice(0, 100)}`);
            }
          } catch {
            results.push('Aviso: falha ao reembolsar no MP — faça manualmente');
          }
        }
      }

      const [updated] = await db.update(siteOrders)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(siteOrders.id, input.id))
        .returning();

      results.push('Pedido cancelado');
      return { order: updated, actions: results };
    }),

  // Admin: permanently remove an order (e.g. test orders). No refund/label
  // cancellation is attempted — use cancelOrder first for real orders.
  deleteOrder: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const [deleted] = await db.delete(siteOrders).where(eq(siteOrders.id, input.id)).returning();
      if (!deleted) throw new TRPCError({ code: 'NOT_FOUND' });
      return { ok: true };
    }),
});
