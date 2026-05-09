import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { freightChats, drivers, freights } from '../db/schema';
import { TRPCError } from '@trpc/server';

async function assertAccess(ctx: { user: { id: number; role: string } }, freightId: number) {
  if (ctx.user.role === 'admin') return 'admin';
  const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
  if (!driver) throw new TRPCError({ code: 'FORBIDDEN' });
  const [freight] = await db.select().from(freights).where(eq(freights.id, freightId));
  if (!freight || freight.assignedDriverId !== driver.id) throw new TRPCError({ code: 'FORBIDDEN' });
  return 'driver';
}

export const freightChatsRouter = router({
  list: protectedProcedure
    .input(z.object({ freightId: z.number() }))
    .query(async ({ input, ctx }) => {
      await assertAccess(ctx, input.freightId);
      return db
        .select()
        .from(freightChats)
        .where(eq(freightChats.freightId, input.freightId))
        .orderBy(asc(freightChats.createdAt));
    }),

  send: protectedProcedure
    .input(z.object({ freightId: z.number(), content: z.string().min(1).max(2000) }))
    .mutation(async ({ input, ctx }) => {
      const senderRole = await assertAccess(ctx, input.freightId);
      const [row] = await db.insert(freightChats).values({
        freightId: input.freightId,
        senderId: ctx.user.id,
        senderRole,
        content: input.content,
      }).returning();
      return row;
    }),
});
