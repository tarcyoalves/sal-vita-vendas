import { useState } from 'react';
import { toast } from 'sonner';
import { useMemo } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { QueryError } from '../QueryError';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import { formatBRL } from '../../lib/faturamento/calc';
import { formatarDocumento, mascararDocumentoSocio } from '../../lib/credito/documento';
import { dataBR, dataHoraBR, permissoesCredito } from '../../lib/credito/regras';
import { naturezaJuridicaTexto } from '../../../../shared/creditoRotulos';
import { analisarSinais, atenuacaoDoItem, ROTULO_VEREDITO, type RelatorioCredito, type Veredito } from '../../../../shared/credito';
import { StatusBadge } from '../StatusBadge';
import { CreditoSemaforo } from './CreditoSemaforo';
import { PontosDeAtencao } from './PontosDeAtencao';
import { SeloSimulacao } from './SeloSimulacao';
import { useBaixarPdfCredito } from './useBaixarPdfCredito';

const GRUPOS: Array<[keyof RelatorioCredito['anotacoes'], string]> = [
  ['protestos', 'Protestos'],
  ['pendenciasFinanceiras', 'Pendências financeiras (PEFIN/REFIN)'],
  ['chequesSemFundo', 'Cheques sem fundo'],
  ['acoesJudiciais', 'Ações judiciais'],
  ['falenciaRecuperacao', 'Falência / Recuperação judicial'],
];

const txt = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v));
const brl = (n: number | null) => (n === null ? '—' : formatBRL(n));
const pct = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="border-b-2 border-brand-700 pb-1 text-sm font-semibold uppercase tracking-wide text-brand-700">{titulo}</h3>
      {children}
    </section>
  );
}

