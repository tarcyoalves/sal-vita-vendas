import { trpc } from '../lib/trpc';
import { useAuth } from '../_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useMemo } from 'react';
import { Calendar, Clock, TrendingUp, AlertCircle } from 'lucide-react';

interface Task {
  id: number;
  title: string;
  reminderDate?: Date | null;
  reminderEnabled?: boolean | null;
  assignedTo?: string | null;
  userId: number;
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) { return `${pad(d.getDate())}/${pad(d.getMonth()+1)}`; }
function fmtTime(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function dayKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

export default function AttendantProgress() {
  const { user } = useAuth();
  const { data: tasks = [], isLoading } = trpc.tasks.list.useQuery();

  const m = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(todayStart.getTime() - 6  * 86400000);
    const monthStart = new Date(todayStart.getTime() - 29 * 86400000);

    const active = (tasks as Task[]).filter(t => t.reminderDate && t.reminderEnabled !== false);

    const inRange = (d: Date, from: Date, days: number) =>
      d >= from && d < new Date(todayStart.getTime() + days * 86400000);

    const todayTasks  = active.filter(t => inRange(new Date(t.reminderDate!), todayStart, 1));
    const weekTasks   = active.filter(t => inRange(new Date(t.reminderDate!), weekStart,  7));
    const monthTasks  = active.filter(t => inRange(new Date(t.reminderDate!), monthStart, 30));

    const overdueToday   = todayTasks.filter(t => new Date(t.reminderDate!) < now);
    const upcomingToday  = todayTasks.filter(t => new Date(t.reminderDate!) >= now);

    // Weekly heatmap
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayStart.getTime() - (6 - i) * 86400000);
      const count = active.filter(t => dayKey(new Date(t.reminderDate!)) === dayKey(d)).length;
      return { date: d, count, label: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()] };
    });

    const maxCount = Math.max(1, ...weekDays.map(d => d.count));

    return { todayTasks, weekTasks, monthTasks, overdueToday, upcomingToday, weekDays, maxCount, total: active.length };
  }, [tasks]);

  if (isLoading) return <div className="p-6 text-center text-gray-400">Carregando...</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-gray-800">{user?.name}</h1>
        <p className="text-sm text-gray-500">Acompanhamento de lembretes</p>
      </div>

      {/* Period KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Hoje',   value: m.todayTasks.length,  icon: <Clock size={16} />,       color: 'text-blue-600',  border: 'border-blue-200' },
          { label: 'Semana', value: m.weekTasks.length,   icon: <Calendar size={16} />,    color: 'text-indigo-600',border: 'border-indigo-200' },
          { label: 'Mês',    value: m.monthTasks.length,  icon: <TrendingUp size={16} />,  color: 'text-slate-700', border: 'border-slate-200' },
        ].map(k => (
          <Card key={k.label} className={`border ${k.border}`}>
            <CardContent className="pt-4 pb-3">
              <div className={`flex items-center gap-1.5 mb-2 ${k.color}`}>
                {k.icon}
                <span className="text-xs font-medium text-gray-500">{k.label}</span>
              </div>
              <p className={`text-3xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">lembretes</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Overdue alert */}
      {m.overdueToday.length > 0 && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">
              {m.overdueToday.length} lembrete{m.overdueToday.length > 1 ? 's' : ''} em atraso hoje
            </p>
            <p className="text-xs text-red-500 mt-0.5">Entre em contato com os clientes o quanto antes.</p>
          </div>
        </div>
      )}

      {/* Weekly heatmap */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-gray-600">Lembretes — últimos 7 dias</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="grid grid-cols-7 gap-2">
            {m.weekDays.map((day, i) => {
              const isToday = i === 6;
              const pct = day.count / m.maxCount;
              const bg = day.count === 0
                ? 'bg-gray-100'
                : pct < 0.4 ? 'bg-blue-200'
                : pct < 0.7 ? 'bg-blue-400'
                : 'bg-blue-600';
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className={`text-xs ${isToday ? 'font-bold text-blue-700' : 'text-gray-400'}`}>{day.label}</span>
                  <div className={`w-full aspect-square rounded-md ${bg} ${isToday ? 'ring-2 ring-blue-400 ring-offset-1' : ''} flex items-center justify-center`}>
                    {day.count > 0 && (
                      <span className="text-xs font-semibold text-white">{day.count}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{fmtDate(day.date)}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Today's reminders */}
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-semibold text-gray-600">Agenda de Hoje</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {m.todayTasks.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum lembrete agendado para hoje.</p>
          ) : (
            <div className="space-y-2">
              {[...m.todayTasks]
                .sort((a, b) => new Date(a.reminderDate!).getTime() - new Date(b.reminderDate!).getTime())
                .map(t => {
                  const d = new Date(t.reminderDate!);
                  const overdue = d < new Date();
                  return (
                    <div key={t.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm ${overdue ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                      <span className={`truncate flex-1 mr-3 ${overdue ? 'text-red-700 font-medium' : 'text-gray-700'}`}>{t.title}</span>
                      <span className={`flex-shrink-0 text-xs font-semibold ${overdue ? 'text-red-500' : 'text-blue-600'}`}>{fmtTime(d)}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
