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
    // lança um embarque com atraso corrige aqui, senão a comissão cairia no mês
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
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Faturar pedido</DialogTitle>
          <DialogDescription>
            Ajuste as quantidades e valores reais embarcados. Estes dados serao registrados como faturamento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            <span className="font-medium">Cliente:</span>{' '}
            {pedido.clienteNome}
            {pedido.cidade && ` - ${pedido.cidade}`}
            {pedido.uf && `/${pedido.uf}`}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-data" className="text-xs">
              Data do faturamento/embarque <span className="text-red-500">*</span>
            </Label>
            <Input
              id="inv-data"
              type="date"
              value={faturadoEmData}
              onChange={(e) => setFaturadoEmData(e.target.value)}
              className="text-sm"
              required
            />
            <p className="text-[11px] text-slate-500">
              Define o mês da comissão a pagar. Use a data real do embarque, mesmo que
              o lançamento esteja sendo feito depois.
            </p>
          </div>

          {/* Items editor (real values) */}
          <OrderItemsEditor itens={itensReais} onChange={setItensReais} />

          {/* Comparison */}
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
                Estimado
              </p>
              <p className="text-base font-bold text-amber-700">
                {formatBRL(estimadoTotal)}
              </p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-center">
              <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wide">
                Faturado
              </p>
              <p className="text-base font-bold text-emerald-700">
                {formatBRL(realTotal)}
              </p>
            </div>
            <div
              className={`rounded-xl px-3 py-2 text-center border ${
                delta >= 0
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <p
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  delta >= 0 ? 'text-blue-600' : 'text-red-600'
                }`}
              >
                Diferenca
              </p>
              <p
                className={`text-base font-bold ${
                  delta >= 0 ? 'text-blue-700' : 'text-red-700'
                }`}
              >
                {delta >= 0 ? '+' : ''}
                {formatBRL(delta)}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            Confirmar faturamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
