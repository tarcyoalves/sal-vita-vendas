import { useState, useMemo } from 'react';
import { X, AlertCircle, CheckCircle2, Calendar, Clock, TrendingUp, BarChart2, Users, RefreshCw } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { trpc } from '../lib/trpc';

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

type Tab = 'resumo' | 'agenda' | 'historico' | 'comparacao';

export default function AttendantDetailModal({ seller, allTasks, allSellers, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('resumo');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleResult, setRescheduleResult] = useState<string | null>(null);
  const bulkReschedule = trpc.ai.bulkReschedule.useMutation();

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
    };
  }, [allTasks, allSellers, seller]);

  const handleReschedule = async () => {
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

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'resumo',    label: 'Resumo',    icon: <BarChart2 size={14} /> },
    { key: 'agenda',    label: 'Agenda',    icon: <Clock size={14} /> },
    { key: 'historico', label: 'Histórico', icon: <Calendar size={14} /> },
    { key: 'comparacao',label: 'Comparação',icon: <Users size={14} /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-800 rounded-t-2xl gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold flex-shrink-0 text-sm">
              {seller.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white text-sm truncate">{seller.name}</p>
              <p className="text-xs text-slate-400 truncate">{m.total} clientes</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {m.overdue.length > 0 && (
              <Button
                size="sm"
                disabled={rescheduleLoading}
                onClick={handleReschedule}
                className="bg-orange-500 hover:bg-orange-600 text-white text-xs gap-1 px-2"
              >
                {rescheduleLoading
                  ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full inline-block" />
                  : <RefreshCw size={13} />}
                <span className="hidden sm:inline">
                  {rescheduleLoading ? 'Reagendando...' : 'Reagendar Vencidos'}
                </span>
              </Button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 flex-shrink-0"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {rescheduleResult && (
          <div className={`px-5 py-2.5 text-sm border-b ${rescheduleResult.startsWith('Erro') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
            {rescheduleResult}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 px-3 pt-2 pb-0 border-b bg-gray-50 overflow-x-auto scrollbar-none">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1 px-2.5 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${tab === t.key ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── RESUMO ── */}
          {tab === 'resumo' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Total Clientes', value: m.total, color: 'text-slate-700', border: 'border-slate-200' },
                  { label: 'Com Lembrete', value: m.withReminder.length, color: 'text-blue-600', border: 'border-blue-200' },
                  { label: 'Vencidos', value: m.overdue.length, color: m.overdue.length > 0 ? 'text-red-600' : 'text-gray-400', border: m.overdue.length > 0 ? 'border-red-200' : 'border-gray-200' },
                  { label: 'Reagendados Hoje', value: m.rescheduledToday.length, color: 'text-green-600', border: 'border-green-200' },
                ].map(k => (
                  <Card key={k.label} className={`border ${k.border}`}>
                    <CardContent className="pt-4 pb-3">
                      <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{k.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Sem anotação', value: m.noNotes.length, total: m.total, warn: true },
                  { label: 'Desativados', value: m.disabledReminders.length, total: m.total, warn: true },
                  { label: 'Nunca atualizados', value: m.neverUpdated.length, total: m.total, warn: true },
                  { label: 'Ativos esta semana', value: m.upcoming.length, total: m.withReminder.length, warn: false },
                ].map(k => (
                  <div key={k.label} className="p-3 bg-gray-50 rounded-xl border">
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs text-gray-500">{k.label}</span>
                      <span className={`text-xs font-bold ${k.warn && k.value > 0 ? 'text-orange-600' : 'text-gray-600'}`}>{k.value}/{k.total}</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${k.warn ? 'bg-orange-400' : 'bg-blue-400'}`}
                        style={{ width: k.total > 0 ? `${Math.round((k.value / k.total) * 100)}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {m.overdue.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-600 mb-2">Lembretes vencidos (primeiros 8)</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {m.overdue.slice(0, 8).map(t => (
                      <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs">
                        <span className="truncate flex-1 mr-3 text-red-800">{t.title}</span>
                        <span className="flex-shrink-0 text-red-500">
                          {(() => { try { return fmtDate(new Date(t.reminderDate as string)); } catch { return '—'; } })()}
                        </span>
                      </div>
                    ))}
                  </div>
                  {m.overdue.length > 8 && <p className="text-xs text-gray-400 mt-1 text-center">+ {m.overdue.length - 8} outros vencidos</p>}
                </div>
              )}

              {m.overdue.length === 0 && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  <CheckCircle2 size={16} />
                  Sem lembretes vencidos — atendente em dia!
                </div>
              )}
            </div>
          )}

          {/* ── AGENDA ── */}
          {tab === 'agenda' && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Hoje</p>
                {m.todayTasks.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Nenhum lembrete para hoje.</p>
                ) : (
                  <div className="space-y-1.5">
                    {[...m.todayTasks]
                      .sort((a, b) => new Date(a.reminderDate as string).getTime() - new Date(b.reminderDate as string).getTime())
                      .map(t => {
                        const d = new Date(t.reminderDate as string);
                        const overdue = d < new Date();
                        return (
                          <div key={t.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${overdue ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-100'}`}>
                            <span className={`truncate flex-1 mr-3 ${overdue ? 'text-red-700 font-medium' : 'text-gray-700'}`}>{t.title}</span>
                            <span className={`flex-shrink-0 text-xs font-semibold ${overdue ? 'text-red-500' : 'text-blue-600'}`}>{fmtTime(d)}</span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Próximos 7 dias</p>
                {m.upcoming.length === 0 ? (
                  <p className="text-sm text-gray-400 py-4 text-center">Nenhum lembrete agendado esta semana.</p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {[...m.upcoming]
                      .sort((a, b) => new Date(a.reminderDate as string).getTime() - new Date(b.reminderDate as string).getTime())
                      .slice(0, 20)
                      .map(t => {
                        const d = new Date(t.reminderDate as string);
                        return (
                          <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border text-sm">
                            <span className="truncate flex-1 mr-3 text-gray-700">{t.title}</span>
                            <span className="flex-shrink-0 text-xs text-gray-500">{fmtDate(d)} {fmtTime(d)}</span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── HISTÓRICO ── */}
          {tab === 'historico' && (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Lembretes por dia — últimos 30 dias</p>
              <div className="grid grid-cols-10 gap-1">
                {m.days30.map((day, i) => {
                  const isToday = day.key === todayKey();
                  const pct = day.count / m.maxDay;
                  const bg = day.count === 0 ? 'bg-gray-100'
                    : pct < 0.3 ? 'bg-blue-200'
                    : pct < 0.6 ? 'bg-blue-400'
                    : 'bg-blue-600';
                  return (
                    <div key={i} title={`${fmtDate(day.d)}: ${day.count} lembretes`} className="flex flex-col items-center gap-0.5">
                      <div className={`w-full aspect-square rounded-sm ${bg} ${isToday ? 'ring-2 ring-blue-400' : ''}`} />
                      {i % 5 === 0 && <span className="text-[9px] text-gray-400">{fmtDate(day.d)}</span>}
                    </div>
                  );
                })}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Semanas recentes</p>
                {Array.from({ length: 4 }, (_, w) => {
                  const weekDays = m.days30.slice(m.days30.length - 30 + w * 7, m.days30.length - 30 + (w + 1) * 7);
                  const total = weekDays.reduce((s, d) => s + d.count, 0);
                  const label = w === 3 ? 'Esta semana' : w === 2 ? 'Semana passada' : `Há ${4 - w} semanas`;
                  return (
                    <div key={w} className="flex items-center justify-between py-2 border-b last:border-0">
                      <span className="text-sm text-gray-600">{label}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: m.maxDay > 0 ? `${Math.min(100, Math.round((total / (m.maxDay * 7)) * 100))}%` : '0%' }} />
                        </div>
                        <span className="text-sm font-semibold text-gray-700 w-8 text-right">{total}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── COMPARAÇÃO ── */}
          {tab === 'comparacao' && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ranking — menor nº de vencidos</p>
              {m.teamStats.map((s, i) => {
                const isMine = s.name === seller.name;
                const pct = s.total > 0 ? Math.round((s.overdue / s.total) * 100) : 0;
                return (
                  <div key={s.name} className={`p-3 rounded-xl border ${isMine ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold w-5 ${i === 0 ? 'text-green-600' : 'text-gray-400'}`}>#{i + 1}</span>
                      <span className={`text-sm font-semibold flex-1 ${isMine ? 'text-blue-800' : 'text-gray-700'}`}>{s.name} {isMine && '← você'}</span>
                      <span className={`text-xs font-bold ${s.overdue > 0 ? 'text-red-600' : 'text-green-600'}`}>{s.overdue} vencidos</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      {[
                        { l: 'Clientes', v: s.total },
                        { l: 'C/ lembrete', v: s.withReminder },
                        { l: 'Vencidos', v: s.overdue },
                        { l: 'Sem nota', v: s.noNotes },
                      ].map(k => (
                        <div key={k.l}>
                          <p className="text-xs text-gray-500">{k.l}</p>
                          <p className="text-sm font-bold text-gray-700">{k.v}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct === 0 ? 'bg-green-400' : pct < 20 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 text-right">{pct}% vencidos</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
