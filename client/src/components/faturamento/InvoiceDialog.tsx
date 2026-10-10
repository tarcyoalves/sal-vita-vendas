import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { OrderItemsEditor } from './OrderItemsEditor';
import { useFatStore } from '../../lib/faturamento/store';
import { totalItens, formatBRL, dataInputLocal, hojeInputLocal } from '../../lib/faturamento/calc';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import type { ItemPedido } from '../../lib/faturamento/types';

interface InvoiceDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pedidoId: string | null;
  onDone?: () => void;
}

export function InvoiceDialog({
  open,
  onOpenChange,
  pedidoId,
  onDone,
}: InvoiceDialogProps) {
  const { actions } = useFatStore();

  const pedido = pedidoId ? actions.pedidos.get(pedidoId) : null;

  const [itensReais, setItensReais] = useState<ItemPedido[]>([]);
  const [faturadoEmData, setFaturadoEmData] = useState('');
  // Capture estimated baseline once when the dialog opens
  const estimadoSnapshotRef = useRef<ItemPedido[]>([]);

  useEffect(() => {
    if (!open || !pedido) return;
    // Clone current items as the "real" starting point (attendant can edit)
    setItensReais(pedido.itens.map((it) => ({ ...it })));
    // Refaturar mantém a data já registrada; a primeira vez sugere hoje. Quem
    // lança um embarque com atraso corrige aqui, senão o prêmio cairia no mês
    // do lançamento em vez do mês em que a mercadoria saiu.
    setFaturadoEmData(dataInputLocal(pedido.faturadoEm) || hojeInputLocal());
    // Snapshot for comparison: use existing snapshot if already set (re-opening), else current
    estimadoSnapshotRef.current =
      pedido.itensEstimadoSnapshot ?? pedido.itens;
  }, [open, pedidoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const estimadoTotal = useMemo(
    () => totalItens(estimadoSnapshotRef.current),
    [itensReais], // recalculate when the dialog re-renders (snapshot is stable)
  );
  const realTotal = useMemo(() => totalItens(itensReais), [itensReais]);
  const delta = realTotal - estimadoTotal;

  const handleConfirm = () => {
    if (!pedidoId) return;
    if (!faturadoEmData) {
      toast.error('Informe a data do faturamento/embarque');
      return;
    }
    actions.pedidos.faturar(pedidoId, itensReais, faturadoEmData);
    toast.success('Pedido marcado como faturado!');
    onDone?.();
    onOpenChange(false);
  };

  if (!pedido) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Faturar pedido</DialogTitle>
          <DialogDescription>
            Ajuste as quantidades e valores reais embarcados. Estes dados serão registrados como faturamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-slate-700">
            <span className="font-medium">Cliente:</span>{' '}
            {pedido.clienteNome}
            {pedido.cidade && ` - ${pedido.cidade}`}
            {pedido.uf && `/${pedido.uf}`}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-data" className="text-xs">
              Data do faturamento/embarque <span className="text-red-700" aria-hidden>*</span>
            </Label>
            <Input
              id="inv-data"
              type="date"
              value={faturadoEmData}
              onChange={(e) => setFaturadoEmData(e.target.value)}
              className="text-sm"
              required
            />
            <p className="text-xs text-slate-500">
              Define o mês do prêmio a pagar. Use a data real do embarque, mesmo que
              o lançamento esteja sendo feito depois.
            </p>
          </div>

          {/* Items editor (real values) */}
          <OrderItemsEditor itens={itensReais} onChange={setItensReais} />

          {/* Comparação */}
          <dl className="grid grid-cols-3 gap-3 border-t border-slate-200 pt-3 text-sm tabular-nums">
            <div>
              <dt className="text-xs text-slate-500">Estimado</dt>
              <dd className="text-base font-semibold text-slate-900">{formatBRL(estimadoTotal)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Faturado</dt>
              <dd className="text-base font-semibold text-slate-900">{formatBRL(realTotal)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Diferença</dt>
              <dd className={`text-base font-semibold ${delta >= 0 ? 'text-slate-900' : 'text-red-700'}`}>
                {delta >= 0 ? '+' : ''}
                {formatBRL(delta)}
              </dd>
            </div>
          </dl>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            Confirmar faturamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
