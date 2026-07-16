import { trpc } from '../lib/trpc';
import { useAuth } from '../_core/hooks/useAuth';
import { useMemo, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Phone, Clock, Zap, TrendingUp, AlertCircle, Trophy, DollarSign, Flame, Target, PartyPopper } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import AttendantBilling from '../components/faturamento/AttendantBilling';
import { useFatStore } from '../lib/faturamento/store';
import { resumoAtendente, isoNoMes, formatBRL } from '../lib/faturamento/calc';

const MES_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Sellers created before dailyGoal was wired up still carry the old default of 10
// while the gamification has always targeted 100 — treat 10 as "not customized".
function effectiveDailyGoal(dailyGoal?: number | null): number {
  return dailyGoal && dailyGoal !== 10 ? dailyGoal : 100;
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtDate(d: Date) { return `${pad(d.getDate())}/${pad(d.getMonth()+1)}`; }
function dayKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function fmtMs(ms: number) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${pad(h)}:${pad(m)}`;
}

function ProgressRing({ pct, size = 96, stroke = 9, color }: { pct: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct / 100, 1) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  );
}

export default function AttendantProgress() {
  const { user } = useAuth();
  // No refetchInterval — mutations invalidate the cache; server is not polled
  const { data: tasks = [], isLoading } = trpc.tasks.list.useQuery();
  const { data: session } = trpc.workSessions.current.useQuery(undefined, { staleTime: 60_000 });
  const { data: sellerProfile } = trpc.sellers.myProfile.useQuery(undefined, { staleTime: 300_000 });
  // Mesma store já usada na aba Faturamento — reaproveitada aqui (sem query
  // nova) para cruzar contatos (esforço) com comissão (resultado) no tempo.
  const { pedidos: allPedidos, comissoes } = useFatStore();

  // Local clock tick — updates display every minute without any server call
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!session || session.status !== 'active') return;
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  // session inteiro como dependência: recria o interval se startedAt/pausedMs mudar
  }, [session]);

  const prevContactsRef = useRef<number>(-1);

  const m = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(todayStart.getTime() - 6 * 86400000);

    const contactsToday = (tasks as any[]).filter(t =>
      t.lastContactedAt && new Date(t.lastContactedAt) >= todayStart
    );

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayStart.getTime() - (6 - i) * 86400000);
      const count = (tasks as any[]).filter(t =>
        t.lastContactedAt && dayKey(new Date(t.lastContactedAt)) === dayKey(d)
      ).length;
      return { date: d, count, label: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()] };
    });
    const maxBar = Math.max(1, ...weekDays.map(d => d.count));

    let workedMs = 0;
    if (session) {
      const start = new Date(session.startedAt).getTime();
      const end   = session.endedAt ? new Date(session.endedAt).getTime() : now.getTime();
      const paused = session.totalPausedMs ?? 0;
      const extraPause = (session.status === 'paused' && session.pausedAt)
        ? now.getTime() - new Date(session.pausedAt).getTime() : 0;
      workedMs = Math.max(0, end - start - paused - extraPause);
    }
    const goalMs  = (sellerProfile?.workHoursGoal ?? 8) * 3600000;
    const hoursWorked = workedMs / 3600000;
    const hoursPct = Math.min(Math.round((workedMs / goalMs) * 100), 100);
    const dailyGoal = effectiveDailyGoal(sellerProfile?.dailyGoal);
    const contactsPct = Math.min(Math.round((contactsToday.length / dailyGoal) * 100), 100);
    const productivity = hoursWorked > 0.1 ? (contactsToday.length / hoursWorked).toFixed(1) : '--';

    const overdueToday = (tasks as any[]).filter(t =>
      t.reminderDate && t.reminderEnabled !== false && new Date(t.reminderDate) < now &&
      new Date(t.reminderDate) >= todayStart
    ).length;

    const weekContacts = (tasks as any[]).filter(t =>
      t.lastContactedAt && new Date(t.lastContactedAt) >= weekStart
    ).length;

    // 🎉 Minhas conversões (clientes ativos)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const convertedTasks = (tasks as any[]).filter(t => !!t.convertedAt);
    const convertedCount = convertedTasks.length;
    const conversionRate = (tasks as any[]).length > 0
      ? Math.round((convertedCount / (tasks as any[]).length) * 100) : 0;
    const convertedThisMonth = convertedTasks.filter(t => {
      try { return new Date(t.convertedAt) >= thirtyDaysAgo; } catch { return false; }
    }).length;

    return {
      contactsToday: contactsToday.length,
      contactsPct,
      dailyGoal,
      hoursPct,
      hoursWorked: fmtMs(workedMs),
      hoursGoal: fmtMs(goalMs),
      productivity,
      overdueToday,
      weekContacts,
      convertedCount,
      conversionRate,
      convertedThisMonth,
      weekDays,
      maxBar,
      sessionStatus: session?.status ?? null,
    };
  }, [tasks, session, sellerProfile, tick]);

  // 📈 Evolução: contatos (esforço) x comissão prevista (resultado), mês a mês.
  // O objetivo é tornar visível, com números do próprio atendente, que fazer
  // mais tarefas/contatos se traduz em mais vendas e mais comissão no fim do
  // mês — sem depender de dados de outros atendentes (só o que já é seu).
  const evolucao = useMemo(() => {
    if (!sellerProfile) return null;
    const comissaoPct = comissoes[sellerProfile.id] ?? 0;
    const now = new Date();
    const pontos = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const filtroMes = { ano: d.getFullYear(), mes: d.getMonth() };
      const contatos = (tasks as any[]).filter(t => isoNoMes(t.lastContactedAt, filtroMes)).length;
      const resumo = resumoAtendente(allPedidos, sellerProfile.id, sellerProfile.name, comissaoPct, filtroMes);
      return {
        label: `${MES_ABBR[filtroMes.mes]}/${String(filtroMes.ano).slice(2)}`,
        contatos,
        comissao: resumo.comissaoPrevista,
        pedidos: resumo.qtdPedidos,
      };
    });
    const totalContatos = pontos.reduce((s, p) => s + p.contatos, 0);
    const totalComissao = pontos.reduce((s, p) => s + p.comissao, 0);
    const valorPorContato = totalContatos > 0 ? totalComissao / totalContatos : 0;
    const melhorMes = pontos.reduce<typeof pontos[number] | null>(
      (best, p) => (p.comissao > (best?.comissao ?? -1) ? p : best), null,
    );
    return { pontos, valorPorContato, melhorMes, temDados: totalContatos > 0 || totalComissao > 0 };
  }, [tasks, allPedidos, comissoes, sellerProfile]);

  useEffect(() => {
    const prev = prevContactsRef.current;
    const cur  = m.contactsToday;
    if (prev < 0) { prevContactsRef.current = cur; return; }
    const goal = m.dailyGoal;
    const q1 = Math.round(goal * 0.25), half = Math.round(goal * 0.5), q3 = Math.round(goal * 0.75);
    if (prev < q1   && cur >= q1)   toast.success(`${q1} contatos! Ótimo começo!`);
    if (prev < half && cur >= half) toast.success(`${half} contatos! Você está na metade da meta!`);
    if (prev < q3   && cur >= q3)   toast.success(`${q3} contatos! Falta só ${goal - q3} pra fechar!`);
    if (prev < goal && cur >= goal) toast.success(`META BATIDA! ${goal} contatos hoje!`, { duration: 6000 });
    prevContactsRef.current = cur;
  }, [m.contactsToday, m.dailyGoal]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  const contactColor = m.contactsPct >= 100 ? '#16a34a' : m.contactsPct >= 60 ? '#2563eb' : m.contactsPct >= 30 ? '#d97706' : '#dc2626';
  const hoursColor   = m.hoursPct   >= 100 ? '#16a34a' : m.hoursPct   >= 60 ? '#2563eb' : '#94a3b8';

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <Tabs defaultValue="progresso">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="progresso" className="flex-1">Progresso</TabsTrigger>
          <TabsTrigger value="faturamento" className="flex-1">Faturamento</TabsTrigger>
        </TabsList>

        <TabsContent value="progresso">
          <div className="space-y-4">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">{user?.name}</h1>
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${m.sessionStatus === 'active' ? 'bg-green-500 animate-pulse' : m.sessionStatus === 'paused' ? 'bg-yellow-400' : 'bg-gray-300'}`} />
            {m.sessionStatus === 'active' ? 'Trabalhando agora'
             : m.sessionStatus === 'paused' ? 'Sessão pausada'
             : 'Sem sessão ativa'}
          </p>
        </div>
        {m.contactsToday >= m.dailyGoal && (
          <div className="flex items-center gap-1.5 bg-green-100 text-green-700 px-3 py-1.5 rounded-full text-sm font-bold">
            <Trophy size={15} /> META BATIDA!
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contatos hoje</p>
          <div className="relative">
            <ProgressRing pct={m.contactsPct} size={100} stroke={9} color={contactColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black" style={{ color: contactColor }}>{m.contactsToday}</span>
              <span className="text-[10px] text-gray-400 font-medium">/ {m.dailyGoal}</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold" style={{ color: contactColor }}>{m.contactsPct}%</p>
            <p className="text-xs text-gray-400">{m.dailyGoal - m.contactsToday > 0 ? `faltam ${m.dailyGoal - m.contactsToday}` : 'completo'}</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Horas trabalhadas</p>
          <div className="relative">
            <ProgressRing pct={m.hoursPct} size={100} stroke={9} color={hoursColor} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-black" style={{ color: hoursColor }}>{m.hoursWorked}</span>
              <span className="text-[10px] text-gray-400 font-medium">/ {m.hoursGoal}</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold" style={{ color: hoursColor }}>{m.hoursPct}%</p>
            <p className="text-xs text-gray-400">da meta de horas</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-indigo-50 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1 text-indigo-600"><Phone size={14} /><span className="text-[10px] font-semibold text-gray-500">Semana</span></div>
          <p className="text-xl font-black text-indigo-600">{m.weekContacts}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1 text-amber-600"><Zap size={14} /><span className="text-[10px] font-semibold text-gray-500">Contatos/h</span></div>
          <p className="text-xl font-black text-amber-600">{m.productivity}</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1 text-slate-600"><Clock size={14} /><span className="text-[10px] font-semibold text-gray-500">Trabalhado</span></div>
          <p className="text-xl font-black text-slate-600">{m.hoursWorked}</p>
        </div>
      </div>

      {m.convertedCount > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <PartyPopper size={16} className="text-green-600" />
            <p className="text-sm font-semibold text-green-800">Minhas conversões (clientes ativos)</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-xl font-black text-green-700">{m.convertedCount}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Total convertidos</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-green-700">{m.conversionRate}%</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Taxa de conversão</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-green-700">{m.convertedThisMonth}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">Últimos 30 dias</p>
            </div>
          </div>
          <p className="text-[11px] text-green-600 mt-2 text-center">Continue mantendo contato — cada conversa aproxima de uma nova venda!</p>
        </div>
      )}

      {m.overdueToday > 0 && (
        <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">{m.overdueToday} lembrete{m.overdueToday > 1 ? 's' : ''} em atraso hoje</p>
            <p className="text-xs text-red-500 mt-0.5">Entre em contato com os clientes o quanto antes.</p>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-blue-500" />
          <p className="text-sm font-semibold text-gray-700">Contatos — últimos 7 dias</p>
        </div>
        <div className="flex items-end gap-1.5 h-24">
          {m.weekDays.map((day, i) => {
            const isToday = i === 6;
            const pct = m.maxBar > 0 ? (day.count / m.maxBar) * 100 : 0;
            const barColor = isToday ? (day.count >= m.dailyGoal ? '#16a34a' : '#2563eb') : '#93c5fd';
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                {day.count > 0 && (
                  <span className={`text-[10px] font-bold ${isToday ? 'text-blue-700' : 'text-gray-400'}`}>{day.count}</span>
                )}
                <div className="w-full rounded-t-md transition-all duration-500" style={{
                  height: `${Math.max(pct, day.count > 0 ? 8 : 2)}%`,
                  backgroundColor: barColor,
                  opacity: isToday ? 1 : 0.6,
                }} />
                <span className={`text-[9px] ${isToday ? 'font-bold text-blue-700' : 'text-gray-400'}`}>
                  {isToday ? 'hoje' : day.label}
                </span>
                <span className="text-[8px] text-gray-300">{fmtDate(day.date)}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span className="text-xs text-gray-500">Meta diária: <strong>{m.dailyGoal} contatos</strong></span>
        </div>
      </div>

      {evolucao?.temDados && (
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign size={15} className="text-emerald-500" />
            <p className="text-sm font-semibold text-gray-700">Seu impacto: tarefas geram vendas</p>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">Contatos feitos (barras) x comissão prevista (linha) — últimos 6 meses</p>

          <div className="h-44 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={evolucao.pontos} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="contatos" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={26} allowDecimals={false} />
                <YAxis yAxisId="comissao" orientation="right" hide domain={[0, (max: number) => max * 1.15 || 1]} />
                <Tooltip
                  formatter={(value: number, name: string) =>
                    name === 'Comissão prevista' ? [formatBRL(value), name] : [value, name]
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                />
                <Bar yAxisId="contatos" dataKey="contatos" name="Contatos" fill="#a5b4fc" radius={[4, 4, 0, 0]} barSize={20} />
                <Line yAxisId="comissao" dataKey="comissao" name="Comissão prevista" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: '#059669' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
              <p className="text-lg font-black text-emerald-700">{formatBRL(evolucao.valorPorContato)}</p>
              <p className="text-[10px] text-gray-500">em comissão por contato feito</p>
            </div>
            <div className="bg-indigo-50 rounded-xl p-2.5 text-center">
              <p className="text-lg font-black text-indigo-700">{evolucao.melhorMes?.label ?? '--'}</p>
              <p className="text-[10px] text-gray-500">seu melhor mês ({formatBRL(evolucao.melhorMes?.comissao ?? 0)})</p>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 mt-3 text-center">
            Quanto mais tarefas você trabalha, mais contatos vira orçamento — e mais orçamento vira comissão no fim do mês.
          </p>
        </div>
      )}

      <div className={`rounded-2xl p-4 text-center ${m.contactsToday >= m.dailyGoal ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-100'}`}>
        {m.contactsToday >= m.dailyGoal ? (
          <>
            <div className="flex justify-center mb-1"><Trophy size={32} className="text-green-600" /></div>
            <p className="font-bold text-green-700">Parabéns! Meta de {m.dailyGoal} contatos atingida!</p>
            <p className="text-xs text-green-600 mt-0.5">Excelente trabalho hoje, {user?.name?.split(' ')[0]}!</p>
          </>
        ) : m.contactsToday >= Math.round(m.dailyGoal * 0.75) ? (
          <>
            <div className="flex justify-center mb-1"><Zap size={32} className="text-blue-600" /></div>
            <p className="font-bold text-blue-700">Quase lá! Só faltam {m.dailyGoal - m.contactsToday} contatos!</p>
          </>
        ) : m.contactsToday >= Math.round(m.dailyGoal * 0.5) ? (
          <>
            <div className="flex justify-center mb-1"><Flame size={32} className="text-orange-500" /></div>
            <p className="font-bold text-blue-700">Na metade! {m.dailyGoal - m.contactsToday} contatos pra fechar.</p>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-1"><Target size={32} className="text-blue-600" /></div>
            <p className="font-bold text-blue-700">Meta de hoje: {m.dailyGoal} contatos</p>
            <p className="text-xs text-blue-500 mt-0.5">Cada anotação salva conta como um contato!</p>
          </>
        )}
      </div>

          </div>
        </TabsContent>

        <TabsContent value="faturamento">
          <AttendantBilling />
        </TabsContent>
      </Tabs>
    </div>
  );
}
