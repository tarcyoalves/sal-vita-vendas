import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { db } from '../db';
import { users, drivers } from '../db/schema';
import { hashPassword, verifyPassword, signToken, DUMMY_HASH, COOKIE_NAME } from '../auth';

export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const [u] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, ctx.user.id));
    return u ?? null;
  }),

  loginAdmin: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const [u] = await db.select().from(users).where(eq(users.email, input.email));
      const valid = u ? verifyPassword(input.password, u.passwordHash) : (verifyPassword(input.password, DUMMY_HASH), false);
      if (!valid || !u || u.role !== 'admin') throw new Error('Email ou senha inválidos');
      const token = signToken({ id: u.id, email: u.email, name: u.name, role: u.role });
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      ctx.res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly${secure}; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Lax`);
      return { id: u.id, name: u.name, email: u.email, role: u.role };
    }),

  loginMobile: publicProcedure
    .input(z.object({ cpf: z.string().min(1), password: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const [driver] = await db.select().from(drivers).where(eq(drivers.cpf, input.cpf));
      const [u] = driver ? await db.select().from(users).where(eq(users.id, driver.userId)) : [];
      const valid = u ? verifyPassword(input.password, u.passwordHash) : (verifyPassword(input.password, DUMMY_HASH), false);
      if (!valid || !driver || !u) throw new Error('CPF ou senha inválidos');
      const token = signToken({ id: u.id, email: u.email, name: u.name, role: u.role });
      return { token, driver: { id: driver.id, cpf: driver.cpf, plate: driver.plate, phone: driver.phone, status: driver.status }, user: { id: u.id, name: u.name, role: u.role } };
    }),

  registerDriver: publicProcedure
    .input(z.object({ name: z.string().min(2), cpf: z.string().min(11), plate: z.string().min(7), phone: z.string().min(10), password: z.string().min(6) }))
    .mutation(async ({ input }) => {
      const existing = await db.select().from(drivers).where(eq(drivers.cpf, input.cpf));
      if (existing.length > 0) throw new Error('CPF já cadastrado');
      const email = `${input.cpf.replace(/\D/g, '')}@motorista.sallog`;
      const [newUser] = await db.insert(users).values({ name: input.name, email, passwordHash: hashPassword(input.password), role: 'driver' }).returning();
      const [newDriver] = await db.insert(drivers).values({ userId: newUser.id, cpf: input.cpf, plate: input.plate.toUpperCase(), phone: input.phone }).returning();
      const token = signToken({ id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role });
      return { token, driver: { id: newDriver.id, cpf: newDriver.cpf, plate: newDriver.plate, phone: newDriver.phone, status: newDriver.status }, user: { id: newUser.id, name: newUser.name, role: newUser.role } };
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0`);
    return { ok: true };
  }),
});
