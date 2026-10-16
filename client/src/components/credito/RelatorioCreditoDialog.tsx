import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { QueryError } from '../QueryError';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import { formatarDocumento } from '../../lib/credito/documento';
import { faixaExibivel, frasePelaFonte } from '../../../../shared/creditoRotulos';
import { dataHoraBR, permissoesCredito } from '../../lib/credito/regras';
import { analisarSinais, entradasDeScore, ROTULO_VEREDITO, type RelatorioCredito, type Veredito } from '../../../../shared/credito';
import { fontesFaltantes, nomeDoProduto } from '../../../../shared/creditoCatalogo';
import { StatusBadge } from '../StatusBadge';
import { ConsultarOutraFonte } from './ConsultarOutraFonte';
import { CreditoSemaforo } from './CreditoSemaforo';
import { MatrizComparacao } from './MatrizComparacao';
import { PontosDeAtencao } from './PontosDeAtencao';
import { Anotacoes, ComportamentoComercial, ConsultasDoDocumento, DadosDaEmpresa, Secao, Socios, brl, pct, txt } from './RelatorioSecoes';
import { ScoresDasFontes } from './ScoresDasFontes';
import { SeloSimulacao } from './SeloSimulacao';
import { useBaixarPdfCredito } from './useBaixarPdfCredito';

