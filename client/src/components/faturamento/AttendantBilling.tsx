import { AvisoMesSemPedidos } from "./AvisoMesSemPedidos";
import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import { useFatStore } from '../../lib/faturamento/store';
import { useConfirm } from '../useConfirm';
import { QueryError } from '../QueryError';
import {
  resumoAtendente, mesAtual, pedidoNoMes, totalPedido, comissaoPedido, notaPesoFaturado,
  formatBRL, formatDataBR,
} from '../../lib/faturamento/calc';
import type { FiltroMes, Pedido } from '../../lib/faturamento/types';
import { OrderDialog } from './OrderDialog';
import { InvoiceDialog } from './InvoiceDialog';
import { DeleteOrderDialog } from './DeleteOrderDialog';
import { OrderPrintDocument } from './OrderPrintDocument';
import { LinkTaskDialog } from './LinkTaskDialog';
import { Button } from '../ui/button';
import { StatusBadge } from '../StatusBadge';
import { Panel, StatStrip, Stat, EmptyState } from '../layout/Page';
import {
  Package, ChevronLeft, ChevronRight,
  Pencil, Truck, Trash2, Printer, Link2, Undo2,
} from 'lucide-react';

const MESES = [
  'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function AttendantBilling() {
  const { data: sellerProfile, isLoading: profileLoading } =
    trpc.sellers.myProfile.useQuery(undefined, { staleTime: 300_000 });

  const { pedidos: allPedidos, comissoes, actions, error: fatError, loaded: fatLoaded, loading: fatLoading, reload: fatReload } = useFatStore();

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

  // Tarefas do próprio atendente — já vem escopado pelo servidor (tasks.list
  // retorna só as tarefas do usuário logado quando role !== 'admin'), então é
  // seguro usar direto como candidatas para vincular um pedido órfão.
  const { data: myTasks = [], isLoading: carregandoTarefas } = trpc.tasks.list.useQuery();
  const [linkingPedidoId, setLinkingPedidoId] = useState<string | null>(null);

  const seller = sellerProfile
    ? { id: sellerProfile.id, name: sellerProfile.name }
    : null;

  const comissaoPct = seller ? (comissoes[seller.id] ?? 0) : 0;

  const linkingPedido = linkingPedidoId ? actions.pedidos.get(linkingPedidoId) : null;

  const handleLinkTask = (taskId: number) => {
    if (!linkingPedidoId) return;
    actions.pedidos.upsert({ id: linkingPedidoId, taskId });
    toast.success('Pedido vinculado à tarefa!');
  };

  const resumo = useMemo(() => {
    if (!seller) return null;
    return resumoAtendente(allPedidos, seller.id, seller.name, comissaoPct, filtro);
  }, [allPedidos, seller?.id, seller?.name, comissaoPct, filtro]);

  // Pedidos for this seller in this month
  const pedidosDoMes = useMemo(() => {
    if (!seller) return [];
    // Mesma regra dos KPIs: o pedido aparece no mês em que fatura, não no mês
    // em que foi digitado. Assim a lista e os totais nunca divergem.
    return allPedidos.filter(
      (p) => p.sellerId === seller.id && pedidoNoMes(p, filtro),
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

  const { confirm, confirmDialog } = useConfirm();

  const openInvoice = (pedidoId: string) => {
    setInvoicePedidoId(pedidoId);
    setInvoiceOpen(true);
  };

  // Desfaz o faturamento com confirmação: a ação descarta as quantidades reais
  // do embarque e tira o pedido do faturamento do mês.
  const undoInvoice = async (pedidoId: string) => {
    const ok = await confirm(
      'Ele volta para "estimado" e sai do faturamento do mês. ' +
        'As quantidades reais digitadas no embarque serão substituídas pelos valores estimados.',
      { title: 'Desfazer o faturamento deste pedido?', confirmLabel: 'Desfazer faturamento' },
    );
    if (!ok) return;
    actions.pedidos.desfazerFaturamento(pedidoId);
    toast.success('Faturamento desfeito. O pedido voltou para estimado.');
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!seller) {
    return (
      <Panel>
        <EmptyState title="Perfil de vendedor não encontrado" description="Peça ao administrador para vincular seu usuário a um perfil de atendente." />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <AvisoMesSemPedidos pedidos={allPedidos.filter((p) => !seller || p.sellerId === seller.id)} filtro={filtro} onIr={setFiltro} />
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon-sm" onClick={prevMonth} aria-label="Mês anterior">
          <ChevronLeft size={16} />
        </Button>
        <p className="text-sm font-semibold text-slate-900">
          {MESES[filtro.mes]} {filtro.ano}
        </p>
        <Button variant="outline" size="icon-sm" onClick={nextMonth} aria-label="Próximo mês">
          <ChevronRight size={16} />
        </Button>
      </div>

      {resumo && (
        <StatStrip>
          <Stat label="Total vendido" value={formatBRL(resumo.totalVendido)} />
          <Stat label="Total embarcado" value={formatBRL(resumo.totalEmbarcado)} />
          <Stat label="Comissão prevista" value={formatBRL(resumo.comissaoPrevista)} />
          <Stat label="Comissão embarcada" value={formatBRL(resumo.comissaoEmbarcada)} />
        </StatStrip>
      )}

      {comissaoPct > 0 && (
        <p className="text-xs text-slate-500">
          Estimado conta no mês previsto de faturamento; embarcado, no mês do embarque real.
        </p>
      )}

      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Pedidos ({pedidosDoMes.length})
        </h3>
        <p className="text-xs text-slate-500">Crie pedidos a partir das tarefas</p>
      </div>

      {/* Pedidos list */}
      {pedidosDoMes.length === 0 && fatError && !fatLoaded ? (
        <QueryError message="Falha ao carregar os pedidos" onRetry={fatReload} retrying={fatLoading} />
      ) : pedidosDoMes.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Package />}
            title="Nenhum pedido neste mês"
            description="Acesse suas tarefas para criar pedidos."
          />
        </Panel>
      ) : (
        <Panel className="divide-y divide-slate-200">
          {pedidosDoMes.map((p) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              onOpenLinkDialog={() => setLinkingPedidoId(p.id)}
              onEdit={() => openEditOrder(p.id)}
              onInvoice={() => openInvoice(p.id)}
              onUndoInvoice={() => undoInvoice(p.id)}
              onDelete={() => openDelete(p.id)}
              onPrint={() => openPrint(p)}
            />
          ))}
        </Panel>
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
      <LinkTaskDialog
        open={!!linkingPedidoId}
        onOpenChange={(o) => { if (!o) setLinkingPedidoId(null); }}
        tasks={myTasks}
        carregando={carregandoTarefas}
        pedidoCnpj={linkingPedido?.cnpj}
        onConfirm={handleLinkTask}
      />
    </div>
  );
}

function PedidoCard({
  pedido,
  onOpenLinkDialog,
  onEdit,
  onInvoice,
  onUndoInvoice,
  onDelete,
  onPrint,
}: {
  pedido: Pedido;
  onOpenLinkDialog: () => void;
  onEdit: () => void;
  onInvoice: () => void;
  onUndoInvoice: () => void;
  onDelete: () => void;
  onPrint: () => void;
}) {
  const total = totalPedido(pedido);
  const comissao = comissaoPedido(pedido);
  const isFaturado = pedido.status === 'faturado';

  return (
    <div className="space-y-2.5 px-4 py-3">
      {/* Header: client + status */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {pedido.clienteNome || 'Sem cliente'}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {pedido.taskId && (
              <span className="text-xs text-brand-700 font-medium">Tarefa #{pedido.taskId}</span>
            )}
            <span className="text-xs text-slate-500">
              {isFaturado
                ? `Faturado em ${formatDataBR(pedido.faturadoEm)}`
                : pedido.previsaoFaturamentoEm
                  ? `Previsto ${formatDataBR(pedido.previsaoFaturamentoEm)}`
                  : 'Sem previsão'}
            </span>
            {pedido.cnpj && (
              <span className="text-xs text-slate-500">{pedido.cnpj}</span>
            )}
            {pedido.razaoSocial && (
              <span className="text-xs text-slate-500">{pedido.razaoSocial}</span>
            )}
            {(pedido.cidade || pedido.uf) && (
              <span className="text-xs text-slate-500">
                {pedido.cidade}{pedido.cidade && pedido.uf ? '/' : ''}{pedido.uf}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge tone={isFaturado ? 'success' : 'warning'}>
            {isFaturado ? 'Faturado' : 'Estimado'}
          </StatusBadge>
          <StatusBadge tone={pedido.aprovadoEm ? 'info' : 'neutral'}>
            {pedido.aprovadoEm ? 'Autorizado' : 'Aguardando revisão'}
          </StatusBadge>
        </div>
      </div>

      {/* Vincular a uma tarefa — pedidos antigos sem esse vínculo */}
      {!pedido.taskId && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <div className="flex items-center gap-1.5">
            <Link2 size={13} />
            <span className="font-medium">Sem tarefa vinculada</span>
          </div>
          <Button size="sm" className="gap-1 shrink-0" onClick={onOpenLinkDialog}>
            <Link2 size={12} />
            Vincular tarefa
          </Button>
        </div>
      )}

      {/* Product details */}
      {pedido.itens.length > 0 && (
        <div className="rounded-md bg-slate-50 px-3 py-2 space-y-1">
          {pedido.itens.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-700 truncate">{item.descricao || 'Item'}</span>
              <span className="text-slate-500 whitespace-nowrap tabular-nums">
                {item.quantidade}un x {formatBRL(item.valorUnitario)} = <strong className="font-semibold text-slate-900">{formatBRL(item.quantidade * item.valorUnitario)}</strong>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Payment/freight/obs details */}
      {(pedido.prazoPagamentoSal || pedido.prazoPagamentoFrete || pedido.valorFretePorUnidade || pedido.observacoes) && (
        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 space-y-0.5">
          {pedido.prazoPagamentoSal && <div><strong>Prazo sal:</strong> {pedido.prazoPagamentoSal}</div>}
          {pedido.prazoPagamentoFrete && <div><strong>Prazo frete:</strong> {pedido.prazoPagamentoFrete}</div>}
          {!!pedido.valorFretePorUnidade && <div><strong>Frete/ton:</strong> {formatBRL(pedido.valorFretePorUnidade)}</div>}
          {pedido.observacoes && <div><strong>Obs:</strong> {pedido.observacoes}</div>}
        </div>
      )}

      {/* Total + actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold tabular-nums text-slate-900">
            {formatBRL(total)}
          </p>
          {pedido.comissaoPct > 0 && (
            <p className="text-xs text-slate-500 tabular-nums">
              Comissão {pedido.comissaoPct}%: {formatBRL(comissao)}
              {notaPesoFaturado(pedido) ? ` (${notaPesoFaturado(pedido)})` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {pedido.aprovadoEm && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPrint}
              className="gap-1"
            >
              <Printer size={12} />
              Gerar cópia
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="gap-1"
          >
            <Pencil size={12} />
            Editar
          </Button>
          {!isFaturado && (
            <Button
              size="sm"
              onClick={onInvoice}
              className="gap-1"
            >
              <Truck size={12} />
              Marcar como faturado
            </Button>
          )}
          {isFaturado && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUndoInvoice}
              className="gap-1"
            >
              <Undo2 size={12} />
              Desfazer
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            aria-label="Excluir pedido"
            className="gap-1 text-red-700"
          >
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
    </div>
  );
}
