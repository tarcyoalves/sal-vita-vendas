import { router, protectedProcedure } from '../trpc';
import { db } from '../db';
import { sellers, tasks, workSessions, clients } from '../db/schema';
import { eq, or, and, gte, sql } from 'drizzle-orm';

const HOT_KEYWORDS = [
  'orçamento', 'orcamento', 'interessad', 'confirmar', 'confirmo',
  'reunião', 'reuniao', 'fechar', 'fecha', 'comprar', 'compro',
  'prazo', 'decidir', 'decidiu', 'aprovou', 'aprovar',
  'pediu', 'combinou', 'marcou', 'positivo', 'demo',
];

export const tvRouter = router({
  dashboard: protectedProcedure.query(async () => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [allSellers, allTasks, activeSessions, clientCount] = await Promise.all([
      db.select().from(sellers).where(eq(sellers.status, 'active')),
      db.select({
        id: tasks.id, title: tasks.title, notes: tasks.notes,
        assignedTo: tasks.assignedTo, status: tasks.status,
        reminderDate: tasks.reminderDate, updatedAt: tasks.updatedAt,
        lastContactedAt: tasks.lastContactedAt,
        userId: tasks.userId,
      }).from(tasks),
      db.select({ userId: workSessions.userId, status: workSessions.status })
        .from(workSessions)
        .where(and(
          or(eq(workSessions.status, 'active'), eq(workSessions.status, 'paused')),
          gte(workSessions.startedAt, todayStart),
        )),
      db.select({ count: sql<number>`count(*)::int` }).from(clients),
    ]);

    // 4 weekly buckets ending today
    const weeks = Array.from({ length: 4 }, (_, i) => {
      const end = new Date(todayStart);
      end.setDate(todayStart.getDate() - (3 - i) * 7);
      const start = new Date(end);
      start.setDate(end.getDate() - 7);
      return { label: `S${i + 1}`, start, end };
    });

    const sellerStats = allSellers.map(seller => {
      const mine = allTasks.filter(t => t.assignedTo === seller.name);

      const weeklyContacts = weeks.map(w => ({
        week: w.label,
        // Real contacts: tasks where attendant actually wrote notes (lastContactedAt set)
        contacts: mine.filter(t => {
          if (!t.lastContactedAt) return false;
          const lc = new Date(t.lastContactedAt);
          return lc >= w.start && lc < w.end;
        }).length,
      }));

      const lastW = weeklyContacts[3]?.contacts ?? 0;
      const prevW = weeklyContacts[2]?.contacts ?? 0;
      const trend: 'up' | 'down' | 'stable' =
        lastW > prevW ? 'up' : lastW < prevW ? 'down' : 'stable';

      // Real contacts today: only tasks the attendant manually edited with notes
      const contactsToday = mine.filter(
        t => t.lastContactedAt && new Date(t.lastContactedAt) >= todayStart
      ).length;
      const overdueCount = mine.filter(
        t => t.reminderDate && new Date(t.reminderDate) < now && t.status === 'pending'
      ).length;
      const noNotesCount = mine.filter(
        t => !t.notes || t.notes.trim().length < 10
      ).length;
      const isOnline = activeSessions.some(
        s => s.userId === seller.userId && s.status === 'active'
      );

      return {
        id: seller.id,
        name: seller.name,
        weeklyContacts,
        contactsToday,
        overdueCount,
        noNotesCount,
        isOnline,
        trend,
      };
    });

    const hotClients = allTasks
      .filter(t => t.notes && t.notes.trim().length > 10)
      .map(t => {
        const n = (t.notes || '').toLowerCase();
        const score = HOT_KEYWORDS.reduce((acc, kw) => acc + (n.includes(kw) ? 12 : 0), 0);
        const hoursAgo = (now.getTime() - new Date(t.updatedAt).getTime()) / 3_600_000;
        const recency = hoursAgo < 4 ? 35 : hoursAgo < 24 ? 20 : hoursAgo < 72 ? 8 : 0;
        return {
          title: t.title.split(' - ')[0].slice(0, 40),
          snippet: (t.notes || '').slice(0, 80),
          assignedTo: t.assignedTo || '—',
          score: Math.min(99, score + recency),
          hoursAgo: Math.round(hoursAgo),
        };
      })
      .filter(t => t.score >= 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    type Alert = { type: string; seller: string; count: number; label: string };
    const alerts: Alert[] = [];
    for (const s of sellerStats) {
      if (s.noNotesCount > 5)
        alerts.push({ type: 'no_notes', seller: s.name, count: s.noNotesCount, label: 'sem anotação' });
      if (s.overdueCount > 3)
        alerts.push({ type: 'overdue', seller: s.name, count: s.overdueCount, label: 'atrasados' });
      if (s.isOnline && s.contactsToday === 0)
        alerts.push({ type: 'idle', seller: s.name, count: 0, label: 'online sem contatos hoje' });
    }

    const totalOverdue = allTasks.filter(
      t => t.reminderDate && new Date(t.reminderDate) < now && t.status === 'pending'
    ).length;
    const contactsToday = allTasks.filter(
      t => t.lastContactedAt && new Date(t.lastContactedAt) >= todayStart
    ).length;

    return {
      kpis: {
        onlineNow: sellerStats.filter(s => s.isOnline).length,
        totalSellers: allSellers.length,
        contactsToday,
        totalClients: clientCount[0]?.count ?? 0,
        totalOverdue,
      },
      sellerStats,
      hotClients,
      alerts: alerts.slice(0, 5),
    };
  }),
});
