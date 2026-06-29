import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { OrderItemsEditor } from './OrderItemsEditor';
import { useFatStore } from '../../lib/faturamento/store';
import { totalItens, formatBRL } from '../../lib/faturamento/calc';
import type { ItemPedido, Pedido } from '../../lib/faturamento/types';

interface OrderDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  seller: { id: number; name: string } | null;
  task?: {
    id: number;
    title?: string;
    cnpj?: string | null;
    clientName?: string | null;
  } | null;
  existingPedidoId?: string | null;
  onSaved?: (pedido: Pedido) => void;
}

export function OrderDialog({
  open,
  onOpenChange,
  seller,
  task,
  existingPedidoId,
  onSaved,
}: OrderDialogProps) {
  const { actions, comissoes } = useFatStore();

  const existing = existingPedidoId ? actions.pedidos.get(existingPedidoId) : null;

  const [clienteNome, setClienteNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [itens, setItens] = useState<ItemPedido[]>([]);

  // Reset form whenever dialog opens or the target changes
  useEffect(() => {
    if (!open) return;
    if (existing) {
      setClienteNome(existing.clienteNome);
      setCnpj(existing.cnpj);
      setRazaoSocial(existing.razaoSocial);
      setCidade(existing.cidade);
      setUf(existing.uf);
      setItens(existing.itens);
    } else {
      setClienteNome(task?.clientName ?? task?.title ?? '');
      setCnpj(task?.cnpj ?? '');
      setRazaoSocial('');
      setCidade('');
      setUf('');
      setItens([]);
    }
  }, [open, existingPedidoId, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const comissaoPct = seller ? (comissoes[seller.id] ?? 0) : 0;
  const total = useMemo(() => totalItens(itens), [itens]);
  const comissaoValor = total * comissaoPct / 100;

  const handleSave = () => {
    if (!clienteNome.trim()) {
      toast.error('Informe o nome do cliente');
      return;
    }
    if (!seller) {
      toast.error('Perfil de vendedor não encontrado');
      return;
    }
    if (!task && !existingPedidoId) {
      toast.error('O pedido deve estar vinculado a uma tarefa');
      return;
    }
    const pedido = actions.pedidos.upsert({
      id: existingPedidoId ?? undefined,
      sellerId: seller.id,
      sellerName: seller.name,
      taskId: task?.id ?? null,
      clienteNome: clienteNome.trim(),
      cnpj: cnpj.trim(),
      razaoSocial: razaoSocial.trim(),
      cidade: cidade.trim(),
      uf: uf.trim().toUpperCase(),
      comissaoPct,
      itens,
      status: 'estimado',
    });
    toast.success(existingPedidoId ? 'Pedido atualizado!' : 'Pedido criado!');
    onSaved?.(pedido);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existingPedidoId ? 'Editar pedido' : 'Novo pedido (estimativa)'}
            {task && <span className="text-blue-600 text-sm font-normal ml-2">Tarefa #{task.id}</span>}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados do cliente e os itens do pedido. Selecione os produtos do catalogo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="od-cliente">Cliente</Label>
              <Input
                id="od-cliente"
                placeholder="Nome do cliente"
                value={clienteNome}
                onChange={(e) => setClienteNome(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od-cnpj">CNPJ</Label>
              <Input
                id="od-cnpj"
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od-razao">Razao Social</Label>
              <Input
                id="od-razao"
                placeholder="Razao Social"
                value={razaoSocial}
                onChange={(e) => setRazaoSocial(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="od-cidade">Cidade</Label>
                <Input
                  id="od-cidade"
                  placeholder="Cidade"
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="od-uf">UF</Label>
                <Input
                  id="od-uf"
                  placeholder="UF"
                  maxLength={2}
                  value={uf}
                  onChange={(e) => setUf(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Items editor */}
          <OrderItemsEditor itens={itens} onChange={setItens} />

          {/* Commission line */}
          {seller && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5">
              <span className="text-sm text-blue-800">
                Comissao: <strong>{comissaoPct}%</strong>
              </span>
              <span className="text-sm font-bold text-blue-900">
                {formatBRL(comissaoValor)}
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            {existingPedidoId ? 'Salvar alteracoes' : 'Criar pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
