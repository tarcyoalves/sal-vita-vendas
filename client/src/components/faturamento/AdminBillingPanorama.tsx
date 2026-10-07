import { useState, useMemo } from "react";
import { useFatStore } from "../../lib/faturamento/store";
import { QueryError } from '../QueryError';
import {
  panoramaPorAtendente,
  somarResumos,
  mesAtual,
  formatBRL,
  formatTons,
} from "../../lib/faturamento/calc";
import type { FiltroMes, ResumoAtendente } from "../../lib/faturamento/types";
import { trpc } from "../../lib/trpc";
import { AvisoMesSemPedidos } from "./AvisoMesSemPedidos";
import { Panel, PanelHeader, StatStrip, Stat, EmptyState } from "../layout/Page";
import { Button } from "../ui/button";
import { ChevronLeft, ChevronRight, BarChart2 } from "lucide-react";

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
  const { pedidos, comissoes, error: fatError, loaded: fatLoaded, loading: fatLoading, reload: fatReload } = useFatStore();
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
      <AvisoMesSemPedidos pedidos={pedidos} filtro={filtro} onIr={setFiltro} />
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" aria-label="Mês anterior" onClick={() => setFiltro(prevMes)}>
          <ChevronLeft size={16} />
        </Button>
        <span className="min-w-[140px] text-center text-sm font-semibold text-slate-900">
          {MONTH_NAMES[filtro.mes]} {filtro.ano}
        </span>
        <Button variant="outline" size="icon-sm" aria-label="Próximo mês" onClick={() => setFiltro(nextMes)}>
          <ChevronRight size={16} />
        </Button>
      </div>

      <StatStrip className="sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Vendido (pipeline)"
          value={formatBRL(totals.totalVendido)}
          hint={`${totals.qtdPedidos} pedido${totals.qtdPedidos !== 1 ? "s" : ""}`}
        />
        <Stat
          label="Embarcado"
          value={formatBRL(totals.totalEmbarcado)}
          hint={`${totals.qtdFaturados} faturado${totals.qtdFaturados !== 1 ? "s" : ""}`}
        />
        <Stat
          label="Peso estimado"
          value={formatTons(totals.pesoTotalKg)}
          hint={`${(totals.pesoTotalKg / 1000).toFixed(1)} t no pipeline`}
        />
        <Stat label="Peso embarcado" value={formatTons(totals.pesoEmbarcadoKg)} hint="toneladas faturadas" />
        <Stat label="Comissão prevista" value={formatBRL(totals.comissaoPrevista)} hint="sobre pipeline" />
        <Stat label="Comissão a pagar" value={formatBRL(totals.comissaoEmbarcada)} hint="sobre embarcado" />
      </StatStrip>

      {!hasData && fatError && !fatLoaded ? (
        <QueryError message="Falha ao carregar os pedidos" onRetry={fatReload} retrying={fatLoading} />
      ) : !hasData ? (
        <Panel>
          <EmptyState
            icon={<BarChart2 />}
            title="Nenhum pedido neste mês"
            description={`Não há pedidos em ${MONTH_NAMES[filtro.mes]} ${filtro.ano}. Use as setas para trocar de mês.`}
          />
        </Panel>
      ) : (
        <>
          <Panel className="md:hidden">
            <ul className="divide-y divide-slate-200">
              {rows
                .filter((r) => r.totalVendido > 0 || r.totalEmbarcado > 0 || r.qtdPedidos > 0)
                .map((r) => (
                  <li key={r.sellerId ?? "none"} className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{r.sellerName || "Sem atendente"}</p>
                    <p className="text-xs text-slate-500">
                      {r.qtdPedidos} pedido{r.qtdPedidos !== 1 ? "s" : ""} · {r.qtdFaturados} faturado
                      {r.qtdFaturados !== 1 ? "s" : ""} · {r.comissaoPct}% com.
                    </p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      {[
                        ["Vendido", formatBRL(r.totalVendido)],
                        ["Embarcado", formatBRL(r.totalEmbarcado)],
                        ["Peso estim.", formatTons(r.pesoTotalKg)],
                        ["Peso emb.", formatTons(r.pesoEmbarcadoKg)],
                        ["Com. prevista", formatBRL(r.comissaoPrevista)],
                        ["Com. a pagar", formatBRL(r.comissaoEmbarcada)],
                      ].map(([k, v]) => (
                        <div key={k} className="flex items-baseline justify-between gap-2">
                          <dt className="text-xs text-slate-500">{k}</dt>
                          <dd className="tabular-nums font-medium text-slate-900">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
            </ul>
          </Panel>

          <Panel className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-xs text-slate-500">
                    <th className="px-3 py-2.5 text-left font-medium">Atendente</th>
                    <th className="px-3 py-2.5 text-right font-medium">% Com.</th>
                    <th className="px-3 py-2.5 text-right font-medium">Total vendido</th>
                    <th className="px-3 py-2.5 text-right font-medium">Total embarcado</th>
                    <th className="px-3 py-2.5 text-right font-medium">Peso estim.</th>
                    <th className="px-3 py-2.5 text-right font-medium">Peso emb.</th>
                    <th className="px-3 py-2.5 text-right font-medium">Com. prevista</th>
                    <th className="px-3 py-2.5 text-right font-medium">Com. a pagar</th>
                    <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.sellerId ?? "none"} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-slate-900">{r.sellerName || "Sem atendente"}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{r.comissaoPct}%</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{formatBRL(r.totalVendido)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">{formatBRL(r.totalEmbarcado)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{formatTons(r.pesoTotalKg)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">{formatTons(r.pesoEmbarcadoKg)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{formatBRL(r.comissaoPrevista)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">{formatBRL(r.comissaoEmbarcada)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700">{r.qtdPedidos}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-300">
                  <tr className="font-semibold text-slate-900">
                    <td className="px-3 py-2.5" colSpan={2}>Total</td>
                    <td className="px-3 py-2.5 text-right">{formatBRL(totals.totalVendido)}</td>
                    <td className="px-3 py-2.5 text-right">{formatBRL(totals.totalEmbarcado)}</td>
                    <td className="px-3 py-2.5 text-right">{formatTons(totals.pesoTotalKg)}</td>
                    <td className="px-3 py-2.5 text-right">{formatTons(totals.pesoEmbarcadoKg)}</td>
                    <td className="px-3 py-2.5 text-right">{formatBRL(totals.comissaoPrevista)}</td>
                    <td className="px-3 py-2.5 text-right">{formatBRL(totals.comissaoEmbarcada)}</td>
                    <td className="px-3 py-2.5 text-right">{totals.qtdPedidos}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Total embarcado por atendente" />
            <div className="space-y-2 px-4 py-3">
              {rows
                .filter((r) => r.totalEmbarcado > 0 || r.totalVendido > 0)
                .map((r) => {
                  const pctEmb = maxEmbarcado > 0 ? (r.totalEmbarcado / maxEmbarcado) * 100 : 0;
                  return (
                    <div key={r.sellerId ?? "none"} className="flex items-center gap-3">
                      <span className="w-24 flex-shrink-0 truncate text-xs text-slate-700">
                        {r.sellerName || "Sem atendente"}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded-sm bg-slate-100">
                        <div
                          className="h-full rounded-sm bg-brand-600 transition-all"
                          style={{ width: `${Math.max(pctEmb, 2)}%` }}
                        />
                      </div>
                      <span className="w-24 flex-shrink-0 text-right text-xs font-medium tabular-nums text-slate-900">
                        {formatBRL(r.totalEmbarcado)}
                      </span>
                    </div>
                  );
                })}
              {rows.every((r) => r.totalEmbarcado === 0 && r.totalVendido === 0) && (
                <p className="py-2 text-center text-xs text-slate-500">Nenhum dado para exibir.</p>
              )}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
