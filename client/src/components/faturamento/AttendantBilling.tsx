import { useState, useMemo } from 'react';
import { trpc } from '../../lib/trpc';
import { useFatStore } from '../../lib/faturamento/store';
import {
  resumoAtendente, mesAtual, isoNoMes, totalPedido, comissaoPedido,
  formatBRL,
} from '../../lib/faturamento/calc';
import type { FiltroMes, Pedido } from '../../lib/faturamento/types';
import { OrderDialog } from './OrderDialog';
import { InvoiceDialog } from './InvoiceDialog';
import { DeleteOrderDialog } from './DeleteOrderDialog';
import { OrderPrintDocument } from './OrderPrintDocument';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  DollarSign, TrendingUp, Package, ChevronLeft, ChevronRight,
  Plus, Pencil, Truck, Trash2, Printer,
} from 'lucide-react';

const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function StatTile({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  color: string;
}) {
  const bgMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };
  const valMap: Record<string, string> = {
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    indigo: 'text-indigo-700',
  };
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm">
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`p-1 rounded-md ${bgMap[color] ?? 'bg-slate-50 text-slate-600'}`}>
          <Icon size={13} />
        </div>
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className={`text-lg font-black ${valMap[color] ?? 'text-slate-700'}`}>
        {value}
      </p>
    </div>
  );
}

