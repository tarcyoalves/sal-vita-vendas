import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function CallHistory() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const logoutMutation = trpc.auth.logout.useMutation();

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    setLocation("/");
  };

  const { data: results, isLoading } = trpc.results.list.useQuery(
    {
      sellerId: user?.role === "admin" ? undefined : user?.id,
    },
    { enabled: !!user }
  );

  const filteredResults = results?.filter((result: any) => {
    if (filterStatus !== "all" && result.resultType !== filterStatus) return false;
    if (filterStartDate && new Date(result.completedAt || "") < new Date(filterStartDate)) return false;
    if (filterEndDate && new Date(result.completedAt || "") > new Date(filterEndDate)) return false;
    return true;
  }) || [];

  const getResultColor = (type: string) => {
    switch (type) {
      case "realizada":
        return "saas-badge-success";
      case "convertida":
        return "saas-badge-info";
      case "reagendada":
        return "saas-badge-warning";
      case "nao_atendida":
        return "saas-badge-danger";
      default:
        return "saas-badge-neutral";
    }
  };

  const getResultLabel = (type: string) => {
    switch (type) {
      case "realizada":
        return "Realizada";
      case "convertida":
        return "Convertida";
      case "reagendada":
        return "Reagendada";
      case "nao_atendida":
        return "Não Atendida";
      default:
        return type;
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="pb-4 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Histórico de Ligações & Contatos</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Registro de interações telefônicas, agendamentos e conversões
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="saas-stat-card">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total de Ligações</p>
          <p className="text-2xl font-bold text-slate-900 tracking-tight mt-1">{filteredResults.length}</p>
        </div>

        <div className="saas-stat-card">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Realizadas</p>
          <p className="text-2xl font-bold text-emerald-600 tracking-tight mt-1">
            {filteredResults.filter((r: any) => r.resultType === "realizada").length}
          </p>
        </div>

        <div className="saas-stat-card">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Convertidas</p>
          <p className="text-2xl font-bold text-blue-600 tracking-tight mt-1">
            {filteredResults.filter((r: any) => r.resultType === "convertida").length}
          </p>
        </div>

        <div className="saas-stat-card">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Taxa de Conversão</p>
          <p className="text-2xl font-bold text-[#0C3680] tracking-tight mt-1">
            {filteredResults.length > 0
              ? Math.round(
                  (filteredResults.filter((r: any) => r.resultType === "convertida").length / filteredResults.length) * 100
                )
              : 0}
            %
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="saas-card p-4 space-y-3">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Filtros de Pesquisa</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Status da Ligação</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0C3680]/20 focus:border-[#0C3680] transition-all shadow-xs"
            >
              <option value="all">Todos os Status</option>
              <option value="realizada">Realizada</option>
              <option value="convertida">Convertida</option>
              <option value="reagendada">Reagendada</option>
              <option value="nao_atendida">Não Atendida</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data Inicial</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0C3680]/20 focus:border-[#0C3680] transition-all shadow-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Data Final</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0C3680]/20 focus:border-[#0C3680] transition-all shadow-xs"
            />
          </div>
        </div>
      </div>

      {/* Results List */}
      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-7 w-7 border-2 border-slate-200 border-t-[#0C3680] mx-auto mb-2" />
          <p className="text-xs text-slate-400">Carregando histórico...</p>
        </div>
      ) : filteredResults.length === 0 ? (
        <div className="saas-card text-center py-12 text-slate-400">
          <p className="font-medium text-sm text-slate-600">Nenhuma ligação encontrada</p>
          <p className="text-xs mt-1">Ajuste os filtros acima para visualizar o histórico de contatos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredResults.map((result: any) => (
            <div key={result.id} className="saas-card p-4 hover:border-slate-300 transition-all">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`saas-badge ${getResultColor(result.resultType)}`}>
                      {getResultLabel(result.resultType)}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {result.completedAt
                        ? format(new Date(result.completedAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })
                        : "Sem data"}
                    </span>
                  </div>

                  {result.notes && (
                    <div className="mt-2.5 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                      <p className="text-xs text-slate-700 leading-relaxed">{result.notes}</p>
                    </div>
                  )}

                  {result.nextScheduledDate && (
                    <div className="mt-2 text-xs font-semibold text-[#0C3680] flex items-center gap-1">
                      <span>Próximo agendamento:</span>
                      <span>{format(new Date(result.nextScheduledDate), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
