import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { ordersDb as db } from '../db/ordersDb';
import { abandonedCarts, automationRuns, coupons, msgTemplates, siteOrders } from '../db/schema';
import { desc, eq, and, sql, lte } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

async function sendViaWhatsApp(phone: string, message: string): Promise<boolean> {
  const url = process.env.WA_SERVER_URL || 'https://evolution.salvitarn.com.br';
  const key = process.env.WA_API_KEY || 'MinhaChaveSuperSegura123456';
  try {
    const res = await fetch(`${url}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key },
      body: JSON.stringify({ phone: fmtPhone(phone), message }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  return d.startsWith('55') ? d : `55${d}`;
}

function waLink(phone: string, msg: string) {
  return `https://wa.me/${fmtPhone(phone)}?text=${encodeURIComponent(msg)}`;
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// Fallback messages (used when no template found)
function recoveryMsg(name: string, coupon?: string) {
  return `Olá *${name}*! 🌊\n\nNotamos que você se interessou pelo *Sal Marinho Integral Sal Vita* mas não finalizou o pedido.\n\n${coupon ? `🎁 Use o cupom *${coupon}* e ganhe desconto especial!\n\n` : ''}👉 Finalize agora: https://premium.salvitarn.com.br\n\nQualquer dúvida é só chamar aqui! 😊\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_`;
}

function unpaidMsg(name: string, id: number, qty: number, total: string) {
  return `Olá *${name}*! 🌊\n\nSeu pedido *#${id}* do Sal Vita ainda está aguardando pagamento.\n\n📦 ${qty}x Sal Marinho Integral 1kg\n💰 Total: R$ ${total}\n\nFinalize o pagamento aqui:\n👉 https://premium.salvitarn.com.br/meu-pedido?pedido=${id}\n\n_Pedido reservado por tempo limitado!_\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_`;
}

function failedMsg(name: string, id: number) {
  return `Olá *${name}*! 🌊\n\nHouve um problema com o pagamento do pedido *#${id}*.\n\nTente novamente com outro método:\n👉 https://premium.salvitarn.com.br/meu-pedido?pedido=${id}\n\nAceitamos Cartão, PIX e Boleto 💳\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_`;
}

async function fetchPixCode(mpPaymentId: string): Promise<string | null> {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token || !mpPaymentId) return null;
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, any>;
    return data?.point_of_interaction?.transaction_data?.qr_code ?? null;
  } catch {
    return null;
  }
}

export const recoveryRouter = router({

  // Public: track cart step from landing page
  trackCart: publicProcedure
    .input(z.object({
      customerName: z.string().min(2).max(100),
      customerPhone: z.string().min(10).max(20),
      customerEmail: z.string().optional(),
      postalCode: z.string().optional(),
      quantity: z.number().int().min(1).max(100).default(1),
      stepReached: z.number().int().min(1).max(3).default(1),
    }))
    .mutation(async ({ input }) => {
      const phone = input.customerPhone.replace(/\D/g, '');
      // Check if already converted to a real order in the last 24 hours
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recent = await db.select().from(siteOrders)
        .where(and(eq(siteOrders.customerPhone, phone), sql`${siteOrders.createdAt} > ${oneDayAgo}`))
        .limit(1);
      if (recent.length > 0) return { tracked: false, reason: 'converted' };

      // Upsert by phone
      const existing = await db.select().from(abandonedCarts)
        .where(eq(abandonedCarts.customerPhone, phone))
        .limit(1);

      const newStep = input.stepReached;
      let cartId: number;

      if (existing.length > 0) {
        const cart = existing[0];
        const higherStep = Math.max(cart.stepReached ?? 1, newStep);
        // Only advance status if not already converted/cancelled
        const currentStatus = cart.status ?? 'checkout_started';
        const nextStatus = currentStatus === 'converted' || currentStatus === 'cancelled'
          ? currentStatus
          : higherStep >= 3 ? 'redirected_to_payment'
          : higherStep >= 2 ? 'checkout_started'
          : 'checkout_started';
        await db.update(abandonedCarts).set({
          customerName: input.customerName,
          customerEmail: input.customerEmail ?? cart.customerEmail,
          postalCode: input.postalCode ?? cart.postalCode,
          quantity: input.quantity,
          stepReached: higherStep,
          status: nextStatus,
          updatedAt: new Date(),
        }).where(eq(abandonedCarts.id, cart.id));
        cartId = cart.id;
      } else {
        const [inserted] = await db.insert(abandonedCarts).values({
          customerName: input.customerName,
          customerPhone: phone,
          customerEmail: input.customerEmail ?? null,
          postalCode: input.postalCode ?? null,
          quantity: input.quantity,
          stepReached: newStep,
          status: 'checkout_started',
        }).returning({ id: abandonedCarts.id });
        cartId = inserted.id;
      }

      // Schedule 30-min abandonment automation when customer reaches shipping step
      // Only if no pending automation exists for this cart yet
      if (newStep >= 2) {
        const existingRun = await db.select({ id: automationRuns.id })
          .from(automationRuns)
          .where(and(eq(automationRuns.cartId, cartId), eq(automationRuns.status, 'scheduled')))
          .limit(1);
        if (existingRun.length === 0) {
          const scheduledFor = new Date(Date.now() + 30 * 60 * 1000);
          await db.insert(automationRuns).values({
            cartId,
            customerPhone: phone,
            ruleName: 'abandoned_cart_30m',
            status: 'scheduled',
            scheduledFor,
          });
        }
      }

      return { tracked: true, cartId };
    }),

  // Public: validate coupon code
  validateCoupon: publicProcedure
    .input(z.object({
      code: z.string().min(1).max(50),
      orderValue: z.number().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const code = input.code.toUpperCase().trim();
      const found = await db.select().from(coupons)
        .where(and(eq(coupons.code, code), eq(coupons.active, true)))
        .limit(1);

      if (!found.length) return { valid: false, message: 'Cupom inválido ou expirado.' };
      const c = found[0];

      if (c.expiresAt && new Date() > new Date(c.expiresAt)) {
        return { valid: false, message: 'Este cupom expirou.' };
      }
      if (c.maxUses && c.usedCount >= c.maxUses) {
        return { valid: false, message: 'Cupom esgotado.' };
      }
      const minVal = parseFloat(c.minOrderValue ?? '0');
      if (input.orderValue !== undefined && input.orderValue < minVal) {
        return { valid: false, message: `Pedido mínimo de R$ ${minVal.toFixed(2)} para este cupom.` };
      }

      return {
        valid: true,
        discountType: c.discountType as 'percent' | 'fixed',
        discountValue: parseFloat(c.discountValue),
        description: c.description ?? '',
        message: c.discountType === 'percent'
          ? `✅ Cupom válido! ${c.discountValue}% de desconto aplicado.`
          : `✅ Cupom válido! R$ ${parseFloat(c.discountValue).toFixed(2)} de desconto aplicado.`,
      };
    }),

  // Admin: list abandoned carts (not yet recovered)
  listAbandoned: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const rows = await db.select().from(abandonedCarts)
        .where(eq(abandonedCarts.recovered, false))
        .orderBy(desc(abandonedCarts.updatedAt));
      return rows.map(r => ({
        ...r,
        waLink: waLink(r.customerPhone, recoveryMsg(r.customerName)),
        waLinkWithCoupon: waLink(r.customerPhone, recoveryMsg(r.customerName, 'VOLTA10')),
      }));
    }),

  // Admin: list unpaid orders (payment awaiting, not cancelled)
  listUnpaid: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const rows = await db.select().from(siteOrders)
        .where(and(
          eq(siteOrders.paymentStatus, 'awaiting'),
          eq(siteOrders.status, 'pending'),
        ))
        .orderBy(desc(siteOrders.createdAt));
      return rows.map(r => ({
        ...r,
        waLinkUnpaid: waLink(r.customerPhone, unpaidMsg(r.customerName, r.id, r.quantity, r.totalPrice ?? '0')),
        waLinkFailed: waLink(r.customerPhone, failedMsg(r.customerName, r.id)),
      }));
    }),

  // Admin: mark abandoned cart as recovered
  markRecovered: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      await db.update(abandonedCarts)
        .set({ recovered: true, updatedAt: new Date() })
        .where(eq(abandonedCarts.id, input.id));
      return { ok: true };
    }),

  // Admin: mark recovery message sent
  markSent: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      await db.update(abandonedCarts)
        .set({ recoverySentAt: new Date(), updatedAt: new Date() })
        .where(eq(abandonedCarts.id, input.id));
      return { ok: true };
    }),

  // Admin: list coupons
  listCoupons: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return db.select().from(coupons).orderBy(desc(coupons.createdAt));
    }),

  // Admin: create coupon
  createCoupon: protectedProcedure
    .input(z.object({
      code: z.string().min(2).max(20).transform(s => s.toUpperCase().trim()),
      description: z.string().max(200).optional(),
      discountType: z.enum(['percent', 'fixed']),
      discountValue: z.number().min(1),
      minOrderValue: z.number().min(0).default(0),
      maxUses: z.number().int().min(1).default(100),
      expiresAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const [created] = await db.insert(coupons).values({
        code: input.code,
        description: input.description ?? null,
        discountType: input.discountType,
        discountValue: String(input.discountValue),
        minOrderValue: String(input.minOrderValue),
        maxUses: input.maxUses,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      }).returning();
      return created;
    }),

  // Admin: toggle coupon active/inactive
  toggleCoupon: protectedProcedure
    .input(z.object({ id: z.number(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      await db.update(coupons).set({ active: input.active }).where(eq(coupons.id, input.id));
      return { ok: true };
    }),

  // Admin: send WhatsApp recovery message to specific cart
  sendRecovery: protectedProcedure
    .input(z.object({ id: z.number(), coupon: z.string().optional(), templateId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const [cart] = await db.select().from(abandonedCarts).where(eq(abandonedCarts.id, input.id)).limit(1);
      if (!cart) throw new TRPCError({ code: 'NOT_FOUND' });

      let msg: string;
      if (input.templateId) {
        const [tpl] = await db.select().from(msgTemplates).where(eq(msgTemplates.id, input.templateId)).limit(1);
        if (tpl) {
          msg = renderTemplate(tpl.body, {
            nome: cart.customerName,
            cupom: input.coupon ?? 'VOLTA10',
            link: 'https://premium.salvitarn.com.br',
            produto: 'Sal Marinho Integral 1kg',
          });
        } else {
          msg = recoveryMsg(cart.customerName, input.coupon);
        }
      } else {
        // Try default template first
        const [tpl] = await db.select().from(msgTemplates)
          .where(and(eq(msgTemplates.type, 'abandoned'), eq(msgTemplates.isDefault, true), eq(msgTemplates.active, true)))
          .limit(1);
        msg = tpl
          ? renderTemplate(tpl.body, { nome: cart.customerName, cupom: input.coupon ?? 'VOLTA10', link: 'https://premium.salvitarn.com.br', produto: 'Sal Marinho Integral 1kg' })
          : recoveryMsg(cart.customerName, input.coupon);
      }

      const ok = await sendViaWhatsApp(cart.customerPhone, msg);
      if (ok) {
        await db.update(abandonedCarts)
          .set({ recoverySentAt: new Date(), updatedAt: new Date() })
          .where(eq(abandonedCarts.id, input.id));
      }
      return { ok, phone: fmtPhone(cart.customerPhone), preview: msg };
    }),

  // Admin: send WhatsApp to unpaid order (with optional template + PIX fetch)
  sendUnpaid: protectedProcedure
    .input(z.object({ id: z.number(), templateId: z.number().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const [order] = await db.select().from(siteOrders).where(eq(siteOrders.id, input.id)).limit(1);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });

      const pixCode = order.mpPaymentId ? await fetchPixCode(order.mpPaymentId) : null;
      const orderLink = `https://premium.salvitarn.com.br/meu-pedido?pedido=${order.id}`;
      const vars = {
        nome: order.customerName,
        pedido: String(order.id),
        valor: parseFloat(order.totalPrice ?? '0').toFixed(2).replace('.', ','),
        link: orderLink,
        pix: pixCode ?? '',
        produto: 'Sal Marinho Integral 1kg',
      };

      let msg: string;
      if (input.templateId) {
        const [tpl] = await db.select().from(msgTemplates).where(eq(msgTemplates.id, input.templateId)).limit(1);
        msg = tpl ? renderTemplate(tpl.body, vars) : unpaidMsg(order.customerName, order.id, order.quantity, order.totalPrice ?? '0');
      } else if (pixCode) {
        // Auto-select PIX template when PIX code is available
        const [tpl] = await db.select().from(msgTemplates)
          .where(and(eq(msgTemplates.slug, 'unpaid_pix'), eq(msgTemplates.active, true)))
          .limit(1);
        msg = tpl ? renderTemplate(tpl.body, vars) : unpaidMsg(order.customerName, order.id, order.quantity, order.totalPrice ?? '0');
      } else {
        const [tpl] = await db.select().from(msgTemplates)
          .where(and(eq(msgTemplates.type, 'unpaid'), eq(msgTemplates.isDefault, true), eq(msgTemplates.active, true)))
          .limit(1);
        msg = tpl ? renderTemplate(tpl.body, vars) : unpaidMsg(order.customerName, order.id, order.quantity, order.totalPrice ?? '0');
      }

      const ok = await sendViaWhatsApp(order.customerPhone, msg);
      return { ok, phone: fmtPhone(order.customerPhone), hasPix: !!pixCode, preview: msg };
    }),

  // Admin: get payment info (PIX code / boleto) for unpaid order
  getPaymentInfo: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const [order] = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId)).limit(1);
      if (!order?.mpPaymentId) return { pixCode: null, boletoUrl: null };
      const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      if (!token) return { pixCode: null, boletoUrl: null };
      try {
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${order.mpPaymentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return { pixCode: null, boletoUrl: null };
        const data = await res.json() as Record<string, any>;
        return {
          pixCode: data?.point_of_interaction?.transaction_data?.qr_code ?? null,
          boletoUrl: data?.transaction_details?.external_resource_url ?? null,
          paymentMethod: data?.payment_method_id ?? null,
          status: data?.status ?? null,
        };
      } catch {
        return { pixCode: null, boletoUrl: null };
      }
    }),

  // Admin: auto-send to all carts not contacted in last 24h
  autoSendAbandoned: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const pending = await db.select().from(abandonedCarts).where(
        and(
          eq(abandonedCarts.recovered, false),
          sql`(${abandonedCarts.recoverySentAt} IS NULL OR ${abandonedCarts.recoverySentAt} < ${oneDayAgo})`,
        )
      ).limit(50);

      let sent = 0;
      for (const cart of pending) {
        const ok = await sendViaWhatsApp(cart.customerPhone, recoveryMsg(cart.customerName));
        if (ok) {
          await db.update(abandonedCarts)
            .set({ recoverySentAt: new Date(), updatedAt: new Date() })
            .where(eq(abandonedCarts.id, cart.id));
          sent++;
        }
        await new Promise(r => setTimeout(r, 1500));
      }
      return { sent, total: pending.length };
    }),

  // Admin: check WA connection status
  waStatus: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const url = process.env.WA_SERVER_URL || 'https://evolution.salvitarn.com.br';
      const key = process.env.WA_API_KEY || 'MinhaChaveSuperSegura123456';
      try {
        const res = await fetch(`${url}/status`, { headers: { 'apikey': key } });
        return await res.json() as { status: string; connected: boolean };
      } catch {
        return { status: 'error', connected: false };
      }
    }),

  // Admin: list message templates
  listTemplates: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return db.select().from(msgTemplates).orderBy(msgTemplates.type, msgTemplates.label);
    }),

  // Admin: save (create or update) template
  saveTemplate: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      slug: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/),
      type: z.enum(['abandoned', 'unpaid', 'failed', 'general']),
      label: z.string().min(2).max(80),
      body: z.string().min(10).max(1500),
      active: z.boolean().default(true),
      isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      if (input.id) {
        const [updated] = await db.update(msgTemplates).set({
          slug: input.slug, type: input.type, label: input.label,
          body: input.body, active: input.active, isDefault: input.isDefault,
          updatedAt: new Date(),
        }).where(eq(msgTemplates.id, input.id)).returning();
        return updated;
      }
      const [created] = await db.insert(msgTemplates).values({
        slug: input.slug, type: input.type, label: input.label,
        body: input.body, active: input.active, isDefault: input.isDefault,
      }).returning();
      return created;
    }),

  // Admin: delete template
  deleteTemplate: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      await db.delete(msgTemplates).where(eq(msgTemplates.id, input.id));
      return { ok: true };
    }),

  // Admin: set template as default for its type
  setDefaultTemplate: protectedProcedure
    .input(z.object({ id: z.number(), type: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      await db.update(msgTemplates).set({ isDefault: false }).where(eq(msgTemplates.type, input.type));
      await db.update(msgTemplates).set({ isDefault: true }).where(eq(msgTemplates.id, input.id));
      return { ok: true };
    }),

  // Admin: AI processes all pending abandoned carts — generates personalized messages + optimal timing
  aiProcessCarts: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'GROQ_API_KEY não configurado' });

      // Get all scheduled runs that haven't been AI-processed yet
      const pending = await db.select({
        run: automationRuns,
        cart: abandonedCarts,
      })
        .from(automationRuns)
        .innerJoin(abandonedCarts, eq(automationRuns.cartId, abandonedCarts.id))
        .where(and(eq(automationRuns.status, 'scheduled'), sql`${automationRuns.aiProcessedAt} IS NULL`))
        .limit(30);

      const now = new Date();
      const nowBR = new Date(now.getTime() - 3 * 60 * 60 * 1000); // UTC-3
      const hour = nowBR.getUTCHours();
      const weekday = nowBR.getUTCDay(); // 0=sun 6=sat

      let processed = 0;
      const results: { cartId: number; name: string; scheduledFor: string; reasoning: string }[] = [];

      for (const { run, cart } of pending) {
        if (cart.status === 'converted' || cart.recovered) {
          await db.update(automationRuns).set({ status: 'cancelled', cancelledAt: new Date(), aiProcessedAt: new Date(), updatedAt: new Date() })
            .where(eq(automationRuns.id, run.id));
          continue;
        }

        const stepDesc = cart.stepReached === 1 ? 'preencheu o formulário mas não calculou frete'
          : cart.stepReached === 2 ? 'calculou o frete mas não foi para o pagamento'
          : 'chegou até a etapa de pagamento mas não concluiu';

        const prompt = `Você é especialista em conversão de e-commerce para a Sal Vita (sal marinho premium de Mossoró/RN).

DADOS DO LEAD:
- Nome: ${cart.customerName}
- Telefone: ${cart.customerPhone}
- Quantidade no carrinho: ${cart.quantity ?? 1}kg
- Etapa atingida: ${stepDesc}
- CEP (região): ${cart.postalCode ?? 'não informado'}
- Abandonou: ${cart.createdAt ? new Date(cart.createdAt).toLocaleString('pt-BR') : 'recentemente'}
- Horário atual em Brasília: ${hour}:00, ${['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'][weekday]}

PRODUTO: Sal Marinho Integral 1kg — R$ 29,90 (sem refino, 84+ minerais, Mossoró/RN)
SITE: https://premium.salvitarn.com.br

TAREFA: Gere uma mensagem de recuperação de carrinho para WhatsApp e defina o melhor horário para envio.

Regras da mensagem:
- Máximo 3 parágrafos curtos (não mais que 180 palavras total)
- Tom amigável e natural, NÃO insistente
- Use *negrito* para destaque
- Termine com link do site
- Adapte ao passo que o cliente alcançou (ex: se chegou no frete, mencione o frete grátis para pedidos maiores)
- Opcionalmente inclua cupom VOLTA10 se fizer sentido (não para quem já foi ao pagamento)
- NÃO mencione o número de telefone nem diga "detectamos"

Regras do horário:
- Não envie entre 22h e 8h
- Prefira 9h–11h ou 18h–20h em dias úteis
- Se for fim de semana, prefira 10h–12h
- Retorne horário como ISO8601 UTC (subtraia 3h do horário Brasília)

Responda SOMENTE com JSON válido neste formato exato:
{"mensagem": "texto aqui", "scheduledFor": "2026-01-01T13:00:00.000Z", "oferecer_cupom": true, "raciocinio": "motivo da escolha"}`;

        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 600,
              temperature: 0.6,
              response_format: { type: 'json_object' },
            }),
          });
          if (!res.ok) continue;
          const data = await res.json() as { choices: { message: { content: string } }[] };
          const raw = data.choices?.[0]?.message?.content ?? '{}';
          let parsed: { mensagem?: string; scheduledFor?: string; raciocinio?: string };
          try { parsed = JSON.parse(raw); } catch { continue; }

          const aiMsg = parsed.mensagem?.trim();
          if (!aiMsg) continue;

          // Clamp scheduledFor: at least 30min from now, at most 48h
          let sf = parsed.scheduledFor ? new Date(parsed.scheduledFor) : run.scheduledFor;
          const min30 = new Date(Date.now() + 30 * 60 * 1000);
          const max48h = new Date(Date.now() + 48 * 60 * 60 * 1000);
          if (sf < min30) sf = min30;
          if (sf > max48h) sf = max48h;

          await db.update(automationRuns).set({
            aiBody: aiMsg,
            aiReasoning: parsed.raciocinio ?? null,
            aiProcessedAt: new Date(),
            scheduledFor: sf,
            updatedAt: new Date(),
          }).where(eq(automationRuns.id, run.id));

          results.push({ cartId: cart.id, name: cart.customerName, scheduledFor: sf.toISOString(), reasoning: parsed.raciocinio ?? '' });
          processed++;
        } catch { /* skip this cart, will retry next run */ }

        await new Promise(r => setTimeout(r, 500)); // rate limit
      }
      return { processed, results };
    }),

  // Admin: AI processes a single unpaid order — generates personalized follow-up
  aiProcessOrder: protectedProcedure
    .input(z.object({ orderId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'GROQ_API_KEY não configurado' });

      const [order] = await db.select().from(siteOrders).where(eq(siteOrders.id, input.orderId)).limit(1);
      if (!order) throw new TRPCError({ code: 'NOT_FOUND' });

      const pixCode = order.mpPaymentId ? await fetchPixCode(order.mpPaymentId) : null;
      const orderLink = `https://premium.salvitarn.com.br/meu-pedido?pedido=${order.id}`;

      const prompt = `Você é especialista em recuperação de vendas para Sal Vita (sal marinho premium de Mossoró/RN).

PEDIDO NÃO PAGO:
- Cliente: ${order.customerName}
- Pedido: #${order.id}
- Valor total: R$ ${parseFloat(order.totalPrice ?? '0').toFixed(2)}
- Quantidade: ${order.quantity}x Sal Marinho Integral 1kg
- Status do pagamento: ${order.paymentStatus === 'failed' ? 'FALHOU' : 'aguardando'}
- Tem código PIX: ${pixCode ? 'SIM' : 'NÃO'}
- Link do pedido: ${orderLink}
${pixCode ? `- Código PIX: ${pixCode.substring(0, 30)}...` : ''}

Gere uma mensagem de WhatsApp para recuperar este pagamento.
Regras:
- Se tem PIX: inclua instrução clara para copiar e usar o código
- Se pagamento falhou: seja simpático, sugira tentar outro método
- Máximo 3 parágrafos, tom amigável
- Use *negrito* para destaque no valor e pedido
- Inclua o link do pedido ao final

Responda SOMENTE em JSON: {"mensagem": "texto aqui", "raciocinio": "motivo"}`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400,
          temperature: 0.6,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro na API Groq' });
      const data = await res.json() as { choices: { message: { content: string } }[] };
      const raw = data.choices?.[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as { mensagem?: string; raciocinio?: string };
      if (!parsed.mensagem) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'IA não gerou mensagem' });

      const finalMsg = pixCode
        ? parsed.mensagem.replace('{pix}', pixCode)
        : parsed.mensagem;

      return { message: finalMsg, hasPix: !!pixCode, reasoning: parsed.raciocinio ?? '' };
    }),

  // Admin: AI processes + immediately sends to one specific cart
  aiSendCart: protectedProcedure
    .input(z.object({ cartId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'GROQ_API_KEY não configurado' });

      const [cart] = await db.select().from(abandonedCarts).where(eq(abandonedCarts.id, input.cartId)).limit(1);
      if (!cart) throw new TRPCError({ code: 'NOT_FOUND' });

      const stepDesc = cart.stepReached === 1 ? 'preencheu o formulário mas não calculou frete'
        : cart.stepReached === 2 ? 'calculou o frete mas não foi para o pagamento'
        : 'chegou até a etapa de pagamento mas não concluiu';

      const prompt = `Gere uma mensagem de recuperação de carrinho para WhatsApp para o cliente ${cart.customerName} da Sal Vita (sal marinho de Mossoró/RN, R$29,90/kg).
O cliente ${stepDesc}. Quantidade: ${cart.quantity ?? 1}kg.
Máximo 3 parágrafos, tom amigável, use *negrito*, inclua https://premium.salvitarn.com.br ao final.
Responda SOMENTE JSON: {"mensagem": "texto"}`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 350,
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro na API Groq' });
      const data = await res.json() as { choices: { message: { content: string } }[] };
      const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}') as { mensagem?: string };
      if (!parsed.mensagem) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'IA não gerou mensagem' });

      const ok = await sendViaWhatsApp(cart.customerPhone, parsed.mensagem);
      if (ok) {
        await db.update(abandonedCarts).set({ recoverySentAt: new Date(), updatedAt: new Date() })
          .where(eq(abandonedCarts.id, input.cartId));
        // Update or cancel existing automation run since we already sent
        await db.update(automationRuns)
          .set({ status: 'sent', sentAt: new Date(), aiBody: parsed.mensagem, updatedAt: new Date() })
          .where(and(eq(automationRuns.cartId, input.cartId), eq(automationRuns.status, 'scheduled')));
      }
      return { ok, phone: fmtPhone(cart.customerPhone), preview: parsed.mensagem };
    }),

  // Internal/Admin: run automation job — sends scheduled WA messages for abandoned carts
  // Called by cron (/api/cron/abandoned-cart) or manually from admin UI
  runAutomationJob: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const now = new Date();
      const due = await db.select().from(automationRuns).where(
        and(eq(automationRuns.status, 'scheduled'), lte(automationRuns.scheduledFor, now))
      ).limit(50);

      let sent = 0, cancelled = 0, failed = 0;
      for (const run of due) {
        // Verify cart is not converted and has no confirmed payment
        const [cart] = await db.select().from(abandonedCarts)
          .where(eq(abandonedCarts.id, run.cartId)).limit(1);
        if (!cart || cart.status === 'converted' || cart.recovered) {
          await db.update(automationRuns).set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
            .where(eq(automationRuns.id, run.id));
          cancelled++;
          continue;
        }
        // Priority: 1) AI-generated body  2) default template  3) hardcoded fallback
        let msg: string;
        if (run.aiBody) {
          msg = run.aiBody;
        } else {
          const [tpl] = await db.select().from(msgTemplates)
            .where(and(eq(msgTemplates.type, 'abandoned'), eq(msgTemplates.isDefault, true), eq(msgTemplates.active, true)))
            .limit(1);
          msg = tpl
            ? renderTemplate(tpl.body, { nome: cart.customerName, link: 'https://premium.salvitarn.com.br', cupom: 'VOLTA10', produto: 'Sal Marinho Integral 1kg' })
            : recoveryMsg(cart.customerName);
        }
        const ok = await sendViaWhatsApp(run.customerPhone, msg);
        if (ok) {
          await db.update(automationRuns).set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
            .where(eq(automationRuns.id, run.id));
          await db.update(abandonedCarts).set({ recoverySentAt: new Date(), updatedAt: new Date() })
            .where(eq(abandonedCarts.id, run.cartId));
          sent++;
        } else {
          await db.update(automationRuns).set({ status: 'failed', updatedAt: new Date() })
            .where(eq(automationRuns.id, run.id));
          failed++;
        }
        await new Promise(r => setTimeout(r, 1200));
      }
      return { processed: due.length, sent, cancelled, failed };
    }),

  // Admin: list automation runs
  listAutomationRuns: protectedProcedure
    .query(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      return db.select().from(automationRuns)
        .orderBy(desc(automationRuns.createdAt))
        .limit(100);
    }),

  // Admin: delete coupon
  deleteCoupon: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      await db.delete(coupons).where(eq(coupons.id, input.id));
      return { ok: true };
    }),

  // Admin: AI recovery analysis (uses separate GROQ key for premium)
  aiRecovery: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.role !== 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const apiKey = process.env.SAL_VITA_PREMIUM_1KG_GROQ ?? process.env.GROQ_API_KEY_PREMIUM ?? process.env.GROQ_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'SAL_VITA_PREMIUM_1KG_GROQ não configurado' });

      const [carts, unpaidOrders, allOrders] = await Promise.all([
        db.select().from(abandonedCarts).where(eq(abandonedCarts.recovered, false)).orderBy(desc(abandonedCarts.updatedAt)),
        db.select().from(siteOrders).where(eq(siteOrders.paymentStatus, 'awaiting')).orderBy(desc(siteOrders.createdAt)),
        db.select().from(siteOrders).orderBy(desc(siteOrders.createdAt)).limit(100),
      ]);

      const paid = allOrders.filter(o => o.paymentStatus === 'confirmed');
      const conversionRate = allOrders.length > 0 ? ((paid.length / allOrders.length) * 100).toFixed(1) : '0';
      const revenueAtRisk = unpaidOrders.reduce((s, o) => s + parseFloat(o.totalPrice ?? '0'), 0);

      // Hourly distribution of abandoned carts
      const hourDist: Record<number, number> = {};
      carts.forEach(c => { const h = new Date(c.createdAt).getHours(); hourDist[h] = (hourDist[h] ?? 0) + 1; });
      const peakHour = Object.entries(hourDist).sort((a,b)=>b[1]-a[1])[0];

      // Steps analysis
      const stepDist = carts.reduce((acc, c) => { const s = c.stepReached ?? 1; acc[s] = (acc[s]??0)+1; return acc; }, {} as Record<number,number>);

      const prompt = `Você é especialista em e-commerce e recuperação de vendas. Analise estes dados da Sal Vita (sal marinho premium de Mossoró/RN) e forneça estratégias de recuperação em português brasileiro.

DADOS DE ABANDONO:
- Carrinhos abandonados não recuperados: ${carts.length}
- Pedidos não pagos (aguardando pagamento): ${unpaidOrders.length}
- Taxa de conversão atual: ${conversionRate}%
- Receita em risco (pedidos não pagos): R$ ${revenueAtRisk.toFixed(2)}
- Distribuição por etapa de abandono: ${JSON.stringify(stepDist)} (1=formulário, 2=frete, 3=pagamento)
- Horário de pico de abandono: ${peakHour ? `${peakHour[0]}h (${peakHour[1]} carrinhos)` : 'N/A'}

PEDIDOS RECENTES (últimos 100):
- Total: ${allOrders.length}
- Pagos e confirmados: ${paid.length}
- Aguardando pagamento: ${unpaidOrders.length}
- Cidades com mais abandonos: ${[...new Set(carts.map(c => c.postalCode?.slice(0,5)).filter(Boolean))].slice(0,5).join(', ')}

Forneça:
1. 🎯 Análise do funil de abandono (onde estão saindo e por quê)
2. 📱 3 mensagens WhatsApp de recuperação personalizadas para diferentes situações
3. 🎁 Estratégia de cupom recomendada (tipo, valor, validade)
4. ⏰ Melhor horário para enviar mensagens de recuperação
5. 💡 2 mudanças na landing page para reduzir abandono

Seja específico, prático e use dados fornecidos. Formate com emojis e seções claras.`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1200,
          temperature: 0.7,
        }),
      });
      if (!res.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao chamar Groq' });
      const data = await res.json() as { choices: { message: { content: string } }[] };
      const insights = data.choices?.[0]?.message?.content ?? 'Sem resposta';

      return {
        insights,
        stats: {
          abandoned: carts.length,
          unpaid: unpaidOrders.length,
          conversionRate,
          revenueAtRisk,
          stepDist,
          peakHour: peakHour ? Number(peakHour[0]) : null,
        },
      };
    }),

  // Public: customer chat powered by Groq
  chat: publicProcedure
    .input(z.object({
      messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })).max(20),
    }))
    .mutation(async ({ input }) => {
      const apiKey = process.env.SAL_VITA_PREMIUM_1KG_GROQ ?? process.env.GROQ_API_KEY_PREMIUM ?? process.env.GROQ_API_KEY;
      if (!apiKey) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Chat não disponível no momento.' });

      const system = `Você é a assistente virtual do SAL VITA PREMIUM, um sal marinho integral artesanal produzido em Mossoró/RN, Brasil.

PRODUTO:
- Nome: Sal Vita Premium — Sal Marinho Integral 1kg
- Preço: R$ 29,90 por kg (pode variar conforme quantidade)
- Diferencial: sem refino, colhido diretamente do mar, mantém 84+ minerais naturais (magnésio, potássio, cálcio, iodo)
- Produzido em Mossoró/RN (capital mundial do sal)
- Ideal para: culinária saudável, dieta natural, substituição do sal refinado
- Enviamos para todo o Brasil via Melhor Envio (PAC/SEDEX)
- Formas de pagamento: Cartão, PIX, Boleto (via Mercado Pago)
- Site: https://premium.salvitarn.com.br
- Rastreio: https://premium.salvitarn.com.br/meu-pedido

INSTRUÇÕES:
- Seja simpática, objetiva e use emojis com moderação
- Responda APENAS sobre o produto, pedidos, frete, pagamento e dúvidas do site
- Se não souber, diga "Vou verificar isso para você! Entre em contato pelo WhatsApp para mais detalhes."
- Nunca invente preços ou prazos que não conhece
- Incentive a compra quando pertinente, mas sem ser insistente
- FORMATO: escreva respostas curtas, divididas em parágrafos pequenos (1-2 frases cada), com linha em branco entre eles. Nunca escreva um bloco longo de texto corrido. Máximo 3 parágrafos.
- IMPORTANTE: Nunca mencione aditivos, conservantes ou substâncias químicas espontaneamente. Só trate desse assunto se o cliente perguntar diretamente. Se perguntado, informe que o produto pode conter ferrocianeto de sódio como antiaglomerante, em conformidade com as normas da ANVISA e legislação vigente.`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: system }, ...input.messages],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });

      if (!res.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Erro ao processar mensagem.' });
      const data = await res.json() as { choices: { message: { content: string } }[] };
      return { reply: data.choices[0]?.message?.content ?? 'Desculpe, não consegui processar sua mensagem.' };
    }),
});
