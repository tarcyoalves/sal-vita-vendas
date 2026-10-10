import { trpc } from '../lib/trpc';
import { useAuth } from '../_core/hooks/useAuth';
import { useMemo, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { QueryError } from '../components/QueryError';
import { Page, PageHeader, Panel, PanelHeader, StatStrip, Stat } from '../components/layout/Page';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { safePercent } from '../lib/numbers';
// Módulos puros do servidor (sem banco): mesma conta de horas do servidor, sem duplicar a regra.
import { spMidnight } from '../../../server/lib/tz';
import { workedMsInDay } from '../../../server/lib/workHours';
import AttendantBilling from '../components/faturamento/AttendantBilling';
import { useFatStore } from '../lib/faturamento/store';
import { resumoAtendente, isoNoMes, formatBRL, parseDataLocal } from '../lib/faturamento/calc';

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

function GoalBar({ label, valueLabel, pct, color }: { label: string; valueLabel: string; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-slate-900">{label}</span>
        <span className="tabular-nums text-slate-700">{valueLabel} <span className="text-xs text-slate-500">· {pct}%</span></span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color, transition: 'width 0.4s ease-out' }} />
      </div>
    </div>
  );
}

export default function AttendantProgress() {
  const { user } = useAuth();
  // No refetchInterval — mutations invalidate the cache; server is not polled
  const { data: tasks = [], isLoading, isError, isFetching, refetch } = trpc.tasks.list.useQuery();
  const { data: session } = trpc.workSessions.current.useQuery(undefined, { staleTime: 60_000 });
  const { data: sellerProfile } = trpc.sellers.myProfile.useQuery(undefined, { staleTime: 300_000 });
  // Mesma store já usada na aba Faturamento — reaproveitada aqui (sem query
  // nova) para cruzar contatos (esforço) com prêmio (resultado) no tempo.
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

    const contactsToday = tasks.filter(t =>
      t.lastContactedAt && new Date(t.lastContactedAt) >= todayStart
    );

    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(todayStart.getTime() - (6 - i) * 86400000);
      const count = tasks.filter(t =>
        t.lastContactedAt && dayKey(new Date(t.lastContactedAt)) === dayKey(d)
      ).length;
      return { date: d, count, label: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][d.getDay()] };
    });
    const maxBar = Math.max(1, ...weekDays.map(d => d.count));

    let workedMs = 0;
    if (session) {
      // Só a parte desta sessão que cai em HOJE (SP), como o servidor (workedMsInDay): uma
      // sessão que atravessou a meia-noite não pode trazer as horas de ontem para o dia.
      const dayStart = spMidnight(now);
      workedMs = workedMsInDay(session, now, dayStart, new Date(dayStart.getTime() + 86400000));
      // Horas de hoje = esta sessão (relógio ao vivo) + as outras sessões de hoje já
      // encerradas (encerrar e reiniciar não pode zerar as horas da manhã)
      workedMs += session.todayOtherMs ?? 0;
    }
    // workHoursGoal=0 (perfil sem meta) dividia por zero e a barra virava NaN%.
    const goalHours = sellerProfile?.workHoursGoal && sellerProfile.workHoursGoal > 0 ? sellerProfile.workHoursGoal : 8;
    const goalMs  = goalHours * 3600000;
    const hoursWorked = workedMs / 3600000;
    const hoursPct = safePercent(workedMs, goalMs);
    const dailyGoal = effectiveDailyGoal(sellerProfile?.dailyGoal);
    const contactsPct = safePercent(contactsToday.length, dailyGoal);
    const productivity = hoursWorked > 0.1 ? (contactsToday.length / hoursWorked).toFixed(1) : '--';

    const overdueToday = tasks.filter(t =>
      t.reminderDate && t.reminderEnabled !== false && new Date(t.reminderDate) < now &&
      new Date(t.reminderDate) >= todayStart
    ).length;

    const weekContacts = tasks.filter(t =>
      t.lastContactedAt && new Date(t.lastContactedAt) >= weekStart
    ).length;

    // Minhas conversões (clientes ativos)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
    const convertedTasks = tasks.filter(t => !!t.convertedAt);
    const convertedCount = convertedTasks.length;
    const conversionRate = tasks.length > 0
      ? Math.round((convertedCount / tasks.length) * 100) : 0;
    const convertedThisMonth = convertedTasks.filter(t => {
      // `convertedAt` chega como Date (ou null) — parseDataLocal cobre os dois
      // e evita o `new Date(null)`, que vira 1970 e contaria como convertido.
      const d = parseDataLocal(t.convertedAt);
      return d != null && d >= thirtyDaysAgo;
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

  // Evolução: contatos (esforço) x prêmio previsto (resultado), mês a mês.
  // O objetivo é tornar visível, com números do próprio atendente, que fazer
  // mais tarefas/contatos se traduz em mais vendas e mais prêmio no fim do
  // mês — sem depender de dados de outros atendentes (só o que já é seu).
  const evolucao = useMemo(() => {
    if (!sellerProfile) return null;
    const comissaoPct = comissoes[sellerProfile.id] ?? 0;
    const now = new Date();
    const pontos = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const filtroMes = { ano: d.getFullYear(), mes: d.getMonth() };
      const contatos = tasks.filter(t => isoNoMes(t.lastContactedAt, filtroMes)).length;
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
    if (prev < q1   && cur >= q1)   toast.success(`${q1} contatos feitos. Bom começo`);
    if (prev < half && cur >= half) toast.success(`${half} contatos: metade da meta`);
    if (prev < q3   && cur >= q3)   toast.success(`${q3} contatos: faltam ${goal - q3} para a meta`);
    if (prev < goal && cur >= goal) toast.success(`Meta batida: ${goal} contatos hoje`, { duration: 6000 });
    prevContactsRef.current = cur;
  }, [m.contactsToday, m.dailyGoal]);

  if (isLoading) return (
    <Page className="max-w-3xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-20" />
      <Skeleton className="h-40" />
    </Page>
  );

  // Falha da API não pode parecer "zero contatos" (perda de dados).
  if (isError && tasks.length === 0) return (
    <Page className="max-w-3xl">
      <QueryError onRetry={() => { void refetch(); }} retrying={isFetching} />
    </Page>
  );

  const contactColor = m.contactsPct >= 100 ? '#16a34a' : m.contactsPct >= 60 ? '#0C3680' : m.contactsPct >= 30 ? '#d97706' : '#dc2626';
  const hoursColor   = m.hoursPct   >= 100 ? '#16a34a' : m.hoursPct   >= 60 ? '#0C3680' : '#94a3b8';
  const remaining = m.dailyGoal - m.contactsToday;
  const goalMessage = m.contactsToday >= m.dailyGoal
    ? `Meta de ${m.dailyGoal} contatos atingida. Bom trabalho hoje, ${user?.name?.split(' ')[0] ?? ''}.`
    : m.contactsToday >= Math.round(m.dailyGoal * 0.75)
      ? `Quase lá: faltam ${remaining} contatos.`
      : m.contactsToday >= Math.round(m.dailyGoal * 0.5)
        ? `Na metade: ${remaining} contatos para fechar a meta.`
        : `Meta de hoje: ${m.dailyGoal} contatos. Cada anotação salva conta como um contato.`;

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title="Meu Progresso"
        description={
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block size-2 rounded-full ${m.sessionStatus === 'active' ? 'bg-green-500' : m.sessionStatus === 'paused' ? 'bg-amber-500' : 'bg-slate-300'}`}
            />
            {user?.name} ·{' '}
            {m.sessionStatus === 'active' ? 'Trabalhando agora'
             : m.sessionStatus === 'paused' ? 'Sessão pausada'
             : 'Sem sessão ativa'}
          </span>
        }
        actions={m.contactsToday >= m.dailyGoal ? <Badge variant="success">Meta batida</Badge> : undefined}
      />

      <Tabs defaultValue="progresso">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="progresso" className="flex-1">Progresso</TabsTrigger>
          <TabsTrigger value="faturamento" className="flex-1">Faturamento</TabsTrigger>
        </TabsList>

        <TabsContent value="progresso">
          <div className="space-y-5">

            <StatStrip>
              <Stat
                label="Contatos hoje"
                value={`${m.contactsToday}/${m.dailyGoal}`}
                hint={remaining > 0 ? `faltam ${remaining}` : 'completo'}
                tone={m.contactsToday >= m.dailyGoal ? 'success' : 'default'}
              />
              <Stat label="Horas trabalhadas" value={m.hoursWorked} hint={`de ${m.hoursGoal}`} />
              <Stat label="Contatos na semana" value={m.weekContacts} hint="últimos 7 dias" />
              <Stat label="Contatos por hora" value={m.productivity} />
            </StatStrip>

            {m.overdueToday > 0 && (
              <div role="alert" className="flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3">
                <AlertCircle aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-red-700" />
                <div>
                  <p className="text-sm font-medium text-red-800">{m.overdueToday} lembrete{m.overdueToday > 1 ? 's' : ''} em atraso hoje</p>
                  <p className="text-xs text-red-700">Entre em contato com os clientes o quanto antes.</p>
                </div>
              </div>
            )}

            <Panel>
              <PanelHeader title="Metas de hoje" description={goalMessage} />
              <div className="space-y-4 p-4">
                <GoalBar label="Contatos" valueLabel={`${m.contactsToday} / ${m.dailyGoal}`} pct={m.contactsPct} color={contactColor} />
                <GoalBar label="Horas trabalhadas" valueLabel={`${m.hoursWorked} / ${m.hoursGoal}`} pct={m.hoursPct} color={hoursColor} />
              </div>
            </Panel>

            {m.convertedCount > 0 && (
              <Panel>
                <PanelHeader title="Minhas conversões" description="Clientes ativos" />
                <StatStrip className="rounded-none border-0">
                  <Stat label="Total convertidos" value={m.convertedCount} tone="success" />
                  <Stat label="Taxa de conversão" value={`${m.conversionRate}%`} tone="success" />
                  <Stat label="Últimos 30 dias" value={m.convertedThisMonth} tone="success" />
                </StatStrip>
              </Panel>
            )}

            <Panel>
              <PanelHeader title="Contatos — últimos 7 dias" description={`Meta diária: ${m.dailyGoal} contatos`} />
              <div className="p-4">
                <div className="flex h-28 items-end gap-1.5">
                  {m.weekDays.map((day, i) => {
                    const isToday = i === 6;
                    const pct = m.maxBar > 0 ? (day.count / m.maxBar) * 100 : 0;
                    const barColor = isToday ? (day.count >= m.dailyGoal ? '#16a34a' : '#0C3680') : '#94a3b8';
                    return (
                      <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                        {day.count > 0 && (
                          <span className={`text-xs font-medium tabular-nums ${isToday ? 'text-slate-900' : 'text-slate-500'}`}>{day.count}</span>
                        )}
                        <div className="w-full rounded-t-sm" style={{
                          height: `${Math.max(pct * 0.7, day.count > 0 ? 6 : 2)}%`,
                          backgroundColor: barColor,
                          opacity: isToday ? 1 : 0.7,
                        }} />
                        <span className={`text-xs ${isToday ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>
                          {isToday ? 'hoje' : day.label}
                        </span>
                        <span className="text-[11px] text-slate-500">{fmtDate(day.date)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>

            {evolucao?.temDados && (
              <Panel>
                <PanelHeader
                  title="Seu impacto: contatos e prêmio"
                  description="Contatos feitos (barras) e prêmio previsto (linha) nos últimos 6 meses"
                />
                <div className="p-4">
                  <div className="-ml-2 h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={evolucao.pontos} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="contatos" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={26} allowDecimals={false} />
                        <YAxis yAxisId="comissao" orientation="right" hide domain={[0, (max: number) => max * 1.15 || 1]} />
                        <Tooltip
                          formatter={(value: number, name: string) =>
                            name === 'Prêmio previsto' ? [formatBRL(value), name] : [value, name]
                          }
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        />
                        <Bar yAxisId="contatos" dataKey="contatos" name="Contatos" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={20} />
                        <Line yAxisId="comissao" dataKey="comissao" name="Prêmio previsto" stroke="#0C3680" strokeWidth={2.5} dot={{ r: 3, fill: '#0C3680' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <StatStrip className="rounded-none border-0 border-t">
                  <Stat label="Prêmio por contato feito" value={formatBRL(evolucao.valorPorContato)} />
                  <Stat label={`Melhor mês (${evolucao.melhorMes?.label ?? '--'})`} value={formatBRL(evolucao.melhorMes?.comissao ?? 0)} />
                </StatStrip>
              </Panel>
            )}

          </div>
        </TabsContent>

        <TabsContent value="faturamento">
          <AttendantBilling />
        </TabsContent>
      </Tabs>
    </Page>
  );
}
