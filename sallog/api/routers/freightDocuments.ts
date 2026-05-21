import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { freightDocuments, drivers, freights } from '../db/schema';
import { TRPCError } from '@trpc/server';

export const freightDocumentsRouter = router({
  create: protectedProcedure
    .input(z.object({
      freightId: z.number(),
      fileUrl: z.string().url(),
      type: z.enum(['comprovante', 'canhoto']).default('comprovante'),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role === 'admin') throw new TRPCError({ code: 'FORBIDDEN' });
      const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
      if (!driver) throw new TRPCError({ code: 'FORBIDDEN' });
      const [freight] = await db.select().from(freights).where(eq(freights.id, input.freightId));
      if (!freight || freight.assignedDriverId !== driver.id) throw new TRPCError({ code: 'FORBIDDEN' });
      const [row] = await db.insert(freightDocuments).values({
        freightId: input.freightId,
        driverId: driver.id,
        fileUrl: input.fileUrl,
        type: input.type,
      }).returning();
      return row;
    }),

  listByFreight: protectedProcedure
    .input(z.object({ freightId: z.number() }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== 'admin') {
        const [driver] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
        if (!driver) throw new TRPCError({ code: 'FORBIDDEN' });
        const [freight] = await db.select().from(freights).where(eq(freights.id, input.freightId));
        if (!freight || freight.assignedDriverId !== driver.id) throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return db.select().from(freightDocuments).where(eq(freightDocuments.freightId, input.freightId));
    }),

  validate: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.update(freightDocuments)
        .set({ validated: true, validatedAt: new Date(), validatedBy: ctx.user.id })
        .where(eq(freightDocuments.id, input.id));
      return { ok: true };
    }),

  cloudinaryConfig: protectedProcedure.query(() => {
    return {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET ?? 'sallog_docs',
    };
  }),
});
