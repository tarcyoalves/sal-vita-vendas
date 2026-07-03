import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Printer } from 'lucide-react';
import { totalItens, pesoTotalItens, freteTotal, formatBRL, formatKg } from '../../lib/faturamento/calc';
import type { Pedido, ItemPedido } from '../../lib/faturamento/types';

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

// Frete desta linha: isento quando o produto tem preço final fixo (snapshot
// no item), senão quantidade × valor do frete por unidade do pedido.
function freteItem(it: ItemPedido, valorFretePorUnidade: number): number {
  return it.isentoFrete ? 0 : (Number(it.quantidade) || 0) * (Number(valorFretePorUnidade) || 0);
}

// Cópia do pedido, gerada pelo atendente para enviar ao cliente, disponível
// depois que o admin aprova. Documento 100% voltado ao cliente: sem comissão,
// sem dado administrativo — só o que o cliente precisa para conferir e pagar
// o pedido, em uma única página.
export function OrderPrintDocument({ open, onOpenChange, pedido }: OrderPrintDocumentProps) {
  if (!pedido) return null;

  const totalSal = totalItens(pedido.itens);
  const totalFrete = freteTotal(pedido);
  const totalGeral = totalSal + totalFrete;
  const pesoTotal = pesoTotalItens(pedido.itens);

  // Cliente e Razão Social costumam vir com o mesmo valor (herdado da task) —
  // mostrar só uma vez evita a duplicação óbvia que confunde o cliente.
  const razaoSocial = pedido.razaoSocial?.trim() || '';
  const clienteNome = pedido.clienteNome?.trim() || '';
  const nomePrincipal = razaoSocial || clienteNome || '--';
  const nomeSecundario =
    clienteNome && razaoSocial && clienteNome.toLowerCase() !== razaoSocial.toLowerCase()
      ? clienteNome
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto print:max-w-none print:max-h-none print:overflow-visible">
        <DialogHeader className="print:hidden">
          <DialogTitle>Cópia do pedido</DialogTitle>
          <DialogDescription>
            Documento pronto para enviar ao cliente. Clique em Imprimir para gerar o PDF (use "Salvar como PDF" na janela de impressão).
          </DialogDescription>
        </DialogHeader>

        <div id="pedido-print-area" className="text-sm text-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
                <img
                  src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
                  alt="Sal Vita"
                  style={{ height: '40px', width: 'auto' }}
                  className="object-contain rounded-lg"
                />
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">Sal marinho de<br />Mossoró/RN</p>
            </div>
            <div className="text-right">
              <p className="text-base font-bold uppercase text-slate-800">Pedido de Vendas</p>
              <p className="text-xs text-slate-500">Nº {pedido.id.slice(0, 8).toUpperCase()} · {fmtDate(pedido.criadoEm)}</p>
            </div>
          </div>

          {/* Cliente */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3 border border-slate-300 rounded-lg p-2.5">
            <div className="col-span-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Cliente</p>
              <p className="font-medium">{nomePrincipal}</p>
              {nomeSecundario && <p className="text-xs text-slate-500">{nomeSecundario}</p>}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">CNPJ</p>
              <p>{pedido.cnpj || '--'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Cidade/UF</p>
              <p>{[pedido.cidade, pedido.uf].filter(Boolean).join('/') || '--'}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] font-semibold text-slate-400 uppercase">Atendente</p>
              <p>{pedido.sellerName || '--'}</p>
            </div>
          </div>

          {/* Itens */}
          <table className="w-full border-collapse mb-3">
            <thead>
              <tr className="border-b-2 border-slate-800">
                <th className="text-left py-1 text-[11px] font-semibold uppercase">Descrição do sal</th>
                <th className="text-right py-1 text-[11px] font-semibold uppercase">Qtd</th>
                <th className="text-right py-1 text-[11px] font-semibold uppercase">Peso</th>
                <th className="text-right py-1 text-[11px] font-semibold uppercase">Valor do sal</th>
                <th className="text-right py-1 text-[11px] font-semibold uppercase">Valor do frete</th>
                <th className="text-right py-1 text-[11px] font-semibold uppercase">Preço final</th>
              </tr>
            </thead>
            <tbody>
              {pedido.itens.map((it) => {
                const valorSal = it.quantidade * it.valorUnitario;
                const valorFrete = freteItem(it, pedido.valorFretePorUnidade);
                return (
                  <tr key={it.id} className="border-b border-slate-200">
                    <td className="py-1">{it.descricao || 'Item'}</td>
                    <td className="py-1 text-right">{it.quantidade}</td>
                    <td className="py-1 text-right">{formatKg(it.pesoKg)}</td>
                    <td className="py-1 text-right">{formatBRL(valorSal)}</td>
                    <td className="py-1 text-right">{formatBRL(valorFrete)}</td>
                    <td className="py-1 text-right font-semibold">{formatBRL(valorSal + valorFrete)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800 font-semibold">
                <td className="py-1" colSpan={2}>Totais</td>
                <td className="py-1 text-right">{formatKg(pesoTotal)}</td>
                <td className="py-1 text-right">{formatBRL(totalSal)}</td>
                <td className="py-1 text-right">{formatBRL(totalFrete)}</td>
                <td className="py-1 text-right text-blue-900">{formatBRL(totalGeral)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Resumo de pagamento */}
          <table className="w-full border-collapse mb-3 border border-slate-300 rounded-lg overflow-hidden">
            <tbody className="text-sm">
              <tr className="border-b border-slate-200">
                <td className="py-1.5 px-2.5 text-slate-600">Total Sal</td>
                <td className="py-1.5 px-2.5 text-right font-semibold">{formatBRL(totalSal)}</td>
                <td className="py-1.5 px-2.5 text-right text-slate-500">{pedido.prazoPagamentoSal || '--'}</td>
              </tr>
              <tr className="border-b border-slate-200">
                <td className="py-1.5 px-2.5 text-slate-600">Total Frete</td>
                <td className="py-1.5 px-2.5 text-right font-semibold">{formatBRL(totalFrete)}</td>
                <td className="py-1.5 px-2.5 text-right text-slate-500">{pedido.prazoPagamentoFrete || '--'}</td>
              </tr>
              <tr className="bg-blue-50">
                <td className="py-2 px-2.5 font-bold text-blue-900 uppercase text-xs">Total geral do pedido</td>
                <td className="py-2 px-2.5 text-right font-bold text-blue-900 text-lg" colSpan={2}>{formatBRL(totalGeral)}</td>
              </tr>
            </tbody>
          </table>

          {/* Observações gerais */}
          {pedido.observacoes && (
            <div className="border border-slate-300 rounded-lg p-2.5">
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Observações gerais do pedido</p>
              <p className="whitespace-pre-wrap text-sm">{pedido.observacoes}</p>
            </div>
          )}
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
          @page { size: A4 portrait; margin: 14mm; }
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
