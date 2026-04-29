import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { workSessions, sellers, tasks } from '../db/schema';
import { eq, and, desc, gte, or } from 'drizzle-orm';

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
      const now = new Date();
      // End any stale active or paused sessions
      await db.update(workSessions)
        .set({ status: 'ended', endedAt: now, updatedAt: now })
        .where(and(
          eq(workSessions.userId, ctx.user.id),
          or(eq(workSessions.status, 'active'), eq(workSessions.status, 'paused')),
        ));

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

  // Admin: all seller sessions today + recent task activity + last-online history
  allActiveToday: adminProcedure.query(async () => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const [allSellers, todaySessions, todayTasks, allRecentSessions, allTasksForMonitor] = await Promise.all([
      db.select().from(sellers).where(eq(sellers.status, 'active')),
      db.select().from(workSessions)
        .where(gte(workSessions.startedAt, todayStart))
        .orderBy(desc(workSessions.startedAt)),
      // Today's edited tasks — include title so we can show what they worked on
      db.select({
        userId: tasks.userId,
        assignedTo: tasks.assignedTo,
        title: tasks.title,
        lastContactedAt: tasks.lastContactedAt,
      }).from(tasks).where(gte(tasks.lastContactedAt, todayStart))
        .orderBy(desc(tasks.lastContactedAt)),
      // Most recent session per seller across all days — for "last online" info
      db.select({
        userId: workSessions.userId,
        startedAt: workSessions.startedAt,
        endedAt: workSessions.endedAt,
        status: workSessions.status,
      }).from(workSessions)
        .orderBy(desc(workSessions.startedAt))
        .limit(500),
      // Monitoring: need lastContactedAt for ghost + burst detection
      db.select({
        userId: tasks.userId,
        assignedTo: tasks.assignedTo,
        lastContactedAt: tasks.lastContactedAt,
      }).from(tasks),
    ]);

    return allSellers.map(seller => {
      // Most recent session today
      const session = todaySessions.find(s => s.userId === seller.userId) ?? null;

      // Tasks touched today by this seller
      const mine = todayTasks.filter(
        t => t.userId === seller.userId || t.assignedTo === seller.name
      );
      const contactsToday = mine.length;
      const lastActivityDate = mine.length > 0
        ? new Date(Math.max(...mine.map(t => new Date(t.lastContactedAt!).getTime())))
        : null;

      // Last 5 tasks edited today — for activity detail
      const recentTasks = mine.slice(0, 5).map(t => ({
        title: t.title.split(' - ')[0].slice(0, 60),
        lastContactedAt: t.lastContactedAt,
      }));

      // Last online from any past session (for sellers with no today session)
      const lastOnlineSession = !session
        ? allRecentSessions.find(s => s.userId === seller.userId) ?? null
        : null;
      const lastOnlineAt = lastOnlineSession
        ? (lastOnlineSession.endedAt ?? lastOnlineSession.startedAt)
        : null;

      // Worked time = total elapsed - pauses
      let workedMs = 0;
      let idleSinceMs = 0;
      if (session) {
        const end = session.endedAt ? new Date(session.endedAt) : now;
        const elapsed = end.getTime() - new Date(session.startedAt).getTime();
        let pausedTotal = session.totalPausedMs ?? 0;
        if (session.status === 'paused' && session.pausedAt) {
          pausedTotal += now.getTime() - new Date(session.pausedAt).getTime();
        }
        workedMs = Math.max(0, elapsed - pausedTotal);

        // Idle = active session but last activity > 30 min ago
        if (session.status === 'active' && lastActivityDate) {
          idleSinceMs = now.getTime() - lastActivityDate.getTime();
        } else if (session.status === 'active' && contactsToday === 0) {
          idleSinceMs = now.getTime() - new Date(session.startedAt).getTime();
        }
      }

      // Monitoring: ghost count (no real contact in 30+ days)
      const sellerTasks = allTasksForMonitor.filter(
        t => t.userId === seller.userId || t.assignedTo === seller.name
      );
      const ghostCount = sellerTasks.filter(
        t => !t.lastContactedAt || new Date(t.lastContactedAt) < thirtyDaysAgo
      ).length;

      // Monitoring: burst detection (≥5 contacts in any 10-min window)
      const contactedSorted = sellerTasks
        .filter(t => t.lastContactedAt)
        .sort((a, b) => new Date(a.lastContactedAt!).getTime() - new Date(b.lastContactedAt!).getTime());
      let burstMax = 0;
      for (let i = 0; i < contactedSorted.length; i++) {
        const base = new Date(contactedSorted[i].lastContactedAt!).getTime();
        const inWin = contactedSorted.filter(t => {
          const d = new Date(t.lastContactedAt!).getTime() - base;
          return d >= 0 && d <= 600000;
        }).length;
        if (inWin > burstMax) burstMax = inWin;
      }

      return {
        sellerId: seller.id,
        name: seller.name,
        email: seller.email,
        session: session ? {
          startedAt: session.startedAt,
          status: session.status,
          pausedAt: session.pausedAt ?? null,
          workedMs,
        } : null,
        contactsToday,
        lastActivityDate,
        idleSinceMs,
        recentTasks,
        lastOnlineAt,
        ghostCount,
        burstAlert: burstMax >= 5,
        burstMax,
      };
    });
  }),
});
