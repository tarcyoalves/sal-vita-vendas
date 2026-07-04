import { useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Printer, Mail, Loader2 } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import {
  totalItens, pesoTotalItens, freteTotal, freteUnitItem, formatBRL, formatKg, formatPrazo,
} from '../../lib/faturamento/calc';
import { EMPRESA } from '../../../../shared/const';
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

// Conteúdo do documento — extraído para ser renderizado uma única vez, direto
// como filho de <body> via portal (ver comentário no componente principal
// sobre por que isso é necessário para imprimir em uma página só).
function PedidoPrintContent({ pedido }: { pedido: Pedido }) {
  const totalSal = totalItens(pedido.itens);
  const totalFrete = freteTotal(pedido);
  const totalGeral = totalSal + totalFrete;
  const pesoTotal = pesoTotalItens(pedido.itens);

  // Só um nome de cliente — clienteNome às vezes guarda o título bruto da
  // task (que já embute CNPJ/telefone/cidade), então mostrar os dois campos
  // duplicava a mesma informação de formas diferentes. Razão Social é a
  // fonte mais confiável quando existe.
  const nomePrincipal = pedido.razaoSocial?.trim() || pedido.clienteNome?.trim() || '--';

  return (
    <div className="text-[13px] text-slate-800 p-6 max-w-[210mm] mx-auto bg-white">
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3 mb-4 gap-4">
        <div className="flex items-start gap-3">
          <img
            src="https://salvitarn.com.br/wp-content/uploads/2025/04/logo-SAL-VITA.png"
            alt="Sal Vita"
            style={{ height: '58px', width: 'auto' }}
            className="object-contain shrink-0"
          />
          <div className="text-[11px] text-slate-600 leading-snug">
            <p className="font-bold text-slate-800 text-[13px]">{EMPRESA.razaoSocial}</p>
            <p>CNPJ: {EMPRESA.cnpj} · IE: {EMPRESA.ie}</p>
            <p>{EMPRESA.endereco}</p>
            <p>{EMPRESA.cidade} · Tel: {EMPRESA.telefone} · {EMPRESA.email}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold uppercase text-slate-800">Pedido de Vendas</p>
          <p className="text-xs text-slate-500">Nº {pedido.id.slice(0, 8).toUpperCase()} · {fmtDate(pedido.criadoEm)}</p>
        </div>
      </div>

      {/* Cliente */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4 border border-slate-300 rounded-lg p-3">
        <div className="col-span-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase">Cliente</p>
          <p className="font-medium">{nomePrincipal}</p>
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

      {/* Itens — valores unitários (por saco/fardo). Totais agregados (em R$)
          ficam só no resumo de pagamento abaixo, para não repetir o mesmo
          número em dois lugares; a linha "Totais" aqui mostra só o peso,
          que não aparece em nenhum outro lugar do documento. */}
      <table className="w-full border-collapse mb-4 table-fixed">
        <colgroup>
          <col className="w-[34%]" />
          <col className="w-[9%]" />
          <col className="w-[13%]" />
          <col className="w-[14%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
        </colgroup>
        <thead>
          <tr className="border-b-2 border-slate-800">
            <th className="text-left py-1.5 pr-2 text-[11px] font-semibold uppercase">Descrição do sal</th>
            <th className="text-right py-1.5 px-1 text-[11px] font-semibold uppercase whitespace-nowrap">Qtd</th>
            <th className="text-right py-1.5 px-1 text-[11px] font-semibold uppercase whitespace-nowrap">Peso</th>
            <th className="text-right py-1.5 px-1 text-[11px] font-semibold uppercase leading-tight">Valor do<br />sal (un.)</th>
            <th className="text-right py-1.5 px-1 text-[11px] font-semibold uppercase leading-tight">Valor do<br />frete (un.)</th>
            <th className="text-right py-1.5 pl-1 text-[11px] font-semibold uppercase leading-tight">Preço<br />final (un.)</th>
          </tr>
        </thead>
        <tbody>
          {pedido.itens.map((it) => {
            const frete = freteUnitItem(it, pedido.valorFretePorUnidade);
            return (
              <tr key={it.id} className="border-b border-slate-200">
                <td className="py-1.5 pr-2 break-words">{it.descricao || 'Item'}</td>
                <td className="py-1.5 px-1 text-right whitespace-nowrap">{it.quantidade}</td>
                <td className="py-1.5 px-1 text-right whitespace-nowrap">{formatKg(it.pesoKg)}</td>
                <td className="py-1.5 px-1 text-right whitespace-nowrap">{formatBRL(it.valorUnitario)}</td>
                <td className="py-1.5 px-1 text-right whitespace-nowrap">{formatBRL(frete)}</td>
                <td className="py-1.5 pl-1 text-right font-semibold whitespace-nowrap">{formatBRL(it.valorUnitario + frete)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-800 font-semibold">
            <td className="py-1.5 pr-2" colSpan={2}>Peso total</td>
            <td className="py-1.5 px-1 text-right whitespace-nowrap">{formatKg(pesoTotal)}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>

      {/* Resumo de pagamento */}
      <table className="w-full border-collapse mb-4 border border-slate-300 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-300">
            <th className="text-left py-1.5 px-3 text-[10px] font-semibold text-slate-400 uppercase">&nbsp;</th>
            <th className="text-right py-1.5 px-3 text-[10px] font-semibold text-slate-400 uppercase">Valor</th>
            <th className="text-right py-1.5 px-3 text-[10px] font-semibold text-slate-400 uppercase">Condição de pagamento</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-slate-200">
            <td className="py-2 px-3 text-slate-600">Total Sal</td>
            <td className="py-2 px-3 text-right font-semibold">{formatBRL(totalSal)}</td>
            <td className="py-2 px-3 text-right text-slate-500">{formatPrazo(pedido.prazoPagamentoSal)}</td>
          </tr>
          <tr className="border-b border-slate-200">
            <td className="py-2 px-3 text-slate-600">Total Frete</td>
            <td className="py-2 px-3 text-right font-semibold">{formatBRL(totalFrete)}</td>
            <td className="py-2 px-3 text-right text-slate-500">{formatPrazo(pedido.prazoPagamentoFrete)}</td>
          </tr>
          <tr className="bg-blue-50">
            <td className="py-2.5 px-3 font-bold text-blue-900 uppercase text-xs">Total geral do pedido</td>
            <td className="py-2.5 px-3 text-right font-bold text-blue-900 text-lg" colSpan={2}>{formatBRL(totalGeral)}</td>
          </tr>
        </tbody>
      </table>

      {/* Observações gerais — bloco sempre presente, mesmo vazio */}
      <div className="border border-slate-300 rounded-lg p-3 mb-4 min-h-[52px]">
        <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Observações gerais do pedido</p>
        {pedido.observacoes && <p className="whitespace-pre-wrap text-[13px]">{pedido.observacoes}</p>}
      </div>

      <p className="text-center text-xs text-slate-400 pt-2 border-t border-slate-200">
        {EMPRESA.site}
      </p>
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
  const enviarEmailMutation = trpc.faturamento.enviarPedidoEmail.useMutation({
    onSuccess: () => toast.success('E-mail enviado para o cliente!'),
    onError: (err) => toast.error(err.message || 'Não foi possível enviar o e-mail'),
  });

  if (!pedido) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto print:hidden">
        <DialogHeader>
          <DialogTitle>Cópia do pedido</DialogTitle>
          <DialogDescription>
            Documento pronto para enviar ao cliente. Clique em Imprimir para gerar o PDF (use "Salvar como PDF" na janela de impressão), ou envie direto por e-mail.
          </DialogDescription>
        </DialogHeader>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <PedidoPrintContent pedido={pedido} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={() => window.print()} variant="outline" className="gap-1.5">
            <Printer size={14} />
            Imprimir / Salvar PDF
          </Button>
          <Button
            onClick={() => enviarEmailMutation.mutate({ pedidoId: pedido.id })}
            disabled={enviarEmailMutation.isPending}
            className="gap-1.5"
          >
            {enviarEmailMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
            Enviar por e-mail
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
