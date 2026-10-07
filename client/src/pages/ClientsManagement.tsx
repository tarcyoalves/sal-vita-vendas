import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { useState, useMemo } from "react";
import { Users, Search } from "lucide-react";
import { QueryError } from "../components/QueryError";
import { Page, PageHeader, Panel, PanelHeader, StatStrip, Stat, EmptyState, AccessDenied } from "../components/layout/Page";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

type StatusFilter = "all" | "active" | "inactive";

export default function ClientsManagement() {
  const { user, loading: authLoading } = useAuth();
  const { data: allTasks, isLoading, isError, isFetching, refetch } = trpc.tasks.list.useQuery();

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
      <Page>
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-20 w-full" />
      </Page>
    );
  }

  if (!user || user.role !== "admin") {
    return <AccessDenied area="Clientes" />;
  }

  const activeCount = allTasks?.filter((t) => t.convertedAt).length ?? 0;
  const inactiveCount = (allTasks?.length ?? 0) - activeCount;
  const hasFilter = !!(search || assignedFilter);

  return (
    <Page>
      <PageHeader
        title="Gestão de Clientes"
        description="Leads e clientes ativos do CRM, com atendente responsável e status."
      />

      <StatStrip className="sm:grid-cols-3">
        <Stat label="Total da base" value={allTasks?.length ?? 0} onClick={() => setStatusFilter("all")} />
        <Stat label="Clientes ativos" value={activeCount} tone="success" onClick={() => setStatusFilter("active")} />
        <Stat label="Leads em prospecção" value={inactiveCount} tone="warning" onClick={() => setStatusFilter("inactive")} />
      </StatStrip>

      <Panel>
        <PanelHeader
          title={statusFilter === "active" ? "Clientes ativos" : statusFilter === "inactive" ? "Leads em prospecção" : "Todos os clientes e leads"}
          description={`${filtered.length} ${filtered.length === 1 ? "registro" : "registros"}`}
        />
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 px-4 py-3 sm:grid-cols-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input
              type="text"
              aria-label="Buscar cliente"
              placeholder="Buscar por nome, telefone, e-mail ou CNPJ"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            aria-label="Filtrar por atendente"
            value={assignedFilter}
            onChange={(e) => setAssignedFilter(e.target.value)}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-brand-500/30 max-md:h-10"
          >
            <option value="">Todos os atendentes</option>
            {assignees.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="divide-y divide-slate-200" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="ml-auto h-5 w-20" />
              </div>
            ))}
          </div>
        ) : isError && !allTasks ? (
          <QueryError className="m-4" onRetry={() => { void refetch(); }} retrying={isFetching} />
        ) : filtered.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome / razão social</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="hidden sm:table-cell">E-mail</TableHead>
                <TableHead className="hidden md:table-cell">Atendente</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Contatos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => {
                const isActive = !!t.convertedAt;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-[200px] truncate font-medium text-slate-900">{t.title}</TableCell>
                    <TableCell className="whitespace-nowrap text-slate-700">{t.phone || "--"}</TableCell>
                    <TableCell className="hidden max-w-[180px] truncate text-slate-700 sm:table-cell">{t.email || "--"}</TableCell>
                    <TableCell className="hidden text-slate-700 md:table-cell">{t.assignedTo || "--"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-slate-700 lg:table-cell">{t.contactCount}</TableCell>
                    <TableCell>
                      <Badge variant={isActive ? "success" : "warning"}>{isActive ? "Cliente ativo" : "Lead"}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {t.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="neutral">{tag}</Badge>
                        ))}
                        {t.tags.length > 3 && (
                          <span className="self-center text-xs text-slate-500">+{t.tags.length - 3}</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<Users />}
            title={hasFilter ? "Nenhum resultado encontrado" : "Nenhum cliente ou lead cadastrado"}
            description={
              hasFilter
                ? "Tente outros termos de busca ou limpe os filtros."
                : "Os leads aparecem aqui automaticamente quando criados nas Tarefas."
            }
          />
        )}
      </Panel>
    </Page>
  );
}
