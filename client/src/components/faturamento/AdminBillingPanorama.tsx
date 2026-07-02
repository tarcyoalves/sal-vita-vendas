import { useState, useMemo } from "react";
import { useFatStore } from "../../lib/faturamento/store";
import {
  panoramaPorAtendente,
  somarResumos,
  mesAtual,
  formatBRL,
  formatTons,
} from "../../lib/faturamento/calc";
import type { FiltroMes, ResumoAtendente } from "../../lib/faturamento/types";
import { trpc } from "../../lib/trpc";
import { Card, CardContent } from "../ui/card";
import {
  ChevronLeft,
  ChevronRight,
  BarChart2,
  TrendingUp,
  Package,
  Banknote,
  Scale,
  CheckCircle2,
} from "lucide-react";

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

interface KpiTileProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}

function KpiTile({ label, value, sub, icon, color, bgColor }: KpiTileProps) {
  return (
    <div className={`rounded-2xl p-4 ${bgColor} flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 leading-tight">{label}</p>
        <div className={`flex-shrink-0 p-1.5 rounded-xl ${color} bg-white/60`}>
          {icon}
        </div>
      </div>
      <p className={`text-lg font-bold leading-tight ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
    </div>
  );
}

export default function AdminBillingPanorama() {
  const [filtro, setFiltro] = useState<FiltroMes>(mesAtual);
  const { pedidos, comissoes } = useFatStore();
  const { data: sellers = [] } = trpc.sellers.list.useQuery();

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

      {/* KPI tiles — 2-col mobile, 3-col md */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiTile
          label="Total Vendido (pipeline)"
          value={formatBRL(totals.totalVendido)}
          sub={`${totals.qtdPedidos} pedido${totals.qtdPedidos !== 1 ? "s" : ""}`}
          icon={<TrendingUp size={15} />}
          color="text-blue-700"
          bgColor="bg-blue-50"
        />
        <KpiTile
          label="Total Embarcado"
          value={formatBRL(totals.totalEmbarcado)}
          sub={`${totals.qtdFaturados} faturado${totals.qtdFaturados !== 1 ? "s" : ""}`}
          icon={<CheckCircle2 size={15} />}
          color="text-emerald-700"
          bgColor="bg-emerald-50"
        />
        <KpiTile
          label="Peso Estimado"
          value={formatTons(totals.pesoTotalKg)}
          sub={`${(totals.pesoTotalKg / 1000).toFixed(1)} t no pipeline`}
          icon={<Scale size={15} />}
          color="text-violet-700"
          bgColor="bg-violet-50"
        />
        <KpiTile
          label="Peso Embarcado"
          value={formatTons(totals.pesoEmbarcadoKg)}
          sub="toneladas faturadas"
          icon={<Package size={15} />}
          color="text-teal-700"
          bgColor="bg-teal-50"
        />
        <KpiTile
          label="Comissão Prevista"
          value={formatBRL(totals.comissaoPrevista)}
          sub="sobre pipeline"
          icon={<Banknote size={15} />}
          color="text-amber-700"
          bgColor="bg-amber-50"
        />
        <KpiTile
          label="Comissão a Pagar"
          value={formatBRL(totals.comissaoEmbarcada)}
          sub="sobre embarcado"
          icon={<Banknote size={15} />}
          color="text-orange-700"
          bgColor="bg-orange-50"
        />
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
          {/* Mobile: per-attendant cards (hidden on md+) */}
          <div className="md:hidden space-y-3">
            {rows
              .filter((r) => r.totalVendido > 0 || r.totalEmbarcado > 0 || r.qtdPedidos > 0)
              .map((r) => (
                <Card key={r.sellerId ?? "none"}>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{r.sellerName || "Sem atendente"}</p>
                        <p className="text-xs text-slate-400">{r.qtdPedidos} pedido{r.qtdPedidos !== 1 ? "s" : ""} · {r.qtdFaturados} faturado{r.qtdFaturados !== 1 ? "s" : ""} · {r.comissaoPct}% com.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 rounded-xl p-2.5">
                        <p className="text-[10px] text-blue-500 font-medium">Vendido</p>
                        <p className="text-sm font-bold text-blue-800 mt-0.5">{formatBRL(r.totalVendido)}</p>
                      </div>
                      <div className="bg-emerald-50 rounded-xl p-2.5">
                        <p className="text-[10px] text-emerald-500 font-medium">Embarcado</p>
                        <p className="text-sm font-bold text-emerald-800 mt-0.5">{formatBRL(r.totalEmbarcado)}</p>
                      </div>
                      <div className="bg-violet-50 rounded-xl p-2.5">
                        <p className="text-[10px] text-violet-500 font-medium">Peso estim.</p>
                        <p className="text-sm font-bold text-violet-800 mt-0.5">{formatTons(r.pesoTotalKg)}</p>
                      </div>
                      <div className="bg-teal-50 rounded-xl p-2.5">
                        <p className="text-[10px] text-teal-500 font-medium">Peso emb.</p>
                        <p className="text-sm font-bold text-teal-800 mt-0.5">{formatTons(r.pesoEmbarcadoKg)}</p>
                      </div>
                      <div className="bg-amber-50 rounded-xl p-2.5">
                        <p className="text-[10px] text-amber-500 font-medium">Com. prevista</p>
                        <p className="text-sm font-bold text-amber-800 mt-0.5">{formatBRL(r.comissaoPrevista)}</p>
                      </div>
                      <div className="bg-orange-50 rounded-xl p-2.5">
                        <p className="text-[10px] text-orange-500 font-medium">Com. a pagar</p>
                        <p className="text-sm font-bold text-orange-800 mt-0.5">{formatBRL(r.comissaoEmbarcada)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>

          {/* Desktop: full table (hidden on mobile) */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Atendente</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">% Com.</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Vendido</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Embarcado</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Peso Estim.</th>
                      <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Peso Emb.</th>
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
                        <td className="px-3 py-3 text-right text-violet-700">{formatTons(r.pesoTotalKg)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-teal-700">{formatTons(r.pesoEmbarcadoKg)}</td>
                        <td className="px-3 py-3 text-right text-gray-600">{formatBRL(r.comissaoPrevista)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-blue-700">{formatBRL(r.comissaoEmbarcada)}</td>
                        <td className="px-3 py-3 text-right text-gray-600">{r.qtdPedidos}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                    <tr className="font-semibold text-gray-800">
                      <td className="px-3 py-3" colSpan={2}>Total</td>
                      <td className="px-3 py-3 text-right">{formatBRL(totals.totalVendido)}</td>
                      <td className="px-3 py-3 text-right text-emerald-700">{formatBRL(totals.totalEmbarcado)}</td>
                      <td className="px-3 py-3 text-right text-violet-700">{formatTons(totals.pesoTotalKg)}</td>
                      <td className="px-3 py-3 text-right text-teal-700">{formatTons(totals.pesoEmbarcadoKg)}</td>
                      <td className="px-3 py-3 text-right">{formatBRL(totals.comissaoPrevista)}</td>
                      <td className="px-3 py-3 text-right text-blue-700">{formatBRL(totals.comissaoEmbarcada)}</td>
                      <td className="px-3 py-3 text-right">{totals.qtdPedidos}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Bar chart — embarcado per attendant */}
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
                        <span className="text-xs text-gray-600 w-24 truncate flex-shrink-0">
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
