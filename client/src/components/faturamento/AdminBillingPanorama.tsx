import { useState, useMemo } from "react";
import { useFatStore } from "../../lib/faturamento/store";
import {
  panoramaPorAtendente,
  somarResumos,
  mesAtual,
  formatBRL,
} from "../../lib/faturamento/calc";
import type { FiltroMes, ResumoAtendente } from "../../lib/faturamento/types";
import { trpc } from "../../lib/trpc";
import { Card, CardContent } from "../ui/card";
import { ChevronLeft, ChevronRight, BarChart2, Users } from "lucide-react";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function prevMes(f: FiltroMes): FiltroMes {
  return f.mes === 0 ? { ano: f.ano - 1, mes: 11 } : { ano: f.ano, mes: f.mes - 1 };
}
function nextMes(f: FiltroMes): FiltroMes {
  return f.mes === 11 ? { ano: f.ano + 1, mes: 0 } : { ano: f.ano, mes: f.mes + 1 };
}

export default function AdminBillingPanorama() {
  const [filtro, setFiltro] = useState<FiltroMes>(mesAtual);
  const { pedidos, comissoes, actions } = useFatStore();
  const { data: sellers = [] } = trpc.sellers.listWithRole.useQuery();

  const sellerList = useMemo(
    () => (sellers as { id: number; name: string }[]).map((s) => ({ id: s.id, name: s.name })),
    [sellers],
  );

  const rows: ResumoAtendente[] = useMemo(
    () => panoramaPorAtendente(pedidos, sellerList, comissoes, filtro),
    [pedidos, sellerList, comissoes, filtro],
  );

  const totals = useMemo(() => somarResumos(rows), [rows]);
  const maxEmbarcado = useMemo(
    () => Math.max(...rows.map((r) => r.totalEmbarcado), 1),
    [rows],
  );

  const hasData = rows.some(
    (r) => r.totalVendido > 0 || r.totalEmbarcado > 0 || r.qtdPedidos > 0,
  );

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFiltro(prevMes)}
            className="p-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold text-gray-700 min-w-[140px] text-center">
            {MONTH_NAMES[filtro.mes]} {filtro.ano}
          </span>
          <button
            onClick={() => setFiltro(nextMes)}
            className="p-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-10 px-4 text-center">
          <BarChart2 size={28} className="text-slate-300" />
          <p className="text-sm text-slate-500 max-w-sm">
            Nenhum pedido encontrado para {MONTH_NAMES[filtro.mes]} {filtro.ano}.
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Atendente</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">% Com.</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Vendido</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Embarcado</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Com. Prevista</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Com. a Pagar</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pedidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.sellerId ?? "none"}
                        className="border-b border-slate-100 hover:bg-blue-50/50 transition-colors"
                      >
                        <td className="px-3 py-3 font-medium text-gray-800">{r.sellerName || "Sem atendente"}</td>
                        <td className="px-3 py-3 text-right text-gray-600">{r.comissaoPct}%</td>
                        <td className="px-3 py-3 text-right text-gray-600">{formatBRL(r.totalVendido)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-emerald-700">{formatBRL(r.totalEmbarcado)}</td>
                        <td className="px-3 py-3 text-right text-gray-600">{formatBRL(r.comissaoPrevista)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-blue-700">{formatBRL(r.comissaoEmbarcada)}</td>
                        <td className="px-3 py-3 text-right text-gray-600">{r.qtdPedidos}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                    <tr className="font-semibold text-gray-800">
                      <td className="px-3 py-3">Total</td>
                      <td className="px-3 py-3"></td>
                      <td className="px-3 py-3 text-right">{formatBRL(totals.totalVendido)}</td>
                      <td className="px-3 py-3 text-right text-emerald-700">{formatBRL(totals.totalEmbarcado)}</td>
                      <td className="px-3 py-3 text-right">{formatBRL(totals.comissaoPrevista)}</td>
                      <td className="px-3 py-3 text-right text-blue-700">{formatBRL(totals.comissaoEmbarcada)}</td>
                      <td className="px-3 py-3 text-right">{totals.qtdPedidos}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Bar comparison */}
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 mb-3">
                <BarChart2 size={16} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-700">Total Embarcado por Atendente</h3>
              </div>
              <div className="space-y-2">
                {rows
                  .filter((r) => r.totalEmbarcado > 0 || r.totalVendido > 0)
                  .map((r) => {
                    const pctEmb = maxEmbarcado > 0 ? (r.totalEmbarcado / maxEmbarcado) * 100 : 0;
                    return (
                      <div key={r.sellerId ?? "none"} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 w-28 truncate flex-shrink-0">
                          {r.sellerName || "Sem atendente"}
                        </span>
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all"
                            style={{ width: `${Math.max(pctEmb, 2)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-gray-700 w-24 text-right flex-shrink-0">
                          {formatBRL(r.totalEmbarcado)}
                        </span>
                      </div>
                    );
                  })}
                {rows.every((r) => r.totalEmbarcado === 0 && r.totalVendido === 0) && (
                  <p className="text-xs text-gray-400 text-center py-2">Nenhum dado para exibir.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
