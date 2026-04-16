import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import { useLocation } from "wouter";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: sellers, isLoading } = trpc.sellers.list.useQuery();
  const { data: tasks = [] } = trpc.tasks.list.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();
  const analyzeAttendantsMutation = trpc.ai.analyzeAttendants.useMutation();
  const [monitorReport, setMonitorReport] = useState<any[] | null>(null);
  const [monitorSummary, setMonitorSummary] = useState<string | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  const handleRunMonitor = async () => {
    setMonitorLoading(true);
    try {
      const result = await analyzeAttendantsMutation.mutateAsync();
      setMonitorReport(result.report);
      setMonitorSummary(result.summary);
    } catch (e: any) {
      setMonitorSummary('Erro ao analisar: ' + (e?.message ?? 'Erro desconhecido'));
    } finally {
      setMonitorLoading(false);
    }
  };

  if (!user || user.role !== "admin") {
    return <div className="p-4">Acesso negado</div>;
  }

  const pending = (tasks as any[]).filter(t => t.status === 'pending');
  const completed = (tasks as any[]).filter(t => t.status === 'completed');
  const completionRate = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <a href="/admin/dashboard" className="hover:opacity-80 transition flex-shrink-0">
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663471406798/ebiDeAqNiPYHcVdFoPsqfV/logoSALVITA_grande_3761478e.png"
                alt="Sal Vita"
                className="h-8 cursor-pointer"
              />
            </a>
            <h1 className="text-base sm:text-xl font-bold text-blue-900 truncate">📊 Dashboard</h1>
          </div>
          {/* Desktop nav */}
          <div className="hidden sm:flex gap-2 flex-shrink-0">
            <a href="/attendants"><Button variant="outline" size="sm">👥 Atendentes</Button></a>
            <a href="/tasks"><Button variant="outline" size="sm">📋 Tarefas</Button></a>
            <a href="/ai-chat"><Button variant="outline" size="sm">💬 Chat IA</Button></a>
            <a href="/ai-settings"><Button variant="outline" size="sm">⚙️ Config IA</Button></a>
            <Button variant="destructive" size="sm" onClick={handleLogout}>Sair</Button>
          </div>
          {/* Mobile nav — icon-only */}
          <div className="flex sm:hidden gap-1 flex-shrink-0">
            <a href="/attendants"><Button variant="outline" size="sm" className="px-2">👥</Button></a>
            <a href="/tasks"><Button variant="outline" size="sm" className="px-2">📋</Button></a>
            <a href="/ai-chat"><Button variant="outline" size="sm" className="px-2">💬</Button></a>
            <a href="/ai-settings"><Button variant="outline" size="sm" className="px-2">⚙️</Button></a>
            <Button variant="destructive" size="sm" className="px-2" onClick={handleLogout}>✕</Button>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5 text-center">
              <p className="text-3xl font-bold text-blue-600">{sellers?.length || 0}</p>
              <p className="text-sm text-gray-500 mt-1">Atendentes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 text-center">
              <p className="text-3xl font-bold text-orange-500">{pending.length}</p>
              <p className="text-sm text-gray-500 mt-1">Tarefas Pendentes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 text-center">
              <p className="text-3xl font-bold text-green-600">{completed.length}</p>
              <p className="text-sm text-gray-500 mt-1">Tarefas Concluídas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 text-center">
              <p className="text-3xl font-bold text-purple-600">{completionRate}%</p>
              <p className="text-sm text-gray-500 mt-1">Taxa de Conclusão</p>
            </CardContent>
          </Card>
        </div>

        {/* Attendants overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>👥 Atendentes Cadastrados</span>
              <a href="/attendants"><Button size="sm" variant="outline">Gerenciar</Button></a>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-gray-500">Carregando...</p>
            ) : sellers && sellers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {sellers.map((seller) => {
                  const sellerTasks = (tasks as any[]).filter(t => t.userId === seller.userId);
                  const done = sellerTasks.filter(t => t.status === 'completed').length;
                  const rate = sellerTasks.length > 0 ? Math.round((done / sellerTasks.length) * 100) : 0;
                  return (
                    <div key={seller.id} className="p-3 border rounded-lg bg-white">
                      <p className="font-semibold">{seller.name}</p>
                      <p className="text-xs text-gray-500">{seller.email}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-600">{rate}%</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{done}/{sellerTasks.length} tarefas</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500">Nenhum atendente cadastrado. <a href="/attendants" className="text-blue-600 underline">Adicionar agora</a></p>
            )}
          </CardContent>
        </Card>

        {/* Monitor IA */}
        <Card className="border-purple-200">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>🕵️ Monitor IA — Desempenho e Comportamento</span>
              <Button onClick={handleRunMonitor} disabled={monitorLoading} className="bg-purple-600 hover:bg-purple-700 text-white" size="sm">
                {monitorLoading ? '⏳ Analisando...' : '🔍 Analisar Agora'}
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!monitorReport && !monitorSummary && !monitorLoading && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-4xl mb-2">🤖</p>
                <p>Clique em "Analisar Agora" para a IA verificar o comportamento de cada atendente.</p>
                <p className="text-xs mt-1">Detecta: tarefas concluídas sem anotação, adiamentos suspeitos, baixa produtividade.</p>
              </div>
            )}

            {monitorLoading && (
              <div className="text-center py-8 text-purple-600">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-3" />
                <p>Analisando dados de todos os atendentes...</p>
              </div>
            )}

            {monitorReport && monitorReport.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {monitorReport.map((r: any) => (
                  <div key={r.sellerId} className={`p-4 rounded-xl border-2 ${r.status === '🔴 Suspeito' ? 'border-red-300 bg-red-50' : r.status === '🟡 Atenção' ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-gray-800">{r.name}</p>
                        <p className="text-xs text-gray-500">{r.email}</p>
                      </div>
                      <span className="text-sm font-bold">{r.status}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center my-2">
                      <div className="bg-white rounded p-1">
                        <p className="text-lg font-bold text-blue-600">{r.completionRate}%</p>
                        <p className="text-xs text-gray-500">Conclusão</p>
                      </div>
                      <div className="bg-white rounded p-1">
                        <p className="text-lg font-bold text-orange-500">{r.overdue}</p>
                        <p className="text-xs text-gray-500">Atrasadas</p>
                      </div>
                      <div className="bg-white rounded p-1">
                        <p className="text-lg font-bold text-gray-700">{r.total}</p>
                        <p className="text-xs text-gray-500">Total</p>
                      </div>
                    </div>
                    {r.flags.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {r.flags.map((flag: string, i: number) => (
                          <p key={i} className="text-xs text-red-700 bg-red-100 px-2 py-1 rounded">⚠️ {flag}</p>
                        ))}
                      </div>
                    )}
                    {r.suspicionScore > 0 && (
                      <p className="text-xs text-gray-400 mt-2">Score de suspeita: {r.suspicionScore}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {monitorSummary && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <p className="font-semibold text-purple-800 mb-2">📋 Parecer Executivo da IA:</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{monitorSummary}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <a href="/tasks"><div className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl p-4 text-center cursor-pointer transition"><p className="text-2xl">📋</p><p className="font-medium mt-1">Tarefas</p></div></a>
          <a href="/attendants"><div className="bg-green-600 hover:bg-green-700 text-white rounded-xl p-4 text-center cursor-pointer transition"><p className="text-2xl">👥</p><p className="font-medium mt-1">Atendentes</p></div></a>
          <a href="/ai-chat"><div className="bg-purple-600 hover:bg-purple-700 text-white rounded-xl p-4 text-center cursor-pointer transition"><p className="text-2xl">💬</p><p className="font-medium mt-1">Chat IA</p></div></a>
          <a href="/ai-settings"><div className="bg-gray-600 hover:bg-gray-700 text-white rounded-xl p-4 text-center cursor-pointer transition"><p className="text-2xl">⚙️</p><p className="font-medium mt-1">Config IA</p></div></a>
        </div>

      </div>
    </div>
  );
}
