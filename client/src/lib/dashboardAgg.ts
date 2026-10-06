// Agregados do AdminDashboard calculados UMA vez por [tasks, sellers, agora].
// Antes cada card de atendente refiltrava todas as tarefas a cada render (O(atendentes×tarefas))
// e criava `new Date()` por tarefa. Funções puras para poder testar sem React.

export interface DashTask {
  id?: number;
  status?: string | null;
  assignedTo?: string | null;
  userId?: number | null;
  reminderDate?: Date | string | null;
  reminderEnabled?: boolean | null;
  lastContactedAt?: Date | string | null;
  convertedAt?: Date | string | null;
  createdAt?: Date | string | null;
  contactCount?: number | null;
}
export interface DashSeller {
  id: number;
  name: string;
  userId?: number | null;
}

/** Dono da tarefa comparável: o servidor usa lower(), então maiúsculas/espaços não separam atendentes. */
export function normalizeOwner(name?: string | null): string {
  return (name ?? '').trim().toLowerCase();
}

/**
 * Atrasada = pendente, com data, lembrete não desativado (`!== false`, igual à tela de Tarefas)
 * e data já passada.
 */
export function isTaskOverdue(t: DashTask, nowMs: number): boolean {
  if (t.status !== 'pending' || !t.reminderDate || t.reminderEnabled === false) return false;
  return new Date(t.reminderDate).getTime() < nowMs;
}

/** Tarefas de cada atendente: pelo nome (normalizado) OU pelo userId. Uma passada nas tarefas. */
export function indexTasksBySeller<T extends DashTask>(tasks: T[], sellers: DashSeller[]): Map<number, T[]> {
  const byName = new Map<string, T[]>();
  const byUser = new Map<number, T[]>();
  for (const t of tasks) {
    const key = normalizeOwner(t.assignedTo);
    if (key) {
      const a = byName.get(key);
      if (a) a.push(t); else byName.set(key, [t]);
    }
    if (t.userId != null) {
      const a = byUser.get(t.userId);
      if (a) a.push(t); else byUser.set(t.userId, [t]);
    }
  }
  const result = new Map<number, T[]>();
  for (const s of sellers) {
    const named = byName.get(normalizeOwner(s.name)) ?? [];
    const owned = s.userId != null ? byUser.get(s.userId) ?? [] : [];
    if (owned.length === 0) { result.set(s.id, named); continue; }
    if (named.length === 0) { result.set(s.id, owned); continue; }
    const seen = new Set<T>(named);
    result.set(s.id, [...named, ...owned.filter((t) => !seen.has(t))]);
  }
  return result;
}

const DAY = 86_400_000;

