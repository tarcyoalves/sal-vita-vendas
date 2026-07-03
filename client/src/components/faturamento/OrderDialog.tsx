import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { OrderItemsEditor } from './OrderItemsEditor';
import { useFatStore } from '../../lib/faturamento/store';
import { totalItens, formatBRL, parseBRL } from '../../lib/faturamento/calc';
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
    description?: string | null;
  } | null;
  existingPedidoId?: string | null;
  onSaved?: (pedido: Pedido) => void;
}

// Leads importados em massa gravam title/description em formato posicional:
//   title       = [cnpj, nome, fone, email, cidade, uf].filter(Boolean).join(' - ')
//   description = [cidade, uf].filter(Boolean).join(' - ')
// (ver Tasks.tsx, importação CSV). Extrai razaoSocial/cidade/uf desse formato
// quando disponível, para pré-preencher o pedido ao converter o lead.
function parseTaskClientInfo(task: OrderDialogProps['task']): {
  razaoSocial: string;
  cidade: string;
  uf: string;
} {
  let razaoSocial = '';
  let cidade = '';
  let uf = '';

  if (task?.description) {
    const parts = task.description.split(' - ').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2 && /^[A-Za-z]{2}$/.test(parts[parts.length - 1])) {
      uf = parts[parts.length - 1].toUpperCase();
      cidade = parts.slice(0, -1).join(' - ');
    } else if (parts.length === 1) {
      cidade = parts[0];
    }
  }

  if (task?.title && task?.cnpj) {
    const segments = task.title.split(' - ').map((s) => s.trim()).filter(Boolean);
    const cnpjIdx = segments.findIndex((s) => s.replace(/\D/g, '') === task.cnpj);
    if (cnpjIdx >= 0 && segments[cnpjIdx + 1]) {
      razaoSocial = segments[cnpjIdx + 1];
    }
  }

  return { razaoSocial, cidade, uf };
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
  const [prazoPagamentoSal, setPrazoPagamentoSal] = useState('');
  const [prazoPagamentoFrete, setPrazoPagamentoFrete] = useState('');
  const [valorFreteRaw, setValorFreteRaw] = useState('');
  const [valorPagoRaw, setValorPagoRaw] = useState('');
  const [observacoes, setObservacoes] = useState('');

  // Pedido recém-criado nesta sessão do diálogo: assim que o admin confirma
  // "Pedido criado!" ele pode continuar editando (agora como update) até
  // clicar em "Concluir" no aviso de confirmação.
  const [savedPedido, setSavedPedido] = useState<Pedido | null>(null);
  const [showSuccessConfirm, setShowSuccessConfirm] = useState(false);
  const effectiveId = existingPedidoId ?? savedPedido?.id ?? null;

  useEffect(() => {
    if (!open) return;
    setSavedPedido(null);
    setShowSuccessConfirm(false);
    if (existing) {
      setClienteNome(existing.clienteNome);
      setCnpj(existing.cnpj);
      setRazaoSocial(existing.razaoSocial);
      setCidade(existing.cidade);
      setUf(existing.uf);
      setItens(existing.itens);
      setPrazoPagamentoSal(existing.prazoPagamentoSal ?? '');
      setPrazoPagamentoFrete(existing.prazoPagamentoFrete ?? '');
      setValorFreteRaw(existing.valorFretePorUnidade ? String(existing.valorFretePorUnidade).replace('.', ',') : '');
      setValorPagoRaw(existing.valorPago ? String(existing.valorPago).replace('.', ',') : '');
      setObservacoes(existing.observacoes ?? '');
    } else {
      const parsed = parseTaskClientInfo(task);
      setClienteNome(task?.clientName ?? task?.title ?? '');
      setCnpj(task?.cnpj ?? '');
      setRazaoSocial(parsed.razaoSocial);
      setCidade(parsed.cidade);
      setUf(parsed.uf);
      setItens([]);
      setPrazoPagamentoSal('');
      setPrazoPagamentoFrete('');
      setValorFreteRaw('');
      setValorPagoRaw('');
      setObservacoes('');
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
    if (!task && !effectiveId) {
      toast.error('O pedido deve estar vinculado a uma tarefa');
      return;
    }
    if (!prazoPagamentoSal.trim()) {
      toast.error('Informe o prazo de pagamento do sal');
      return;
    }
    if (!prazoPagamentoFrete.trim()) {
      toast.error('Informe o prazo de pagamento do frete');
      return;
    }
    const isFirstSave = !effectiveId;
    const pedido = actions.pedidos.upsert({
      id: effectiveId ?? undefined,
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
      prazoPagamentoSal: prazoPagamentoSal.trim(),
      prazoPagamentoFrete: prazoPagamentoFrete.trim(),
      valorFretePorUnidade: parseBRL(valorFreteRaw),
      valorPago: parseBRL(valorPagoRaw),
      observacoes: observacoes.trim(),
      status: 'estimado',
    });
    onSaved?.(pedido);
    if (isFirstSave) {
      setSavedPedido(pedido);
      setShowSuccessConfirm(true);
    } else {
      toast.success('Pedido atualizado!');
      onOpenChange(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>
            {existingPedidoId ? 'Editar pedido' : 'Novo pedido (estimativa)'}
            {task && <span className="text-blue-600 text-sm font-normal ml-2">Tarefa #{task.id}</span>}
          </DialogTitle>
          <DialogDescription>
            Preencha os dados do cliente e os itens do pedido. Selecione os produtos do catalogo.
          </DialogDescription>
        </DialogHeader>

        {/* min-w-0 evita que o DialogContent (display:grid) estique a modal
            inteira para caber a tabela de itens — o scroll fica contido nela. */}
        <div className="space-y-4 min-w-0">
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

          {/* Payment & freight info */}
          <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Condicoes e Frete</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="od-prazo-sal" className="text-xs">Prazo pagamento sal <span className="text-red-500">*</span></Label>
                <Input
                  id="od-prazo-sal"
                  placeholder="Ex: 30 dias, a vista, 15/30/45"
                  value={prazoPagamentoSal}
                  onChange={(e) => setPrazoPagamentoSal(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="od-prazo-frete" className="text-xs">Prazo pagamento frete <span className="text-red-500">*</span></Label>
                <Input
                  id="od-prazo-frete"
                  placeholder="Ex: a vista, 30 dias"
                  value={prazoPagamentoFrete}
                  onChange={(e) => setPrazoPagamentoFrete(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="od-valor-frete" className="text-xs">Valor do frete por saco/fardo</Label>
                <Input
                  id="od-valor-frete"
                  placeholder="R$ 0,00"
                  inputMode="decimal"
                  value={valorFreteRaw}
                  onChange={(e) => setValorFreteRaw(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="od-valor-pago" className="text-xs">Valor pago (V.pago)</Label>
                <Input
                  id="od-valor-pago"
                  placeholder="R$ 0,00"
                  inputMode="decimal"
                  value={valorPagoRaw}
                  onChange={(e) => setValorPagoRaw(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="od-obs" className="text-xs">Observacoes</Label>
              <Textarea
                id="od-obs"
                placeholder="Informacoes adicionais do pedido..."
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>
          </div>

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
            {effectiveId ? 'Salvar alteracoes' : 'Criar pedido'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showSuccessConfirm} onOpenChange={setShowSuccessConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pedido criado!</AlertDialogTitle>
          <AlertDialogDescription>
            O pedido foi salvo. Deseja revisar os dados antes de concluir, ou já está tudo certo?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setShowSuccessConfirm(false)}>
            Editar novamente
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setShowSuccessConfirm(false);
              onOpenChange(false);
            }}
          >
            Concluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
