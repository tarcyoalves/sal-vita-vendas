import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import ReactMarkdown from 'react-markdown';
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
} from "lucide-react";
import AttendantDetailModal from '../components/AttendantDetailModal';

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const { data: sellers = [], isLoading } = trpc.sellers.list.useQuery();
  const { data: tasks = [] } = trpc.tasks.list.useQuery();
  const { data: reminders = [] } = trpc.tasks.reminders.useQuery();
  const analyzeAttendantsMutation = trpc.ai.analyzeAttendants.useMutation();
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
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <p className="font-semibold text-purple-800 mb-3 text-sm">📋 Parecer Executivo da IA</p>
              <div className="text-sm text-gray-700 prose prose-sm max-w-none
                prose-headings:text-purple-900 prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1
                prose-h2:text-base prose-h3:text-sm
                prose-strong:text-gray-900
                prose-li:my-0 prose-ul:my-1 prose-ol:my-1
                prose-p:my-1">
                <ReactMarkdown>{monitorSummary}</ReactMarkdown>
              </div>
            </div>
          )}
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
