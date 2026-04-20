import { trpc } from '../lib/trpc';
import { useAuth } from '../_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useMemo } from 'react';

interface Task {
  id: number;
  title: string;
  reminderDate?: Date | null;
  reminderEnabled?: boolean | null;
  assignedTo?: string | null;
  userId: number;
  createdAt: Date;
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) { return `${pad(d.getDate())}/${pad(d.getMonth()+1)}`; }
function fmtTime(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function dayKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

export default function AttendantProgress() {
  const { user } = useAuth();
  const { data: tasks = [], isLoading } = trpc.tasks.list.useQuery();

  const metrics = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 6 * 86400000);
    const monthStart = new Date(todayStart.getTime() - 29 * 86400000);

    const all = tasks as Task[];

    // Tasks with active reminders
    const withReminder = all.filter(t => t.reminderDate && t.reminderEnabled !== false);

    const todayTasks = withReminder.filter(t => {
      const d = new Date(t.reminderDate!);
      return d >= todayStart && d < new Date(todayStart.getTime() + 86400000);
    });

    const weekTasks = withReminder.filter(t => {
      const d = new Date(t.reminderDate!);
      return d >= weekStart && d < new Date(todayStart.getTime() + 86400000);
    });

    const monthTasks = withReminder.filter(t => {
      const d = new Date(t.reminderDate!);
      return d >= monthStart && d < new Date(todayStart.getTime() + 86400000);
    });

    const overdueToday = todayTasks.filter(t => new Date(t.reminderDate!) < now);
    const upcomingToday = todayTasks.filter(t => new Date(t.reminderDate!) >= now);

    // Streak: consecutive days (including today) that had at least 1 scheduled reminder
    const dayMap = new Set<string>();
    withReminder.forEach(t => {
      const d = new Date(t.reminderDate!);
      dayMap.add(dayKey(d));
    });

    let streak = 0;
    for (let i = 0; i <= 30; i++) {
      const d = new Date(todayStart.getTime() - i * 86400000);
      if (dayMap.has(dayKey(d))) {
        streak++;
      } else if (i > 0) { // allow today to be empty and still keep streak from yesterday
        break;
      }
    }

    // Weekly heatmap: last 7 days
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayStart.getTime() - (6 - i) * 86400000);
      const count = withReminder.filter(t => {
        const td = new Date(t.reminderDate!);
        return dayKey(td) === dayKey(d);
      }).length;
      return { date: d, count, label: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()] };
    });

    // Score: simple engagement score (0-100)
    const maxPerDay = Math.max(1, Math.ceil(withReminder.length / 7));
    const score = Math.min(100, Math.round(
      (streak * 10) + (monthTasks.length * 2) + (weekTasks.length * 3)
    ));

    // Badge based on score
    let badge = { label: '🌱 Iniciante', color: 'text-gray-600', bg: 'bg-gray-100' };
    if (score >= 80) badge = { label: '🏆 Campeão', color: 'text-yellow-700', bg: 'bg-yellow-100' };
    else if (score >= 50) badge = { label: '⭐ Destaque', color: 'text-blue-700', bg: 'bg-blue-100' };
    else if (score >= 25) badge = { label: '📈 Em Progresso', color: 'text-green-700', bg: 'bg-green-100' };

    return { todayTasks, weekTasks, monthTasks, overdueToday, upcomingToday, streak, weekDays, score, badge, maxPerDay, total: withReminder.length };
  }, [tasks]);

  if (isLoading) return <div className="p-6 text-center text-gray-500">Carregando...</div>;

  const m = metrics;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-500 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-blue-200 text-sm">Olá,</p>
            <h2 className="text-2xl font-bold">{user?.name?.split(' ')[0]} 👋</h2>
            <div className={`mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${m.badge.bg} ${m.badge.color}`}>
              {m.badge.label}
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-black">{m.score}</div>
            <div className="text-blue-200 text-xs">pontos</div>
          </div>
        </div>
      </div>

      {/* Streak */}
      <Card className={m.streak >= 3 ? 'border-orange-300 bg-orange-50' : ''}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Sequência atual</p>
              <p className="text-3xl font-black text-orange-500">🔥 {m.streak} {m.streak === 1 ? 'dia' : 'dias'}</p>
              <p className="text-xs text-gray-400 mt-1">
                {m.streak === 0 ? 'Adicione lembretes para iniciar sua sequência!' :
                 m.streak < 3 ? 'Continue assim! 3 dias = 🌱 ' :
                 m.streak < 7 ? 'Ótimo ritmo! 7 dias = ⭐' :
                 'Incrível! Você está em chamas! 🔥'}
              </p>
            </div>
            <div className="text-6xl">{m.streak >= 7 ? '🏆' : m.streak >= 3 ? '⭐' : '🌱'}</div>
          </div>
        </CardContent>
      </Card>

      {/* 3 Period Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Hoje</p>
            <p className="text-3xl font-black text-blue-600">{m.todayTasks.length}</p>
            {m.overdueToday.length > 0 && (
              <p className="text-xs text-red-500 mt-1">⚠️ {m.overdueToday.length} atrasado{m.overdueToday.length > 1 ? 's' : ''}</p>
            )}
            {m.overdueToday.length === 0 && m.upcomingToday.length > 0 && (
              <p className="text-xs text-green-600 mt-1">✅ Em dia</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Semana</p>
            <p className="text-3xl font-black text-purple-600">{m.weekTasks.length}</p>
            <p className="text-xs text-gray-400 mt-1">últimos 7 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <p className="text-xs text-gray-500 mb-1">Mês</p>
            <p className="text-3xl font-black text-green-600">{m.monthTasks.length}</p>
            <p className="text-xs text-gray-400 mt-1">últimos 30 dias</p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Atividade — últimos 7 dias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5">
            {m.weekDays.map((day, i) => {
              const isToday = i === 6;
              const intensity = day.count === 0 ? 0 : Math.min(4, Math.ceil((day.count / Math.max(1, m.maxPerDay)) * 4));
              const colors = ['bg-gray-100', 'bg-blue-200', 'bg-blue-400', 'bg-blue-600', 'bg-blue-800'];
              return (
                <div key={i} className="text-center">
                  <p className={`text-xs mb-1 ${isToday ? 'font-bold text-blue-700' : 'text-gray-400'}`}>{day.label}</p>
                  <div className={`w-full aspect-square rounded-md ${colors[intensity]} ${isToday ? 'ring-2 ring-blue-500' : ''} flex items-center justify-center`}>
                    {day.count > 0 && <span className="text-xs font-bold text-white drop-shadow">{day.count}</span>}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{fmtDate(day.date)}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Today's reminders list */}
      {m.todayTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">📅 Lembretes de Hoje</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {m.todayTasks
              .sort((a, b) => new Date(a.reminderDate!).getTime() - new Date(b.reminderDate!).getTime())
              .map(t => {
                const d = new Date(t.reminderDate!);
                const isOverdue = d < new Date();
                return (
                  <div key={t.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${isOverdue ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'}`}>
                    <p className="text-sm font-medium truncate flex-1 mr-2">{t.title}</p>
                    <span className={`text-xs font-semibold flex-shrink-0 ${isOverdue ? 'text-red-600' : 'text-blue-700'}`}>
                      {isOverdue ? '🚨' : '🔔'} {fmtTime(d)}
                    </span>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      {/* Score explanation */}
      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="pt-4 text-xs text-gray-500 space-y-1">
          <p className="font-semibold text-gray-700 mb-2">Como é calculada sua pontuação?</p>
          <p>🔥 Sequência: +10 pts por dia consecutivo</p>
          <p>📅 Lembretes no mês: +2 pts cada</p>
          <p>📆 Lembretes na semana: +3 pts cada</p>
          <p>🌱 Iniciante &lt;25 | 📈 Em Progresso 25+ | ⭐ Destaque 50+ | 🏆 Campeão 80+</p>
        </CardContent>
      </Card>

    </div>
  );
}
