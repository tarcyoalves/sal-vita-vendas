import { createPortal } from 'react-dom';
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

// Frete unitário desta linha (por saco/fardo): isento quando o produto tem
// preço final fixo (snapshot no item), senão o valor de frete por unidade do pedido.
function freteUnit(it: ItemPedido, valorFretePorUnidade: number): number {
  return it.isentoFrete ? 0 : Number(valorFretePorUnidade) || 0;
}

// Conteúdo do documento — extraído para ser renderizado uma única vez, direto
// como filho de <body> via portal (ver comentário no componente principal
// sobre por que isso é necessário para imprimir em uma página só).
function PedidoPrintContent({ pedido }: { pedido: Pedido }) {
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
    <div className="text-[13px] text-slate-800 p-6 max-w-[210mm] mx-auto bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-slate-800 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-800 rounded-xl flex items-center justify-center shrink-0">
            <img
              src="https://salvitarn.com.br/wp-content/uploads/2025/09/logotipo2.webp"
              alt="Sal Vita"
              style={{ height: '46px', width: 'auto' }}
              className="object-contain rounded-lg"
            />
          </div>
          <p className="text-xs text-slate-500 leading-snug">Sal marinho de<br />Mossoró/RN</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold uppercase text-slate-800">Pedido de Vendas</p>
          <p className="text-xs text-slate-500">Nº {pedido.id.slice(0, 8).toUpperCase()} · {fmtDate(pedido.criadoEm)}</p>
        </div>
      </div>

      {/* Cliente */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4 border border-slate-300 rounded-lg p-3">
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

      {/* Itens — valores unitários (por saco/fardo); totais agregados ficam na linha "Totais" */}
      <table className="w-full border-collapse mb-4">
        <thead>
          <tr className="border-b-2 border-slate-800">
            <th className="text-left py-1.5 text-[11px] font-semibold uppercase">Descrição do sal</th>
            <th className="text-right py-1.5 text-[11px] font-semibold uppercase">Qtd</th>
            <th className="text-right py-1.5 text-[11px] font-semibold uppercase">Peso</th>
            <th className="text-right py-1.5 text-[11px] font-semibold uppercase">Valor do sal<br />(un.)</th>
            <th className="text-right py-1.5 text-[11px] font-semibold uppercase">Valor do frete<br />(un.)</th>
            <th className="text-right py-1.5 text-[11px] font-semibold uppercase">Preço final<br />(un.)</th>
          </tr>
        </thead>
        <tbody>
          {pedido.itens.map((it) => {
            const frete = freteUnit(it, pedido.valorFretePorUnidade);
            return (
              <tr key={it.id} className="border-b border-slate-200">
                <td className="py-1.5">{it.descricao || 'Item'}</td>
                <td className="py-1.5 text-right">{it.quantidade}</td>
                <td className="py-1.5 text-right">{formatKg(it.pesoKg)}</td>
                <td className="py-1.5 text-right">{formatBRL(it.valorUnitario)}</td>
                <td className="py-1.5 text-right">{formatBRL(frete)}</td>
                <td className="py-1.5 text-right font-semibold">{formatBRL(it.valorUnitario + frete)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-800 font-semibold">
            <td className="py-1.5" colSpan={2}>Totais</td>
            <td className="py-1.5 text-right">{formatKg(pesoTotal)}</td>
            <td className="py-1.5 text-right">{formatBRL(totalSal)}</td>
            <td className="py-1.5 text-right">{formatBRL(totalFrete)}</td>
            <td className="py-1.5 text-right text-blue-900">{formatBRL(totalGeral)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Resumo de pagamento */}
      <table className="w-full border-collapse mb-4 border border-slate-300 rounded-lg overflow-hidden">
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="py-2 px-3 text-slate-600">Total Sal</td>
            <td className="py-2 px-3 text-right font-semibold">{formatBRL(totalSal)}</td>
            <td className="py-2 px-3 text-right text-slate-500">{pedido.prazoPagamentoSal || '--'}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-2 px-3 text-slate-600">Total Frete</td>
            <td className="py-2 px-3 text-right font-semibold">{formatBRL(totalFrete)}</td>
            <td className="py-2 px-3 text-right text-slate-500">{pedido.prazoPagamentoFrete || '--'}</td>
          </tr>
          <tr className="bg-blue-50">
            <td className="py-2.5 px-3 font-bold text-blue-900 uppercase text-xs">Total geral do pedido</td>
            <td className="py-2.5 px-3 text-right font-bold text-blue-900 text-lg" colSpan={2}>{formatBRL(totalGeral)}</td>
          </tr>
        </tbody>
      </table>

      {/* Observações gerais */}
      {pedido.observacoes && (
        <div className="border border-slate-300 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Observações gerais do pedido</p>
          <p className="whitespace-pre-wrap text-[13px]">{pedido.observacoes}</p>
        </div>
      )}
    </div>
  );
}

// Cópia do pedido, gerada pelo atendente para enviar ao cliente, disponível
// depois que o admin aprova. Documento 100% voltado ao cliente: sem comissão,
// sem dado administrativo — só o que o cliente precisa para conferir e pagar
// o pedido, em uma única página.
//
// O conteúdo é renderizado duas vezes: uma para a pré-visualização dentro do
// diálogo, e outra via portal direto em <body> (fora da árvore do diálogo).
// Isso é necessário porque o diálogo (Radix) usa position:fixed para se
// centralizar na tela — se a impressão tentasse "esconder tudo e mostrar só
// a área do pedido" dentro dessa árvore, o navegador ainda calcula a posição
// impressa relativa ao container fixo do diálogo, empurrando o conteúdo pra
// baixo e sobrando uma página quase em branco antes dele (bug real observado
// ao imprimir). O portal garante que a área impressa seja filha direta de
// <body>, sem nenhum ancestral posicionado, imprimindo do topo da página.
export function OrderPrintDocument({ open, onOpenChange, pedido }: OrderPrintDocumentProps) {
  if (!pedido) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto print:hidden">
        <DialogHeader>
          <DialogTitle>Cópia do pedido</DialogTitle>
          <DialogDescription>
            Documento pronto para enviar ao cliente. Clique em Imprimir para gerar o PDF (use "Salvar como PDF" na janela de impressão).
          </DialogDescription>
        </DialogHeader>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <PedidoPrintContent pedido={pedido} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => window.print()} className="gap-1.5">
            <Printer size={14} />
            Imprimir / Salvar PDF
          </Button>
        </DialogFooter>
      </DialogContent>

      {open && createPortal(
        <div id="pedido-print-root">
          <PedidoPrintContent pedido={pedido} />
        </div>,
        document.body,
      )}

      <style>{`
        #pedido-print-root { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 10mm; }
          body > *:not(#pedido-print-root) { display: none !important; }
          #pedido-print-root { display: block !important; }
        }
      `}</style>
    </Dialog>
  );
}
