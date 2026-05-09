import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { driverLocations, drivers, freights } from '../db/schema';
import { TRPCError } from '@trpc/server';

async function assertAccess(ctx: { user: { id: number; role: string } }, freightId: number) {
  if (ctx.user.role === 'admin') return;
  const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
  if (!driver) throw new TRPCError({ code: 'FORBIDDEN' });
  const [freight] = await db.select().from(freights).where(eq(freights.id, freightId));
  if (!freight || freight.assignedDriverId !== driver.id) throw new TRPCError({ code: 'FORBIDDEN' });
}

export const locationsRouter = router({
  record: protectedProcedure
    .input(z.object({ freightId: z.number(), lat: z.number(), lng: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
      if (!driver) throw new TRPCError({ code: 'FORBIDDEN' });
      const [freight] = await db.select().from(freights).where(eq(freights.id, input.freightId));
      if (!freight || freight.assignedDriverId !== driver.id) throw new TRPCError({ code: 'FORBIDDEN' });
      await db.insert(driverLocations).values({ driverId: driver.id, freightId: input.freightId, lat: input.lat, lng: input.lng });
      return { ok: true };
    }),

  latestByFreight: protectedProcedure
    .input(z.object({ freightId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertAccess(ctx, input.freightId);
      const [row] = await db
        .select()
        .from(driverLocations)
        .where(eq(driverLocations.freightId, input.freightId))
        .orderBy(desc(driverLocations.recordedAt))
        .limit(1);
      return row ?? null;
    }),

  historyByFreight: adminProcedure
    .input(z.object({ freightId: z.number(), limit: z.number().int().min(1).max(200).optional() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(driverLocations)
        .where(eq(driverLocations.freightId, input.freightId))
        .orderBy(desc(driverLocations.recordedAt))
        .limit(input.limit ?? 50);
    }),
});
