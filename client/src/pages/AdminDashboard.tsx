import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Users,
  ClipboardList,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  MessageSquare,
  Settings,
  Scan,
  BarChart2,
  Timer,
  Activity,
} from "lucide-react";
import AttendantDetailModal from '../components/AttendantDetailModal';

// ── AI Analysis Report ───────────────────────────────────────────────────────
// Uses inline styles (not Tailwind dynamic classes) + manual table parser
// (avoids remark-gfm ESM issues and Tailwind JIT missing dynamic strings)

type SectionTheme = { bg: string; border: string; headerBg: string; headerText: string; dot: string };

function getSectionTheme(h: string): SectionTheme {
  if (h.includes('🏆')) return { bg:'#fffbeb', border:'#f59e0b', headerBg:'#fef3c7', headerText:'#92400e', dot:'#f59e0b' };
  if (h.includes('🔴')) return { bg:'#fef2f2', border:'#ef4444', headerBg:'#fee2e2', headerText:'#991b1b', dot:'#ef4444' };
  if (h.includes('📊')) return { bg:'#eff6ff', border:'#3b82f6', headerBg:'#dbeafe', headerText:'#1e40af', dot:'#3b82f6' };
  if (h.includes('✅')) return { bg:'#f0fdf4', border:'#22c55e', headerBg:'#dcfce7', headerText:'#166534', dot:'#22c55e' };
  if (h.includes('🌟')) return { bg:'#faf5ff', border:'#8b5cf6', headerBg:'#ede9fe', headerText:'#5b21b6', dot:'#8b5cf6' };
  return { bg:'#f8fafc', border:'#94a3b8', headerBg:'#f1f5f9', headerText:'#1e293b', dot:'#64748b' };
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*(?:[^*]|\*(?!\*))+\*\*)/g);
  if (parts.length === 1) return text;
  return <>{parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} style={{ fontWeight:700, color:'#111827' }}>{p.slice(2,-2)}</strong>
      : <span key={i}>{p}</span>
  )}</>;
}

