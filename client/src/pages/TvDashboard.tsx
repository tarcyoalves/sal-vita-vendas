import { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import {
  LineChart, Line, XAxis, YAxis,
  ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];
const MEDALS = ['🥇', '🥈', '🥉'];

/* ─── Clock ─────────────────────────────────────────────── */
function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const p = (n: number) => String(n).padStart(2, '0');
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  return (
    <div className="text-right flex-shrink-0 select-none">
      <div className="text-3xl font-black tabular-nums leading-none text-slate-800"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}>
        {p(time.getHours())}:{p(time.getMinutes())}
        <span className="text-slate-400 text-xl">:{p(time.getSeconds())}</span>
      </div>
      <div className="text-[11px] text-slate-400 mt-1 uppercase tracking-widest">
        {days[time.getDay()]} · {p(time.getDate())} {months[time.getMonth()]} {time.getFullYear()}
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
      className={`flex-1 bg-white rounded-2xl px-5 py-4 flex items-center gap-4 border border-slate-100 shadow-sm relative overflow-hidden ${alert ? 'ring-1 ring-red-200' : ''}`}
      style={{ borderTop: `3px solid ${alert ? '#ef4444' : color}` }}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${alert ? 'bg-red-50' : 'bg-slate-50'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div
          className={`text-3xl font-black tabular-nums leading-none ${alert ? 'text-red-600' : 'text-slate-800'}`}
          style={{ fontFamily: "'Barlow Condensed', sans-serif", color: alert ? undefined : color }}
        >
          {value}
        </div>
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-1 truncate">{label}</div>
        {sub && <div className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</div>}
      </div>
      {alert && (
        <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
      )}
    </div>
  );
}

/* ─── Trend Badge ────────────────────────────────────────── */
function Trend({ t }: { t: 'up' | 'down' | 'stable' }) {
  if (t === 'up')   return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">↗ sobe</span>;
  if (t === 'down') return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">↘ cai</span>;
  return <span className="text-[11px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">→ estável</span>;
}

