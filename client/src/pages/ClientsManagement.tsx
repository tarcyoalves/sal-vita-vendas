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

  const activeCount = allTasks?.filter((t) => t.convertedAt).length ?? 0;
  const inactiveCount = (allTasks?.length ?? 0) - activeCount;

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="pb-4 border-b">
        <h1 className="text-xl md:text-3xl font-bold text-blue-900">Gestao de Clientes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Visao geral dos leads e clientes ativos do CRM
        </p>
      </div>

      {/* Contadores */}
      <div className="grid grid-cols-3 gap-3">
        <Card
          className={`cursor-pointer transition ${statusFilter === "all" ? "ring-2 ring-blue-500" : ""}`}
          onClick={() => setStatusFilter("all")}
        >
          <CardContent className="p-3 md:p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-xl md:text-2xl font-bold">{allTasks?.length ?? 0}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition ${statusFilter === "active" ? "ring-2 ring-green-500" : ""}`}
          onClick={() => setStatusFilter("active")}
        >
          <CardContent className="p-3 md:p-4 flex items-center gap-3">
            <UserCheck className="w-8 h-8 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-xl md:text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-gray-500">Ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card
          className={`cursor-pointer transition ${statusFilter === "inactive" ? "ring-2 ring-orange-500" : ""}`}
          onClick={() => setStatusFilter("inactive")}
        >
          <CardContent className="p-3 md:p-4 flex items-center gap-3">
            <UserX className="w-8 h-8 text-orange-500 flex-shrink-0" />
            <div>
              <p className="text-xl md:text-2xl font-bold">{inactiveCount}</p>
              <p className="text-xs text-gray-500">Leads</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-3 md:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar nome, telefone, e-mail ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 p-2 border rounded text-sm"
            />
          </div>
          <select
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="p-2 border rounded text-sm"
          >
            <option value="">Todos os atendentes</option>
            {assignees.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {statusFilter === "active" ? "Clientes Ativos" : statusFilter === "inactive" ? "Leads" : "Todos"}{" "}
            ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-gray-500 py-6 text-center">Carregando...</p>
          ) : filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[540px]">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Telefone</th>
                    <th className="p-2 text-left hidden sm:table-cell">E-mail</th>
                    <th className="p-2 text-left hidden md:table-cell">Atendente</th>
                    <th className="p-2 text-left hidden lg:table-cell">Contatos</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left hidden md:table-cell">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => {
                    const isActive = !!t.convertedAt;
                    return (
                      <tr key={t.id} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium max-w-[180px] truncate">{t.title}</td>
                        <td className="p-2 text-gray-600 whitespace-nowrap">{t.phone || "--"}</td>
                        <td className="p-2 hidden sm:table-cell text-blue-600 text-xs max-w-[180px] truncate">
                          {t.email || "--"}
                        </td>
                        <td className="p-2 hidden md:table-cell text-gray-500 text-xs">{t.assignedTo || "--"}</td>
                        <td className="p-2 hidden lg:table-cell text-center text-gray-500">{t.contactCount}</td>
                        <td className="p-2">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${
                              isActive
                                ? "bg-green-100 text-green-800"
                                : "bg-orange-100 text-orange-700"
                            }`}
                          >
                            {isActive ? "Ativo" : "Lead"}
                          </span>
                        </td>
                        <td className="p-2 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {t.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px]"
                              >
                                {tag}
                              </span>
                            ))}
                            {t.tags.length > 3 && (
                              <span className="text-[10px] text-gray-400">+{t.tags.length - 3}</span>
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
            <div className="text-center py-10">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {search || assignedFilter ? "Nenhum resultado encontrado" : "Nenhum lead cadastrado"}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {search || assignedFilter
                  ? "Tente ajustar os filtros"
                  : "Os leads aparecem aqui quando criados nas Tarefas."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
