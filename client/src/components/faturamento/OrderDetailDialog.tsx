import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../ui/select';
import { useFatStore } from '../../lib/faturamento/store';
import { useAuth } from '../../_core/hooks/useAuth';
import { trpc } from '../../lib/trpc';
import {
  totalPedido, comissaoPedido, freteTotal, pesoTotalItens,
  formatBRL, formatKg,
} from '../../lib/faturamento/calc';
import { OrderPrintDocument } from './OrderPrintDocument';
import { Pencil, Truck, Trash2, CheckCircle2, Printer, Link2 } from 'lucide-react';

const onlyDigits = (v?: string | null) => (v ?? '').replace(/\D/g, '');

interface OrderDetailDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pedidoId: string | null;
  onEdit: () => void;
  onInvoice: () => void;
  onDelete: () => void;
  onApproved?: () => void;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR');
}

// Popup de gerenciamento do pedido — visão completa (admin), com atalhos para
// editar, marcar como faturado ou excluir. Reutiliza os dialogs já existentes
// (fecha este e abre o correspondente) em vez de duplicar a lógica de edição.
export function OrderDetailDialog({
  open,
  onOpenChange,
  pedidoId,
  onEdit,
  onInvoice,
  onDelete,
  onApproved,
}: OrderDetailDialogProps) {
  const { actions } = useFatStore();
  const { user } = useAuth();
  const [printOpen, setPrintOpen] = useState(false);
  const [linkTaskId, setLinkTaskId] = useState('');
  const pedido = pedidoId ? actions.pedidos.get(pedidoId) : null;
  const canApprove = user?.role === 'admin' || user?.role === 'manager';

  // Pedidos antigos (importados do localStorage, antes da tarefa passar a ser
  // obrigatória na criação) podem ter ficado sem tarefa vinculada. Como não há
  // como reconstruir esse vínculo com certeza, oferece uma lista de tarefas
  // candidatas (mesmo CNPJ, senão mesmo atendente) para o admin escolher à mão
  // em vez de tentar adivinhar automaticamente.
  const { data: allTasks = [] } = trpc.tasks.list.useQuery(undefined, {
    enabled: canApprove && !!pedido && !pedido.taskId,
  });
  const candidateTasks = useMemo(() => {
    if (!pedido || pedido.taskId) return [];
    const cnpj = onlyDigits(pedido.cnpj);
    const porCnpj = cnpj ? allTasks.filter((t) => onlyDigits(t.cnpj) === cnpj) : [];
    if (porCnpj.length > 0) return porCnpj;
    return allTasks.filter((t) => t.assignedTo?.toLowerCase() === pedido.sellerName?.toLowerCase());
  }, [allTasks, pedido]);

  if (!pedido) return null;

  const total = totalPedido(pedido);
  const comissao = comissaoPedido(pedido);
  const frete = freteTotal(pedido);
  const isFaturado = pedido.status === 'faturado';

  const handleAprovar = () => {
    if (!user) return;
    actions.pedidos.aprovar(pedido.id, user.name);
    toast.success('Pedido aprovado!');
    onApproved?.();
  };

  const handleVincularTarefa = () => {
    if (!linkTaskId) return;
    actions.pedidos.upsert({ id: pedido.id, taskId: Number(linkTaskId) });
    toast.success('Pedido vinculado à tarefa!');
    setLinkTaskId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {pedido.clienteNome || 'Sem cliente'}
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
              {pedido.aprovadoEm ? 'Autorizada' : 'Aguardando revisão'}
            </Badge>
            {pedido.taskId && (
              <span className="text-blue-600 text-sm font-normal">Tarefa #{pedido.taskId}</span>
            )}
          </DialogTitle>
          <DialogDescription>
            Detalhes completos do pedido. Use as ações abaixo para editar, faturar ou excluir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          {/* Client info */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">CNPJ</p>
              <p className="text-slate-700">{pedido.cnpj || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Razao Social</p>
              <p className="text-slate-700">{pedido.razaoSocial || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Cidade/UF</p>
              <p className="text-slate-700">
                {[pedido.cidade, pedido.uf].filter(Boolean).join('/') || '--'}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Atendente</p>
              <p className="text-slate-700">{pedido.sellerName || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Criado em</p>
              <p className="text-slate-700">{fmtDate(pedido.criadoEm)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Faturado em</p>
              <p className="text-slate-700">{fmtDate(pedido.faturadoEm)}</p>
            </div>
            {pedido.aprovadoEm && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Aprovado por</p>
                <p className="text-slate-700">{pedido.aprovadoPor} · {fmtDate(pedido.aprovadoEm)}</p>
              </div>
            )}
          </div>

          {/* Vincular a uma tarefa — só para pedidos antigos sem esse vínculo */}
          {!pedido.taskId && canApprove && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 text-sm text-orange-800">
              <div className="flex items-center gap-1.5 shrink-0">
                <Link2 size={14} />
                <span className="font-medium">Sem tarefa vinculada</span>
              </div>
              {candidateTasks.length > 0 ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Select value={linkTaskId} onValueChange={setLinkTaskId}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue placeholder="Selecione a tarefa correspondente" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidateTasks.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          #{t.id} · {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8 gap-1.5 shrink-0" disabled={!linkTaskId} onClick={handleVincularTarefa}>
                    <Link2 size={14} />
                    Vincular
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-orange-700">Nenhuma tarefa com o mesmo CNPJ/atendente encontrada.</span>
              )}
            </div>
          )}

          {/* Items */}
          {pedido.itens.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-3 py-2 text-xs font-semibold text-slate-600 uppercase">Produto</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-600 uppercase text-right">Qtd</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-600 uppercase text-right">Peso</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-600 uppercase text-right">Valor unit.</th>
                    <th className="px-3 py-2 text-xs font-semibold text-slate-600 uppercase text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pedido.itens.map((it) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{it.descricao || 'Item'}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{it.quantidade}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{formatKg(it.pesoKg)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{formatBRL(it.valorUnitario)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">
                        {formatBRL(it.quantidade * it.valorUnitario)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-xs">
                    <td className="px-3 py-2 text-slate-500" colSpan={2}>Totais</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatKg(pesoTotalItens(pedido.itens))}</td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Payment/freight/obs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-sm text-amber-800">
            <div>
              <p className="text-[10px] font-semibold text-amber-500 uppercase">F. Pagamento</p>
              <p>{pedido.prazoPagamentoSal || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-amber-500 uppercase">Prazo frete</p>
              <p>{pedido.prazoPagamentoFrete || '--'}</p>
            </div>
            {frete > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-amber-500 uppercase">Frete total</p>
                <p>{formatBRL(frete)}</p>
              </div>
            )}
            {pedido.observacoes && (
              <div className="col-span-2 sm:col-span-3">
                <p className="text-[10px] font-semibold text-amber-500 uppercase">Obs</p>
                <p>{pedido.observacoes}</p>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
            <span className="text-sm text-blue-800">
              Comissao {pedido.comissaoPct}%: <strong>{formatBRL(comissao)}</strong>
            </span>
            <span className="text-lg font-bold text-blue-900">{formatBRL(total)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 border-red-200 hover:bg-red-50 gap-1.5"
            onClick={onDelete}
          >
            <Trash2 size={14} />
            Excluir
          </Button>
          {pedido.aprovadoEm && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setPrintOpen(true)}
            >
              <Printer size={14} />
              Gerar cópia
            </Button>
          )}
          {canApprove && !pedido.aprovadoEm && (
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 gap-1.5"
              onClick={handleAprovar}
            >
              <CheckCircle2 size={14} />
              Aprovar pedido
            </Button>
          )}
          {!isFaturado && (
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
              onClick={onInvoice}
            >
              <Truck size={14} />
              Marcar como faturado
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={onEdit}>
            <Pencil size={14} />
            Editar pedido
          </Button>
        </DialogFooter>
      </DialogContent>

      <OrderPrintDocument open={printOpen} onOpenChange={setPrintOpen} pedido={pedido} />
    </Dialog>
  );
}
