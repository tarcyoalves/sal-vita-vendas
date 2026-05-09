import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { freightDocuments, drivers, freights } from '../db/schema';
import { TRPCError } from '@trpc/server';

export const freightDocumentsRouter = router({
  create: protectedProcedure.input(z.object({ freightId: z.number(), fileUrl: z.string().url() })).mutation(async ({ input, ctx }) => {
    if (ctx.user.role === 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
    const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
    if (!driver) throw new TRPCError({ code: 'FORBIDDEN' });
    const [freight] = await db.select().from(freights).where(eq(freights.id, input.freightId));
    if (!freight || freight.assignedDriverId !== driver.id) throw new TRPCError({ code: 'FORBIDDEN' });
    const [row] = await db.insert(freightDocuments).values({ freightId: input.freightId, driverId: driver.id, fileUrl: input.fileUrl }).returning();
    return row;
  }),

  listByFreight: protectedProcedure.input(z.object({ freightId: z.number() })).query(async ({ input, ctx }) => {
    if (ctx.user.role !== 'admin') {
      const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
      if (!driver) throw new TRPCError({ code: 'FORBIDDEN' });
      const [freight] = await db.select().from(freights).where(eq(freights.id, input.freightId));
      if (!freight || freight.assignedDriverId !== driver.id) throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return db.select().from(freightDocuments).where(eq(freightDocuments.freightId, input.freightId));
  }),
});