export interface RelatorioCreditoDialogProps {
  /** Modo relatório: UM relatório (uma consulta de um produto). */
  reportId?: number | null;
  /** Modo documento: o RELATÓRIO CONSOLIDADO do CNPJ/CPF (todas as fontes válidas combinadas). Tem prioridade sobre `reportId`. */
  documento?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/** Visão comum aos dois modos: o que a tela precisa além do `RelatorioCredito`. */
interface Visao { id: number | null; veredito: Veredito; motivos: string[]; consultadoEm: string | Date; provedor: string; motivo: string | null }

/** Relatório completo (mesmas seções do PDF), por consulta ou consolidado do documento. Só admin/gerente: o servidor usa staffProcedure. */
export function RelatorioCreditoDialog({ reportId = null, documento = null, open, onOpenChange }: RelatorioCreditoDialogProps) {
  const { user } = useAuth();
  const perm = permissoesCredito(user?.role);
  const modoDoc = !!documento;
  const q = trpc.credito.relatorio.useQuery({ id: reportId ?? 0 }, { enabled: open && !modoDoc && reportId !== null && perm.verRelatorio, retry: false });
  const qd = trpc.credito.relatorioDocumento.useQuery({ documento: documento ?? '' }, { enabled: open && modoDoc && perm.verRelatorio, retry: false });
  const { baixar, baixandoId, baixarDocumento, baixandoDocumento, ocupado } = useBaixarPdfCredito();
  const utils = trpc.useUtils();
  const reprocessar = trpc.credito.reprocessar.useMutation();
  const [verEstrutura, setVerEstrutura] = useState(false);
  const individual = open && !modoDoc && reportId !== null;
  const estrutura = trpc.credito.estruturaBruta.useQuery({ id: reportId ?? 0 }, { enabled: individual && perm.administrar && verEstrutura, retry: false });
  const link = trpc.credito.linkOriginal.useQuery({ id: reportId ?? 0 }, { enabled: individual && perm.administrar, retry: false });
  const ativa = modoDoc ? qd : q;
  const consolidado = modoDoc ? qd.data?.consolidado : undefined;
  const d: Visao | undefined = modoDoc
    ? (qd.data ? {
      id: null, veredito: qd.data.veredito, motivos: qd.data.motivos, consultadoEm: qd.data.consolidado.consultadoEm,
      provedor: qd.data.consolidado.simulado ? 'simulado' : 'consolidado', motivo: null,
    } : undefined)
    : (q.data ? {
      id: q.data.id, veredito: q.data.veredito, motivos: q.data.motivos, consultadoEm: q.data.consultadoEm,
      provedor: q.data.provedor, motivo: q.data.motivo,
    } : undefined);
  const r: RelatorioCredito | undefined = modoDoc ? qd.data?.consolidado.fundido : q.data?.relatorio;
  const sinais = useMemo(
    () => (modoDoc ? (qd.data?.sinais ?? []) : (r && q.data ? analisarSinais(r, new Date(q.data.consultadoEm)) : [])),
    [modoDoc, qd.data, r, q.data],
  );
  const simulado = d?.provedor === 'simulado';
  const faltam = consolidado ? fontesFaltantes(consolidado.fontes.map((f) => f.produto)) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl w-[96vw] max-h-[92dvh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">{modoDoc ? `Relatório de crédito do ${r?.tipo ?? 'CNPJ'}` : 'Relatório de análise de crédito'}</DialogTitle>
          <DialogDescription>
            {r && d
              ? consolidado
                ? `${r.tipo} ${formatarDocumento(r.documento)} · Fontes: ${consolidado.fontes.map((f) => `${f.produtoNome} (${dataHoraBR(f.consultadoEm)})`).join(' + ')}`
                : `${r.tipo} ${formatarDocumento(r.documento)} · consulta em ${dataHoraBR(d.consultadoEm)} · Fonte: ${r.fonte.provedor === 'boavista_apifull' ? 'API Full' : r.fonte.provedor === 'simulado' ? 'Simulado' : r.fonte.provedor} / ${nomeDoProduto(q.data?.produto ?? r.fonte.produto, r.fonte.provedor)}`
              : 'Carregando…'}
          </DialogDescription>
        </DialogHeader>

        {!perm.verRelatorio ? (
          <p className="text-sm text-slate-600">Seu usuário não tem acesso ao relatório completo.</p>
        ) : ativa.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-brand-600" aria-label="Carregando" /></div>
        ) : ativa.error || !d || !r ? (
          <QueryError message={ativa.error?.message ?? 'Não foi possível carregar o relatório'} onRetry={() => void ativa.refetch()} retrying={ativa.isFetching} />
        ) : (
          <div className="min-w-0 space-y-5">
            {simulado && <SeloSimulacao />}

            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="break-words text-lg font-semibold text-slate-900">{txt(r.cadastro.razaoSocial ?? r.cadastro.nomeFantasia)}</p>
              <div className="flex flex-wrap items-center gap-2">
                <CreditoSemaforo relatorio={{ veredito: d.veredito, valido: true, simulado }} size="lg" />
                <span className="text-base font-semibold text-slate-900">{ROTULO_VEREDITO[d.veredito]}</span>
                <span className="text-xs text-slate-500">(regras da Sal Vita)</span>
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                {(d.motivos.length ? d.motivos : ['Nenhum fator de restrição encontrado nas regras da Sal Vita.']).map((m) => <li key={m} className="break-words">{m}</li>)}
              </ul>
              {!consolidado && <PontosDeAtencao sinais={sinais} />}
              {consolidado && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Fontes consultadas">
                  {consolidado.fontes.map((f) => (
                    <li key={f.produto}>
                      <StatusBadge tone="neutral">
                        {f.produtoNome} · {dataHoraBR(f.consultadoEm)}{f.custoReais != null && f.custoReais > 0 ? ` · ${brl(f.custoReais)}` : ''}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
              {consolidado && !consolidado.valido && <p className="text-xs font-medium text-amber-800">Vencido: nenhuma das consultas tem menos de 30 dias.</p>}
            </div>

            {consolidado && faltam.length > 0 && <ConsultarOutraFonte documento={r.documento} faltam={faltam} />}

            {consolidado ? (
              <>
                <Secao titulo="Scores informados pelas fontes"><ScoresDasFontes consolidado={consolidado} /></Secao>
                <Secao titulo="Comparação entre as fontes"><MatrizComparacao consolidado={consolidado} /></Secao>
                <Secao titulo="Pontos de atenção (regras da Sal Vita)"><PontosDeAtencao sinais={sinais} titulo={null} /></Secao>
              </>
            ) : (
              <Secao titulo="Score">
                <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                  <div>
                    <p className="text-xs text-slate-500">Score (0 a 1000)</p>
                    <p className="text-3xl font-bold tabular-nums text-brand-700">{r.score.valor ?? 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Probabilidade de inadimplência</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{pct(r.score.probabilidadeInadimplencia)}</p>
                  </div>
                  {faixaExibivel(r.score.faixa) && <div><p className="text-xs text-slate-500">Faixa</p><p className="text-sm text-slate-900">{faixaExibivel(r.score.faixa)}</p></div>}
                </div>
                {entradasDeScore(r.score).slice(1).map((o) => (
                  <p key={o.rotulo ?? 'outro'} className="text-sm text-slate-800">
                    <strong>Outro score da mesma fonte{o.rotulo ? ` (${o.rotulo})` : ''}:</strong>{' '}
                    {o.valor === null ? 'não calculado' : `${o.valor} · probabilidade ${pct(o.probabilidadeInadimplencia)}${o.faixa ? ` · faixa ${o.faixa}` : ''}`}
                  </p>
                ))}
                <p className="text-xs text-slate-500">Score e probabilidade informados pela fonte; não são calculados pela Sal Vita.</p>
                {d.veredito === 'REPROVADO_A_PRAZO' && (r.score.valor ?? 0) >= 600 && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                    Atenção: o score da fonte é alto, mas o relatório registra restrições. Para decidir, prevalecem as restrições, não o score.
                  </p>
                )}
                {r.score.textoInterpretacao && <p className="line-clamp-2 text-xs text-slate-500" title={frasePelaFonte(r.score.textoInterpretacao)}>{frasePelaFonte(r.score.textoInterpretacao)}</p>}
              </Secao>
            )}

            <Anotacoes r={r} agora={new Date(d.consultadoEm)} consolidado={!!consolidado} />
            <DadosDaEmpresa r={r} />
            <Socios r={r} />
            <ConsultasDoDocumento r={r} consolidado={consolidado} />
            <ComportamentoComercial r={r} tela={modoDoc ? qd.data?.comportamento : null} />

            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              Documento confidencial, de uso interno da Sal Vita, destinado à análise de concessão de crédito (LGPD).
              {d.motivo ? ` Motivo da consulta: ${d.motivo}.` : ''}
            </p>
          </div>
        )}

        {perm.administrar && d && d.id !== null && (
          <details className="rounded-md border border-slate-200 p-3 text-xs text-slate-600" onToggle={(e) => setVerEstrutura((e.currentTarget as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer font-medium text-slate-700">Diagnóstico da resposta do provedor (só admin)</summary>
            {estrutura.isLoading ? <p className="mt-2">Carregando…</p> : estrutura.data && !estrutura.data.guardado ? (
              <p className="mt-2">A resposta original não foi guardada.</p>
            ) : estrutura.data ? (
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-50 p-2">{estrutura.data.linhas.join('\n')}</pre>
            ) : null}
          </details>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Fechar</Button>
          {perm.administrar && d && d.id !== null && (
            <Button variant="outline" size="lg" disabled={reprocessar.isPending} onClick={() => reprocessar.mutate({ id: d.id as number }, {
              onSuccess: () => { toast.success('Relatório refeito a partir da resposta já paga (sem custo).'); void utils.credito.invalidate(); },
              onError: (e) => toast.error(e.message),
            })}>
              {reprocessar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Reprocessar (sem custo)
            </Button>
          )}
          {perm.baixarPdf && d && modoDoc && r && (
            <Button size="lg" onClick={() => void baixarDocumento(r.documento)} disabled={ocupado}>
              {baixandoDocumento === r.documento ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              Baixar PDF do CNPJ
            </Button>
          )}
          {perm.baixarPdf && d && d.id !== null && (
            <Button size="lg" onClick={() => void baixar(d.id as number)} disabled={ocupado}>
              {baixandoId === d.id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              Baixar PDF (completo)
            </Button>
          )}
          {perm.administrar && !modoDoc && link.data?.url && (
            <a href={link.data.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
              PDF original do provedor
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
