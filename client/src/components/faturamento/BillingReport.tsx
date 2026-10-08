import { AvisoMesSemPedidos } from "./AvisoMesSemPedidos";
import { useState, useMemo } from "react";
import { seloPendenciaSmbi } from "../../lib/faturamento/smbiPendencia";
import { useFatStore } from "../../lib/faturamento/store";
import { QueryError } from '../QueryError';
import {
  totalPedido, totalItens, mesAtual, pedidoNoMes, formatBRL,
  pesoEfetivoKg, formatKg, formatDataBR,
} from "../../lib/faturamento/calc";
import type { Pedido, FiltroMes } from "../../lib/faturamento/types";
import { trpc } from "../../lib/trpc";
import { Panel, EmptyState } from "../layout/Page";
import { StatusBadge } from "../StatusBadge";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Download, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { OrderDetailDialog } from "./OrderDetailDialog";
import { OrderDialog } from "./OrderDialog";
import { InvoiceDialog } from "./InvoiceDialog";
import { DeleteOrderDialog } from "./DeleteOrderDialog";

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

/** Ligado a pedido do ERP SMBI: criado pelo robô ou vinculado à mão pelo admin. */
function vinculadoSmbi(p: Pick<Pedido, "smbiMovsaiId" | "smbiVinculoEstado">): boolean {
  return !!p.smbiMovsaiId || !!p.smbiVinculoEstado;
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
  const { pedidos: allPedidos, error: fatError, loaded: fatLoaded, loading: fatLoading, reload: fatReload } = useFatStore();
  const { data: sellers = [] } = trpc.sellers.list.useQuery();

  // Filters
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendente" | "estimado" | "faturado">("todos");
  const [sellerFilter, setSellerFilter] = useState<string>("todos");
  const [mesFilter, setMesFilter] = useState<FiltroMes | null>(mesAtual);
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [ufFilter, setUfFilter] = useState("");
  // Vínculo com o ERP SMBI: vinculado = tem número de pedido do SMBI (criado pelo robô ou vinculado à mão).
  const [smbiFilter, setSmbiFilter] = useState<"todos" | "vinculados" | "nao_vinculados">("todos");
  // Busca livre: CNPJ, Razão Social, Cidade e Produtos num único campo — mesmo
  // padrão de busca já usado em Tarefas e no picker de vínculo de pedidos.
  const [searchQuery, setSearchQuery] = useState("");

  // Manage popup (view all + edit/faturar/excluir shortcuts)
  const [selectedPedidoId, setSelectedPedidoId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const selectedPedido = selectedPedidoId
    ? allPedidos.find((p) => p.id === selectedPedidoId) ?? null
    : null;

  const openDetail = (id: string) => {
    setSelectedPedidoId(id);
    setDetailOpen(true);
  };
  // Linhas/cartões clicáveis também respondem a Enter e Espaço.
  const abrirComTeclado = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetail(id);
    }
  };

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
      if (statusFilter === "pendente") {
        result = result.filter((p) => !p.aprovadoEm);
      } else {
        result = result.filter((p) => p.status === statusFilter);
      }
    }

    if (sellerFilter !== "todos") {
      result = result.filter((p) => p.sellerName === sellerFilter);
    }

    // Competência, não data de criação: estimado entra no mês previsto de
    // faturamento e faturado no mês do embarque real. Não abrir exceção para
    // pendentes aqui — os totais do mês somariam pedidos de outros meses. Para
    // achar pendentes de qualquer mês existe o filtro "Aguardando revisão"
    // (statusFilter "pendente"), que ignora o mês.
    if (!showAllMonths && mesFilter && statusFilter !== "pendente") {
      result = result.filter((p) => pedidoNoMes(p, mesFilter));
    }

    if (smbiFilter !== "todos") {
      result = result.filter((p) => (smbiFilter === "vinculados") === vinculadoSmbi(p));
    }

    if (ufFilter.trim()) {
      const ufLower = ufFilter.trim().toLowerCase();
      result = result.filter((p) => p.uf.toLowerCase().includes(ufLower));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const qDigits = q.replace(/\D/g, "");
      result = result.filter((p) => {
        const matchCnpj = qDigits && p.cnpj.replace(/\D/g, "").includes(qDigits);
        const matchRazaoSocial = p.razaoSocial.toLowerCase().includes(q);
        const matchCidade = p.cidade.toLowerCase().includes(q);
        const matchProdutos = p.itens.some((it) => it.descricao.toLowerCase().includes(q));
        return matchCnpj || matchRazaoSocial || matchCidade || matchProdutos;
      });
    }

    return result;
  }, [allPedidos, statusFilter, sellerFilter, mesFilter, showAllMonths, ufFilter, smbiFilter, searchQuery]);

  // Totals
  const totalEstimado = useMemo(() => filtered.reduce((s, p) => s + estimatedTotal(p), 0), [filtered]);
  const totalFaturado = useMemo(
    () => filtered.filter((p) => p.status === "faturado").reduce((s, p) => s + totalPedido(p), 0),
    [filtered],
  );

  // CSV
  const handleExport = () => {
    const headers = ["Tarefa", "CNPJ", "Razao Social", "Cidade", "UF", "Atendente", "Status", "Produtos", "Previsao Faturamento", "Faturado Em", "Valor Estimado", "Valor Faturado", "Pedido SMBI"];
    const csvRows = filtered.map((p) => [
      p.taskId ? `#${p.taskId}` : "",
      p.cnpj,
      p.razaoSocial,
      p.cidade,
      p.uf,
      p.sellerName,
      p.status === "faturado" ? "Faturado" : "Estimado",
      p.itens.map(it => `${it.descricao} (${it.quantidade}un)`).join(", "),
      formatDataBR(p.previsaoFaturamentoEm),
      formatDataBR(p.faturadoEm),
      estimatedTotal(p).toFixed(2).replace(".", ","),
      p.status === "faturado" ? totalPedido(p).toFixed(2).replace(".", ",") : "",
      vinculadoSmbi(p) ? (p.smbiVinculoMovsais?.join(" / ") ?? p.smbiMovsaiId ?? "") : "",
    ]);
    const dateStr = new Date().toISOString().slice(0, 10);
    exportCsv(`relatorio-faturamento-${dateStr}.csv`, headers, csvRows);
  };

  return (
    <div className="space-y-4">
      {!showAllMonths && mesFilter && (
        <AvisoMesSemPedidos pedidos={allPedidos} filtro={mesFilter} onIr={setMesFilter} />
      )}
      {/* Filters */}
      <Panel>
        <div className="space-y-3 px-4 py-3">
          <Input
            type="search"
            aria-label="Buscar pedidos"
            placeholder="Buscar por CNPJ, razão social, cidade ou produto"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="pendente">Aguardando revisão</option>
                <option value="estimado">Estimado</option>
                <option value="faturado">Faturado</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Atendente</label>
              <select
                value={sellerFilter}
                onChange={(e) => setSellerFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="todos">Todos</option>
                {sellerNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Mês</label>
              {showAllMonths ? (
                <Button
                  variant="outline"
                  className="w-full justify-start text-brand-700"
                  onClick={() => { setShowAllMonths(false); setMesFilter(mesAtual()); }}
                >
                  Todos os meses (filtrar)
                </Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Mês anterior"
                    onClick={() => mesFilter && setMesFilter(prevMes(mesFilter))}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <span className="flex-1 text-center text-sm font-medium text-slate-900">
                    {mesFilter ? `${MONTH_NAMES[mesFilter.mes].slice(0, 3)}/${mesFilter.ano}` : "--"}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label="Próximo mês"
                    onClick={() => mesFilter && setMesFilter(nextMes(mesFilter))}
                  >
                    <ChevronRight size={14} />
                  </Button>
                  <Button variant="link" size="sm" onClick={() => setShowAllMonths(true)}>
                    Todos
                  </Button>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">UF</label>
              <select
                value={ufFilter}
                onChange={(e) => setUfFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Todas</option>
                {distinctUFs.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">SMBI</label>
              <select
                value={smbiFilter}
                onChange={(e) => setSmbiFilter(e.target.value as typeof smbiFilter)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="todos">Todos</option>
                <option value="vinculados">Vinculados ao SMBI</option>
                <option value="nao_vinculados">Não vinculados ao SMBI</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full gap-1"
                onClick={handleExport}
                disabled={filtered.length === 0}
              >
                <Download size={14} /> Exportar CSV
              </Button>
            </div>
          </div>
        </div>
      </Panel>

      {/* Report table */}
      {filtered.length === 0 && fatError && !fatLoaded ? (
        <QueryError message="Falha ao carregar os pedidos" onRetry={fatReload} retrying={fatLoading} />
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<FileText />}
            title="Nenhum pedido encontrado"
            description="Ajuste os filtros, a busca ou o mês para ver outros pedidos."
          />
        </Panel>
      ) : (
        <Panel>
          <div>
            {/* Celular: cartões clicáveis (a tabela tem 12 colunas). */}
            <div className="md:hidden divide-y divide-slate-200">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(p.id)}
                  onKeyDown={(e) => abrirComTeclado(e, p.id)}
                  className="px-4 py-3 space-y-1.5 cursor-pointer active:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-900 text-sm min-w-0 break-words">{p.razaoSocial || p.clienteNome || "--"}</p>
                    <StatusBadge tone={p.status === "faturado" ? "success" : "warning"} className="flex-shrink-0">
                      {p.status === "faturado" ? "Faturado" : "Estimado"}
                    </StatusBadge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{p.sellerName || "--"} · {formatKg(pesoEfetivoKg(p))}</span>
                    <span>
                      {p.status === "faturado"
                        ? `Emb. ${formatDataBR(p.faturadoEm)}`
                        : `Prev. ${formatDataBR(p.previsaoFaturamentoEm ?? p.criadoEm)}`}
                    </span>
                  </div>
                  {seloPendenciaSmbi(p) && !vinculadoSmbi(p) && (
                    <div><StatusBadge tone={seloPendenciaSmbi(p)!.tom}>{seloPendenciaSmbi(p)!.rotulo}</StatusBadge></div>
                  )}
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="tabular-nums text-slate-700">Estimado {formatBRL(estimatedTotal(p))}</span>
                    {p.status === "faturado"
                      ? <span className="font-semibold tabular-nums text-slate-900">Faturado {formatBRL(totalPedido(p))}</span>
                      : <span className="text-slate-500">Faturado --</span>}
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 bg-slate-50 text-sm font-semibold tabular-nums text-slate-900 space-y-0.5">
                <div>Total ({filtered.length} pedido{filtered.length !== 1 ? "s" : ""})</div>
                <div className="flex justify-between"><span className="font-medium text-slate-500">Estimado</span><span>{formatBRL(totalEstimado)}</span></div>
                <div className="flex justify-between"><span className="font-medium text-slate-500">Faturado</span><span>{formatBRL(totalFaturado)}</span></div>
              </div>
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Tarefa</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">CNPJ</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Razão social</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Cidade/UF</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Atendente</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Produtos</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Pagamento</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">Competência</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500">Peso</th>
                    <th className="px-3 py-2.5 text-center text-xs font-medium text-slate-500">Status</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500">Estimado</th>
                    <th className="px-3 py-2.5 text-right text-xs font-medium text-slate-500">Faturado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => openDetail(p.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => abrirComTeclado(e, p.id)}
                      className="border-b border-slate-200 hover:bg-slate-50 transition-colors align-top cursor-pointer focus-visible:outline-none focus-visible:bg-brand-50"
                    >
                      <td className="px-3 py-3 text-brand-700 text-xs font-medium">{p.taskId ? `#${p.taskId}` : "--"}</td>
                      <td className="px-3 py-3 text-slate-700 text-xs">{p.cnpj || "--"}</td>
                      <td className="px-3 py-3 font-medium text-slate-900 max-w-[180px] truncate">{p.razaoSocial || p.clienteNome || "--"}</td>
                      <td className="px-3 py-3 text-slate-700 text-xs whitespace-nowrap">{[p.cidade, p.uf].filter(Boolean).join("/") || "--"}</td>
                      <td className="px-3 py-3 text-slate-700 text-xs">{p.sellerName || "--"}</td>
                      <td className="px-3 py-3 text-xs text-slate-700 max-w-[200px]">
                        {p.itens.length > 0 ? (
                          <div className="space-y-0.5">
                            {p.itens.map((it) => (
                              <div key={it.id} className="truncate">{it.descricao} ({it.quantidade}un)</div>
                            ))}
                          </div>
                        ) : "--"}
                      </td>
                      <td className="px-3 py-3 text-slate-700 text-xs whitespace-nowrap">{p.prazoPagamentoSal || "--"}</td>
                      <td className="px-3 py-3 text-slate-700 text-xs whitespace-nowrap">
                        {p.status === "faturado"
                          ? `Emb. ${formatDataBR(p.faturadoEm)}`
                          : `Prev. ${formatDataBR(p.previsaoFaturamentoEm ?? p.criadoEm)}`}
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700 text-xs whitespace-nowrap">{formatKg(pesoEfetivoKg(p))}</td>
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <StatusBadge tone={p.status === "faturado" ? "success" : "warning"}>
                            {p.status === "faturado" ? "Faturado" : "Estimado"}
                          </StatusBadge>
                          <StatusBadge tone={p.aprovadoEm ? "info" : "neutral"}>
                            {p.aprovadoEm ? "Autorizado" : "Aguardando revisão"}
                          </StatusBadge>
                          <StatusBadge tone={vinculadoSmbi(p) ? "success" : (seloPendenciaSmbi(p)?.tom ?? "neutral")}>
                            {vinculadoSmbi(p) ? `SMBI ${p.smbiMovsaiId ?? p.smbiVinculoMovsais?.[0] ?? ""}` : (seloPendenciaSmbi(p)?.rotulo ?? "Sem SMBI")}
                          </StatusBadge>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-slate-700">{formatBRL(estimatedTotal(p))}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">
                        {p.status === "faturado" ? (
                          <span>{formatBRL(totalPedido(p))}</span>
                        ) : (
                          <span className="font-normal text-slate-500">--</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-300">
                  <tr className="font-semibold text-slate-900">
                    <td className="px-3 py-3" colSpan={10}>
                      Total ({filtered.length} pedido{filtered.length !== 1 ? "s" : ""})
                    </td>
                    <td className="px-3 py-3 text-right">{formatBRL(totalEstimado)}</td>
                    <td className="px-3 py-3 text-right">{formatBRL(totalFaturado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </Panel>
      )}

      {/* Manage popup: view everything + edit/faturar/excluir shortcuts */}
      <OrderDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        pedidoId={selectedPedidoId}
        onEdit={() => { setDetailOpen(false); setEditOpen(true); }}
        onInvoice={() => { setDetailOpen(false); setInvoiceOpen(true); }}
        onDelete={() => { setDetailOpen(false); setDeleteOpen(true); }}
      />
      <OrderDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        seller={selectedPedido ? { id: selectedPedido.sellerId ?? 0, name: selectedPedido.sellerName } : null}
        existingPedidoId={selectedPedidoId}
      />
      <InvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        pedidoId={selectedPedidoId}
      />
      <DeleteOrderDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        pedidoId={selectedPedidoId}
      />
    </div>
  );
}
