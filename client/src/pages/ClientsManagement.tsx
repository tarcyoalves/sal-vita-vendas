import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { useState, useMemo } from "react";
import { Users, UserCheck, UserX, Search } from "lucide-react";

type StatusFilter = "all" | "active" | "inactive";

export default function ClientsManagement() {
  const { user, loading: authLoading } = useAuth();
  const { data: allTasks, isLoading } = trpc.tasks.list.useQuery();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [assignedFilter, setAssignedFilter] = useState("");

  // Hooks precisam ficar todos antes de qualquer return condicional (Regras
  // de Hooks) — senão o React quebra com "Rendered more hooks than during
  // the previous render" (erro #310) assim que authLoading vira false.
  const assignees = useMemo(() => {
    if (!allTasks) return [];
    const set = new Set<string>();
    for (const t of allTasks) {
      if (t.assignedTo) set.add(t.assignedTo);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allTasks]);

  const filtered = useMemo(() => {
    if (!allTasks) return [];
    return allTasks.filter((t) => {
      if (statusFilter === "active" && !t.convertedAt) return false;
      if (statusFilter === "inactive" && t.convertedAt) return false;
      if (assignedFilter && t.assignedTo !== assignedFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchPhone = t.phone?.toLowerCase().includes(q);
        const matchEmail = t.email?.toLowerCase().includes(q);
        const matchCnpj = t.cnpj?.includes(q);
        if (!matchTitle && !matchPhone && !matchEmail && !matchCnpj) return false;
      }
      return true;
    });
  }, [allTasks, statusFilter, assignedFilter, search]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return <div className="p-4">Acesso negado</div>;
  }

  const activeCount = allTasks?.filter((t) => t.convertedAt).length ?? 0;
  const inactiveCount = (allTasks?.length ?? 0) - activeCount;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="pb-4 border-b border-slate-200/80 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Gestão de Clientes</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Visão consolidada dos leads e clientes ativos do CRM Sal Vita
          </p>
        </div>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className={`saas-stat-card cursor-pointer transition-all ${statusFilter === "all" ? "ring-2 ring-[#0C3680] border-[#0C3680]/30" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#0C3680] border border-blue-100 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total de Base</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight leading-none mt-1">{allTasks?.length ?? 0}</p>
            </div>
          </div>
        </div>

        <div
          className={`saas-stat-card cursor-pointer transition-all ${statusFilter === "active" ? "ring-2 ring-emerald-500 border-emerald-300" : ""}`}
          onClick={() => setStatusFilter("active")}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center flex-shrink-0">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Clientes Ativos</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight leading-none mt-1">{activeCount}</p>
            </div>
          </div>
        </div>

        <div
          className={`saas-stat-card cursor-pointer transition-all ${statusFilter === "inactive" ? "ring-2 ring-amber-500 border-amber-300" : ""}`}
          onClick={() => setStatusFilter("inactive")}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center flex-shrink-0">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Leads em Prospecção</p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight leading-none mt-1">{inactiveCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="saas-card p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, telefone, e-mail ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0C3680]/20 focus:border-[#0C3680] transition-all shadow-xs"
          />
        </div>
        <select
          value={assignedFilter}
          onChange={(e) => setAssignedFilter(e.target.value)}
          className="px-3 py-2 bg-slate-50/50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0C3680]/20 focus:border-[#0C3680] transition-all shadow-xs"
        >
          <option value="">Todos os atendentes</option>
          {assignees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      <div className="saas-card overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <span>{statusFilter === "active" ? "Clientes Ativos" : statusFilter === "inactive" ? "Leads em Prospecção" : "Todos os Clientes & Leads"}</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">{filtered.length}</span>
          </h2>
        </div>
        <div>
          {isLoading ? (
            <div className="py-12 text-center">
              <div className="animate-spin rounded-full h-7 w-7 border-2 border-slate-200 border-t-[#0C3680] mx-auto mb-2" />
              <p className="text-xs text-slate-400">Carregando dados...</p>
            </div>
          ) : filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[540px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3 text-left">Nome / Razão Social</th>
                    <th className="px-4 py-3 text-left">Telefone</th>
                    <th className="px-4 py-3 text-left hidden sm:table-cell">E-mail</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Atendente</th>
                    <th className="px-4 py-3 text-center hidden lg:table-cell">Contatos</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left hidden md:table-cell">Tags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((t) => {
                    const isActive = !!t.convertedAt;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900 max-w-[200px] truncate">{t.title}</td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs whitespace-nowrap">{t.phone || "--"}</td>
                        <td className="px-4 py-3 hidden sm:table-cell text-slate-600 text-xs max-w-[180px] truncate">
                          {t.email || "--"}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-slate-500 text-xs font-medium">{t.assignedTo || "--"}</td>
                        <td className="px-4 py-3 hidden lg:table-cell text-center text-slate-500 text-xs font-mono font-medium">{t.contactCount}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`saas-badge ${
                              isActive
                                ? "saas-badge-success"
                                : "saas-badge-warning"
                            }`}
                          >
                            {isActive ? "Cliente Ativo" : "Lead"}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {t.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200/60"
                              >
                                {tag}
                              </span>
                            ))}
                            {t.tags.length > 3 && (
                              <span className="text-[10px] text-slate-400 font-medium self-center">+{t.tags.length - 3}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3 stroke-[1.5]" />
              <p className="text-slate-600 font-medium text-sm">
                {search || assignedFilter ? "Nenhum resultado encontrado" : "Nenhum cliente ou lead cadastrado"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {search || assignedFilter
                  ? "Tente refinar os termos da sua busca ou filtros"
                  : "Os leads aparecem aqui automaticamente quando criados nas Tarefas."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
