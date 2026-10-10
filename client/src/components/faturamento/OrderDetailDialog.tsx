import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { StatusBadge } from '../StatusBadge';
import { useFatStore } from '../../lib/faturamento/store';
import { useConfirm } from '../useConfirm';
import { useAuth } from '../../_core/hooks/useAuth';
import { trpc } from '../../lib/trpc';
import {
  totalPedido, comissaoPedido, freteTotal, pesoTotalItens, pesoEfetivoKg, notaPesoFaturado,
  formatBRL, formatKg, formatDataBR,
} from '../../lib/faturamento/calc';
import { OrderPrintDocument } from './OrderPrintDocument';
import { LinkTaskDialog } from './LinkTaskDialog';
import { Pencil, Truck, Trash2, CheckCircle2, Printer, Link2, Undo2, Loader2 } from 'lucide-react';
import SmbiPedidoControles from './SmbiPedidoControles';

interface OrderDetailDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pedidoId: string | null;
  onEdit: () => void;
  onInvoice: () => void;
  onDelete: () => void;
  onApproved?: () => void;
}

// Delegado ao calc: uma data pura ('2026-09-01') lida com `new Date` viraria
// 31/08 em fuso negativo, mostrando o mês errado justamente nos campos que
// definem a competência do prêmio.
const fmtDate = formatDataBR;

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
  const { actions, reload, loading: fatLoading } = useFatStore();
  const { confirm, confirmDialog } = useConfirm();
  const { user } = useAuth();
  const [aprovando, setAprovando] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const pedido = pedidoId ? actions.pedidos.get(pedidoId) : null;
  const canApprove = user?.role === 'admin' || user?.role === 'manager';

  // Pedidos antigos (importados do localStorage, antes da tarefa passar a ser
  // obrigatória na criação) podem ter ficado sem tarefa vinculada. Como não há
  // como reconstruir esse vínculo com certeza, oferece um painel de busca
  // (LinkTaskDialog — mesmo usado na visão do atendente) para o admin escolher
  // à mão em vez de tentar adivinhar automaticamente.
  const { data: allTasks = [], isLoading: carregandoTarefas } = trpc.tasks.list.useQuery(undefined, {
    enabled: !!pedido && (canApprove || !!pedido.taskId),
  });
  const tarefaVinculada = pedido?.taskId ? allTasks.find((t) => t.id === pedido.taskId) : undefined;

  // Pedido recém-criado por outro atendente ainda não está no espelho local: busca de novo
  // em vez de abrir um diálogo vazio. `tentouRecarregar` evita laço se ele realmente não existe.
  const [tentouRecarregar, setTentouRecarregar] = useState(false);
  const faltaNoEspelho = open && !!pedidoId && !pedido;
  useEffect(() => {
    if (!faltaNoEspelho) { setTentouRecarregar(false); return; }
    let vivo = true;
    void Promise.resolve(reload()).finally(() => { if (vivo) setTentouRecarregar(true); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faltaNoEspelho, pedidoId]);

  if (!pedido) {
    if (!faltaNoEspelho) return null;
    const buscando = fatLoading || !tentouRecarregar;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{buscando ? 'Carregando pedido…' : 'Pedido não encontrado'}</DialogTitle>
            <DialogDescription>
              {buscando
                ? 'Buscando os dados mais recentes no servidor.'
                : 'Não foi possível localizar este pedido. Ele pode ter sido excluído ou a conexão falhou.'}
            </DialogDescription>
          </DialogHeader>
          {buscando ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin text-brand-600" size={24} />
            </div>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => { setTentouRecarregar(false); void reload().finally(() => setTentouRecarregar(true)); }}>Tentar de novo</Button>
              <Button onClick={() => onOpenChange(false)}>Fechar</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  const handleLinkTask = (taskId: number) => {
    const trocou = !!pedido.taskId && pedido.taskId !== taskId;
    actions.pedidos.upsert({ id: pedido.id, taskId });
    toast.success(trocou ? `Vínculo trocado para a tarefa #${taskId}` : 'Pedido vinculado à tarefa!');
  };

  const total = totalPedido(pedido);
  const comissao = comissaoPedido(pedido);
  const frete = freteTotal(pedido);
  const isFaturado = pedido.status === 'faturado';

  // O aviso de sucesso só sai depois que o servidor confirma; se falhar, o store já
  // mostrou o erro e desfez o otimismo (recarga) — não anunciamos nada aqui.
  const handleAprovar = async () => {
    if (!user || aprovando) return;
    setAprovando(true);
    try {
      const ok = await actions.pedidos.aprovarConfirmando(pedido.id, user.name);
      if (ok) {
        toast.success('Pedido aprovado!');
        onApproved?.();
      }
    } finally {
      setAprovando(false);
    }
  };

  // Confirmação explícita: desfazer descarta as quantidades reais do embarque
  // (voltando ao estimado) e tira o pedido do faturamento do mês. Não é uma
  // ação que se queira disparar por engano num clique.
  const handleDesfazer = async () => {
    const ok = await confirm(
      'Ele volta para "estimado" e sai do faturamento do mês. ' +
        'As quantidades reais digitadas no embarque serão substituídas pelos valores estimados.',
      { title: 'Desfazer o faturamento deste pedido?', confirmLabel: 'Desfazer faturamento' },
    );
    if (!ok) return;
    actions.pedidos.desfazerFaturamento(pedido.id);
    toast.success('Faturamento desfeito. O pedido voltou para estimado.');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl w-[96vw] max-h-[92dvh] overflow-y-auto overflow-x-hidden">
        {confirmDialog}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap text-base">
            {pedido.clienteNome || 'Sem cliente'}
            <StatusBadge tone={isFaturado ? 'success' : 'warning'}>
              {isFaturado ? 'Faturado' : 'Estimado'}
            </StatusBadge>
            <StatusBadge tone={pedido.aprovadoEm ? 'info' : 'neutral'}>
              {pedido.aprovadoEm ? 'Autorizada' : 'Aguardando revisão'}
            </StatusBadge>
            {pedido.taskId && (
              <span className="text-brand-700 text-sm font-normal">Tarefa #{pedido.taskId}</span>
            )}
          </DialogTitle>
          <DialogDescription>
            Detalhes completos do pedido. Use as ações abaixo para editar, faturar ou excluir.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 min-w-0">
          {/* Client info */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-3 text-sm border-b border-slate-200 pb-4">
            <div>
              <dt className="text-xs text-slate-500">CNPJ</dt>
              <dd className="text-slate-900">{pedido.cnpj || '--'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Razão social</dt>
              <dd className="text-slate-900">{pedido.razaoSocial || '--'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Cidade/UF</dt>
              <dd className="text-slate-900">
                {[pedido.cidade, pedido.uf].filter(Boolean).join('/') || '--'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Atendente</dt>
              <dd className="text-slate-900">{pedido.sellerName || '--'}</dd>
            </div>
            {pedido.taskId && (
              <div className="col-span-2 sm:col-span-3 lg:col-span-4 rounded-md bg-slate-50 border border-slate-200 p-2.5">
                <dt className="text-xs text-slate-500 flex items-center justify-between gap-2">
                  <span>Tarefa vinculada #{pedido.taskId}</span>
                  {canApprove && (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setLinkDialogOpen(true)}>
                      <Link2 size={13} />
                      Trocar tarefa
                    </Button>
                  )}
                </dt>
                <dd className="text-slate-900 break-words">
                  {tarefaVinculada
                    ? [tarefaVinculada.title, tarefaVinculada.assignedTo && `Atendente: ${tarefaVinculada.assignedTo}`, tarefaVinculada.status && `Status: ${tarefaVinculada.status}`, tarefaVinculada.phone].filter(Boolean).join(' · ')
                    : 'Carregando… (ou tarefa de outro atendente)'}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-500">Criado em</dt>
              <dd className="text-slate-900">{fmtDate(pedido.criadoEm)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Previsão faturamento</dt>
              <dd className="text-slate-900">{fmtDate(pedido.previsaoFaturamentoEm ?? pedido.criadoEm)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Faturado em</dt>
              <dd className="text-slate-900">{fmtDate(pedido.faturadoEm)}</dd>
            </div>
            {pedido.aprovadoEm && (
              <div>
                <dt className="text-xs text-slate-500">Aprovado por</dt>
                <dd className="text-slate-900">{pedido.aprovadoPor} · {fmtDate(pedido.aprovadoEm)}</dd>
              </div>
            )}
          </dl>

          {/* Vincular a uma tarefa — só para pedidos antigos sem esse vínculo */}
          {!pedido.taskId && canApprove && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              <div className="flex items-center gap-1.5">
                <Link2 size={14} />
                <span className="font-medium">Sem tarefa vinculada</span>
              </div>
              <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setLinkDialogOpen(true)}>
                <Link2 size={14} />
                Vincular tarefa
              </Button>
            </div>
          )}

          {/* Items */}
          {pedido.itens.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm tabular-nums min-w-[560px]">
                <thead>
                  <tr className="bg-slate-50 text-left">
                    <th className="px-3 py-2 text-xs font-medium text-slate-500">Produto</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Qtd</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Peso</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Valor unit.</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pedido.itens.map((it) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-700">{it.descricao || 'Item'}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{it.quantidade}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{formatKg(it.pesoKg)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{formatBRL(it.valorUnitario)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">
                        {formatBRL(it.quantidade * it.valorUnitario)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300 bg-slate-50 font-semibold text-xs">
                    <td className="px-3 py-2 text-slate-700" colSpan={2}>Totais</td>
                    <td className="px-3 py-2 text-right text-slate-900">
                      {formatKg(pesoEfetivoKg(pedido))}
                      {pesoEfetivoKg(pedido) !== pesoTotalItens(pedido.itens) && (
                        <span className="block text-xs font-normal text-slate-500">SMBI · pedido: {formatKg(pesoTotalItens(pedido.itens))}</span>
                      )}
                    </td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Condições */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Forma de pagamento</dt>
              <dd className="text-slate-900">{pedido.prazoPagamentoSal || '--'}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Prazo do frete</dt>
              <dd className="text-slate-900">{pedido.prazoPagamentoFrete || '--'}</dd>
            </div>
            {frete > 0 && (
              <div>
                <dt className="text-xs text-slate-500">Frete total</dt>
                <dd className="tabular-nums text-slate-900">{formatBRL(frete)}</dd>
              </div>
            )}
            {pedido.observacoes && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-slate-500">Observações</dt>
                <dd className="whitespace-pre-wrap text-slate-900">{pedido.observacoes}</dd>
              </div>
            )}
          </dl>

          {/* Totais */}
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
            <span className="text-sm text-slate-700">
              Prêmio {pedido.comissaoPct}%: <strong className="font-semibold tabular-nums text-slate-900">{formatBRL(comissao)}</strong>
              {notaPesoFaturado(pedido) && <span className="block text-xs font-normal text-slate-500">{notaPesoFaturado(pedido)}</span>}
            </span>
            <span className="text-base font-semibold tabular-nums text-slate-900">Total {formatBRL(total)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="text-red-700 gap-1.5 sm:mr-auto"
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
              className="gap-1.5"
              onClick={handleAprovar}
              disabled={aprovando}
            >
              <CheckCircle2 size={14} />
              Aprovar pedido
            </Button>
          )}
          <SmbiPedidoControles pedido={pedido} />
          {!isFaturado && (
            <Button
              size="sm"
              className="gap-1.5"
              onClick={onInvoice}
            >
              <Truck size={14} />
              Marcar como faturado
            </Button>
          )}
          {isFaturado && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleDesfazer}
            >
              <Undo2 size={14} />
              Desfazer faturamento
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
            <Pencil size={14} />
            Editar pedido
          </Button>
        </DialogFooter>
      </DialogContent>

      <OrderPrintDocument open={printOpen} onOpenChange={setPrintOpen} pedido={pedido} />
      <LinkTaskDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        tasks={allTasks}
        carregando={carregandoTarefas}
        pedidoCnpj={pedido.cnpj}
        onConfirm={handleLinkTask}
      />
    </Dialog>
  );
}
