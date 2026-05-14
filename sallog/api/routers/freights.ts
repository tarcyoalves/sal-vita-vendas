import { z } from 'zod';
import { and, eq, ne } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { freights, drivers, freightInterests } from '../db/schema';
import { TRPCError } from '@trpc/server';

export const freightsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), scope: z.enum(['available', 'mine', 'all']).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const rows = await db.select().from(freights);
      if (ctx.user.role === 'admin') return input?.status ? rows.filter((r) => r.status === input.status) : rows;
      const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
      if (!driver) return [];
      if (driver.status !== 'approved') return [];
      const scope = input?.scope ?? 'all';
      if (scope === 'available') return rows.filter((r) => r.status === 'available');
      if (scope === 'mine') return rows.filter((r) => r.assignedDriverId === driver.id);
      return rows.filter((r) => r.status === 'available' || r.assignedDriverId === driver.id);
    }),

  getById: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
    const [freight] = await db.select().from(freights).where(eq(freights.id, input.id));
    if (!freight) return null;
    if (ctx.user.role === 'admin') return freight;
    const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
    if (!driver) throw new TRPCError({ code: 'FORBIDDEN' });
    if (freight.assignedDriverId !== driver.id && freight.status !== 'available') throw new TRPCError({ code: 'FORBIDDEN' });
    return freight;
  }),

  create: adminProcedure
    .input(z.object({
      title: z.string().min(3),
      description: z.string().optional(),
      cargoType: z.enum(['bigbag', 'sacaria', 'granel']),
      originCity: z.string(), originState: z.string().length(2),
      destinationCity: z.string(), destinationState: z.string().length(2),
      distance: z.number().optional(),
      value: z.number().int().min(0),
      weight: z.number().optional(),
      loadDate: z.string().optional(),
      deliveryDate: z.string().optional(),
      direction: z.enum(['ida', 'retorno', 'ambos']).default('ida'),
      freightType: z.enum(['completo', 'complemento']).default('completo'),
      vehicleTypes: z.string().optional(), // JSON array
      needsTarp: z.boolean().default(false),
      needsTracker: z.boolean().default(false),
      hasInsurance: z.boolean().default(true),
      paymentMethod: z.string().optional(),
      valueNegotiable: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const [row] = await db.insert(freights).values({ ...input, createdBy: ctx.user.id }).returning();
      return row;
    }),

  update: adminProcedure
    .input(z.object({ id: z.number(), title: z.string().optional(), description: z.string().optional(), cargoType: z.enum(['bigbag', 'sacaria', 'granel']).optional(), originCity: z.string().optional(), originState: z.string().optional(), destinationCity: z.string().optional(), destinationState: z.string().optional(), distance: z.number().optional(), value: z.number().int().min(0).optional(), weight: z.number().optional(), loadDate: z.string().optional(), direction: z.enum(['ida', 'retorno', 'ambos']).optional() }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.update(freights).set({ ...data, updatedAt: new Date() }).where(eq(freights.id, id));
      return { ok: true };
    }),

  assignDriver: adminProcedure
    .input(z.object({ freightId: z.number(), driverId: z.number() }))
    .mutation(async ({ input }) => {
      const [driver] = await db.select().from(drivers).where(eq(drivers.id, input.driverId));
      if (!driver || driver.status !== 'approved') throw new Error('Motorista não aprovado');
      const [freight] = await db.select().from(freights).where(eq(freights.id, input.freightId));
      if (!freight || freight.status !== 'available') throw new Error('Frete não disponível');
      await db.update(freights).set({ assignedDriverId: input.driverId, status: 'in_progress', updatedAt: new Date() }).where(eq(freights.id, input.freightId));
      await db.update(freightInterests).set({ status: 'accepted' }).where(and(eq(freightInterests.freightId, input.freightId), eq(freightInterests.driverId, input.driverId)));
      await db.update(freightInterests).set({ status: 'rejected' }).where(and(eq(freightInterests.freightId, input.freightId), ne(freightInterests.driverId, input.driverId)));
      return { ok: true };
    }),

  markCompleted: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input, ctx }) => {
    const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
    if (!driver) throw new TRPCError({ code: 'FORBIDDEN' });
    const [freight] = await db.select().from(freights).where(eq(freights.id, input.id));
    if (!freight || freight.assignedDriverId !== driver.id || freight.status !== 'in_progress') throw new TRPCError({ code: 'FORBIDDEN' });
    await db.update(freights).set({ status: 'completed', updatedAt: new Date() }).where(eq(freights.id, input.id));
    return { ok: true };
  }),

  validate: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const [freight] = await db.select().from(freights).where(eq(freights.id, input.id));
    if (!freight || freight.status !== 'completed') throw new Error('Frete não está concluído');
    await db.update(freights).set({ status: 'validated', validatedAt: new Date(), updatedAt: new Date() }).where(eq(freights.id, input.id));
    return { ok: true };
  }),

  markPaid: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const [freight] = await db.select().from(freights).where(eq(freights.id, input.id));
    if (!freight || freight.status !== 'validated') throw new Error('Frete não foi validado');
    await db.update(freights).set({ status: 'paid', paidAt: new Date(), updatedAt: new Date() }).where(eq(freights.id, input.id));
    return { ok: true };
  }),

  stats: adminProcedure.query(async () => {
    const rows = await db.select().from(freights);
    const totalValueCents = rows.reduce((s, r) => s + (r.value ?? 0), 0);
    const paidValueCents = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + (r.value ?? 0), 0);
    const pendingPaymentCents = rows.filter((r) => r.status === 'validated').reduce((s, r) => s + (r.value ?? 0), 0);
    const inProgressValueCents = rows.filter((r) => r.status === 'in_progress').reduce((s, r) => s + (r.value ?? 0), 0);
    // Monthly breakdown — last 6 months
    const now = new Date();
    const months: { month: string; valueCents: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. ', '/').replace('.', '');
      const y = d.getFullYear();
      const m = d.getMonth();
      const bucket = rows.filter((r) => { const c = new Date(r.createdAt); return c.getFullYear() === y && c.getMonth() === m; });
      months.push({ month: label, valueCents: bucket.reduce((s, r) => s + (r.value ?? 0), 0), count: bucket.length });
    }
    return {
      available: rows.filter((r) => r.status === 'available').length,
      in_progress: rows.filter((r) => r.status === 'in_progress').length,
      completed: rows.filter((r) => r.status === 'completed').length,
      validated: rows.filter((r) => r.status === 'validated').length,
      paid: rows.filter((r) => r.status === 'paid').length,
      total: rows.length,
      totalValueCents,
      paidValueCents,
      pendingPaymentCents,
      inProgressValueCents,
      monthly: months,
    };
  }),
});
