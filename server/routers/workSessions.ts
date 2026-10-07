import { z } from 'zod';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '../db';
import { workSessions, sellers, tasks } from '../db/schema';
import { eq, and, desc, gte, gt, or, isNotNull, isNull, lt, count, sql } from 'drizzle-orm';
import { spMidnight } from '../lib/tz';
import { closeSessionValues, effectiveEndMs, heartbeatCutoffs, isForgottenSession, sessionWorkedMs, todayWorkedMs } from '../lib/workHours';

export const workSessionsRouter = router({

  // Sessão atual do usuário: a aberta (ativa de preferência, senão pausada) ou, se
  // não há aberta, a última de hoje (encerrada) — assim as horas da manhã não somem
  // depois de encerrar e reiniciar. Campos acrescentados (contrato antigo intacto):
  //  - todayWorkedMs: horas de hoje (SP), somando todas as sessões, inclusive encerradas
  //  - todayOtherMs: o mesmo, sem a sessão devolvida (o cliente soma o relógio ao vivo dela)
  current: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const todayStart = spMidnight(now);
    const rows = await db.select().from(workSessions)
      .where(and(
        eq(workSessions.userId, ctx.user.id),
        or(
          eq(workSessions.status, 'active'),
          eq(workSessions.status, 'paused'),
          gte(workSessions.startedAt, todayStart),
          gte(workSessions.endedAt, todayStart),
        ),
      ))
      .orderBy(desc(workSessions.startedAt));

    // Sessão aberta de dia anterior sem sinal de vida é "esquecida": não é a sessão
    // atual (senão o relógio contaria dias); o start() a encerra ao iniciar de novo.
    const live = rows.filter(r => !isForgottenSession(r, now));
    const session = live.find(r => r.status === 'active')
      ?? live.find(r => r.status === 'paused')
      ?? live.find(r => new Date(r.startedAt) >= todayStart || (r.endedAt && new Date(r.endedAt) >= todayStart));
    if (!session) return null;
    return {
      ...session,
      todayWorkedMs: todayWorkedMs(rows, now),
      todayOtherMs: todayWorkedMs(rows.filter(r => r.id !== session.id), now),
    };
  }),

  // Start work — idempotente: no máximo uma sessão aberta por usuário.
  // Sessão aberta de DIA ANTERIOR é encerrada (fim limitado ao último sinal de vida,
  // não ao "agora"); sessão aberta de hoje é devolvida (retomada, se pausada). Só se
  // não houver nenhuma o INSERT condicional cria a nova — dois cliques simultâneos
  // não geram duas 'active'.
  start: protectedProcedure
    .input(z.object({ dailyGoalHours: z.number().min(1).max(24).default(8) }))
    .mutation(async ({ input, ctx }) => {
      const now = new Date();
      const todayStart = spMidnight(now);
      const uid = ctx.user.id;
      const openWhere = (id?: number) => and(
        eq(workSessions.userId, uid),
        id === undefined ? undefined : eq(workSessions.id, id),
        or(eq(workSessions.status, 'active'), eq(workSessions.status, 'paused')),
      );

      const open = await db.select().from(workSessions).where(openWhere())
        .orderBy(desc(workSessions.startedAt));
      const todays = open.filter(s => new Date(s.startedAt) >= todayStart);
      // Preferida: ativa mais recente; senão a pausada mais recente. As demais (legado
      // de cliques duplos) e as de dias anteriores são encerradas.
      const keep = todays.find(s => s.status === 'active') ?? todays[0];
      for (const s of open) {
        if (keep && s.id === keep.id) continue;
        await db.update(workSessions)
          .set({ status: 'ended', ...closeSessionValues(s, now), pausedAt: null, updatedAt: now })
          .where(openWhere(s.id));
      }

      if (keep) {
        if (keep.status === 'paused') {
          // Retomar soma a pausa em curso ao total (antes ela era descartada)
          const pausedMs = keep.pausedAt ? Math.max(0, now.getTime() - new Date(keep.pausedAt).getTime()) : 0;
          const [resumed] = await db.update(workSessions)
            .set({ status: 'active', pausedAt: null, totalPausedMs: (keep.totalPausedMs ?? 0) + pausedMs, updatedAt: now })
            .where(and(eq(workSessions.id, keep.id), eq(workSessions.status, 'paused')))
            .returning();
          if (resumed) return resumed;
        } else {
          return keep;
        }
      }

      const ins = await db.execute(sql`
        INSERT INTO work_sessions (user_id, daily_goal_hours, status)
        SELECT ${uid}::integer, ${input.dailyGoalHours}::integer, 'active'
        WHERE NOT EXISTS (
          SELECT 1 FROM work_sessions WHERE user_id = ${uid}::integer AND status IN ('active', 'paused')
        )
        RETURNING id`);
      const newId = (ins.rows[0] as { id?: number } | undefined)?.id;
      const [session] = await db.select().from(workSessions)
        .where(newId !== undefined ? eq(workSessions.id, newId) : openWhere())
        .orderBy(desc(workSessions.startedAt))
        .limit(1);
      return session;
    }),

  // Batimento: o cliente chama a cada 5 min com a aba visível e a sessão ativa. Só
  // atualiza updatedAt (último sinal de vida) — é o que impede uma sessão esquecida
  // aberta de virar 0 h ao ser encerrada (ver effectiveEndMs em lib/workHours.ts).
  // Sessão esquecida (de dia anterior, sem sinal há mais de 15 min) NÃO é atualizada:
  // o notebook que acorda no dia seguinte dispara o setInterval atrasado e, sem esta
  // condição, "ressuscitaria" a sessão e contaria a noite como trabalho. `updated: 0`
  // avisa o cliente para recarregar a sessão atual.
  heartbeat: protectedProcedure.mutation(async ({ ctx }) => {
    const now = new Date();
    const { midnight, staleBefore } = heartbeatCutoffs(now);
    const rows = await db.update(workSessions)
      .set({ updatedAt: now })
      .where(and(
        eq(workSessions.userId, ctx.user.id),
        eq(workSessions.status, 'active'),
        or(gte(workSessions.startedAt, midnight), gt(workSessions.updatedAt, staleBefore)),
      ))
      .returning({ id: workSessions.id });
    return { ok: true as const, updated: rows.length };
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

  // End — finaliza a sessão aberta (e qualquer duplicada legada), somando a pausa em curso
  end: protectedProcedure.mutation(async ({ ctx }) => {
    const now = new Date();
    const open = await db.select().from(workSessions)
      .where(and(
        eq(workSessions.userId, ctx.user.id),
        or(eq(workSessions.status, 'active'), eq(workSessions.status, 'paused')),
      ))
      .orderBy(desc(workSessions.startedAt));
    if (open.length === 0) return null;

    let result = null;
    for (const s of open) {
      const [ended] = await db.update(workSessions)
        .set({ status: 'ended', ...closeSessionValues(s, now), updatedAt: now })
        .where(and(eq(workSessions.id, s.id), or(eq(workSessions.status, 'active'), eq(workSessions.status, 'paused'))))
        .returning();
      result ??= ended ?? null;
    }
    return result;
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
    const todayStart = spMidnight(now);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const [allSellers, todaySessions, todayTasks, allRecentSessions, ghostCounts, burstTasks] = await Promise.all([
      db.select().from(sellers).where(eq(sellers.status, 'active')),
      // Sessões de hoje (SP), inclusive as já encerradas, mais qualquer sessão ainda
      // aberta (mesmo iniciada antes de 00:00 SP) — pausado também aparece no admin
      db.select().from(workSessions)
        .where(or(
          gte(workSessions.startedAt, todayStart),
          gte(workSessions.endedAt, todayStart),
          eq(workSessions.status, 'active'),
          eq(workSessions.status, 'paused'),
        ))
        .orderBy(desc(workSessions.startedAt)),
      // Today's edited tasks — include title so we can show what they worked on
      db.select({
        userId: tasks.userId,
        assignedTo: tasks.assignedTo,
        title: tasks.title,
        lastContactedAt: tasks.lastContactedAt,
      }).from(tasks).where(gte(tasks.lastContactedAt, todayStart))
        .orderBy(desc(tasks.lastContactedAt)),
      // Most recent session per seller in the last 90 days — for "last online" info
      db.select({
        userId: workSessions.userId,
        startedAt: workSessions.startedAt,
        endedAt: workSessions.endedAt,
        status: workSessions.status,
        pausedAt: workSessions.pausedAt,
        totalPausedMs: workSessions.totalPausedMs,
        updatedAt: workSessions.updatedAt,
        dailyGoalHours: workSessions.dailyGoalHours,
      }).from(workSessions)
        .where(gte(workSessions.startedAt, new Date(Date.now() - 90 * 86400000)))
        .orderBy(desc(workSessions.startedAt))
        .limit(200),
      // Ghost count: tasks not contacted in 30+ days (aggregated, no row scan)
      db.select({
        userId: tasks.userId,
        assignedTo: tasks.assignedTo,
        ghostCount: count(),
      }).from(tasks)
        .where(or(isNull(tasks.lastContactedAt), lt(tasks.lastContactedAt, thirtyDaysAgo)))
        .groupBy(tasks.userId, tasks.assignedTo),
      // Burst detection: only tasks contacted in last 2 hours (not all tasks)
      db.select({
        userId: tasks.userId,
        assignedTo: tasks.assignedTo,
        lastContactedAt: tasks.lastContactedAt,
      }).from(tasks)
        .where(and(isNotNull(tasks.lastContactedAt), gte(tasks.lastContactedAt, twoHoursAgo))),
    ]);

    return allSellers.map(seller => {
      // Sessão aberta (ativa de preferência, senão pausada); o contrato `session` segue
      // sendo só a aberta. Quem já encerrou hoje aparece em todayWorkedMs/endedTodayAt.
      const userSessions = todaySessions.filter(s => s.userId === seller.userId);
      // Sessão aberta de dia anterior sem sinal de vida é "esquecida": não aparece como
      // ativa (antes ficava "online" para sempre); sinalizada em `forgotten`.
      const liveSessions = userSessions.filter(s => !isForgottenSession(s, now));
      const forgotten = userSessions.length > liveSessions.length;
      const session = liveSessions.find(s => s.status === 'active')
        ?? liveSessions.find(s => s.status === 'paused') ?? null;
      const todayMs = todayWorkedMs(userSessions, now);
      const endedToday = userSessions.filter(s => s.endedAt && new Date(s.endedAt) >= todayStart);
      const endedTodayAt = endedToday.length > 0
        ? new Date(Math.max(...endedToday.map(s => new Date(s.endedAt!).getTime()))) : null;

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
        ? new Date(effectiveEndMs(lastOnlineSession, now))
        : null;

      // Worked time = total elapsed - pauses
      let workedMs = 0;
      let idleSinceMs = 0;
      if (session) {
        workedMs = sessionWorkedMs(session, now);

        // Idle = active session but last activity > 30 min ago
        if (session.status === 'active' && lastActivityDate) {
          idleSinceMs = now.getTime() - lastActivityDate.getTime();
        } else if (session.status === 'active' && contactsToday === 0) {
          idleSinceMs = now.getTime() - new Date(session.startedAt).getTime();
        }
      }

      // Ghost count from pre-aggregated query
      const ghostCount = ghostCounts
        .filter(g => g.userId === seller.userId || g.assignedTo === seller.name)
        .reduce((sum, g) => sum + Number(g.ghostCount), 0);

      // Burst detection using only last-2h tasks
      const sellerBurst = burstTasks
        .filter(t => t.userId === seller.userId || t.assignedTo === seller.name)
        .filter(t => t.lastContactedAt)
        .sort((a, b) => new Date(a.lastContactedAt!).getTime() - new Date(b.lastContactedAt!).getTime());
      let burstMax = 0;
      for (let i = 0; i < sellerBurst.length; i++) {
        const base = new Date(sellerBurst[i].lastContactedAt!).getTime();
        const inWin = sellerBurst.filter(t => {
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
        forgotten,
        todayWorkedMs: todayMs,
        endedTodayAt,
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