/* ─── Score Badge ────────────────────────────────────────── */
function ScoreBadge({ score }: { score: number }) {
  const { bg, text, ring } = score >= 80
    ? { bg: 'bg-emerald-50', text: 'text-emerald-700', ring: 'ring-emerald-200' }
    : score >= 55
    ? { bg: 'bg-amber-50',   text: 'text-amber-700',   ring: 'ring-amber-200'   }
    : { bg: 'bg-blue-50',    text: 'text-blue-700',    ring: 'ring-blue-200'    };
  return (
    <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ring-2 ${bg} ${text} ${ring}`}
      style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>
      {score}
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
  const { data, isLoading } = trpc.tv.dashboard.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-slate-50">
        <img src="/sal-vita-logo.svg" alt="Sal Vita" className="h-16 opacity-20 animate-pulse" />
        <p className="text-slate-400 text-sm tracking-wide uppercase">Carregando painel...</p>
      </div>
    );
  }

  const numWeeks = data.sellerStats[0]?.weeklyContacts.length ?? 4;
  const chartData = Array.from({ length: numWeeks }, (_, wi) => {
    const entry: Record<string, any> = {
      week: data.sellerStats[0]?.weeklyContacts[wi]?.week ?? `S${wi + 1}`,
    };
    data.sellerStats.forEach(s => {
      entry[s.name] = s.weeklyContacts[wi]?.contacts ?? 0;
    });
    return entry;
  });

  const ranked = [...data.sellerStats].sort((a, b) => b.contactsToday - a.contactsToday);
  const maxToday = Math.max(...ranked.map(s => s.contactsToday), 1);

  const totalLastWeek = data.sellerStats.reduce((acc, s) => acc + (s.weeklyContacts[3]?.contacts ?? 0), 0);
  const totalPrevWeek = data.sellerStats.reduce((acc, s) => acc + (s.weeklyContacts[2]?.contacts ?? 0), 0);
  const weeklyDelta = totalLastWeek - totalPrevWeek;

  const actionMap: Record<string, string> = {
    idle:     'cobrar atividade',
    overdue:  'reagendar contatos',
    no_notes: 'pedir preenchimento',
  };

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: '#F1F5F9', fontFamily: "'Inter', sans-serif" }}
    >

      {/* ══ HEADER ════════════════════════════════════════════ */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <img src="/sal-vita-logo.svg" alt="Sal Vita" className="h-9" />
          <div className="h-6 w-px bg-slate-200" />
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-widest">Ao Vivo</span>
          </div>
          <span className="text-xs text-slate-400">↻ atualiza a cada 60s</span>
        </div>
        <Clock />
      </header>

      {/* ══ KPI STRIP ═════════════════════════════════════════ */}
      <div className="flex gap-3 px-5 py-3 flex-shrink-0">
        <KpiCard
          icon="👥" label="Online agora"
          value={`${data.kpis.onlineNow} / ${data.kpis.totalSellers}`}
          color="#16a34a" sub="atendentes ativos"
        />
        <KpiCard
          icon="📞" label="Contatos hoje"
          value={data.kpis.contactsToday}
          color="#2563eb"
          sub={weeklyDelta >= 0 ? `+${weeklyDelta} vs semana ant.` : `${weeklyDelta} vs semana ant.`}
        />
        <KpiCard
          icon="⚠️" label="Atrasados"
          value={data.kpis.totalOverdue}
          color="#d97706"
          alert={data.kpis.totalOverdue > 10}
          sub="lembretes vencidos"
        />
        <KpiCard
          icon="🏢" label="Base de clientes"
          value={(data.kpis.totalClients ?? 0).toLocaleString('pt-BR')}
          color="#7c3aed" sub="cadastrados"
        />
        <KpiCard
          icon="📊" label="Semana atual"
          value={totalLastWeek}
          color="#0891b2"
          sub={`semana anterior: ${totalPrevWeek}`}
        />
      </div>

      {/* ══ MAIN GRID ═════════════════════════════════════════ */}
      <div className="flex-1 grid grid-cols-5 gap-3 px-5 pb-4 min-h-0">

        {/* ── LEFT col (3) ─────────────────────────────────── */}
        <div className="col-span-3 flex flex-col gap-3 min-h-0">

          {/* Chart */}
          <div className="flex-1 bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col min-h-0">
            <div className="flex items-start justify-between mb-4 flex-shrink-0">
              <div>
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                  Atividade — Últimas 4 Semanas
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">contatos realizados por atendente</p>
              </div>
              <div className="flex items-center gap-4 flex-wrap justify-end">
                {data.sellerStats.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="w-3 h-1 rounded-full inline-block" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-xs text-slate-500 font-medium">{s.name}</span>
                    <Trend t={s.trend} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="week"
                    tick={{ fill: '#94a3b8', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {data.sellerStats.map((s, i) => (
                    <Line
                      key={s.id} type="monotone" dataKey={s.name}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ fill: COLORS[i % COLORS.length], strokeWidth: 0, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Seller Ranking */}
          <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-100 flex-shrink-0">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">
              🏆 Desempenho dos Atendentes
            </h2>
            <div className="space-y-2.5">
              {ranked.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum atendente configurado.</p>
              ) : ranked.map((s, i) => {
                const pct = Math.round((s.contactsToday / maxToday) * 100);
                const bar = COLORS[i % COLORS.length];
                const weekTotal = s.weeklyContacts.reduce((acc, w) => acc + w.contacts, 0);
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm flex-shrink-0">
                      {i < 3 ? MEDALS[i] : <span className="text-slate-400 font-mono text-xs">{i + 1}</span>}
                    </span>
                    <div className="flex items-center gap-2 w-32 flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-200'}`} />
                      <span className="text-sm font-semibold text-slate-700 truncate">{s.name}</span>
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${pct}%`, background: bar }}
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 text-xs font-mono">
                      <span className="font-bold text-slate-800 w-5 text-right" style={{ color: bar }}>{s.contactsToday}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500 w-8 text-right">{weekTotal}</span>
                      <span className="text-slate-300 text-[10px]">4sem</span>
                      {s.overdueCount > 0 && (
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5 text-[10px] font-semibold">
                          {s.overdueCount} atras.
                        </span>
                      )}
                      {s.noNotesCount > 3 && (
                        <span className="bg-slate-50 text-slate-500 border border-slate-200 rounded px-1.5 py-0.5 text-[10px]">
                          {s.noNotesCount} s/nota
                        </span>
                      )}
                      {!s.isOnline && (
                        <span className="bg-slate-50 text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 text-[10px]">offline</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── RIGHT col (2) ─────────────────────────────────── */}
        <div className="col-span-2 flex flex-col gap-3 min-h-0">

          {/* Hot Clients */}
          <div className="flex-1 bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col min-h-0">
            <div className="flex-shrink-0 mb-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">🔥 Clientes Potenciais</h2>
              <p className="text-xs text-slate-400 mt-0.5">pontuados por palavras-chave nas anotações</p>
            </div>
            {data.hotClients.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <span className="text-4xl">💤</span>
                <p className="text-sm text-slate-400 text-center leading-relaxed">
                  Sem clientes pontuados.<br />Atualize as anotações.
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
                {data.hotClients.map((c, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 items-start pb-3 ${i < data.hotClients.length - 1 ? 'border-b border-slate-100' : ''}`}
                  >
                    <ScoreBadge score={c.score} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-slate-800 truncate">{c.title}</p>
                        {c.score >= 80 && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold rounded-full px-2 py-0.5 flex-shrink-0">
                            QUENTE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2 italic">
                        "{c.snippet}…"
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                          {c.assignedTo}
                        </span>
                        <span className="text-xs text-slate-400">
                          há {c.hoursAgo > 0 ? `${c.hoursAgo}h` : '&lt;1h'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alerts */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex-shrink-0">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3">⚡ Alertas e Ações</h2>
            {data.alerts.length === 0 ? (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-emerald-700">Tudo em ordem — equipe operando bem</span>
              </div>
            ) : (
              <div className="space-y-2">
                {data.alerts.map((a, i) => {
                  const isIdle    = a.type === 'idle';
                  const isOverdue = a.type === 'overdue';
                  const styles = isIdle
                    ? { card: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500', action: 'text-amber-600' }
                    : isOverdue
                    ? { card: 'bg-red-50 border-red-200',     text: 'text-red-800',   dot: 'bg-red-500',   action: 'text-red-600'   }
                    : { card: 'bg-slate-50 border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400', action: 'text-slate-500' };
                  return (
                    <div key={i} className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${styles.card}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${styles.dot}`} />
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-bold ${styles.text}`}>{a.seller}</span>
                        <span className="text-xs text-slate-500 ml-2">
                          {a.count > 0 ? `${a.count} ` : ''}{a.label}
                        </span>
                      </div>
                      <span className={`text-xs font-semibold flex-shrink-0 ${styles.action}`}>
                        → {actionMap[a.type] ?? ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
