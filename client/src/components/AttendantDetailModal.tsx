import { useState, useMemo } from 'react';
import { X, CheckCircle2, RefreshCw, Zap } from 'lucide-react';
import { Badge } from './ui/badge';
import { StatStrip, Stat } from './layout/Page';
import { Button } from './ui/button';
import { trpc } from '../lib/trpc';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { useConfirm } from './useConfirm';

interface Task {
  id: number;
  title: string;
  notes?: string | null;
  reminderDate?: Date | string | null;
  reminderEnabled?: boolean | null;
  assignedTo?: string | null;
  userId: number;
  status?: string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
  lastContactedAt?: Date | string | null;
  convertedAt?: Date | string | null;
  contactCount?: number | null;
}

interface Seller {
  id: number;
  name: string;
  email: string;
  userId: number;
}

interface Props {
  seller: Seller;
  allTasks: Task[];
  allSellers: Seller[];
  onClose: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayKey = () => dayKey(new Date());

type Tab = 'resumo' | 'agenda' | 'historico' | 'comparacao' | 'monitoramento';

export default function AttendantDetailModal({ seller, allTasks, allSellers, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('resumo');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleResult, setRescheduleResult] = useState<string | null>(null);
  const bulkReschedule = trpc.ai.bulkReschedule.useMutation();
  const { confirm, confirmDialog } = useConfirm();

  const m = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(todayStart.getTime() + 7 * 86400000);

    const myTasks = allTasks.filter(t =>
      t.assignedTo === seller.name || t.userId === seller.userId
    );

    const withReminder = myTasks.filter(t => t.reminderDate && t.reminderEnabled !== false);
    const overdue = withReminder.filter(t => new Date(t.reminderDate as string) < now);
    const upcoming = withReminder.filter(t => {
      const d = new Date(t.reminderDate as string);
      return d >= now && d < weekEnd;
    });
    const todayTasks = withReminder.filter(t => dayKey(new Date(t.reminderDate as string)) === todayKey());
    const noNotes = myTasks.filter(t => !t.notes || t.notes.trim().length < 15);
    const disabledReminders = myTasks.filter(t => t.reminderEnabled === false);

    const updatedToday = myTasks.filter(t => {
      try { return dayKey(new Date(t.updatedAt as string)) === todayKey(); } catch { return false; }
    });

    const rescheduledToday = updatedToday.filter(t =>
      t.reminderDate && new Date(t.reminderDate as string) >= todayStart
    );

    const neverUpdated = myTasks.filter(t => {
      try {
        const diff = new Date(t.updatedAt as string).getTime() - new Date(t.createdAt as string).getTime();
        return diff < 2 * 60 * 1000;
      } catch { return false; }
    });

    // ── Monitoring signals ──────────────────────────────────────────────────
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

    // Ghost clients: no real contact in 30+ days
    const ghostClients = myTasks.filter(t =>
      !t.lastContactedAt || new Date(t.lastContactedAt as string) < thirtyDaysAgo
    );

    // Note quality
    const notedTasks = myTasks.filter(t => t.notes && t.notes.trim().length > 0);
    const avgNoteLen = notedTasks.length > 0
      ? Math.round(notedTasks.reduce((acc, t) => acc + t.notes!.trim().length, 0) / notedTasks.length)
      : 0;

    // Burst detection: ≥5 contacts within any 10-min window
    const contactedSorted = myTasks
      .filter(t => t.lastContactedAt)
      .sort((a, b) => new Date(a.lastContactedAt as string).getTime() - new Date(b.lastContactedAt as string).getTime());
    let burstMax = 0;
    for (let i = 0; i < contactedSorted.length; i++) {
      const base = new Date(contactedSorted[i].lastContactedAt as string).getTime();
      const inWin = contactedSorted.filter(t => {
        const d = new Date(t.lastContactedAt as string).getTime() - base;
        return d >= 0 && d <= 600000;
      }).length;
      if (inWin > burstMax) burstMax = inWin;
    }
    const hasBurst = burstMax >= 5;

    // Rescheduled without real contact in last 7 days
    const reschedNoContact = myTasks.filter(t => {
      try {
        return (
          new Date(t.updatedAt as string) > sevenDaysAgo
          && (!t.lastContactedAt || new Date(t.lastContactedAt as string) < sevenDaysAgo)
          && !!t.reminderDate
        );
      } catch { return false; }
    });

    // 30-day heatmap: count tasks with reminderDate on each day
    const days30 = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(todayStart.getTime() - (29 - i) * 86400000);
      const key = dayKey(d);
      const count = withReminder.filter(t => {
        try { return dayKey(new Date(t.reminderDate as string)) === key; } catch { return false; }
      }).length;
      const overdueCount = overdue.filter(t => {
        try { return dayKey(new Date(t.reminderDate as string)) === key; } catch { return false; }
      }).length;
      return { d, key, count, overdueCount, label: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()] };
    });

    const maxDay = Math.max(1, ...days30.map(d => d.count));

    // ── Conversão (clientes ativos / vendas) ────────────────────────────────
    const thirtyDaysAgoConv = new Date(now.getTime() - 30 * 86400000);
    const convertedTasks = myTasks.filter(t => !!t.convertedAt);
    const convertedCount = convertedTasks.length;
    const conversionRate = myTasks.length > 0 ? Math.round((convertedCount / myTasks.length) * 100) : 0;
    const convertedThisMonth = convertedTasks.filter(t => {
      try { return new Date(t.convertedAt as string) >= thirtyDaysAgoConv; } catch { return false; }
    }).length;
    const contactsToConvert = convertedTasks
      .map(t => t.contactCount ?? 0)
      .filter(c => c > 0);
    const avgContactsToConvert = contactsToConvert.length > 0
      ? Math.round((contactsToConvert.reduce((a, b) => a + b, 0) / contactsToConvert.length) * 10) / 10
      : 0;
    const cancelledCount = myTasks.filter(t => t.status === 'cancelled').length;
    const decided = convertedCount + cancelledCount;
    const lostRate = decided > 0 ? Math.round((cancelledCount / decided) * 100) : 0;

    // Team conversion comparison
    const teamConversion = allSellers.map(s => {
      const st = allTasks.filter(t => t.assignedTo === s.name || t.userId === s.userId);
      const conv = st.filter(t => !!t.convertedAt).length;
      const rate = st.length > 0 ? Math.round((conv / st.length) * 100) : 0;
      return { name: s.name, total: st.length, converted: conv, rate };
    }).sort((a, b) => b.rate - a.rate);
    const myConversionRank = teamConversion.findIndex(s => s.name === seller.name) + 1;

    // Team comparison
    const teamStats = allSellers.map(s => {
      const st = allTasks.filter(t => t.assignedTo === s.name || t.userId === s.userId);
      const wr = st.filter(t => t.reminderDate && t.reminderEnabled !== false);
      const ov = wr.filter(t => new Date(t.reminderDate as string) < now).length;
      const nn = st.filter(t => !t.notes || (t.notes ?? '').trim().length < 15).length;
      const rate = st.length > 0 ? Math.round((wr.length / st.length) * 100) : 0;
      return { name: s.name, total: st.length, withReminder: wr.length, overdue: ov, noNotes: nn, rate };
    }).sort((a, b) => a.overdue - b.overdue);

    return {
      myTasks, withReminder, overdue, upcoming, todayTasks,
      noNotes, disabledReminders, updatedToday, rescheduledToday, neverUpdated,
      days30, maxDay, teamStats,
      total: myTasks.length,
      ghostClients, avgNoteLen, hasBurst, burstMax, reschedNoContact,
      convertedCount, conversionRate, convertedThisMonth, avgContactsToConvert,
      cancelledCount, lostRate, teamConversion, myConversionRank,
    };
  }, [allTasks, allSellers, seller]);

  const handleReschedule = async () => {
    const ok = await confirm(
      `Reagendar até ${m.overdue.length} tarefas vencidas de ${seller.name}? As datas dos lembretes serão redistribuídas (até 50 por dia, a partir das 8h).`,
      { title: 'Reagendar vencidos', confirmLabel: 'Reagendar' },
    );
    if (!ok) return;
    setRescheduleLoading(true);
    setRescheduleResult(null);
    try {
      const res = await bulkReschedule.mutateAsync({
        sellerName: seller.name,
        tasksPerDay: 50,
        startHour: 8,
      });
      setRescheduleResult(res.message ?? (res.error as string) ?? 'Concluído.');
    } catch (e: any) {
      setRescheduleResult('Erro: ' + (e?.message ?? 'tente novamente'));
    } finally {
      setRescheduleLoading(false);
    }
  };

  const tabs: { key: Tab; label: string; alert?: boolean }[] = [
    { key: 'resumo',        label: 'Resumo' },
    { key: 'agenda',        label: 'Agenda' },
    { key: 'historico',     label: 'Histórico' },
    { key: 'comparacao',    label: 'Comparação' },
    { key: 'monitoramento', label: 'Monitoramento', alert: m.hasBurst || m.ghostClients.length > 0 },
  ];

  const safeDate = (v: unknown) => { try { return fmtDate(new Date(v as string)); } catch { return '—'; } };

  return (
    <>
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="max-w-3xl flex flex-col gap-0 p-0 overflow-hidden"
      >
        <DialogTitle className="sr-only">Detalhes de {seller.name}</DialogTitle>

        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-slate-900">{seller.name}</p>
            <p className="truncate text-xs text-slate-500">{m.total} clientes · {seller.email}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {m.overdue.length > 0 && (
              <Button size="sm" variant="outline" disabled={rescheduleLoading} onClick={handleReschedule}>
                {rescheduleLoading
                  ? <span className="inline-block size-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                  : <RefreshCw />}
                {rescheduleLoading ? 'Reagendando...' : 'Reagendar vencidos'}
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar">
              <X />
            </Button>
          </div>
        </div>

        {rescheduleResult && (
          <div role="status" className={`px-4 py-2 text-sm border-b ${rescheduleResult.startsWith('Erro') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
            {rescheduleResult}
          </div>
        )}

        {/* Abas */}
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 scrollbar-none">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`relative -mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors max-md:min-h-10 ${tab === t.key ? 'border-brand-700 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {t.label}
              {t.alert && <span className="size-1.5 rounded-full bg-red-500" aria-label="com alertas" />}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="max-h-[70dvh] flex-1 overflow-y-auto p-4">

          {/* ── RESUMO ── */}
          {tab === 'resumo' && (
            <div className="space-y-5">
              <StatStrip>
                <Stat label="Total de clientes" value={m.total} />
                <Stat label="Com lembrete" value={m.withReminder.length} />
                <Stat label="Vencidos" value={m.overdue.length} tone={m.overdue.length > 0 ? 'danger' : 'default'} />
                <Stat label="Reagendados hoje" value={m.rescheduledToday.length} tone="success" />
              </StatStrip>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Conversão (vendas)</h3>
                  {m.teamConversion.length > 0 && (
                    <Badge variant="success">{m.myConversionRank}º da equipe</Badge>
                  )}
                </div>
                <StatStrip>
                  <Stat label="Clientes ativos" value={m.convertedCount} />
                  <Stat label="Taxa de conversão" value={`${m.conversionRate}%`} />
                  <Stat label="Convertidos (30d)" value={m.convertedThisMonth} />
                  <Stat label="Contatos p/ converter" value={m.avgContactsToConvert || '—'} hint="média" />
                </StatStrip>
                {m.cancelledCount > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Leads perdidos: <span className={`font-medium ${m.lostRate > 50 ? 'text-red-700' : 'text-slate-700'}`}>{m.lostRate}%</span> ({m.cancelledCount} cancelado{m.cancelledCount !== 1 ? 's' : ''})
                  </p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Qualidade da carteira</h3>
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {[
                    { label: 'Sem anotação', value: m.noNotes.length, total: m.total, warn: true },
                    { label: 'Lembrete desativado', value: m.disabledReminders.length, total: m.total, warn: true },
                    { label: 'Nunca atualizados', value: m.neverUpdated.length, total: m.total, warn: true },
                    { label: 'Com lembrete esta semana', value: m.upcoming.length, total: m.withReminder.length, warn: false },
                  ].map(k => (
                    <div key={k.label} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-44 shrink-0 text-sm text-slate-700">{k.label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${k.warn ? 'bg-amber-500' : 'bg-brand-600'}`}
                          style={{ width: k.total > 0 ? `${Math.round((k.value / k.total) * 100)}%` : '0%' }}
                        />
                      </div>
                      <span className={`w-14 text-right text-sm font-medium tabular-nums ${k.warn && k.value > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{k.value}/{k.total}</span>
                    </div>
                  ))}
                </div>
              </section>

              {m.overdue.length > 0 ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Lembretes vencidos <span className="font-normal text-slate-500">(primeiros 8)</span></h3>
                  <ul className="max-h-48 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
                    {m.overdue.slice(0, 8).map(t => (
                      <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-slate-900">{t.title}</span>
                        <span className="shrink-0 tabular-nums text-red-700">{safeDate(t.reminderDate)}</span>
                      </li>
                    ))}
                  </ul>
                  {m.overdue.length > 8 && <p className="mt-1 text-center text-xs text-slate-500">+ {m.overdue.length - 8} outros vencidos</p>}
                </section>
              ) : (
                <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  <CheckCircle2 size={16} aria-hidden />
                  Sem lembretes vencidos. Atendente em dia.
                </div>
              )}
            </div>
          )}

          {/* ── AGENDA ── */}
          {tab === 'agenda' && (
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Hoje</h3>
                {m.todayTasks.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">Nenhum lembrete para hoje.</p>
                ) : (
                  <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {[...m.todayTasks]
                      .sort((a, b) => new Date(a.reminderDate as string).getTime() - new Date(b.reminderDate as string).getTime())
                      .map(t => {
                        const d = new Date(t.reminderDate as string);
                        const overdue = d < new Date();
                        return (
                          <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                            <span className={`min-w-0 flex-1 truncate ${overdue ? 'font-medium text-red-700' : 'text-slate-900'}`}>{t.title}</span>
                            <span className={`shrink-0 tabular-nums ${overdue ? 'text-red-700' : 'text-slate-500'}`}>{fmtTime(d)}</span>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Próximos 7 dias</h3>
                {m.upcoming.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">Nenhum lembrete agendado esta semana.</p>
                ) : (
                  <ul className="max-h-60 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
                    {[...m.upcoming]
                      .sort((a, b) => new Date(a.reminderDate as string).getTime() - new Date(b.reminderDate as string).getTime())
                      .slice(0, 20)
                      .map(t => {
                        const d = new Date(t.reminderDate as string);
                        return (
                          <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                            <span className="min-w-0 flex-1 truncate text-slate-900">{t.title}</span>
                            <span className="shrink-0 tabular-nums text-slate-500">{fmtDate(d)} {fmtTime(d)}</span>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </section>
            </div>
          )}

          {/* ── HISTÓRICO ── */}
          {tab === 'historico' && (
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Lembretes por dia <span className="font-normal text-slate-500">(últimos 30 dias)</span></h3>
                <div className="grid grid-cols-10 gap-1">
                  {m.days30.map((day, i) => {
                    const isToday = day.key === todayKey();
                    const pct = day.count / m.maxDay;
                    const bg = day.count === 0 ? 'bg-slate-100'
                      : pct < 0.3 ? 'bg-brand-200'
                      : pct < 0.6 ? 'bg-brand-400'
                      : 'bg-brand-700';
                    return (
                      <div key={i} title={`${fmtDate(day.d)}: ${day.count} lembretes`} className="flex flex-col items-center gap-0.5">
                        <div className={`aspect-square w-full rounded-sm ${bg} ${isToday ? 'ring-2 ring-brand-700 ring-offset-1' : ''}`} />
                        {i % 5 === 0 && <span className="text-[10px] tabular-nums text-slate-500">{fmtDate(day.d)}</span>}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Semanas recentes</h3>
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {Array.from({ length: 4 }, (_, w) => {
                    const weekDays = m.days30.slice(m.days30.length - 30 + w * 7, m.days30.length - 30 + (w + 1) * 7);
                    const total = weekDays.reduce((s, d) => s + d.count, 0);
                    const label = w === 3 ? 'Esta semana' : w === 2 ? 'Semana passada' : `Há ${4 - w} semanas`;
                    return (
                      <div key={w} className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm text-slate-700">{label}</span>
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-brand-600" style={{ width: m.maxDay > 0 ? `${Math.min(100, Math.round((total / (m.maxDay * 7)) * 100))}%` : '0%' }} />
                          </div>
                          <span className="w-8 text-right text-sm font-medium tabular-nums text-slate-900">{total}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          )}

          {/* ── MONITORAMENTO ── */}
          {tab === 'monitoramento' && (
            <div className="space-y-5">

              {m.hasBurst && (
                <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <Zap size={18} className="mt-0.5 shrink-0 text-red-700" aria-hidden />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Alerta: marcação em massa detectada</p>
                    <p className="mt-0.5 text-sm text-red-700">
                      {m.burstMax} clientes "contatados" em menos de 10 minutos. Isso é estatisticamente improvável para contatos reais — provável marcação em massa.
                    </p>
                  </div>
                </div>
              )}

              <StatStrip>
                <Stat
                  label="Clientes fantasma"
                  value={m.ghostClients.length}
                  hint="sem contato real em 30+ dias"
                  tone={m.ghostClients.length > 0 ? 'warning' : 'success'}
                />
                <Stat
                  label="Reagendados sem contato"
                  value={m.reschedNoContact.length}
                  hint="atualizados sem contato real (7d)"
                  tone={m.reschedNoContact.length > 0 ? 'warning' : 'success'}
                />
              </StatStrip>

              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Qualidade das anotações</h3>
                  <span className={`text-sm font-medium tabular-nums ${m.avgNoteLen < 20 ? 'text-red-700' : m.avgNoteLen < 60 ? 'text-amber-700' : 'text-green-700'}`}>
                    {m.avgNoteLen} caracteres por nota
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${m.avgNoteLen < 20 ? 'bg-red-500' : m.avgNoteLen < 60 ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(100, Math.round((m.avgNoteLen / 150) * 100))}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {m.avgNoteLen < 20 ? 'Muito curtas — sem detalhe de contato' : m.avgNoteLen < 60 ? 'Razoável — pode melhorar' : 'Bom nível de detalhamento'}
                </p>
              </section>

              {m.ghostClients.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">
                    Clientes fantasma <span className="font-normal text-slate-500">(primeiros 10)</span>
                  </h3>
                  <ul className="max-h-48 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
                    {m.ghostClients.slice(0, 10).map(t => {
                      const lc = t.lastContactedAt ? new Date(t.lastContactedAt as string) : null;
                      const daysAgo = lc ? Math.floor((Date.now() - lc.getTime()) / 86400000) : null;
                      return (
                        <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="min-w-0 flex-1 truncate text-slate-900">{t.title}</span>
                          <span className="shrink-0 text-amber-700">
                            {lc ? `${daysAgo}d atrás` : 'nunca contatado'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {m.ghostClients.length > 10 && (
                    <p className="mt-1 text-center text-xs text-slate-500">+ {m.ghostClients.length - 10} outros clientes fantasma</p>
                  )}
                </section>
              )}

              {!m.hasBurst && m.ghostClients.length === 0 && m.reschedNoContact.length === 0 && m.avgNoteLen >= 60 && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
                  <CheckCircle2 size={16} aria-hidden />
                  Sem alertas de monitoramento. Padrão de atividade saudável.
                </div>
              )}
            </div>
          )}

          {/* ── COMPARAÇÃO ── */}
          {tab === 'comparacao' && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Ranking <span className="font-normal text-slate-500">(menor nº de vencidos primeiro)</span></h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-medium text-slate-500">
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="px-3 py-2 text-left font-medium">Atendente</th>
                      <th className="px-3 py-2 text-right font-medium">Clientes</th>
                      <th className="px-3 py-2 text-right font-medium">C/ lembrete</th>
                      <th className="px-3 py-2 text-right font-medium">Vencidos</th>
                      <th className="px-3 py-2 text-right font-medium">% venc.</th>
                      <th className="px-3 py-2 text-right font-medium">Sem nota</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {m.teamStats.map((s, i) => {
                      const isMine = s.name === seller.name;
                      const pct = s.total > 0 ? Math.round((s.overdue / s.total) * 100) : 0;
                      return (
                        <tr key={s.name} className={isMine ? 'bg-brand-50' : ''}>
                          <td className="px-3 py-2 tabular-nums text-slate-500">{i + 1}</td>
                          <td className={`px-3 py-2 ${isMine ? 'font-semibold text-brand-800' : 'text-slate-900'}`}>{s.name}{isMine && ' (este atendente)'}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.total}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.withReminder}</td>
                          <td className={`px-3 py-2 text-right tabular-nums font-medium ${s.overdue > 0 ? 'text-red-700' : 'text-green-700'}`}>{s.overdue}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${pct === 0 ? 'text-green-700' : pct < 20 ? 'text-amber-700' : 'text-red-700'}`}>{pct}%</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.noNotes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
    {confirmDialog}
    </>
  );
}
