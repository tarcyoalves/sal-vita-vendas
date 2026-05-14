import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { drivers, users } from '../db/schema';
import { hashPassword } from '../auth';

export const driversRouter = router({
  list: adminProcedure
    .input(z.object({ status: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const rows = await db.select({ id: drivers.id, userId: drivers.userId, cpf: drivers.cpf, plate: drivers.plate, phone: drivers.phone, status: drivers.status, vehicleType: drivers.vehicleType, pixKey: drivers.pixKey, score: drivers.score, totalFreights: drivers.totalFreights, isFavorite: drivers.isFavorite, createdAt: drivers.createdAt, userName: users.name, userEmail: users.email }).from(drivers).leftJoin(users, eq(drivers.userId, users.id));
      return input?.status ? rows.filter((r) => r.status === input.status) : rows;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [row] = await db.select({ id: drivers.id, cpf: drivers.cpf, plate: drivers.plate, phone: drivers.phone, status: drivers.status, vehicleType: drivers.vehicleType, pixKey: drivers.pixKey, score: drivers.score, totalFreights: drivers.totalFreights, isFavorite: drivers.isFavorite, createdAt: drivers.createdAt, userName: users.name }).from(drivers).leftJoin(users, eq(drivers.userId, users.id)).where(eq(drivers.id, input.id));
      return row ?? null;
    }),

  myDriver: protectedProcedure.query(async ({ ctx }) => {
    const [row] = await db.select().from(drivers).where(eq(drivers.userId, ctx.user.id));
    return row ?? null;
  }),

  approve: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.update(drivers).set({ status: 'approved', updatedAt: new Date() }).where(eq(drivers.id, input.id));
    return { ok: true };
  }),

  reject: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    await db.update(drivers).set({ status: 'rejected', updatedAt: new Date() }).where(eq(drivers.id, input.id));
    return { ok: true };
  }),

  toggleFavorite: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const [driver] = await db.select().from(drivers).where(eq(drivers.id, input.id));
    if (!driver) throw new Error('Motorista não encontrado');
    await db.update(drivers).set({ isFavorite: !driver.isFavorite, updatedAt: new Date() }).where(eq(drivers.id, input.id));
    return { ok: true, isFavorite: !driver.isFavorite };
  }),

  createManual: adminProcedure
    .input(z.object({
      name: z.string().min(2),
      cpf: z.string().min(11),
      plate: z.string().min(7),
      phone: z.string().min(10),
      vehicleType: z.string().optional(),
      pixKey: z.string().optional(),
      password: z.string().min(6).default('frete123'),
    }))
    .mutation(async ({ input }) => {
      const existing = await db.select().from(drivers).where(eq(drivers.cpf, input.cpf));
      if (existing.length > 0) throw new Error('CPF já cadastrado');
      const email = `${input.cpf.replace(/\D/g, '')}@motorista.sallog`;
      const [newUser] = await db.insert(users).values({ name: input.name, email, passwordHash: hashPassword(input.password), role: 'driver' }).returning();
      const [newDriver] = await db.insert(drivers).values({
        userId: newUser.id,
        cpf: input.cpf,
        plate: input.plate.toUpperCase(),
        phone: input.phone,
        status: 'approved',
        ...(input.vehicleType ? { vehicleType: input.vehicleType } : {}),
        ...(input.pixKey ? { pixKey: input.pixKey } : {}),
      }).returning();
      return { id: newDriver.id, cpf: newDriver.cpf, plate: newDriver.plate, phone: newDriver.phone, status: newDriver.status, userName: newUser.name, userEmail: newUser.email };
    }),
});
