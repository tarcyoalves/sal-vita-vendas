import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { useFatStore } from '../../lib/faturamento/store';
import { formatBRL, totalPedido } from '../../lib/faturamento/calc';

interface DeleteOrderDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pedidoId: string | null;
  onDeleted?: () => void;
}

const MIN_REASON_LENGTH = 5;

export function DeleteOrderDialog({
  open,
  onOpenChange,
  pedidoId,
  onDeleted,
}: DeleteOrderDialogProps) {
  const { actions } = useFatStore();
  const pedido = pedidoId ? actions.pedidos.get(pedidoId) : null;

  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open, pedidoId]);

  const handleConfirm = () => {
    if (!pedidoId) return;
    if (reason.trim().length < MIN_REASON_LENGTH) {
      toast.error(`Informe o motivo da exclusão (mínimo ${MIN_REASON_LENGTH} caracteres)`);
      return;
    }
    actions.pedidos.remove(pedidoId, reason.trim());
    toast.success('Pedido excluído');
    onDeleted?.();
    onOpenChange(false);
  };

  if (!pedido) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Excluir pedido</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. O pedido será removido permanentemente.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-slate-50 px-3 py-2 text-sm space-y-0.5">
          <p className="font-semibold text-slate-900">{pedido.clienteNome || 'Sem cliente'}</p>
          {pedido.cnpj && <p className="text-xs text-slate-500">{pedido.cnpj}</p>}
          <p className="text-sm font-semibold tabular-nums text-slate-900">{formatBRL(totalPedido(pedido))}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="del-reason" className="block text-sm font-medium text-slate-700">
            Motivo da exclusão <span className="text-red-700" aria-hidden>*</span>
          </label>
          <textarea
            id="del-reason"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20 focus-visible:border-brand-500"
            rows={3}
            placeholder="Descreva o motivo (ex.: pedido duplicado, cliente desistiu)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            autoFocus
          />
          <p className="text-xs text-slate-500 text-right">{reason.length}/500</p>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={reason.trim().length < MIN_REASON_LENGTH}
          >
            Excluir pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
