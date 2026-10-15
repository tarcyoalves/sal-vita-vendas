import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Download, FileText, Link2, Loader2, Unlink } from 'lucide-react';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ConfirmDialog';
import { PromptDialog } from '../PromptDialog';
import { QueryError } from '../QueryError';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import { ROTULO_VEREDITO, type Veredito } from '../../../../shared/credito';
import { soDigitos, validarDocumentoLocal } from '../../lib/credito/documento';
import {
  dataHoraBR, mostrarAvisoCreditoReprovado, pedidoLiberado, permissoesCredito, podeMostrarLiberar, rotuloOrigemVinculo, textoLiberacao,
} from '../../lib/credito/regras';
import type { Pedido } from '../../lib/faturamento/types';
import { CreditoCard } from './CreditoCard';
import { CreditoSemaforo } from './CreditoSemaforo';
import { RelatorioCreditoDialog } from './RelatorioCreditoDialog';
import { useBaixarPdfCredito } from './useBaixarPdfCredito';

interface Props {
  pedido: Pedido;
  /** Chamado depois de liberar, para recarregar o espelho de pedidos. */
  onLiberado?: () => void;
}

/** Seção "Crédito" do detalhe do pedido: card do CNPJ, aviso/liberação e relatórios arquivados neste pedido. */
export function PedidoCreditoSecao({ pedido, onLiberado }: Props) {
  const { user } = useAuth();
  const perm = permissoesCredito(user?.role);
  const utils = trpc.useUtils();
  const doc = soDigitos(pedido.cnpj);
  const valido = validarDocumentoLocal(doc).ok;
  const { baixar, baixandoId } = useBaixarPdfCredito();
  const [relatorioId, setRelatorioId] = useState<number | null>(null);
  const [desvincular, setDesvincular] = useState<number | null>(null);
  const [liberarAberto, setLiberarAberto] = useState(false);

  const ultimo = trpc.credito.ultimo.useQuery({ documento: doc }, { enabled: valido, retry: false, staleTime: 30_000 });
  const porPedido = trpc.credito.porPedido.useQuery({ pedidoId: pedido.id }, { enabled: valido, retry: false });

  const refrescar = () => { void utils.credito.invalidate(); };
  const vincular = trpc.credito.vincular.useMutation({
    onSuccess: (r) => { toast.success(r.criado ? 'Relatório vinculado a este pedido' : 'Relatório já estava vinculado'); refrescar(); },
    onError: (e) => toast.error(e.message),
  });
  const desvincularMut = trpc.credito.desvincular.useMutation({
    onSuccess: () => { toast.success('Relatório desvinculado do pedido'); refrescar(); },
    onError: (e) => toast.error(e.message),
  });
  const liberar = trpc.credito.liberarPedido.useMutation({
    onSuccess: () => { toast.success('Pedido liberado apesar do crédito reprovado'); setLiberarAberto(false); refrescar(); onLiberado?.(); },
    onError: (e) => toast.error(e.message),
  });

  const aviso = mostrarAvisoCreditoReprovado({
    veredito: ultimo.data?.veredito, valido: ultimo.data?.valido, prazoSal: pedido.prazoPagamentoSal,
  });
  const liberado = pedidoLiberado(pedido);
  const textoLiberado = textoLiberacao(pedido);

  const linha = (r: { id: number; consultadoEm: Date; veredito: Veredito; score: number | null; origem: string | null; vinculado: boolean }) => (
    <li key={`${r.id}-${r.vinculado}`} className="space-y-2 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <CreditoSemaforo relatorio={{ veredito: r.veredito, valido: true }} size="md" />
        <span className="font-medium text-slate-900">{ROTULO_VEREDITO[r.veredito]}</span>
        <span className="text-slate-600">Score {r.score ?? 'n/i'}</span>
        <span className="text-xs text-slate-500">{dataHoraBR(r.consultadoEm)}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs ${r.vinculado ? 'bg-brand-50 text-brand-800' : 'bg-slate-100 text-slate-700'}`}>
          {rotuloOrigemVinculo(r.origem)}
        </span>
      </div>
      {(perm.verRelatorio || perm.administrar) && (
        <div className="flex flex-wrap gap-2">
          {perm.verRelatorio && (
            <Button size="lg" variant="outline" className="h-10" onClick={() => setRelatorioId(r.id)}><FileText aria-hidden />Ver</Button>
          )}
          {perm.baixarPdf && (
            <Button size="lg" variant="outline" className="h-10" onClick={() => void baixar(r.id)} disabled={baixandoId !== null}>
              {baixandoId === r.id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}Baixar PDF
            </Button>
          )}
          {perm.administrar && !r.vinculado && (
            <Button size="lg" className="h-10" disabled={vincular.isPending} onClick={() => vincular.mutate({ reportId: r.id, pedidoId: pedido.id })}>
              <Link2 aria-hidden />Vincular a este pedido
            </Button>
          )}
          {perm.administrar && r.vinculado && (
            <Button size="lg" variant="outline" className="h-10 text-red-700" disabled={desvincularMut.isPending} onClick={() => setDesvincular(r.id)}>
              <Unlink aria-hidden />Desvincular
            </Button>
          )}
        </div>
      )}
    </li>
  );

  return (
    <section className="space-y-3 border-t border-slate-200 pt-4" aria-label="Crédito">
      <h3 className="text-sm font-semibold text-slate-900">Crédito</h3>

      {!valido ? (
        <p className="text-sm text-slate-500">{doc ? 'O CNPJ deste pedido é inválido: não é possível analisar o crédito.' : 'Pedido sem CNPJ: não há análise de crédito.'}</p>
      ) : (
        <>
          {aviso && (
            <div role="alert" className="space-y-2 rounded-md border-2 border-red-300 bg-red-50 p-3 text-sm text-red-800">
              <p className="flex items-start gap-2 font-semibold"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />Crédito reprovado a prazo</p>
              <p>O prazo do sal deste pedido é “{pedido.prazoPagamentoSal || 'não informado'}”. Com o bloqueio ligado, o envio ao SMBI é recusado até o admin liberar.</p>
              {podeMostrarLiberar({ admin: perm.administrar, avisoVisivel: aviso, liberado }) && (
                <Button size="lg" variant="destructive" className="h-10" onClick={() => setLiberarAberto(true)}>Liberar este pedido</Button>
              )}
            </div>
          )}
          {textoLiberado && (
            <p className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><span className="min-w-0 break-words">{textoLiberado}</span>
            </p>
          )}

          <CreditoCard documento={doc} pedidoId={pedido.id} razaoSocial={pedido.razaoSocial || pedido.clienteNome} />

          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Relatórios arquivados neste pedido</h4>
            {porPedido.isLoading ? (
              <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" aria-hidden />Carregando…</p>
            ) : porPedido.error ? (
              <QueryError message={porPedido.error.message} onRetry={() => void porPedido.refetch()} retrying={porPedido.isFetching} />
            ) : (porPedido.data?.vinculados.length ?? 0) === 0 && !porPedido.data?.ultimoDoCnpj ? (
              <p className="text-sm text-slate-500">Nenhum relatório de crédito ligado a este pedido.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {porPedido.data?.vinculados.map(linha)}
                {porPedido.data?.ultimoDoCnpj && linha(porPedido.data.ultimoDoCnpj)}
              </ul>
            )}
          </div>
        </>
      )}

      <RelatorioCreditoDialog reportId={relatorioId} open={relatorioId !== null} onOpenChange={(o) => { if (!o) setRelatorioId(null); }} />
      <ConfirmDialog
        open={desvincular !== null}
        onOpenChange={(o) => { if (!o) setDesvincular(null); }}
        title="Desvincular o relatório deste pedido?"
        description="O relatório continua no arquivo de análises; só deixa de estar ligado a este pedido."
        confirmLabel="Desvincular"
        onConfirm={() => { if (desvincular !== null) desvincularMut.mutate({ reportId: desvincular, pedidoId: pedido.id }); setDesvincular(null); }}
      />
      <PromptDialog
        open={liberarAberto}
        onOpenChange={setLiberarAberto}
        title="Liberar este pedido?"
        description="O envio ao SMBI deixa de ser bloqueado por crédito neste pedido. Fica registrado quem liberou e por quê."
        label="Motivo da liberação"
        minLength={5}
        confirmLabel="Liberar pedido"
        submitDisabled={liberar.isPending}
        onSubmit={(motivo) => liberar.mutate({ pedidoId: pedido.id, motivo })}
      />
    </section>
  );
}
