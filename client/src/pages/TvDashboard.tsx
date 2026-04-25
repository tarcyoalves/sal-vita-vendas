import { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import {
  LineChart, Line, XAxis, YAxis,
  ResponsiveContainer, Tooltip, CartesianGrid,
} from 'recharts';

const SELLER_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed'];

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
    <div className="text-right flex-shrink-0">
      <div className="text-2xl font-bold tabular-nums text-slate-800" style={{ fontFamily: 'monospace' }}>
        {p(time.getHours())}:{p(time.getMinutes())}:{p(time.getSeconds())}
      </div>
      <div className="text-xs text-slate-400 mt-0.5 uppercase tracking-wide">
        {days[time.getDay()]} · {p(time.getDate())} {months[time.getMonth()]} {time.getFullYear()}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color, icon, alert }: {
  label: string; value: string | number; sub?: string;
  color: string; icon: string; alert?: boolean;
}) {
  return (
    <div className={`rounded-2xl px-5 py-3.5 flex-1 flex items-center gap-4 border ${alert ? 'border-red-200 bg-red-50' : 'border-slate-100 bg-white'} shadow-sm`}>
      <div className={`text-2xl w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${alert ? 'bg-red-100' : 'bg-slate-50'}`}>
        {icon}
      </div>
      <div>
        <div className={`text-2xl font-bold tabular-nums ${alert ? 'text-red-600' : color} ${alert ? 'animate-pulse' : ''}`} style={{ fontFamily: 'monospace' }}>
          {value}
        </div>
        <div className="text-xs text-slate-400 uppercase tracking-wide leading-tight">{label}</div>
        {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function Trend({ t }: { t: 'up' | 'down' | 'stable' }) {
  if (t === 'up')   return <span className="text-green-500 font-bold text-sm">↗ sobe</span>;
  if (t === 'down') return <span className="text-red-400 font-bold text-sm">↘ cai</span>;
  return <span className="text-slate-400 text-sm">→ estável</span>;
}

function ScoreBadge({ score }: { score: number }) {
  const bg = score >= 80 ? 'bg-green-100 text-green-700 ring-green-200' :
             score >= 55 ? 'bg-amber-100 text-amber-700 ring-amber-200' :
                           'bg-blue-100 text-blue-700 ring-blue-200';
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ring-2 ${bg}`}>
      {score}
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="text-slate-500 text-xs mb-2 font-medium">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.stroke }} className="font-semibold">
          {p.name}: {p.value} contato{p.value !== 1 ? 's' : ''}
        </p>
      ))}
    </div>
  );
}

export default function TvDashboard() {
  const { data, isLoading } = trpc.tv.dashboard.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
        <img src="/sal-vita-logo.svg" alt="Sal Vita" className="h-14 opacity-30 animate-pulse" />
        <p className="text-slate-400 text-sm">Carregando painel...</p>
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

  // Weekly totals (last week vs previous)
  const totalLastWeek  = data.sellerStats.reduce((acc, s) => acc + (s.weeklyContacts[3]?.contacts ?? 0), 0);
  const totalPrevWeek  = data.sellerStats.reduce((acc, s) => acc + (s.weeklyContacts[2]?.contacts ?? 0), 0);
  const weeklyDelta = totalLastWeek - totalPrevWeek;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ═══ HEADER ═══════════════════════════════════════════════════════ */}
      <header className="flex items-center gap-5 px-6 py-3 bg-white border-b border-slate-100 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 flex-shrink-0">
          <img src="/sal-vita-logo.svg" alt="Sal Vita" className="h-8" />
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Ao Vivo</span>
          </div>
        </div>

        <div className="flex-1 flex gap-3">
          <KpiCard icon="👥" label="Online agora"   value={`${data.kpis.onlineNow}/${data.kpis.totalSellers}`} color="text-green-600" sub="atendentes" />
          <KpiCard icon="📞" label="Contatos hoje"  value={data.kpis.contactsToday} color="text-blue-600" sub={weeklyDelta >= 0 ? `+${weeklyDelta} vs semana ant.` : `${weeklyDelta} vs semana ant.`} />
          <KpiCard icon="⚠️" label="Atrasados"      value={data.kpis.totalOverdue} color="text-amber-600" alert={data.kpis.totalOverdue > 10} sub="lembretes vencidos" />
          <KpiCard icon="🏢" label="Clientes"       value={(data.kpis.totalClients ?? 0).toLocaleString('pt-BR')} color="text-slate-700" sub="na base" />
          <KpiCard icon="📊" label="Semana atual"   value={totalLastWeek} color="text-purple-600" sub={`semana anterior: ${totalPrevWeek}`} />
        </div>

        <Clock />
      </header>

      {/* ═══ MAIN GRID ════════════════════════════════════════════════════ */}
      <div className="flex-1 grid grid-cols-5 gap-4 p-4 min-h-0">

        {/* ── LEFT (3 cols) ─────────────────────────────────── */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">

          {/* Chart */}
          <div className="flex-1 bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div>
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                  Atividade — Últimas 4 Semanas
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">contatos por atendente</p>
              </div>
              <div className="flex items-center gap-5">
                {data.sellerStats.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2">
                    <span className="w-3 h-0.5 rounded-full inline-block" style={{ background: SELLER_COLORS[i % SELLER_COLORS.length] }} />
                    <span className="text-xs text-slate-500 font-medium">{s.name}</span>
                    <Trend t={s.trend} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  {data.sellerStats.map((s, i) => (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={s.name}
                      stroke={SELLER_COLORS[i % SELLER_COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ fill: SELLER_COLORS[i % SELLER_COLORS.length], strokeWidth: 0, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ranking + indicadores por atendente */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex-shrink-0">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">🏆 Desempenho dos Atendentes</h2>
            <div className="space-y-3">
              {ranked.map((s, i) => {
                const pct = Math.round((s.contactsToday / maxToday) * 100);
                const barColor = SELLER_COLORS[i % SELLER_COLORS.length];
                const weekTotal = s.weeklyContacts.reduce((acc, w) => acc + w.contacts, 0);
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span className="w-5 text-right text-sm text-slate-400 flex-shrink-0 font-mono">{i + 1}</span>
                    <div className="flex items-center gap-2 w-28 flex-shrink-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.isOnline ? 'bg-green-500 animate-pulse' : 'bg-slate-200'}`} />
                      <span className="text-sm font-semibold text-slate-700 truncate">{s.name}</span>
                    </div>
                    <div className="flex-1 h-2 rounded-full overflow-hidden bg-slate-100">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: barColor }} />
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-xs font-mono">
                      <span className="text-slate-700 font-bold w-6 text-right">{s.contactsToday}</span>
                      <span className="text-slate-400">hoje</span>
                      <span className="text-slate-500 w-8 text-right">{weekTotal}</span>
                      <span className="text-slate-400">4sem</span>
                      {s.overdueCount > 0 && (
                        <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5 text-xs font-semibold">
                          {s.overdueCount} atras.
                        </span>
                      )}
                      {s.noNotesCount > 3 && (
                        <span className="bg-slate-100 text-slate-500 rounded px-1.5 py-0.5 text-xs">
                          {s.noNotesCount} s/ nota
                        </span>
                      )}
                      {!s.isOnline && (
                        <span className="bg-slate-100 text-slate-400 rounded px-1.5 py-0.5 text-xs">offline</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {ranked.length === 0 && (
                <p className="text-sm text-slate-400">Nenhum atendente configurado.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT (2 cols) ────────────────────────────────── */}
        <div className="col-span-2 flex flex-col gap-4 min-h-0">

          {/* Hot clients */}
          <div className="flex-1 bg-white rounded-2xl p-5 shadow-sm border border-slate-100 overflow-y-auto min-h-0">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div>
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">🔥 Clientes Potenciais</h2>
                <p className="text-xs text-slate-400 mt-0.5">detectados por palavras-chave nas anotações</p>
              </div>
            </div>
            {data.hotClients.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <span className="text-3xl">💤</span>
                <p className="text-sm text-slate-400 text-center">Sem clientes pontuados ainda.<br />Atualize as anotações.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.hotClients.map((c, i) => (
                  <div key={i} className={`flex gap-3 items-start pb-4 last:pb-0 ${i < data.hotClients.length - 1 ? 'border-b border-slate-100' : ''}`}>
                    <ScoreBadge score={c.score} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-800 truncate">{c.title}</p>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2 italic">"{c.snippet}…"</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">{c.assignedTo}</span>
                        <span className="text-xs text-slate-400">
                          há {c.hoursAgo > 0 ? `${c.hoursAgo}h` : 'menos de 1h'}
                        </span>
                        {c.score >= 80 && <span className="text-xs bg-green-50 text-green-700 font-semibold rounded px-1.5 py-0.5">🔥 Alta prioridade</span>}
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
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-xl px-3 py-2.5">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-green-700">Tudo em ordem — equipe operando bem</span>
              </div>
            ) : (
              <div className="space-y-2">
                {data.alerts.map((a, i) => {
                  const isIdle = a.type === 'idle';
                  const isOverdue = a.type === 'overdue';
                  const bgCls = isIdle ? 'bg-amber-50 border-amber-200' : isOverdue ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200';
                  const textCls = isIdle ? 'text-amber-700' : isOverdue ? 'text-red-700' : 'text-slate-600';
                  const dotCls = isIdle ? 'bg-amber-500' : isOverdue ? 'bg-red-500' : 'bg-slate-400';
                  const actionMap: Record<string, string> = {
                    idle: '→ cobrar atividade',
                    overdue: '→ reagendar contatos',
                    no_notes: '→ pedir preenchimento',
                  };
                  return (
                    <div key={i} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${bgCls}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`} />
                      <span className={`text-sm font-bold ${textCls}`}>{a.seller}</span>
                      <span className="text-xs text-slate-500 flex-1">
                        {a.count > 0 ? `${a.count} ` : ''}{a.label}
                      </span>
                      <span className={`text-xs font-medium ${textCls} flex-shrink-0`}>
                        {actionMap[a.type] ?? ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ FOOTER ═══════════════════════════════════════════════════════ */}
      <footer className="flex items-center justify-between px-6 py-2 bg-white border-t border-slate-100 flex-shrink-0">
        <span className="text-xs text-slate-400 uppercase tracking-wide">Sal Vita · Painel de Gestão</span>
        <span className="text-xs text-slate-300 font-mono">↻ atualiza a cada 60s</span>
      </footer>
    </div>
  );
}
