import { useState } from 'react';
import { Download, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/button';
import { StatusBadge } from '../StatusBadge';
import { QueryError } from '../QueryError';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import { ROTULO_VEREDITO } from '../../../../shared/credito';
import { formatarDocumento, soDigitos, validarDocumentoLocal } from '../../lib/credito/documento';
import { dataBR, dataHoraBR, permissoesCredito } from '../../lib/credito/regras';
import { cn } from '../../lib/utils';
import { CreditoSemaforo } from './CreditoSemaforo';
import { PontosDeAtencao } from './PontosDeAtencao';
import { SeloSimulacao } from './SeloSimulacao';
import { ConsultarCreditoDialog } from './ConsultarCreditoDialog';
import { RelatorioCreditoDialog } from './RelatorioCreditoDialog';
import { useBaixarPdfCredito } from './useBaixarPdfCredito';

export interface CreditoCardProps {
  documento: string;
  pedidoId?: string;
  taskId?: number;
  razaoSocial?: string | null;
  /** Menos espaço: sem lista completa de motivos (usado na tarefa). */
  compacto?: boolean;
  /** Esconde os botões de consulta (a tela que hospeda já tem o seu). */
  semConsultar?: boolean;
  className?: string;
}

/**
 * Card de crédito de um CNPJ/CPF. Todos veem semáforo, veredito, score e motivos (o servidor limita o atendente à
 * carteira dele). Relatório e PDF: admin/gerente. Consultar: só admin.
 */
export function CreditoCard({ documento, pedidoId, taskId, razaoSocial, compacto = false, semConsultar = false, className }: CreditoCardProps) {
  const { user } = useAuth();
  const perm = permissoesCredito(user?.role);
  const doc = soDigitos(documento);
  const valido = validarDocumentoLocal(doc).ok;
  const [consultarAberto, setConsultarAberto] = useState(false);
  const [relatorioId, setRelatorioId] = useState<number | null>(null);
  const { baixar, baixandoId } = useBaixarPdfCredito();

  const q = trpc.credito.ultimo.useQuery({ documento: doc }, { enabled: valido && perm.verCard, retry: false, staleTime: 30_000 });
  const c = q.data;

  const caixa = cn('min-w-0 space-y-3 rounded-lg border border-slate-200 bg-white p-3', className);

  if (!valido) {
    return (
      <div className={caixa}>
        <p className="text-sm text-slate-500">{doc ? 'CNPJ/CPF inválido: não é possível analisar o crédito.' : 'Sem CNPJ informado: não há análise de crédito.'}</p>
      </div>
    );
  }
  if (q.isLoading) {
    return <div className={caixa}><p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" aria-hidden />Carregando crédito…</p></div>;
  }
  if (q.error) {
    const proibido = q.error.data?.code === 'FORBIDDEN';
    return (
      <div className={caixa}>
        {proibido
          ? <p className="text-sm text-slate-500">Este documento está fora da sua carteira.</p>
          : <QueryError message="Falha ao carregar o crédito" onRetry={() => void q.refetch()} retrying={q.isFetching} />}
      </div>
    );
  }

  const botaoConsultar = perm.consultar && !semConsultar && (
    <Button size="lg" variant={c ? 'outline' : 'default'} className="h-10" onClick={() => setConsultarAberto(true)}>
      <ShieldCheck aria-hidden />{c ? 'Consultar de novo' : 'Consultar crédito'}
    </Button>
  );

  return (
    <div className={caixa}>
      {c?.simulado && <SeloSimulacao />}

      {!c ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <CreditoSemaforo relatorio={null} size="lg" />Sem análise de crédito para {formatarDocumento(doc)}.
          </p>
          {botaoConsultar && <div className="flex flex-wrap gap-2">{botaoConsultar}</div>}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <CreditoSemaforo relatorio={c} size="lg" />
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-slate-900">{ROTULO_VEREDITO[c.veredito]}</p>
                <p className="text-xs text-slate-500">Consulta em {dataHoraBR(c.consultadoEm)}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {!c.valido && <StatusBadge tone="warning">Vencido (mais de 30 dias)</StatusBadge>}
              <span className="text-sm text-slate-700">Score <strong className="tabular-nums text-slate-900">{c.score ?? 'n/i'}</strong></span>
            </div>
          </div>

          {!compacto && c.motivos.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
              {c.motivos.map((m) => <li key={m} className="break-words">{m}</li>)}
            </ul>
          )}
          {compacto && c.motivos.length > 0 && (
            <p className="break-words text-xs text-slate-600">{c.motivos.slice(0, 2).join(' · ')}{c.motivos.length > 2 ? ` (+${c.motivos.length - 2})` : ''}</p>
          )}

          {c.produtos.length > 0 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Consultas feitas">
              {c.produtos.map((p) => (
                <li key={p.produto}>
                  <StatusBadge tone={!p.valido ? 'neutral' : p.veredito === 'APROVADO' ? 'success' : p.veredito === 'COM_RESTRICAO' ? 'warning' : 'danger'}>
                    {p.nome} · {dataBR(p.consultadoEm)}{p.valido ? '' : ' (vencida)'}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}

          <PontosDeAtencao sinais={compacto ? c.sinais.filter((s) => s.nivel !== 'POSITIVO') : c.sinais} />

          {(perm.verRelatorio || perm.consultar) && (
            <div className="flex flex-wrap gap-2">
              {perm.verRelatorio && (
                <Button size="lg" variant="outline" className="h-10" onClick={() => setRelatorioId(c.id)}>
                  <FileText aria-hidden />Ver relatório
                </Button>
              )}
              {perm.baixarPdf && (
                <Button size="lg" variant="outline" className="h-10" onClick={() => void baixar(c.id)} disabled={baixandoId !== null}>
                  {baixandoId === c.id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}Baixar PDF
                </Button>
              )}
              {botaoConsultar}
            </div>
          )}
        </>
      )}

      <ConsultarCreditoDialog
        open={consultarAberto}
        onOpenChange={setConsultarAberto}
        documento={doc}
        razaoSocial={razaoSocial ?? c?.razaoSocial}
        taskId={taskId}
        pedidoId={pedidoId}
      />
      <RelatorioCreditoDialog reportId={relatorioId} open={relatorioId !== null} onOpenChange={(o) => { if (!o) setRelatorioId(null); }} />
    </div>
  );
}
