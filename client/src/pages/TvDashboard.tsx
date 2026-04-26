import { useState, useEffect, useMemo } from 'react';
import { trpc } from '../lib/trpc';
import {
  LineChart, Line, XAxis, YAxis,
  ResponsiveContainer, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];
const MEDALS = ['🥇', '🥈', '🥉'];
const DAYS   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const CURRENT_YEAR = new Date().getFullYear();

const ALERT_COLORS: Record<string, string> = {
  idle: '#f59e0b',
  overdue: '#ef4444',
  no_notes: '#64748b',
};
const ALERT_LABELS: Record<string, string> = {
  idle: 'Ociosos',
  overdue: 'Atrasados',
  no_notes: 'Sem nota',
};
const ALERT_STYLES: Record<string, { card: string; text: string; dot: string; action: string }> = {
  idle:     { card: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500', action: 'text-amber-600'  },
  overdue:  { card: 'bg-red-50 border-red-200',     text: 'text-red-800',   dot: 'bg-red-500',   action: 'text-red-600'    },
  no_notes: { card: 'bg-slate-50 border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400', action: 'text-slate-500'  },
};
const ACTION_MAP: Record<string, string> = {
  idle:     'cobrar atividade',
  overdue:  'reagendar contatos',
  no_notes: 'pedir preenchimento',
};

const RING_SIZE = 44;
const RING_SW   = 3.5;
const RING_R    = (RING_SIZE - RING_SW) / 2;
const RING_CIRC = 2 * Math.PI * RING_R;

const pad = (n: number) => String(n).padStart(2, '0');

/* ─── Clock with office-hours indicator ──────────────────── */
function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const isOffice = time.getDay() >= 1 && time.getDay() <= 6
    && time.getHours() >= 7 && time.getHours() < 18;
  return (
    <div className="text-right flex-shrink-0 select-none">
      <div className="flex items-center justify-end gap-2 mb-0.5">
        {isOffice ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Expediente
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Fora do expediente
          </span>
        )}
      </div>
      <div
        className="text-xl md:text-3xl font-black tabular-nums leading-none text-slate-800"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {pad(time.getHours())}:{pad(time.getMinutes())}
        <span className="text-slate-400 text-base md:text-xl">:{pad(time.getSeconds())}</span>
      </div>
      <div className="text-[10px] md:text-[11px] text-slate-400 mt-0.5 uppercase tracking-widest">
        {DAYS[time.getDay()]} · {pad(time.getDate())} {MONTHS[time.getMonth()]} {CURRENT_YEAR}
      </div>
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────── */
function KpiCard({ label, value, sub, color, icon, alert }: {
  label: string; value: string | number; sub?: string;
  color: string; icon: string; alert?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-xl md:rounded-2xl px-3 md:px-5 py-3 md:py-4 flex items-center gap-3 md:gap-4 border border-slate-100 shadow-sm relative overflow-hidden w-full ${alert ? 'ring-1 ring-red-200' : ''}`}
      style={{ borderTop: `3px solid ${alert ? '#ef4444' : color}` }}
    >
      <div className={`w-9 h-9 md:w-11 md:h-11 rounded-xl flex items-center justify-center text-base md:text-xl flex-shrink-0 ${alert ? 'bg-red-50' : 'bg-slate-50'}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`text-2xl md:text-3xl font-black tabular-nums leading-none ${alert ? 'text-red-600' : ''}`}
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: alert ? undefined : color }}
        >
          {value}
        </div>
        <div className="text-[10px] md:text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-0.5 truncate">{label}</div>
        {sub && <div className="hidden md:block text-[11px] text-slate-400 mt-0.5 truncate">{sub}</div>}
      </div>
      {alert && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
    </div>
  );
}

/* ─── Trend Badge ────────────────────────────────────────── */
function TrendBadge({ t }: { t: 'up' | 'down' | 'stable' }) {
  if (t === 'up')
    return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">↗ sobe</span>;
  if (t === 'down')
    return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">↘ cai</span>;
  return <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">→ estável</span>;
}

