import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { drivers, users } from '../db/schema';

export const driversRouter = router({
  list: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const rows = await db
        .select({
          id: drivers.id,
          userId: drivers.userId,
          cpf: drivers.cpf,
          plate: drivers.plate,
          phone: drivers.phone,
          status: drivers.status,
          createdAt: drivers.createdAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(drivers)
        .leftJoin(users, eq(drivers.userId, users.id));
      if (input?.status) return rows.filter((r) => r.status === input.status);
      return rows;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db
        .select({
          id: drivers.id,
          userId: drivers.userId,
          cpf: drivers.cpf,
          plate: drivers.plate,
          phone: drivers.phone,
          status: drivers.status,
          createdAt: drivers.createdAt,
          userName: users.name,
        })
        .from(drivers)
        .leftJoin(users, eq(drivers.userId, users.id))
        .where(eq(drivers.id, input.id));
      return row ?? null;
    }),

  myDriver: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
    return row ?? null;
  }),

  approve: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.update(drivers).set({ status: 'approved', updatedAt: new Date() }).where(eq(drivers.id, input.id));
      return { ok: true };
    }),

  reject: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.update(drivers).set({ status: 'rejected', updatedAt: new Date() }).where(eq(drivers.id, input.id));
      return { ok: true };
    }),

  updateProfile: protectedProcedure
    .input(z.object({ id: z.number(), plate: z.string().optional(), phone: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const [driver] = await db.select().from(drivers).where(eq(drivers.id, input.id));
      if (!driver) throw new Error('Motorista não encontrado');
      if (ctx.user.role !== 'admin' && driver.userId !== ctx.user.id) {
        throw new Error('Sem permissão');
      }
      const updates: Partial<typeof driver> = { updatedAt: new Date() };
      if (input.plate) updates.plate = input.plate.toUpperCase();
      if (input.phone) updates.phone = input.phone;
      await db.update(drivers).set(updates).where(eq(drivers.id, input.id));
      return { ok: true };
    }),
});
