import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { ordersDb as db } from '../db/ordersDb';
import { abandonedCarts, coupons, siteOrders } from '../db/schema';
import { desc, eq, and, sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';

function fmtPhone(raw: string) {
  const d = raw.replace(/\D/g, '');
  return d.startsWith('55') ? d : `55${d}`;
}

function waLink(phone: string, msg: string) {
  return `https://wa.me/${fmtPhone(phone)}?text=${encodeURIComponent(msg)}`;
}

function recoveryMsg(name: string, coupon?: string) {
  return `Olá *${name}*! 🌊\n\nNotamos que você se interessou pelo *Sal Marinho Integral Sal Vita* mas não finalizou o pedido.\n\n${coupon ? `🎁 Use o cupom *${coupon}* e ganhe desconto especial!\n\n` : ''}👉 Finalize agora: https://premium.salvitarn.com.br\n\nQualquer dúvida é só chamar aqui! 😊\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_`;
}

function unpaidMsg(name: string, id: number, qty: number, total: string) {
  return `Olá *${name}*! 🌊\n\nSeu pedido *#${id}* do Sal Vita ainda está aguardando pagamento.\n\n📦 ${qty}x Sal Marinho Integral 1kg\n💰 Total: R$ ${total}\n\nFinalize o pagamento aqui:\n👉 https://premium.salvitarn.com.br/meu-pedido?pedido=${id}\n\n_Pedido reservado por tempo limitado!_\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_`;
}

function failedMsg(name: string, id: number) {
  return `Olá *${name}*! 🌊\n\nHouve um problema com o pagamento do pedido *#${id}*.\n\nTente novamente com outro método:\n👉 https://premium.salvitarn.com.br/meu-pedido?pedido=${id}\n\nAceitamos Cartão, PIX e Boleto 💳\n_Sal Vita — Sal Marinho Premium de Mossoró/RN_`;
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

      if (existing.length > 0) {
        await db.update(abandonedCarts).set({
          customerName: input.customerName,
          customerEmail: input.customerEmail ?? existing[0].customerEmail,
          postalCode: input.postalCode ?? existing[0].postalCode,
          quantity: input.quantity,
          stepReached: Math.max(existing[0].stepReached ?? 1, input.stepReached),
          updatedAt: new Date(),
        }).where(eq(abandonedCarts.id, existing[0].id));
      } else {
        await db.insert(abandonedCarts).values({
          customerName: input.customerName,
          customerPhone: phone,
          customerEmail: input.customerEmail ?? null,
          postalCode: input.postalCode ?? null,
          quantity: input.quantity,
          stepReached: input.stepReached,
        });
      }
      return { tracked: true };
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
});