function Campos({ pares }: { pares: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {pares.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs text-slate-500">{k}</dt>
          <dd className="break-words text-slate-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

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
  const scoreAlto = (consolidado ? consolidado.scores.some((s) => (s.valor ?? 0) >= 600) : (r?.score.valor ?? 0) >= 600);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl w-[96vw] max-h-[92dvh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">{modoDoc ? `Relatório de crédito do ${r?.tipo ?? 'CNPJ'}` : 'Relatório de análise de crédito'}</DialogTitle>
          <DialogDescription>
            {r && d
              ? consolidado
                ? `${r.tipo} ${formatarDocumento(r.documento)} · Fontes: ${consolidado.fontes.map((f) => `${f.produtoNome} (${dataHoraBR(f.consultadoEm)})`).join(' + ')}`
                : `${r.tipo} ${formatarDocumento(r.documento)} · consulta em ${dataHoraBR(d.consultadoEm)} · Fonte: ${r.fonte.provedor === 'boavista_apifull' ? 'API Full' : r.fonte.provedor === 'simulado' ? 'Simulado' : r.fonte.provedor} / ${r.fonte.produto}`
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
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                {(d.motivos.length ? d.motivos : ['Nenhum fator de restrição encontrado nas regras da Sal Vita.']).map((m) => <li key={m} className="break-words">{m}</li>)}
              </ul>
              <PontosDeAtencao sinais={sinais} />
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

            {consolidado && consolidado.divergencias.length > 0 && (
              <div role="note" className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="text-xs font-semibold uppercase tracking-wide">Divergências entre as fontes</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {consolidado.divergencias.map((x) => <li key={x} className="break-words">{x}</li>)}
                </ul>
              </div>
            )}

            <Secao titulo={consolidado ? 'Score por fonte' : 'Score'}>
              {consolidado ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {consolidado.scores.map((s) => (
                    <li key={s.produto} className="min-w-0 space-y-1 rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.produtoNome}</p>
                      {s.calculado ? (
                        <>
                          <p className="text-3xl font-bold tabular-nums text-brand-700">{s.valor}</p>
                          <p className="text-xs text-slate-600">
                            Probabilidade de inadimplência <strong className="tabular-nums">{pct(s.probabilidadeInadimplencia)}</strong>
                            {s.faixa ? ` · Faixa ${s.faixa}` : ''}
                          </p>
                          {s.texto && <p className="line-clamp-2 text-xs text-slate-500" title={s.texto}>{s.texto}</p>}
                        </>
                      ) : (
                        <p className="text-sm font-medium text-amber-800">Score não calculado pela fonte. Usamos o que ela trouxe.</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                  <div>
                    <p className="text-xs text-slate-500">Score (0 a 1000)</p>
                    <p className="text-3xl font-bold tabular-nums text-brand-700">{r.score.valor ?? 'Não informado'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Probabilidade de inadimplência</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{pct(r.score.probabilidadeInadimplencia)}</p>
                  </div>
                  {r.score.faixa && <div><p className="text-xs text-slate-500">Faixa</p><p className="text-sm text-slate-900">{r.score.faixa}</p></div>}
                </div>
              )}
              <p className="text-xs text-slate-500">
                {consolidado
                  ? 'Cada score vem da própria fonte (modelos diferentes) e não é calculado pela Sal Vita nem combinado num número único.'
                  : 'Score e probabilidade informados pela fonte; não são calculados pela Sal Vita.'}
              </p>
              {d?.veredito === 'REPROVADO_A_PRAZO' && scoreAlto && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  Atenção: o score da fonte é alto, mas o relatório registra restrições. Para decidir, prevalecem as restrições, não o score.
                </p>
              )}
              {!consolidado && r.score.textoInterpretacao && <p className="line-clamp-2 text-xs text-slate-500" title={r.score.textoInterpretacao}>{r.score.textoInterpretacao}</p>}
            </Secao>

            {(() => {
              const com = GRUPOS.filter(([k]) => r.anotacoes[k].consultado && (r.anotacoes[k].itens.length > 0 || r.anotacoes[k].quantidade > 0));
              const zerados = GRUPOS.filter(([k]) => r.anotacoes[k].consultado && !com.some(([c]) => c === k)).map(([, n]) => n.replace(/ \(.*\)$/, ''));
              const nao = GRUPOS.filter(([k]) => !r.anotacoes[k].consultado).map(([, n]) => n.replace(/ \(.*\)$/, ''));
              return (
                <Secao titulo="Anotações negativas">
                  {com.length > 0 && (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full min-w-[360px] text-sm tabular-nums">
                        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                          <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Quantidade</th><th className="px-3 py-2 text-right">Valor total</th></tr>
                        </thead>
                        <tbody>
                          {com.map(([k, nome]) => {
                            const g = r.anotacoes[k];
                            return (
                              <tr key={k} className="border-t border-slate-100">
                                <td className="px-3 py-2 font-medium text-red-700">{nome}</td>
                                <td className="px-3 py-2 text-right">{Math.max(g.quantidade, g.itens.length)}</td>
                                <td className="px-3 py-2 text-right">{g.valorTotal !== null ? brl(g.valorTotal) : '—'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {zerados.length > 0 && <p className="text-sm font-medium text-green-700">Sem ocorrências em: {zerados.join(', ')}.</p>}
                  {nao.length > 0 && <p className="text-xs text-slate-500">Não informado pela fonte: {nao.join(', ')}.</p>}
                  {com.map(([k, nome]) => {
                    const g = r.anotacoes[k];
                    return (
                      <div key={k} className="space-y-1">
                        <p className="text-sm font-semibold text-slate-800">{nome.replace(/ \(.*\)$/, '')}</p>
                        {consolidado?.divergenciaPorGrupo[k] && (
                          <p className="text-xs font-medium text-amber-800">Divergência entre fontes — {consolidado.divergenciaPorGrupo[k]}</p>
                        )}
                        {g.itens.length < g.quantidade && (
                          <p className="text-xs font-medium text-amber-800">A fonte listou {g.itens.length} de {g.quantidade} ocorrências.</p>
                        )}
                        {g.itens.length > 0 && (
                          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                            {g.itens.map((it, i) => {
                              const obs = atenuacaoDoItem(it, new Date(d.consultadoEm));
                              return (
                                <li key={`${i}-${it.descricao}`} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[6rem_1fr_auto] sm:gap-3">
                                  <span className="text-xs text-slate-500">{it.data ? dataBR(it.data) : ''}</span>
                                  <span className="min-w-0 break-words text-slate-800">
                                    {it.descricao}
                                    {it.credor && <span className="block text-xs text-slate-500">Credor: {it.credor}</span>}
                                    {it.fonte && <span className="block text-xs text-slate-500">Fonte: {it.fonte}</span>}
                                    {it.local && <span className="block text-xs text-slate-500">{it.local}</span>}
                                    {it.extras && Object.entries(it.extras).length > 0 && (
                                      <span className="mt-0.5 block text-xs text-slate-500">
                                        {Object.entries(it.extras).map(([ch, v]) => `${ch}: ${v}`).join(' · ')}
                                      </span>
                                    )}
                                    {obs && <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Estudar com calma: {obs}</span>}
                                  </span>
                                  <span className="text-right font-medium tabular-nums">{it.valor !== null ? brl(it.valor) : ''}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </Secao>
              );
            })()}

            {(() => {
              const c = r.cadastro;
              const fant = c.nomeFantasia && c.nomeFantasia !== c.razaoSocial ? c.nomeFantasia : '';
              const ender = [c.endereco, [c.municipio, c.uf].filter(Boolean).join('/')].filter(Boolean).join(' — ');
              const pares = ([
                ['Nome fantasia', fant],
                ['Situação', c.situacao ? c.situacao + (c.situacaoEm && c.situacaoEm !== c.fundacao ? ` (desde ${dataBR(c.situacaoEm)})` : '') : ''],
                ['Fundação', c.fundacao ? dataBR(c.fundacao) : ''],
                ['Natureza jurídica', naturezaJuridicaTexto(c.naturezaJuridica)],
                ['Capital social', c.capitalSocial === null ? '' : brl(c.capitalSocial)],
                ['CNAE e atividade', [c.cnaePrincipal, c.atividade].filter(Boolean).join(' — ')],
                ['Opção tributária', c.opcaoTributaria ?? ''],
                ['Inscrição estadual (IE)', c.inscricaoEstadual ?? ''],
                ['Endereço', ender],
                ['Nº de filiais', c.numeroFiliais === null ? '' : String(c.numeroFiliais)],
                ['Faturamento presumido', r.complementos?.faturamentoPresumidoFaixa ?? ''],
                ['Veículos da empresa', r.complementos?.veiculos?.length ? r.complementos.veiculos.map((v) => v.marcaModelo).join('; ') : ''],
              ] as Array<[string, string]>).filter(([, v]) => v !== '');
              return pares.length ? <Secao titulo="Dados da empresa"><Campos pares={pares} /></Secao> : null;
            })()}

            {r.socios.length > 0 && (
              <Secao titulo="Sócios e administradores">
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                  {r.socios.map((s, i) => (
                    <li key={`${i}-${s.nome}`} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[1fr_9rem_9rem_5rem] sm:gap-3">
                      <span className="min-w-0 break-words font-medium text-slate-900">{s.nome}{s.cargo && <span className="block text-xs font-normal text-slate-500">{s.cargo}</span>}</span>
                      <span className="tabular-nums text-slate-700">{mascararDocumentoSocio(s.documento)}</span>
                      <span className="text-slate-700">{s.entrada ? `Entrada ${dataBR(s.entrada)}` : ''}</span>
                      <span className="tabular-nums text-slate-700 sm:text-right">{s.participacao !== null ? pct(s.participacao) : ''}</span>
                    </li>
                  ))}
                </ul>
              </Secao>
            )}

            {(r.consultasRecentes.length > 0 || r.complementos?.consultas12Meses != null) && (
              <Secao titulo="Consultas ao documento">
                {r.complementos?.consultas12Meses != null && <p className="text-sm font-medium text-slate-800">Total em 12 meses: {r.complementos.consultas12Meses}</p>}
                {r.consultasRecentes.length > 0 && (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                    {r.consultasRecentes.map((c, i) => (
                      <li key={`${i}-${c.data}`} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="min-w-0 break-words"><span className="mr-2 text-xs text-slate-500">{dataBR(c.data)}</span>{c.consultante}</span>
                        {c.quantidade > 1 && <span className="shrink-0 tabular-nums text-slate-700">{c.quantidade}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </Secao>
            )}

            {r.comportamento && (
              <Secao titulo="Comportamento comercial">
                <Campos pares={([
                  ['Última compra', r.comportamento.ultimaCompraEm ? dataBR(r.comportamento.ultimaCompraEm) : ''],
                  ['Pagamentos em dia', r.comportamento.pagamentoPontualPct !== null ? pct(r.comportamento.pagamentoPontualPct) : ''],
                  ['Relacionamento mais antigo', r.comportamento.relacionamentoMaisAntigoEm ? dataBR(r.comportamento.relacionamentoMaisAntigoEm) : ''],
                  ['Fornecedores que informaram', r.comportamento.fontesConsultadas !== null ? String(r.comportamento.fontesConsultadas) : ''],
                ] as Array<[string, string]>).filter(([, v]) => v !== '')} />
              </Secao>
            )}

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
