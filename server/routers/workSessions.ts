import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { workSessions } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';

export const workSessionsRouter = router({

  // Get current active/paused session for the user
  current: protectedProcedure.query(async ({ ctx }) => {
    const [session] = await db.select().from(workSessions)
      .where(and(eq(workSessions.userId, ctx.user.id), eq(workSessions.status, 'active')))
      .orderBy(desc(workSessions.startedAt))
      .limit(1);
    if (session) return session;

    const [paused] = await db.select().from(workSessions)
      .where(and(eq(workSessions.userId, ctx.user.id), eq(workSessions.status, 'paused')))
      .orderBy(desc(workSessions.startedAt))
      .limit(1);
    return paused ?? null;
  }),

  // Start work — only one active session at a time
  start: protectedProcedure
    .input(z.object({ dailyGoalHours: z.number().min(1).max(24).default(8) }))
    .mutation(async ({ input, ctx }) => {
      // End any stale active sessions
      await db.update(workSessions)
        .set({ status: 'ended', endedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(workSessions.userId, ctx.user.id), eq(workSessions.status, 'active')));

      const [session] = await db.insert(workSessions).values({
        userId: ctx.user.id,
        dailyGoalHours: input.dailyGoalHours,
        status: 'active',
      }).returning();
      return session;
    }),

  // Pause — records when pause started
  pause: protectedProcedure.mutation(async ({ ctx }) => {
    const now = new Date();
    const [session] = await db.update(workSessions)
      .set({ status: 'paused', pausedAt: now, updatedAt: now })
      .where(and(eq(workSessions.userId, ctx.user.id), eq(workSessions.status, 'active')))
      .returning();
    return session ?? null;
  }),

  // Resume — adds paused time to total
  resume: protectedProcedure.mutation(async ({ ctx }) => {
    const now = new Date();
    const [current] = await db.select().from(workSessions)
      .where(and(eq(workSessions.userId, ctx.user.id), eq(workSessions.status, 'paused')))
      .limit(1);
    if (!current) return null;

    const pausedMs = current.pausedAt
      ? now.getTime() - new Date(current.pausedAt).getTime()
      : 0;

    const [session] = await db.update(workSessions)
      .set({
        status: 'active',
        pausedAt: null,
        totalPausedMs: (current.totalPausedMs ?? 0) + pausedMs,
        updatedAt: now,
      })
      .where(eq(workSessions.id, current.id))
      .returning();
    return session;
  }),

  // End — finalizes session
  end: protectedProcedure.mutation(async ({ ctx }) => {
    const now = new Date();
    const [current] = await db.select().from(workSessions)
      .where(and(
        eq(workSessions.userId, ctx.user.id),
        eq(workSessions.status, 'active'),
      )).limit(1);

    const [paused] = !current ? await db.select().from(workSessions)
      .where(and(eq(workSessions.userId, ctx.user.id), eq(workSessions.status, 'paused')))
      .limit(1) : [null];

    const target = current ?? paused;
    if (!target) return null;

    const extraPausedMs = target.pausedAt
      ? now.getTime() - new Date(target.pausedAt).getTime()
      : 0;

    const [session] = await db.update(workSessions)
      .set({
        status: 'ended',
        endedAt: now,
        totalPausedMs: (target.totalPausedMs ?? 0) + extraPausedMs,
        updatedAt: now,
      })
      .where(eq(workSessions.id, target.id))
      .returning();
    return session;
  }),

  // History — last 30 sessions for this user
  history: protectedProcedure.query(async ({ ctx }) => {
    return db.select().from(workSessions)
      .where(eq(workSessions.userId, ctx.user.id))
      .orderBy(desc(workSessions.startedAt))
      .limit(30);
  }),
});