export default function AttendantBilling() {
  const { data: sellerProfile, isLoading: profileLoading } =
    trpc.sellers.myProfile.useQuery(undefined, { staleTime: 300_000 });

  const { pedidos: allPedidos, comissoes, actions } = useFatStore();

  const [filtro, setFiltro] = useState<FiltroMes>(mesAtual);

  // Order dialog state
  const [orderOpen, setOrderOpen] = useState(false);
  const [editingPedidoId, setEditingPedidoId] = useState<string | null>(null);

  // Invoice dialog state
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoicePedidoId, setInvoicePedidoId] = useState<string | null>(null);

  // Delete dialog state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePedidoId, setDeletePedidoId] = useState<string | null>(null);

  // Print dialog state
  const [printOpen, setPrintOpen] = useState(false);
  const [printPedido, setPrintPedido] = useState<Pedido | null>(null);

  const seller = sellerProfile
    ? { id: sellerProfile.id, name: sellerProfile.name }
    : null;

  const comissaoPct = seller ? (comissoes[seller.id] ?? 0) : 0;

  const resumo = useMemo(() => {
    if (!seller) return null;
    return resumoAtendente(allPedidos, seller.id, seller.name, comissaoPct, filtro);
  }, [allPedidos, seller?.id, seller?.name, comissaoPct, filtro]);

  // Pedidos for this seller in this month
  const pedidosDoMes = useMemo(() => {
    if (!seller) return [];
    return allPedidos.filter(
      (p) => p.sellerId === seller.id && isoNoMes(p.criadoEm, filtro),
    );
  }, [allPedidos, seller?.id, filtro]);

  const prevMonth = () =>
    setFiltro((f) =>
      f.mes === 0
        ? { ano: f.ano - 1, mes: 11 }
        : { ...f, mes: f.mes - 1 },
    );
  const nextMonth = () =>
    setFiltro((f) =>
      f.mes === 11
        ? { ano: f.ano + 1, mes: 0 }
        : { ...f, mes: f.mes + 1 },
    );

  const openNewOrder = () => {
    setEditingPedidoId(null);
    setOrderOpen(true);
  };

  const openEditOrder = (pedidoId: string) => {
    setEditingPedidoId(pedidoId);
    setOrderOpen(true);
  };

  const openInvoice = (pedidoId: string) => {
    setInvoicePedidoId(pedidoId);
    setInvoiceOpen(true);
  };

  const openDelete = (pedidoId: string) => {
    setDeletePedidoId(pedidoId);
    setDeleteOpen(true);
  };

  const openPrint = (pedido: Pedido) => {
    setPrintPedido(pedido);
    setPrintOpen(true);
  };

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Perfil de vendedor nao encontrado.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition"
        >
          <ChevronLeft size={18} className="text-slate-500" />
        </button>
        <p className="text-sm font-semibold text-slate-700">
          {MESES[filtro.mes]} {filtro.ano}
        </p>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition"
        >
          <ChevronRight size={18} className="text-slate-500" />
        </button>
      </div>

      {/* KPI cards */}
      {resumo && (
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Total vendido"
            value={formatBRL(resumo.totalVendido)}
            icon={DollarSign}
            color="blue"
          />
          <StatTile
            label="Total embarcado"
            value={formatBRL(resumo.totalEmbarcado)}
            icon={Package}
            color="emerald"
          />
          <StatTile
            label="Comissao prevista"
            value={formatBRL(resumo.comissaoPrevista)}
            icon={TrendingUp}
            color="amber"
          />
          <StatTile
            label="Comissao embarcada"
            value={formatBRL(resumo.comissaoEmbarcada)}
            icon={Truck}
            color="indigo"
          />
        </div>
      )}

      {comissaoPct > 0 && (
        <p className="text-[11px] text-slate-400 text-center">
          Comissao embarcada e o que de fato embarca no mes (pedidos faturados).
        </p>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          Pedidos ({pedidosDoMes.length})
        </h3>
        <p className="text-xs text-slate-400">Crie pedidos a partir das tarefas</p>
      </div>

      {/* Pedidos list */}
      {pedidosDoMes.length === 0 ? (
        <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <Package size={32} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">Nenhum pedido neste mes</p>
          <p className="text-xs text-slate-400 mt-1">Acesse suas tarefas para criar pedidos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pedidosDoMes.map((p) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              onEdit={() => openEditOrder(p.id)}
              onInvoice={() => openInvoice(p.id)}
              onDelete={() => openDelete(p.id)}
              onPrint={() => openPrint(p)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <OrderDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        seller={seller}
        existingPedidoId={editingPedidoId}
      />
      <InvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        pedidoId={invoicePedidoId}
      />
      <DeleteOrderDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        pedidoId={deletePedidoId}
      />
      <OrderPrintDocument
        open={printOpen}
        onOpenChange={setPrintOpen}
        pedido={printPedido}
      />
    </div>
  );
}

function PedidoCard({
  pedido,
  onEdit,
  onInvoice,
  onDelete,
  onPrint,
}: {
  pedido: Pedido;
  onEdit: () => void;
  onInvoice: () => void;
  onDelete: () => void;
  onPrint: () => void;
}) {
  const total = totalPedido(pedido);
  const comissao = comissaoPedido(pedido);
  const isFaturado = pedido.status === 'faturado';

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm space-y-2">
      {/* Header: client + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">
            {pedido.clienteNome || 'Sem cliente'}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {pedido.taskId && (
              <span className="text-[11px] text-blue-600 font-medium">Tarefa #{pedido.taskId}</span>
            )}
            {pedido.cnpj && (
              <span className="text-[11px] text-slate-500">{pedido.cnpj}</span>
            )}
            {pedido.razaoSocial && (
              <span className="text-[11px] text-slate-500">{pedido.razaoSocial}</span>
            )}
            {(pedido.cidade || pedido.uf) && (
              <span className="text-[11px] text-slate-500">
                {pedido.cidade}{pedido.cidade && pedido.uf ? '/' : ''}{pedido.uf}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge
            className={
              isFaturado
                ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                : 'bg-amber-100 text-amber-700 border-amber-200'
            }
          >
            {isFaturado ? 'Faturado' : 'Estimado'}
          </Badge>
          <Badge
            className={
              pedido.aprovadoEm
                ? 'bg-blue-100 text-blue-700 border-blue-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }
          >
            {pedido.aprovadoEm ? 'Autorizado' : 'Aguardando revisão'}
          </Badge>
        </div>
      </div>

      {/* Product details */}
      {pedido.itens.length > 0 && (
        <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 space-y-0.5">
          {pedido.itens.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-600 truncate mr-2">{item.descricao || 'Item'}</span>
              <span className="text-slate-500 whitespace-nowrap">
                {item.quantidade}un x {formatBRL(item.valorUnitario)} = <strong className="text-slate-700">{formatBRL(item.quantidade * item.valorUnitario)}</strong>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Payment/freight/obs details */}
      {(pedido.prazoPagamentoSal || pedido.prazoPagamentoFrete || pedido.valorFretePorUnidade || pedido.observacoes) && (
        <div className="bg-amber-50 rounded-lg px-2.5 py-1.5 text-[11px] text-amber-800 space-y-0.5">
          {pedido.prazoPagamentoSal && <div><strong>Prazo sal:</strong> {pedido.prazoPagamentoSal}</div>}
          {pedido.prazoPagamentoFrete && <div><strong>Prazo frete:</strong> {pedido.prazoPagamentoFrete}</div>}
          {!!pedido.valorFretePorUnidade && <div><strong>Frete/un:</strong> {formatBRL(pedido.valorFretePorUnidade)}</div>}
          {pedido.observacoes && <div><strong>Obs:</strong> {pedido.observacoes}</div>}
        </div>
      )}

      {/* Total + actions */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-base font-bold text-slate-800">
            {formatBRL(total)}
          </p>
          {pedido.comissaoPct > 0 && (
            <p className="text-[11px] text-slate-400">
              Comissao {pedido.comissaoPct}%: {formatBRL(comissao)}
            </p>
          )}
        </div>
        <div className="flex gap-1.5">
          {pedido.aprovadoEm && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPrint}
              className="gap-1 text-xs h-7"
            >
              <Printer size={12} />
              Gerar cópia
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="gap-1 text-xs h-7"
          >
            <Pencil size={12} />
            Editar
          </Button>
          {!isFaturado && (
            <Button
              size="sm"
              onClick={onInvoice}
              className="gap-1 text-xs h-7 bg-emerald-600 hover:bg-emerald-700"
            >
              <Truck size={12} />
              Marcar como faturado
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="gap-1 text-xs h-7 text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
    </div>
  );
}
