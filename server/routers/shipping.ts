import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { db } from '../db';
import { siteOrders } from '../db/schema';
import { desc, eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

const ME_BASE = 'https://melhorenvio.com.br';
const ORIGIN_CEP = '59600000';
// Dimensions in cm — 1kg TBD by owner, 10kg box confirmed
const PKG_1KG  = { height: 7, width: 15, length: 24 };
const PKG_10KG = { height: 21, width: 24, length: 27 };

function getPkg(qty: number) { return qty >= 10 ? PKG_10KG : PKG_1KG; }

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
  if (!token) {
    console.warn('[meCalculate] MELHOR_ENVIO_TOKEN not set — falling back to static');
    return null;
  }
  try {
    const weight = +(Math.max(1.2, qty * 1.05)).toFixed(2);
    const body = {
      from: { postal_code: ORIGIN_CEP },
      to: { postal_code: destCep.replace(/\D/g,'') },
      package: { ...getPkg(qty), weight },
      options: { insurance_value: 0, receipt: false, own_hand: false },
    };
    console.log('[meCalculate] calling ME API →', `${ME_BASE}/api/v2/me/shipment/calculate`, JSON.stringify(body));
    const res = await fetch(`${ME_BASE}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'SalVita/1.0 (contato@salvitarn.com.br)',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const rawText = await res.text();
    console.log('[meCalculate] ME API status:', res.status, '| response:', rawText.slice(0, 500));
    if (!res.ok) return null;
    let data: any;
    try { data = JSON.parse(rawText); } catch { return null; }
    if (!Array.isArray(data)) {
      console.warn('[meCalculate] ME API did not return array:', typeof data);
      return null;
    }
    const valid = data.filter((s: any) => s && !s.error && s.price);
    console.log('[meCalculate] valid services:', valid.length, '| all:', data.length);
    return valid.map((s: any) => ({
      serviceId: String(s.id),
      name: s.name,
      company: s.company?.name ?? 'Correios',
      price: parseFloat(s.custom_price || s.price),
      days: s.delivery_range ? `${s.delivery_range.min}–${s.delivery_range.max} dias úteis` : '?',
    }));
  } catch (err) {
    console.error('[meCalculate] Melhor Envio API error:', err);
    return null;
  }
}

export const shippingRouter = router({
  calculate: publicProcedure
    .input(z.object({ cep: z.string().min(8), quantity: z.number().min(1).max(100).default(1) }))
    .mutation(async ({ input }) => {
      const apiResult = await meCalculate(input.cep, input.quantity);
      if (apiResult && apiResult.length > 0) return { source: 'api' as const, options: apiResult };
      // Fetch UF from ViaCEP to use static table
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
      postalCode: z.string().min(8).max(9),
      address: z.string().min(3).max(200),
      number: z.string().min(1).max(20),
      complement: z.string().max(100).optional().or(z.literal('')),
      neighborhood: z.string().min(2).max(100),
      city: z.string().min(2).max(100),
      state: z.string().length(2),
      quantity: z.number().int().min(1).max(100),
      shippingServiceId: z.string().optional(),
      shippingServiceName: z.string().optional(),
      shippingPrice: z.number().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const unitPrice = 29.90;
      const shipping = input.shippingPrice ?? 0;
      const total = +(unitPrice * input.quantity + shipping).toFixed(2);
      const [order] = await db.insert(siteOrders).values({
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail || null,
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
      }).returning();
      return { id: order.id, total };
    }),

  listOrders: protectedProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return db.select().from(siteOrders).orderBy(desc(siteOrders.createdAt));
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

  debugShipping: protectedProcedure
    .input(z.object({ cep: z.string().min(8) }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const token = process.env.MELHOR_ENVIO_TOKEN;
      if (!token) return { error: 'MELHOR_ENVIO_TOKEN not set', token: null };
      const body = {
        from: { postal_code: ORIGIN_CEP },
        to: { postal_code: input.cep.replace(/\D/g,'') },
        package: { ...PKG_1KG, weight: 1.2 },
        options: { insurance_value: 0, receipt: false, own_hand: false },
      };
      const res = await fetch(`${ME_BASE}/api/v2/me/shipment/calculate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'SalVita/1.0 (contato@salvitarn.com.br)',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const rawText = await res.text();
      return { status: res.status, tokenPrefix: token.slice(0, 20) + '...', raw: rawText.slice(0, 2000) };
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
      return updated;
    }),

  createPayment: publicProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ input }) => {
      const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!token) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Configure MERCADO_PAGO_ACCESS_TOKEN no painel Vercel' });

      const orders = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId));
      const order = orders[0];
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });
      if (order.paymentStatus === 'confirmed') throw new TRPCError({ code: 'CONFLICT', message: 'Este pedido já foi pago.' });

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
        notification_url: `https://lembretes.salvitarn.com.br/api/mp-webhook`,
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

      const serviceId = order.shippingServiceId ? parseInt(order.shippingServiceId) : 1;
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

      const checkRes = await fetch(`${ME_BASE}/api/v2/me/shipment/checkout`, {
        method: 'POST', headers, body: JSON.stringify({ orders: [meOrderId] }),
      });
      if (!checkRes.ok) {
        const txt = await checkRes.text();
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Erro checkout ME: ${txt}` });
      }

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

      const [updated] = await db.update(siteOrders)
        .set({ meOrderId, meLabelUrl: labelUrl, status: 'shipped', updatedAt: new Date() })
        .where(eq(siteOrders.id, input.orderId))
        .returning();

      return { labelUrl, meOrderId, order: updated };
    }),
});
