import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { freightInterests, drivers, users, freights } from '../db/schema';
import { TRPCError } from '@trpc/server';

export const freightInterestsRouter = router({
  register: protectedProcedure.input(z.object({ freightId: z.number() })).mutation(async ({ input, ctx }) => {
    const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
    if (!driver || driver.status !== 'approved') throw new TRPCError({ code: 'FORBIDDEN', message: 'Motorista não aprovado' });
    const [freight] = await db.select().from(freights).where(eq(freights.id, input.freightId));
    if (!freight || freight.status !== 'available') throw new Error('Frete não disponível');
    await db.insert(freightInterests).values({ freightId: input.freightId, driverId: driver.id }).onConflictDoNothing();
    return { ok: true };
  }),

  listByFreight: adminProcedure.input(z.object({ freightId: z.number() })).query(async ({ input }) => {
    return db.select({ id: freightInterests.id, freightId: freightInterests.freightId, driverId: freightInterests.driverId, createdAt: freightInterests.createdAt, driverCpf: drivers.cpf, driverPlate: drivers.plate, driverPhone: drivers.phone, driverStatus: drivers.status, userName: users.name }).from(freightInterests).leftJoin(drivers, eq(freightInterests.driverId, drivers.id)).leftJoin(users, eq(drivers.userId, users.id)).where(eq(freightInterests.freightId, input.freightId));
  }),

  myInterests: protectedProcedure.query(async ({ ctx }) => {
    const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
    if (!driver) return [];
    return db.select({ freightId: freightInterests.freightId, createdAt: freightInterests.createdAt }).from(freightInterests).where(eq(freightInterests.driverId, driver.id));
  }),
});
