import { useState, useMemo } from "react";
import { useFatStore } from "../../lib/faturamento/store";
import { totalPedido, totalItens, mesAtual, isoNoMes, formatBRL } from "../../lib/faturamento/calc";
import type { Pedido, FiltroMes } from "../../lib/faturamento/types";
import { trpc } from "../../lib/trpc";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// ── CSV export helper (same pattern as AdminDashboard) ─────────────────────
function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (cell: string | number) => {
    const s = String(cell ?? "");
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(";"));
  const csv = "﻿" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function prevMes(f: FiltroMes): FiltroMes {
  return f.mes === 0 ? { ano: f.ano - 1, mes: 11 } : { ano: f.ano, mes: f.mes - 1 };
}
function nextMes(f: FiltroMes): FiltroMes {
  return f.mes === 11 ? { ano: f.ano + 1, mes: 0 } : { ano: f.ano, mes: f.mes + 1 };
}

function estimatedTotal(pedido: Pedido): number {
  const itensBase = pedido.itensEstimadoSnapshot ?? pedido.itens;
  return totalItens(itensBase);
}

export default function BillingReport() {
  const { pedidos: allPedidos } = useFatStore();
  const { data: sellers = [] } = trpc.sellers.listWithRole.useQuery();

  // Filters
  const [statusFilter, setStatusFilter] = useState<"todos" | "estimado" | "faturado">("todos");
  const [sellerFilter, setSellerFilter] = useState<string>("todos");
  const [mesFilter, setMesFilter] = useState<FiltroMes | null>(mesAtual);
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [ufFilter, setUfFilter] = useState("");

  // Derived: distinct UFs from orders
  const distinctUFs = useMemo(
    () => [...new Set(allPedidos.map((p) => p.uf).filter(Boolean))].sort(),
    [allPedidos],
  );

  // Derived: seller names
  const sellerNames = useMemo(
    () =>
      [...new Set([
        ...(sellers as { id: number; name: string }[]).map((s) => s.name),
        ...allPedidos.map((p) => p.sellerName).filter(Boolean),
      ])].sort(),
    [sellers, allPedidos],
  );

  // Apply filters
  const filtered = useMemo(() => {
    let result = allPedidos;

    if (statusFilter !== "todos") {
      result = result.filter((p) => p.status === statusFilter);
    }

    if (sellerFilter !== "todos") {
      result = result.filter((p) => p.sellerName === sellerFilter);
    }

    if (!showAllMonths && mesFilter) {
      result = result.filter((p) => isoNoMes(p.criadoEm, mesFilter));
    }

    if (ufFilter.trim()) {
      const ufLower = ufFilter.trim().toLowerCase();
      result = result.filter((p) => p.uf.toLowerCase().includes(ufLower));
    }

    return result;
  }, [allPedidos, statusFilter, sellerFilter, mesFilter, showAllMonths, ufFilter]);

  // Totals
  const totalEstimado = useMemo(() => filtered.reduce((s, p) => s + estimatedTotal(p), 0), [filtered]);
  const totalFaturado = useMemo(
    () => filtered.filter((p) => p.status === "faturado").reduce((s, p) => s + totalPedido(p), 0),
    [filtered],
  );

  // CSV
  const handleExport = () => {
    const headers = ["CNPJ", "Razao Social", "Cidade", "UF", "Atendente", "Status", "Valor Estimado", "Valor Faturado"];
    const csvRows = filtered.map((p) => [
      p.cnpj,
      p.razaoSocial,
      p.cidade,
      p.uf,
      p.sellerName,
      p.status === "faturado" ? "Faturado" : "Estimado",
      estimatedTotal(p).toFixed(2).replace(".", ","),
      p.status === "faturado" ? totalPedido(p).toFixed(2).replace(".", ",") : "",
    ]);
    const dateStr = new Date().toISOString().slice(0, 10);
    exportCsv(`relatorio-faturamento-${dateStr}.csv`, headers, csvRows);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="todos">Todos</option>
                <option value="estimado">Estimado</option>
                <option value="faturado">Faturado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Atendente</label>
              <select
                value={sellerFilter}
                onChange={(e) => setSellerFilter(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="todos">Todos</option>
                {sellerNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mes</label>
              {showAllMonths ? (
                <button
                  onClick={() => { setShowAllMonths(false); setMesFilter(mesAtual()); }}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-left text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  Todos os meses (filtrar)
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => mesFilter && setMesFilter(prevMes(mesFilter))}
                    className="p-1.5 rounded border hover:bg-gray-50 transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="flex-1 text-center text-sm font-medium text-gray-700">
                    {mesFilter ? `${MONTH_NAMES[mesFilter.mes].slice(0, 3)}/${mesFilter.ano}` : "--"}
                  </span>
                  <button
                    onClick={() => mesFilter && setMesFilter(nextMes(mesFilter))}
                    className="p-1.5 rounded border hover:bg-gray-50 transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                  <button
                    onClick={() => setShowAllMonths(true)}
                    className="text-[10px] text-blue-600 hover:underline ml-1"
                  >
                    Todos
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">UF</label>
              <select
                value={ufFilter}
                onChange={(e) => setUfFilter(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="">Todas</option>
                {distinctUFs.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-1"
                onClick={handleExport}
                disabled={filtered.length === 0}
              >
                <Download size={14} /> Exportar CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 px-4 text-center">
          <FileText size={28} className="text-slate-300" />
          <p className="text-sm text-slate-500 max-w-sm">
            Nenhum pedido encontrado com os filtros selecionados.
          </p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">CNPJ</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Razao Social</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Cidade</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">UF</th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Atendente</th>
                    <th className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">Status</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Valor Estimado</th>
                    <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Valor Faturado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={p.id} className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors">
                      <td className="px-3 py-3 text-gray-600 font-mono text-xs">{p.cnpj || "--"}</td>
                      <td className="px-3 py-3 font-medium text-gray-800 max-w-[200px] truncate">{p.razaoSocial || p.clienteNome || "--"}</td>
                      <td className="px-3 py-3 text-gray-600">{p.cidade || "--"}</td>
                      <td className="px-3 py-3 text-gray-600">{p.uf || "--"}</td>
                      <td className="px-3 py-3 text-gray-600">{p.sellerName || "--"}</td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            p.status === "faturado"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {p.status === "faturado" ? "Faturado" : "Estimado"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600">{formatBRL(estimatedTotal(p))}</td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {p.status === "faturado" ? (
                          <span className="text-emerald-700">{formatBRL(totalPedido(p))}</span>
                        ) : (
                          <span className="text-gray-400">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                  <tr className="font-semibold text-gray-800">
                    <td className="px-3 py-3" colSpan={6}>
                      Total ({filtered.length} pedido{filtered.length !== 1 ? "s" : ""})
                    </td>
                    <td className="px-3 py-3 text-right">{formatBRL(totalEstimado)}</td>
                    <td className="px-3 py-3 text-right text-emerald-700">{formatBRL(totalFaturado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
