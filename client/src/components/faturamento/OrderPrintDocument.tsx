import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Printer } from 'lucide-react';
import {
  totalItens, pesoTotalItens, pesoBrutoTotalItens, comissaoPedido, freteTotal, formatBRL, formatKg,
} from '../../lib/faturamento/calc';
import type { Pedido } from '../../lib/faturamento/types';

interface OrderPrintDocumentProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pedido: Pedido | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '--' : d.toLocaleDateString('pt-BR');
}

// Cópia do pedido, gerada pelo atendente para enviar ao cliente, disponível
// depois que o admin aprova. Usa só campos que o sistema de fato rastreia —
// não inclui endereço completo, transportador/motorista/veículo, desconto ou
// impostos, pois o CRM não guarda esses dados hoje.
export function OrderPrintDocument({ open, onOpenChange, pedido }: OrderPrintDocumentProps) {
  if (!pedido) return null;

  const total = totalItens(pedido.itens);
  const comissao = comissaoPedido(pedido);
  const frete = freteTotal(pedido);
  const saldo = total - (Number(pedido.valorPago) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle>Cópia do pedido</DialogTitle>
          <DialogDescription>
            Documento pronto para enviar ao cliente. Clique em Imprimir para gerar o PDF (use "Salvar como PDF" na janela de impressão).
          </DialogDescription>
        </DialogHeader>

        <div id="pedido-print-area" className="text-sm text-slate-800">
          {/* Header */}
          <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3 mb-4">
            <div>
              <p className="text-2xl font-bold text-blue-900 tracking-tight">Sal Vita</p>
              <p className="text-xs text-slate-500">Sal marinho de Mossoró/RN</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold uppercase">Pedido de Vendas</p>
              <p className="text-xs text-slate-500">Nº {pedido.id.slice(0, 8).toUpperCase()}</p>
              <p className="text-xs text-slate-500">Data: {fmtDate(pedido.criadoEm)}</p>
            </div>
          </div>

          {/* Cliente */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 border border-slate-300 rounded-lg p-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Cliente</p>
              <p>{pedido.clienteNome || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">CNPJ</p>
              <p>{pedido.cnpj || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Razão Social</p>
              <p>{pedido.razaoSocial || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Cidade/UF</p>
              <p>{[pedido.cidade, pedido.uf].filter(Boolean).join('/') || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Atendente</p>
              <p>{pedido.sellerName || '--'}</p>
            </div>
            {pedido.aprovadoEm && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Aprovado por</p>
                <p>{pedido.aprovadoPor} em {fmtDate(pedido.aprovadoEm)}</p>
              </div>
            )}
          </div>

          {/* Itens */}
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr className="border-b-2 border-slate-800">
                <th className="text-left py-1.5 text-[11px] font-semibold uppercase">Produto</th>
                <th className="text-right py-1.5 text-[11px] font-semibold uppercase">Qtd</th>
                <th className="text-right py-1.5 text-[11px] font-semibold uppercase">Peso líq.</th>
                <th className="text-right py-1.5 text-[11px] font-semibold uppercase">Peso bruto</th>
                <th className="text-right py-1.5 text-[11px] font-semibold uppercase">Valor unit.</th>
                <th className="text-right py-1.5 text-[11px] font-semibold uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {pedido.itens.map((it) => (
                <tr key={it.id} className="border-b border-slate-200">
                  <td className="py-1.5">{it.descricao || 'Item'}</td>
                  <td className="py-1.5 text-right">{it.quantidade}</td>
                  <td className="py-1.5 text-right">{formatKg(it.pesoKg)}</td>
                  <td className="py-1.5 text-right">{formatKg(it.pesoBrutoKg || it.pesoKg)}</td>
                  <td className="py-1.5 text-right">{formatBRL(it.valorUnitario)}</td>
                  <td className="py-1.5 text-right font-semibold">{formatBRL(it.quantidade * it.valorUnitario)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800 font-semibold">
                <td className="py-1.5" colSpan={2}>Totais</td>
                <td className="py-1.5 text-right">{formatKg(pesoTotalItens(pedido.itens))}</td>
                <td className="py-1.5 text-right">{formatKg(pesoBrutoTotalItens(pedido.itens))}</td>
                <td />
                <td className="py-1.5 text-right text-blue-900">{formatBRL(total)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Condições */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4 border border-slate-300 rounded-lg p-3">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">F. Pagamento</p>
              <p>{pedido.prazoPagamentoSal || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Prazo frete</p>
              <p>{pedido.prazoPagamentoFrete || '--'}</p>
            </div>
            {!!pedido.valorFretePorUnidade && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Frete/unidade</p>
                <p>{formatBRL(pedido.valorFretePorUnidade)}</p>
              </div>
            )}
            {frete > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase">Frete total</p>
                <p>{formatBRL(frete)}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">V. Pago</p>
              <p>{formatBRL(pedido.valorPago)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Saldo</p>
              <p>{formatBRL(saldo)}</p>
            </div>
          </div>

          {pedido.observacoes && (
            <div className="mb-4">
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Observações</p>
              <p className="whitespace-pre-wrap">{pedido.observacoes}</p>
            </div>
          )}

          <div className="flex items-center justify-between border-t-2 border-slate-800 pt-3 mt-2">
            <span className="text-xs text-slate-500">
              Comissão {pedido.comissaoPct}%: {formatBRL(comissao)}
            </span>
            <span className="text-lg font-bold text-blue-900">{formatBRL(total)}</span>
          </div>

          <p className="text-[10px] text-slate-400 mt-4">
            Documento gerado em {new Date().toLocaleString('pt-BR')} — Sal Vita
          </p>
        </div>

        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => window.print()} className="gap-1.5">
            <Printer size={14} />
            Imprimir / Salvar PDF
          </Button>
        </DialogFooter>
      </DialogContent>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #pedido-print-area, #pedido-print-area * { visibility: visible; }
          #pedido-print-area {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
          }
        }
      `}</style>
    </Dialog>
  );
}
