import { useState, useEffect } from 'react';
import { trpc } from '../lib/trpc';
import {
  LineChart, Line, XAxis, YAxis,
  ResponsiveContainer, Tooltip,
} from 'recharts';

const SELLER_COLORS = ['#00D4FF', '#00FF87', '#FFB347', '#FF6B6B', '#C084FC'];

// ── Clock ──────────────────────────────────────────────────────────────
function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const p = (n: number) => String(n).padStart(2, '0');
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  return (
    <div className="text-right flex-shrink-0">
      <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#00D4FF' }} className="text-3xl font-bold tabular-nums tracking-tight">
        {p(time.getHours())}:{p(time.getMinutes())}:{p(time.getSeconds())}
      </div>
      <div className="text-xs uppercase tracking-widest mt-0.5" style={{ color: '#2E4A6A' }}>
        {days[time.getDay()]} · {p(time.getDate())}/{p(time.getMonth() + 1)}/{time.getFullYear()}
      </div>
    </div>
  );
}

// ── Score badge ────────────────────────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#00FF87' : score >= 55 ? '#FFB347' : '#00D4FF';
  return (
    <div
      className="w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
      style={{
        border: `1.5px solid ${color}`,
        color,
        boxShadow: `0 0 12px ${color}33`,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {score}
    </div>
  );
}

// ── Trend arrow ────────────────────────────────────────────────────────
function Trend({ t }: { t: 'up' | 'down' | 'stable' }) {
  if (t === 'up')   return <span style={{ color: '#00FF87' }} className="text-base font-bold">↗</span>;
  if (t === 'down') return <span style={{ color: '#FF6B6B' }} className="text-base font-bold">↘</span>;
  return <span style={{ color: '#2E4A6A' }} className="text-base">–</span>;
}

// ── KPI card ───────────────────────────────────────────────────────────
function KpiCard({ label, value, color, blink }: { label: string; value: string | number; color: string; blink?: boolean }) {
  return (
    <div
      className="rounded-xl px-4 py-2.5 text-center flex-1"
      style={{ background: '#0D1828', border: `1px solid ${color}22` }}
    >
      <div
        className={`text-2xl font-bold tabular-nums ${blink ? 'animate-pulse' : ''}`}
        style={{ fontFamily: "'JetBrains Mono', monospace", color }}
      >
        {value}
      </div>
      <div className="text-xs uppercase tracking-widest mt-0.5" style={{ color: '#2E4A6A' }}>
        {label}
      </div>
    </div>
  );
}

// ── Custom tooltip ─────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0D1828', border: '1px solid #1A2E4A', borderRadius: 10, padding: '8px 14px' }}>
      <p style={{ color: '#8BBBD8', fontSize: 11, marginBottom: 4, fontFamily: 'monospace' }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.stroke, fontSize: 13, fontFamily: 'monospace' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────
export default function TvDashboard() {
  const { data, isLoading } = trpc.tv.dashboard.useQuery(undefined, {
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: '#070C14' }}
      >
        <img src="/sal-vita-logo.svg" alt="Sal Vita" className="h-16 brightness-0 invert opacity-40 animate-pulse" />
        <p style={{ color: '#2E4A6A', fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>
          carregando painel...
        </p>
      </div>
    );
  }

  // Build recharts data: [{week:'S1', Ana:20, João:14}, ...]
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

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{
        background: '#070C14',
        fontFamily: "'Barlow Condensed', 'Inter', sans-serif",
        letterSpacing: '0.01em',
      }}
    >
      {/* ═══ HEADER ═══════════════════════════════════════════════════════ */}
      <header
        className="flex items-center gap-5 px-6 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid #0D1E30' }}
      >
        {/* Logo + badge */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <img src="/sal-vita-logo.svg" alt="Sal Vita" className="h-8 brightness-0 invert opacity-80" />
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{ background: '#001A2E', border: '1px solid #00D4FF22' }}
          >
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#00D4FF' }}>
              Ao Vivo
            </span>
          </div>
        </div>

        {/* KPIs */}
        <div className="flex-1 flex gap-3">
          <KpiCard label="Online Agora"    value={`${data.kpis.onlineNow}/${data.kpis.totalSellers}`} color="#00FF87" />
          <KpiCard label="Contatos Hoje"   value={data.kpis.contactsToday}  color="#00D4FF" />
          <KpiCard label="Atrasados"       value={data.kpis.totalOverdue}   color={data.kpis.totalOverdue > 5 ? '#FF6B6B' : '#FFB347'} blink={data.kpis.totalOverdue > 10} />
          <KpiCard label="Clientes"        value={(data.kpis.totalClients ?? 0).toLocaleString('pt-BR')} color="#8BBBD8" />
          <KpiCard label="Atendentes"      value={data.kpis.totalSellers}   color="#4A6890" />
        </div>

        <Clock />
      </header>

      {/* ═══ MAIN GRID ════════════════════════════════════════════════════ */}
      <div className="flex-1 grid grid-cols-5 gap-4 p-4 min-h-0">

        {/* ── LEFT (3 cols) ─────────────────────────────────── */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">

          {/* Chart */}
          <div
            className="flex-1 rounded-2xl p-5 flex flex-col min-h-0"
            style={{ background: '#0D1828', border: '1px solid #1A2E4A' }}
          >
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <h2 className="text-sm font-bold uppercase tracking-[0.18em]" style={{ color: '#4A6890' }}>
                Atividade — Últimas 4 Semanas
              </h2>
              <div className="flex items-center gap-4">
                {data.sellerStats.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <span
                      className="w-4 h-0.5 rounded-full inline-block"
                      style={{ background: SELLER_COLORS[i % SELLER_COLORS.length] }}
                    />
                    <span className="text-xs" style={{ color: '#4A6890' }}>{s.name}</span>
                    <Trend t={s.trend} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 4 }}>
                  <XAxis
                    dataKey="week"
                    tick={{ fill: '#2E4A6A', fontSize: 12, fontFamily: 'monospace' }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#2E4A6A', fontSize: 11, fontFamily: 'monospace' }}
                    axisLine={false} tickLine={false}
                  />
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

          {/* Ranking hoje */}
          <div
            className="rounded-2xl p-5 flex-shrink-0"
            style={{ background: '#0D1828', border: '1px solid #1A2E4A' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-[0.18em] mb-4" style={{ color: '#4A6890' }}>
              🏆 Ranking Hoje
            </h2>
            <div className="space-y-3">
              {ranked.map((s, i) => {
                const pct = Math.round((s.contactsToday / maxToday) * 100);
                const barColor = i === 0 ? '#00FF87' : i === 1 ? '#00D4FF' : '#2E4A6A';
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <span
                      className="w-5 text-right flex-shrink-0 text-sm"
                      style={{ color: '#2E4A6A', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex items-center gap-2 w-32 flex-shrink-0">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${s.isOnline ? 'animate-pulse' : ''}`}
                        style={{ background: s.isOnline ? '#00FF87' : '#1A2E4A' }}
                      />
                      <span className="text-sm font-semibold truncate" style={{ color: '#E0F0FF' }}>
                        {s.name}
                      </span>
                    </div>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: '#1A2E4A' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: barColor, transition: 'width 1s ease' }}
                      />
                    </div>
                    <span
                      className="w-8 text-right text-sm flex-shrink-0"
                      style={{ color: '#8BBBD8', fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {s.contactsToday}
                    </span>
                  </div>
                );
              })}
              {ranked.length === 0 && (
                <p className="text-sm" style={{ color: '#2E4A6A' }}>Nenhum atendente configurado.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT (2 cols) ────────────────────────────────── */}
        <div className="col-span-2 flex flex-col gap-4 min-h-0">

          {/* Hot clients */}
          <div
            className="flex-1 rounded-2xl p-5 overflow-y-auto min-h-0"
            style={{ background: '#0D1828', border: '1px solid #1A2E4A' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-[0.18em] mb-4 flex-shrink-0" style={{ color: '#4A6890' }}>
              🔥 Clientes Potenciais
            </h2>
            {data.hotClients.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <span style={{ color: '#1A2E4A', fontSize: 32 }}>💤</span>
                <p className="text-sm" style={{ color: '#2E4A6A' }}>
                  Sem pontuação ainda — atualize as anotações.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.hotClients.map((c, i) => (
                  <div
                    key={i}
                    className="flex gap-3 items-start pb-4 last:pb-0"
                    style={{ borderBottom: i < data.hotClients.length - 1 ? '1px solid #1A2E4A' : 'none' }}
                  >
                    <ScoreBadge score={c.score} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate" style={{ color: '#E0F0FF' }}>
                        {c.title}
                      </p>
                      <p
                        className="text-xs mt-1 leading-relaxed line-clamp-2"
                        style={{ color: '#4A6890', fontStyle: 'italic' }}
                      >
                        "{c.snippet}…"
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs font-semibold" style={{ color: '#00D4FF' }}>{c.assignedTo}</span>
                        <span style={{ color: '#1A2E4A' }}>·</span>
                        <span className="text-xs" style={{ color: '#2E4A6A' }}>
                          há {c.hoursAgo > 0 ? `${c.hoursAgo}h` : 'menos de 1h'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alerts */}
          <div
            className="rounded-2xl p-5 flex-shrink-0"
            style={{ background: '#0D1828', border: '1px solid #1A2E4A' }}
          >
            <h2 className="text-sm font-bold uppercase tracking-[0.18em] mb-3" style={{ color: '#4A6890' }}>
              ⚡ Alertas
            </h2>
            {data.alerts.length === 0 ? (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-sm font-semibold" style={{ color: '#00FF87' }}>
                  Tudo em ordem
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {data.alerts.map((a, i) => {
                  const color = a.type === 'idle' ? '#FFB347' : '#FF6B6B';
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                      style={{ background: `${color}0D`, border: `1px solid ${color}33` }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-sm font-bold" style={{ color }}>{a.seller}</span>
                      <span className="text-xs flex-1" style={{ color: '#4A6890' }}>
                        {a.count > 0 ? `${a.count} ` : ''}{a.label}
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
      <footer
        className="flex items-center justify-between px-6 py-2 flex-shrink-0"
        style={{ borderTop: '1px solid #0D1E30' }}
      >
        <span className="text-xs uppercase tracking-widest" style={{ color: '#1A2E4A', fontFamily: "'JetBrains Mono', monospace" }}>
          Sal Vita · Painel de Controle
        </span>
        <span className="text-xs" style={{ color: '#1A2E4A', fontFamily: "'JetBrains Mono', monospace" }}>
          ↻ atualiza a cada 60s
        </span>
      </footer>
    </div>
  );
}