function MdSection({ body }: { body: string }) {
  const lines = body.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }

    // Markdown table
    if (t.startsWith('|')) {
      const tl: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tl.push(lines[i]); i++; }
      if (tl.length >= 2) {
        const splitRow = (l: string) => l.split('|').slice(1,-1).map(c => c.trim());
        const headers = splitRow(tl[0]);
        const rows = tl.slice(2).map(splitRow).filter(r => r.some(c => c && !/^[:\-\s]+$/.test(c)));
        nodes.push(
          <div key={k++} style={{ overflowX:'auto', margin:'10px 0', borderRadius:'8px', border:'1px solid #e5e7eb' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px' }}>
              <thead>
                <tr style={{ background:'#f3f4f6' }}>
                  {headers.map((h,j) => <th key={j} style={{ padding:'8px 12px', textAlign:'left', fontWeight:600, color:'#4b5563', borderBottom:'2px solid #e5e7eb', whiteSpace:'nowrap' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row,ri) => (
                  <tr key={ri} style={{ background: ri%2===0 ? '#fff' : '#f9fafb' }}>
                    {row.map((cell,ci) => <td key={ci} style={{ padding:'8px 12px', color:'#374151', borderBottom:'1px solid #f3f4f6', verticalAlign:'top' }}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // ### attendant sub-heading
    if (t.startsWith('### ')) {
      nodes.push(<p key={k++} style={{ fontWeight:700, fontSize:'13px', color:'#1f2937', marginTop:'14px', marginBottom:'4px', paddingTop:'10px', borderTop:'1px solid #f3f4f6' }}>{t.slice(4)}</p>);
      i++; continue;
    }
    // #### small heading
    if (t.startsWith('#### ')) {
      nodes.push(<p key={k++} style={{ fontWeight:600, fontSize:'11px', color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:'10px', marginBottom:'2px' }}>{t.slice(5)}</p>);
      i++; continue;
    }
    // List item
    if (/^[-*•]\s/.test(t) || /^\d+\.\s/.test(t)) {
      const txt = t.replace(/^[-*•]\s/,'').replace(/^\d+\.\s/,'');
      nodes.push(
        <div key={k++} style={{ display:'flex', gap:'8px', marginBottom:'5px', paddingLeft:'2px' }}>
          <span style={{ color:'#9ca3af', flexShrink:0, fontSize:'12px', marginTop:'3px' }}>▸</span>
          <span style={{ fontSize:'13px', color:'#374151', lineHeight:'1.55' }}>{renderInline(txt)}</span>
        </div>
      );
      i++; continue;
    }
    // Paragraph
    nodes.push(<p key={k++} style={{ fontSize:'13px', color:'#374151', lineHeight:'1.6', marginBottom:'4px' }}>{renderInline(t)}</p>);
    i++;
  }
  return <>{nodes}</>;
}

function AiAnalysisReport({ markdown }: { markdown: string }) {
  const raw = markdown.split(/(?=^## )/m).filter(Boolean);
  const intro = raw[0]?.startsWith('## ') ? null : raw[0];
  const sections = raw.filter(s => s.startsWith('## '));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <div style={{ width:8, height:8, borderRadius:'50%', background:'#8b5cf6', flexShrink:0 }} />
        <p style={{ fontWeight:600, color:'#6d28d9', fontSize:'13px', margin:0 }}>📋 Parecer Executivo da IA</p>
      </div>

      {intro && (
        <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'12px 16px', fontSize:'13px', color:'#475569', lineHeight:'1.6' }}>
          {intro.trim()}
        </div>
      )}

      {sections.map((section, i) => {
        const lines = section.trim().split('\n');
        const heading = lines[0].replace(/^##\s*/,'');
        const body = lines.slice(1).join('\n').trim();
        const th = getSectionTheme(heading);
        return (
          <div key={i} style={{ background:th.bg, border:`1.5px solid ${th.border}`, borderRadius:'12px', overflow:'hidden' }}>
            <div style={{ background:th.headerBg, padding:'10px 16px', borderBottom:`1px solid ${th.border}`, display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:th.dot, flexShrink:0 }} />
              <h3 style={{ fontWeight:700, fontSize:'13px', color:th.headerText, margin:0 }}>{heading}</h3>
            </div>
            <div style={{ padding:'14px 16px' }}>
              <MdSection body={body} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { data: sellers = [], isLoading } = trpc.sellers.list.useQuery();
  const { data: tasks = [] } = trpc.tasks.list.useQuery();
  const { data: reminders = [] } = trpc.tasks.reminders.useQuery();
  const analyzeAttendantsMutation = trpc.ai.analyzeAttendants.useMutation();
  const { data: sessionData = [] } = trpc.workSessions.allActiveToday.useQuery(undefined, { refetchInterval: 60_000 });
  const [monitorReport, setMonitorReport] = useState<any[] | null>(null);
  const [monitorSummary, setMonitorSummary] = useState<string | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [reminderFilter, setReminderFilter] = useState<string>("all");
  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);

  const getAiConfig = () => {
    try {
      const configs = JSON.parse(localStorage.getItem('aiConfigs') || '{}') as Record<string, any>;
      for (const id of ['groq', 'gemini']) {
        const c = configs[id];
        if (c?.status === 'configured') return { apiKey: c.apiKey, provider: c.provider, model: c.model };
      }
    } catch { /* ignore */ }
    return undefined;
  };

  const handleRunMonitor = async () => {
    setMonitorLoading(true);
    try {
      const aiCfg = getAiConfig();
      const result = await analyzeAttendantsMutation.mutateAsync(aiCfg);
      setMonitorReport(result.report);
      setMonitorSummary(result.summary);
    } catch (e: any) {
      setMonitorSummary('Erro ao analisar: ' + (e?.message ?? 'Erro desconhecido'));
    } finally {
      setMonitorLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user || user.role !== "admin") return null;

  const pending = (tasks as any[]).filter(t => t.status === 'pending');
  const completed = (tasks as any[]).filter(t => t.status === 'completed');
  const overdue = (tasks as any[]).filter(t => {
    if (t.status === 'completed') return false;
    if (!t.reminderDate) return false;
    return new Date(t.reminderDate) < new Date();
  });
  const completionRate = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

  // Filter reminders based on selection
  const filteredReminders = (reminders as any[]).filter(r => {
    if (reminderFilter === "all") return true;
    if (reminderFilter === "__admin__") return !r.assignedTo || r.assignedTo.trim() === "";
    return r.assignedTo === reminderFilter;
  }).sort((a, b) => {
    const dateA = new Date(a.reminderDate).getTime();
    const dateB = new Date(b.reminderDate).getTime();
    return dateA - dateB;
  });

  const now = new Date();
  const upcomingReminders = filteredReminders.filter(r => new Date(r.reminderDate) > now && r.status === 'pending');
  const overdueReminders = filteredReminders.filter(r => new Date(r.reminderDate) <= now && r.status === 'pending');

  const kpis = [
    {
      label: "Atendentes",
      value: sellers?.length || 0,
      icon: <Users size={22} />,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
    },
    {
      label: "Pendentes",
      value: pending.length,
      icon: <ClipboardList size={22} />,
      color: "text-orange-500",
      bg: "bg-orange-50",
      border: "border-orange-100",
    },
    {
      label: "Com lembrete",
      value: (tasks as any[]).filter(t => t.reminderDate && t.reminderEnabled).length,
      icon: <CheckCircle2 size={22} />,
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-100",
    },
    {
      label: "Atrasados",
      value: overdue.length,
      icon: <TrendingUp size={22} />,
      color: "text-purple-600",
      bg: "bg-purple-50",
      border: "border-purple-100",
    },
  ];

  const quickActions = [
    { label: "Tarefas", path: "/tasks", icon: <ClipboardList size={20} />, color: "bg-blue-600 hover:bg-blue-700" },
    { label: "Atendentes", path: "/attendants", icon: <Users size={20} />, color: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "Chat IA", path: "/ai-chat", icon: <MessageSquare size={20} />, color: "bg-purple-600 hover:bg-purple-700" },
    { label: "Config IA", path: "/ai-settings", icon: <Settings size={20} />, color: "bg-slate-600 hover:bg-slate-700" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-4 md:p-5 text-white flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Olá, {user.name?.split(' ')[0]} 👋</h2>
          <p className="text-slate-300 text-sm mt-0.5">
            {overdue.length > 0
              ? `⚠️ ${overdue.length} tarefa${overdue.length > 1 ? 's' : ''} em atraso`
              : 'Tudo em ordem no sistema'}
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 text-slate-400 text-sm">
          <span>{(() => { try { return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); } catch { const d = new Date(); return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`; } })()}</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className={`border ${kpi.border}`}>
            <CardContent className="pt-5 px-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
                </div>
                <div className={`${kpi.bg} ${kpi.color} p-2 rounded-lg`}>
                  {kpi.icon}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attendants overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Users size={18} className="text-gray-600" />
              Desempenho dos Atendentes
            </span>
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setLocation('/attendants')}>
              Gerenciar <ArrowRight size={13} />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : sellers && sellers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sellers.map((seller) => {
                const sellerTasks = (tasks as any[]).filter(t => t.assignedTo === seller.name || t.userId === seller.userId);
                const withReminder = sellerTasks.filter(t => t.reminderDate && t.reminderEnabled).length;
                const rate = sellerTasks.length > 0 ? Math.round((withReminder / sellerTasks.length) * 100) : 0;
                const sellerOverdue = sellerTasks.filter(t => {
                  if (!t.reminderDate || !t.reminderEnabled) return false;
                  return new Date(t.reminderDate) < new Date();
                }).length;
                return (
                  <div key={seller.id} className="p-4 border rounded-xl bg-white hover:shadow-sm transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-slate-700 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {seller.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-gray-800 truncate">{seller.name}</p>
                        <p className="text-xs text-gray-400 truncate">{seller.email}</p>
                      </div>
                      <button
                        onClick={() => setSelectedSeller(seller)}
                        className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Análise detalhada"
                      >
                        <BarChart2 size={12} />
                        Analisar
                      </button>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${rate >= 70 ? 'bg-green-500' : rate >= 40 ? 'bg-orange-400' : 'bg-red-400'}`}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{rate}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{withReminder}/{sellerTasks.length} com lembrete</span>
                      {sellerOverdue > 0 && (
                        <span className="text-red-500 font-medium">⚠️ {sellerOverdue} atrasada{sellerOverdue > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Users size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Nenhum atendente cadastrado.</p>
              <button onClick={() => setLocation('/attendants')} className="mt-2 text-blue-600 text-sm underline hover:no-underline">
                Adicionar agora
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monitor IA */}
      <Card className="border-purple-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Scan size={18} className="text-purple-600" />
              Monitor IA — Comportamento
            </span>
            <Button
              onClick={handleRunMonitor}
              disabled={monitorLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-1 text-xs"
              size="sm"
            >
              {monitorLoading ? (
                <>
                  <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                  Analisando...
                </>
              ) : (
                <>Analisar Agora</>
              )}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!monitorReport && !monitorSummary && !monitorLoading && (
            <div className="text-center py-8 text-gray-400">
              <Scan size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Clique em "Analisar Agora" para verificar o comportamento de cada atendente.</p>
              <p className="text-xs mt-1 text-gray-300">Detecta: tarefas sem anotação, adiamentos suspeitos, baixa produtividade.</p>
            </div>
          )}

          {monitorReport && monitorReport.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {monitorReport.map((r: any) => (
                <div key={r.sellerId} className={`p-4 rounded-xl border-2 ${r.status === '🔴 Suspeito' ? 'border-red-300 bg-red-50' : r.status === '🟡 Atenção' ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-gray-800">{r.name}</p>
                      <p className="text-xs text-gray-500">{r.email}</p>
                    </div>
                    <span className="text-sm font-bold">{r.status}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 text-center mb-2">
                    <div className="bg-white rounded-lg p-1.5">
                      <p className="text-base font-bold text-blue-600">{r.total}</p>
                      <p className="text-xs text-gray-500">Clientes</p>
                    </div>
                    <div className="bg-white rounded-lg p-1.5">
                      <p className={`text-base font-bold ${r.overdue > 0 ? 'text-red-600' : 'text-gray-500'}`}>{r.overdue}</p>
                      <p className="text-xs text-gray-500">Vencidos</p>
                    </div>
                    <div className="bg-white rounded-lg p-1.5">
                      <p className={`text-base font-bold ${r.noNotes > 0 ? 'text-orange-500' : 'text-gray-500'}`}>{r.noNotes}</p>
                      <p className="text-xs text-gray-500">Sem nota</p>
                    </div>
                    <div className="bg-white rounded-lg p-1.5">
                      <p className={`text-base font-bold ${r.disabledReminders > 0 ? 'text-red-700' : 'text-gray-500'}`}>{r.disabledReminders}</p>
                      <p className="text-xs text-gray-500">Desativados</p>
                    </div>
                  </div>
                  {r.flags.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {r.flags.map((flag: string, i: number) => (
                        <p key={i} className="text-xs text-red-700 bg-red-100 px-2 py-1 rounded">⚠️ {flag}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {monitorSummary && (
            <AiAnalysisReport markdown={monitorSummary} />
          )}
        </CardContent>
      </Card>

      {/* Work Sessions */}
      <Card className="border-cyan-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Timer size={18} className="text-cyan-600" />
              Sessões de Trabalho Hoje
            </span>
            <span className="text-xs text-gray-400 font-normal">atualiza a cada 60s</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(sessionData as any[]).map((row: any) => {
              const s = row.session;
              const idleMin = Math.floor((row.idleSinceMs ?? 0) / 60000);
              const isIdle = s?.status === 'active' && idleMin >= 30;
              const isPaused = s?.status === 'paused';
              const workedH = s ? Math.floor(s.workedMs / 3600000) : 0;
              const workedM = s ? Math.floor((s.workedMs % 3600000) / 60000) : 0;
              const startTime = s ? (() => {
                const d = new Date(s.startedAt);
                return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
              })() : null;
              const lastAct = row.lastActivityDate ? (() => {
                const min = Math.floor((Date.now() - new Date(row.lastActivityDate).getTime()) / 60000);
                return min < 1 ? '<1min' : min < 60 ? `${min}min` : `${Math.floor(min/60)}h`;
              })() : null;

              return (
                <div key={row.sellerId} className={`flex items-center gap-3 p-3 rounded-xl border ${
                  isIdle ? 'border-amber-200 bg-amber-50' :
                  isPaused ? 'border-yellow-200 bg-yellow-50' :
                  s ? 'border-green-200 bg-green-50' : 'border-gray-100 bg-gray-50'
                }`}>
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                    isIdle ? 'bg-amber-400' : isPaused ? 'bg-yellow-400' : s ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                  }`} />

                  {/* Name */}
                  <div className="w-28 flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{row.name}</p>
                  </div>

                  {/* Status label */}
                  <div className="w-24 flex-shrink-0">
                    {!s && <span className="text-xs text-gray-400">Sem sessão</span>}
                    {s?.status === 'active' && !isIdle && <span className="text-xs font-semibold text-green-700 flex items-center gap-1"><Activity size={11} /> Ativo</span>}
                    {isIdle && <span className="text-xs font-semibold text-amber-700">⚠ Ocioso {idleMin}min</span>}
                    {isPaused && <span className="text-xs font-semibold text-yellow-700">⏸ Pausado</span>}
                  </div>

                  {/* Metrics */}
                  <div className="flex items-center gap-4 flex-1 text-xs text-gray-600 flex-wrap">
                    {startTime && (
                      <span title="Horário de início">🕐 <strong>{startTime}</strong></span>
                    )}
                    {s && (
                      <span title="Tempo trabalhado (descontando pausas)">
                        ⏱ <strong>{workedH > 0 ? `${workedH}h ` : ''}{workedM}min</strong>
                      </span>
                    )}
                    <span title="Contatos/tarefas tocados hoje">
                      📞 <strong>{row.contactsToday}</strong> contatos
                    </span>
                    {lastAct && (
                      <span title="Última tarefa atualizada">🕒 último: <strong>{lastAct} atrás</strong></span>
                    )}
                  </div>
                </div>
              );
            })}
            {(sessionData as any[]).length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">Nenhum atendente com sessão hoje.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reminders Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <ClipboardList size={18} className="text-gray-600" />
              Lembretes
            </span>
            <select
              value={reminderFilter}
              onChange={(e) => setReminderFilter(e.target.value)}
              className="px-3 py-1 border rounded-lg text-xs font-normal bg-white"
            >
              <option value="all">👁️ Todos</option>
              <option value="__admin__">🔑 Administrador</option>
              {(sellers ?? []).map((s: any) => (
                <option key={s.id} value={s.name}>👤 {s.name}</option>
              ))}
            </select>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredReminders.length === 0 ? (
            <div className="text-center py-6 text-gray-400">
              <ClipboardList size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum lembrete</p>
            </div>
          ) : (
            <>
              {overdueReminders.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-red-600 mb-2">🚨 ATRASADOS ({overdueReminders.length})</p>
                  <div className="space-y-2">
                    {overdueReminders.slice(0, 5).map((reminder: any) => (
                      <div key={reminder.id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <p className="font-medium text-sm text-red-900">{reminder.title}</p>
                          <span className="text-xs text-red-700">{(() => { try { const d=new Date(reminder.reminderDate); const p=(n:number)=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}`; } catch { return ''; } })()}</span>
                        </div>
                        {reminder.assignedTo && <p className="text-xs text-red-600">👤 {reminder.assignedTo}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {upcomingReminders.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-blue-600 mb-2">🔔 PRÓXIMOS ({upcomingReminders.length})</p>
                  <div className="space-y-2">
                    {upcomingReminders.slice(0, 5).map((reminder: any) => (
                      <div key={reminder.id} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start justify-between mb-1">
                          <p className="font-medium text-sm text-blue-900">{reminder.title}</p>
                          <span className="text-xs text-blue-700">{(() => { try { const d=new Date(reminder.reminderDate); const p=(n:number)=>String(n).padStart(2,'0'); return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`; } catch { return ''; } })()}</span>
                        </div>
                        {reminder.assignedTo && <p className="text-xs text-blue-600">👤 {reminder.assignedTo}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Ações Rápidas</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => setLocation(action.path)}
              className={`${action.color} text-white rounded-xl p-4 text-center transition-all hover:scale-[1.02] active:scale-95 flex flex-col items-center gap-2`}
            >
              {action.icon}
              <span className="text-sm font-medium">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Attendant Detail Modal */}
      {selectedSeller && (
        <AttendantDetailModal
          seller={selectedSeller}
          allTasks={tasks as any[]}
          allSellers={sellers as any[]}
          onClose={() => setSelectedSeller(null)}
        />
      )}

    </div>
  );
}