/* ─── Score Badge with SVG circular ring ─────────────────── */
function ScoreBadge({ score }: { score: number }) {
  const dash = (Math.min(score, 100) / 100) * RING_CIRC;
  const { ring, textColor } = score >= 80
    ? { ring: '#10b981', textColor: '#065f46' }
    : score >= 55
    ? { ring: '#f59e0b', textColor: '#92400e' }
    : { ring: '#3b82f6', textColor: '#1e40af' };
  return (
    <div className="relative flex-shrink-0" style={{ width: RING_SIZE, height: RING_SIZE }}>
      <svg width={RING_SIZE} height={RING_SIZE} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none" stroke="#e2e8f0" strokeWidth={RING_SW} />
        <circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_R} fill="none"
          stroke={ring} strokeWidth={RING_SW}
          strokeDasharray={`${dash} ${RING_CIRC}`}
          strokeLinecap="round"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-sm font-black tabular-nums"
        style={{ fontFamily: "'Barlow Condensed', sans-serif", color: textColor }}
      >
        {score}
      </span>
    </div>
  );
}

/* ─── Chart Tooltip ──────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xl px-4 py-3 text-sm min-w-[160px]">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: p.stroke }} />
            <span className="text-slate-600 text-xs">{p.name}</span>
          </div>
          <span className="font-bold text-slate-800 tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Dashboard ─────────────────────────────────────── */