export function computeDashboardAgg<T extends DashTask>(tasks: T[], sellers: DashSeller[], nowMs: number) {
  const now = new Date(nowMs);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const ms = (v: Date | string | null | undefined) => (v ? new Date(v).getTime() : NaN);

  const pending: T[] = [];
  const overdue: T[] = [];
  const convertedTasks: T[] = [];
  const contactedTasks: T[] = [];
  let completedCount = 0;
  let cancelledTotal = 0;
  let contactsToday = 0;
  let reminderOn = 0;
  for (const t of tasks) {
    if (t.status === 'pending') pending.push(t);
    if (t.status === 'completed') completedCount++;
    if (t.status === 'cancelled') cancelledTotal++;
    if (isTaskOverdue(t, nowMs)) overdue.push(t);
    if (t.convertedAt) convertedTasks.push(t);
    if (t.lastContactedAt) {
      contactedTasks.push(t);
      if (ms(t.lastContactedAt) >= todayStartMs) contactsToday++;
    }
    if (t.reminderDate && t.reminderEnabled) reminderOn++;
  }

  const total = tasks.length;
  const convertedCount = convertedTasks.length;
  const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 0;
  const conversionRate = total > 0 ? Math.round((convertedCount / total) * 100) : 0;
  const avgContactsToConvert = convertedCount > 0
    ? Math.round(convertedTasks.reduce((sum, t) => sum + (t.contactCount || 0), 0) / convertedCount)
    : 0;
  const convertedThisMonth = convertedTasks.filter((t) => {
    const d = new Date(t.convertedAt as Date | string);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const funnel = { total, contacted: contactedTasks.length, converted: convertedCount };

  const avg = (deltas: number[]) => (deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0);
  const avgFirstContactMs = avg(
    contactedTasks.map((t) => ms(t.lastContactedAt) - ms(t.createdAt)).filter((d) => d > 0),
  );
  const avgFirstContactDays = avgFirstContactMs > 0 ? avgFirstContactMs / DAY : 0;
  const avgConversionMs = avg(
    convertedTasks.map((t) => ms(t.convertedAt) - ms(t.createdAt)).filter((d) => d > 0),
  );
  const avgConversionDays = avgConversionMs > 0 ? avgConversionMs / DAY : 0;

  const staleNoContact = tasks.filter((t) => {
    if (t.lastContactedAt || t.convertedAt) return false;
    return nowMs - ms(t.createdAt) > 48 * 3_600_000; // > 48h sem nenhum contato
  });

  const hotLeads = avgContactsToConvert > 0
    ? tasks
        .filter((t) => !t.convertedAt && (t.contactCount || 0) >= Math.max(1, avgContactsToConvert - 1))
        .sort((a, b) => (b.contactCount || 0) - (a.contactCount || 0))
        .slice(0, 8)
    : [];

  const bySeller = indexTasksBySeller(tasks, sellers);
  const sellerStats = new Map<number, { tasks: T[]; contactsToday: number; overdue: number }>();
  for (const s of sellers) {
    const mine = bySeller.get(s.id) ?? [];
    sellerStats.set(s.id, {
      tasks: mine,
      contactsToday: mine.filter((t) => t.lastContactedAt && ms(t.lastContactedAt) >= todayStartMs).length,
      overdue: mine.filter((t) => isTaskOverdue(t, nowMs)).length,
    });
  }

  const conversionRanking = sellers.map((seller) => {
    const mine = bySeller.get(seller.id) ?? [];
    const mineConvertedTasks = mine.filter((t) => t.convertedAt);
    const mineConverted = mineConvertedTasks.length;
    const mineCancelled = mine.filter((t) => t.status === 'cancelled').length;
    const rate = mine.length > 0 ? Math.round((mineConverted / mine.length) * 100) : 0;
    const myAvgContacts = mineConverted > 0
      ? Math.round(mineConvertedTasks.reduce((acc, t) => acc + (t.contactCount || 0), 0) / mineConverted)
      : 0;
    // Perdidos: cancelados entre o que já teve desfecho (convertido ou cancelado)
    const decided = mineConverted + mineCancelled;
    const lostRate = decided > 0 ? Math.round((mineCancelled / decided) * 100) : 0;
    return { name: seller.name, total: mine.length, converted: mineConverted, rate, myAvgContacts, cancelled: mineCancelled, lostRate };
  }).filter((r) => r.total > 0).sort((a, b) => b.converted - a.converted || b.rate - a.rate);

  // Tendência semanal de conversões (últimas 8 semanas, por convertedAt)
  const weeks: { label: string; start: number; end: number; count: number }[] = [];
  const cursor = new Date(now); cursor.setDate(cursor.getDate() - cursor.getDay()); cursor.setHours(0, 0, 0, 0);
  const p2 = (n: number) => String(n).padStart(2, '0');
  for (let i = 7; i >= 0; i--) {
    const start = new Date(cursor); start.setDate(start.getDate() - i * 7);
    const end = new Date(start); end.setDate(end.getDate() + 7);
    weeks.push({ label: `${p2(start.getDate())}/${p2(start.getMonth() + 1)}`, start: start.getTime(), end: end.getTime(), count: 0 });
  }
  for (const t of convertedTasks) {
    const ts = ms(t.convertedAt);
    const wk = weeks.find((w) => ts >= w.start && ts < w.end);
    if (wk) wk.count++;
  }
  const weeklyTrendMax = Math.max(1, ...weeks.map((w) => w.count));

  const decidedTotal = convertedCount + cancelledTotal;
  const lostRateGlobal = decidedTotal > 0 ? Math.round((cancelledTotal / decidedTotal) * 100) : 0;

  return {
    todayStart, pending, overdue, completionRate, contactsToday, reminderOn,
    convertedTasks, convertedCount, conversionRate, avgContactsToConvert, convertedThisMonth,
    funnel, avgFirstContactMs, avgFirstContactDays, avgConversionMs, avgConversionDays, staleNoContact, hotLeads,
    sellerStats, conversionRanking, weeklyTrend: weeks, weeklyTrendMax,
    cancelledTotal, decidedTotal, lostRateGlobal,
  };
}