export default function TvDashboard() {
  const { data, isLoading, dataUpdatedAt } = trpc.tv.dashboard.useQuery(undefined, {
    refetchInterval: 30_000,
    retry: 3,
  });

  const chartData = useMemo(() => {
    if (!data) return [];
    const numWeeks = data.sellerStats[0]?.weeklyContacts.length ?? 4;
    return Array.from({ length: numWeeks }, (_, wi) => {
      const entry: Record<string, any> = {
        week: data.sellerStats[0]?.weeklyContacts[wi]?.week ?? `S${wi + 1}`,
      };
      data.sellerStats.forEach(s => { entry[s.name] = s.weeklyContacts[wi]?.contacts ?? 0; });
      return entry;
    });
  }, [data]);

  const maxWeekTotal = useMemo(() => {
    if (!data) return 1;
    return Math.max(...data.sellerStats.map(s => s.weeklyContacts.reduce((a, w) => a + w.contacts, 0)), 1);
  }, [data]);

  const ranked = useMemo(() => {
    if (!data) return [];
    const maxToday = Math.max(...data.sellerStats.map(s => s.contactsToday), 1);
    return [...data.sellerStats]
      .map(s => {
        const weekTotal     = s.weeklyContacts.reduce((a, w) => a + w.contacts, 0);
        const sContacts     = (s.contactsToday / maxToday) * 40;
        const sWeek         = (weekTotal / maxWeekTotal) * 30;
        const sNoDelay      = s.overdueCount === 0 ? 20 : Math.max(0, 20 - s.overdueCount * 2);
        const sOnline       = s.isOnline ? 10 : 0;
        const compositeScore = Math.round(sContacts + sWeek + sNoDelay + sOnline);
        return { ...s, weekTotal, compositeScore, pct: Math.round((s.contactsToday / maxToday) * 100) };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore);
  }, [data, maxWeekTotal]);

  const { weeklyDelta, totalLastWeek, totalPrevWeek } = useMemo(() => {
    if (!data) return { weeklyDelta: 0, totalLastWeek: 0, totalPrevWeek: 0 };
    const last = data.sellerStats.reduce((a, s) => a + (s.weeklyContacts[3]?.contacts ?? 0), 0);
    const prev = data.sellerStats.reduce((a, s) => a + (s.weeklyContacts[2]?.contacts ?? 0), 0);
    return { weeklyDelta: last - prev, totalLastWeek: last, totalPrevWeek: prev };
  }, [data]);

  const alertPieData = useMemo(() => {
    if (!data) return [];
    const counts: Record<string, number> = {};
    data.alerts.forEach(a => { counts[a.type] = (counts[a.type] ?? 0) + (a.count || 1); });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([type, value]) => ({ type, value }));
  }, [data]);

  const lastUpdated = useMemo(() => {
    if (!dataUpdatedAt) return '—';
    const d = new Date(dataUpdatedAt);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }, [dataUpdatedAt]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-slate-50">
        <img src="/sal-vita-logo.svg" alt="Sal Vita" className="h-14 opacity-20 animate-pulse" />
        <p className="text-slate-400 text-sm tracking-wide uppercase">Carregando painel...</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: '#EEF1F8', fontFamily: "'Inter', sans-serif" }}
    >
      {/* ══ HEADER ══════════════════════════════════════════ */}
      <header className="flex items-center justify-between px-4 md:px-6 py-2.5 md:py-3 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-4">
          <img src="/sal-vita-logo.svg" alt="Sal Vita" className="h-7 md:h-9" />
          <div className="hidden md:block h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 md:px-3 py-1">
            <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] md:text-[11px] font-bold text-emerald-700 uppercase tracking-widest">Ao Vivo</span>
          </div>
          <span className="hidden md:block text-xs text-slate-400">↻ atualiza a cada 30s</span>
        </div>
        <Clock />
      </header>

      {/* ══ KPI STRIP ═══════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:flex gap-2 md:gap-3 px-3 md:px-5 py-2.5 md:py-3 flex-shrink-0">
        <div className="md:flex-1">
          <KpiCard icon="👥" label="Online agora" value={`${data.kpis.onlineNow}/${data.kpis.totalSellers}`} color="#16a34a" sub="atendentes ativos" />
        </div>
        <div className="md:flex-1">
          <KpiCard icon="📞" label="Contatos hoje" value={data.kpis.contactsToday} color="#2563eb"
            sub={weeklyDelta >= 0 ? `+${weeklyDelta} vs sem. ant.` : `${weeklyDelta} vs sem. ant.`} />
        </div>
        <div className="md:flex-1">
          <KpiCard icon="⚠️" label="Atrasados" value={data.kpis.totalOverdue} color="#d97706"
            alert={data.kpis.totalOverdue > 10} sub="lembretes vencidos" />
        </div>
        <div className="md:flex-1">
          <KpiCard icon="🏢" label="Clientes" value={(data.kpis.totalClients ?? 0).toLocaleString('pt-BR')} color="#7c3aed" sub="cadastrados" />
        </div>
        <div className="col-span-2 md:flex-1">
          <KpiCard icon="📊" label="Semana atual" value={totalLastWeek} color="#0891b2" sub={`semana anterior: ${totalPrevWeek}`} />
        </div>
      </div>

      {/* ══ MAIN CONTENT ════════════════════════════════════ */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-3 px-3 md:px-5 pb-20">

        {/* ── LEFT — 7 cols ─────────────────────────────── */}
        <div className="md:col-span-7 flex flex-col gap-3">

          {/* Weekly chart */}
          <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-100 flex flex-col" style={{ borderTop: '3px solid #2563eb' }}>
            <div className="flex items-start justify-between mb-3 md:mb-4 flex-shrink-0 flex-wrap gap-2">
              <div>
                <h2 className="text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wide">Atividade — Últimas 4 Semanas</h2>
                <p className="text-[11px] text-slate-400 mt-0.5 hidden md:block">contatos realizados por atendente</p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {data.sellerStats.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 rounded-full inline-block" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-[11px] text-slate-500 font-medium">{s.name}</span>
                    <TrendBadge t={s.trend} />
                  </div>
                ))}
              </div>
            </div>
            <div className="h-48 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip />} />
                  {data.sellerStats.map((s, i) => (
                    <Line key={s.id} type="monotone" dataKey={s.name}
                      stroke={COLORS[i % COLORS.length]} strokeWidth={2.5}
                      dot={{ fill: COLORS[i % COLORS.length], strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Seller ranking */}
          <div className="bg-white rounded-2xl px-4 md:px-5 py-4 shadow-sm border border-slate-100 flex-shrink-0" style={{ borderTop: '3px solid #7c3aed' }}>
            <h2 className="text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 md:mb-4">🏆 Desempenho dos Atendentes</h2>
            <div className="space-y-2.5">
              {ranked.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum atendente configurado.</p>
              ) : ranked.map((s, i) => {
                const bar = COLORS[i % COLORS.length];
                return (
                  <div key={s.id} className="flex items-center gap-2 md:gap-3">
                    <span className="w-6 text-center text-sm flex-shrink-0">
                      {i < 3 ? MEDALS[i] : <span className="text-slate-400 font-mono text-xs">{i + 1}</span>}
                    </span>
                    <div className="flex items-center gap-1.5 w-24 md:w-32 flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-200'}`} />
                      <span className="text-xs md:text-sm font-semibold text-slate-700 truncate">{s.name}</span>
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${s.pct}%`, background: bar }} />
                    </div>
                    <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0 text-[11px] md:text-xs font-mono">
                      <span className="font-bold w-5 text-right" style={{ color: bar }}>{s.contactsToday}</span>
                      <span className="text-slate-300 hidden md:inline">·</span>
                      <span className="text-slate-500 hidden md:inline">{s.weekTotal} <span className="text-slate-300 text-[10px]">4sem</span></span>
                      {s.overdueCount > 0 && (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded px-1 py-0.5 text-[10px] font-semibold">{s.overdueCount}⚠</span>
                      )}
                    </div>
                    <ScoreBadge score={s.compositeScore} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT — 5 cols ────────────────────────────── */}
        <div className="md:col-span-5 flex flex-col gap-3">

          {/* Hot clients */}
          <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-100 flex flex-col" style={{ borderTop: '3px solid #f59e0b' }}>
            <div className="flex-shrink-0 mb-3 md:mb-4">
              <h2 className="text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wide">🔥 Clientes Potenciais</h2>
              <p className="text-[11px] text-slate-400 mt-0.5 hidden md:block">pontuados por palavras-chave nas anotações</p>
            </div>
            {data.hotClients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 md:flex-1 gap-3">
                <span className="text-4xl">💤</span>
                <p className="text-sm text-slate-400 text-center leading-relaxed">Sem clientes pontuados.<br />Atualize as anotações.</p>
              </div>
            ) : (
              <div className="md:max-h-[320px] md:overflow-y-auto space-y-3 md:pr-1">
                {data.hotClients.map((c, i) => (
                  <div key={i} className={`flex gap-3 items-start pb-3 ${i < data.hotClients.length - 1 ? 'border-b border-slate-100' : ''}`}>
                    <ScoreBadge score={c.score} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-slate-800 truncate">{c.title}</p>
                        {c.score >= 80 && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold rounded-full px-2 py-0.5 flex-shrink-0">QUENTE</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2 italic">"{c.snippet}…"</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">{c.assignedTo}</span>
                        <span className="text-xs text-slate-400">há {c.hoursAgo > 0 ? `${c.hoursAgo}h` : '<1h'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alerts + PieChart */}
          <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-slate-100 flex-shrink-0" style={{ borderTop: '3px solid #ef4444' }}>
            <div className="flex items-start justify-between mb-3 gap-3">
              <h2 className="text-xs md:text-sm font-bold text-slate-700 uppercase tracking-wide">⚡ Alertas e Ações</h2>
              {alertPieData.length > 0 && (
                <PieChart width={80} height={80} className="flex-shrink-0">
                  <Pie data={alertPieData} dataKey="value" cx="50%" cy="50%"
                    innerRadius={18} outerRadius={36} paddingAngle={2}
                    label={false} labelLine={false}
                  >
                    {alertPieData.map((entry, idx) => (
                      <Cell key={idx} fill={ALERT_COLORS[entry.type] ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any, _name: any, props: any) =>
                      [value, ALERT_LABELS[props.payload.type] ?? props.payload.type]
                    }
                  />
                </PieChart>
              )}
            </div>
            {data.alerts.length === 0 ? (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-3 md:px-4 py-2.5 md:py-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-xs md:text-sm font-semibold text-emerald-700">Tudo em ordem — equipe operando bem</span>
              </div>
            ) : (
              <div className="space-y-2">
                {data.alerts.map((a, i) => {
                  const st = ALERT_STYLES[a.type] ?? ALERT_STYLES.no_notes;
                  return (
                    <div key={i} className={`flex items-center gap-2.5 rounded-xl px-3 md:px-4 py-2.5 md:py-3 border ${st.card}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs md:text-sm font-bold ${st.text}`}>{a.seller}</span>
                        <span className="text-[11px] text-slate-500 ml-1.5">{a.count > 0 ? `${a.count} ` : ''}{a.label}</span>
                      </div>
                      <span className={`text-[10px] md:text-xs font-semibold flex-shrink-0 ${st.action}`}>→ {ACTION_MAP[a.type] ?? ''}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══ FOOTER (desktop only, fixed) ════════════════════ */}
      <footer className="hidden md:flex items-center justify-between px-6 py-2 bg-white border-t border-slate-200 text-[11px] text-slate-400 sticky bottom-0 z-10">
        <span className="font-semibold text-slate-500">Sal Vita — Painel de Gestão</span>
        <span>atualizado às {lastUpdated}</span>
        <span>© {CURRENT_YEAR} Sal Vita</span>
      </footer>
    </div>
  );
}
