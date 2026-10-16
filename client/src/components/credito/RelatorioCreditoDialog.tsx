import { toast } from 'sonner';
import { useMemo } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { StatusBadge } from '../StatusBadge';
import { QueryError } from '../QueryError';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import { formatBRL } from '../../lib/faturamento/calc';
import { formatarDocumento, mascararDocumentoSocio } from '../../lib/credito/documento';
import { dataBR, dataHoraBR, permissoesCredito } from '../../lib/credito/regras';
import { analisarSinais, atenuacaoDoItem, ROTULO_VEREDITO, type GrupoAnotacao, type RelatorioCredito } from '../../../../shared/credito';
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

function Situacao({ g }: { g: GrupoAnotacao }) {
  if (!g.consultado) return <StatusBadge tone="neutral">Não informado pela fonte</StatusBadge>;
  if (g.quantidade > 0) return <StatusBadge tone="danger">Consta</StatusBadge>;
  return <StatusBadge tone="success">Nada consta</StatusBadge>;
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
  reportId: number | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/** Relatório completo (mesmas seções do PDF). Só admin/gerente: o servidor usa staffProcedure. */
export function RelatorioCreditoDialog({ reportId, open, onOpenChange }: RelatorioCreditoDialogProps) {
  const { user } = useAuth();
  const perm = permissoesCredito(user?.role);
  const q = trpc.credito.relatorio.useQuery({ id: reportId ?? 0 }, { enabled: open && reportId !== null && perm.verRelatorio, retry: false });
  const { baixar, baixandoId } = useBaixarPdfCredito();
  const utils = trpc.useUtils();
  const reprocessar = trpc.credito.reprocessar.useMutation();
  const d = q.data;
  const r = d?.relatorio;
  const sinais = useMemo(() => (r && d ? analisarSinais(r, new Date(d.consultadoEm)) : []), [r, d]);
  const simulado = d?.provedor === 'simulado';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl w-[96vw] max-h-[92dvh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">Relatório de análise de crédito</DialogTitle>
          <DialogDescription>
            {r ? `${r.tipo} ${formatarDocumento(r.documento)} · consulta em ${dataHoraBR(d?.consultadoEm)}` : 'Carregando…'}
          </DialogDescription>
        </DialogHeader>

        {!perm.verRelatorio ? (
          <p className="text-sm text-slate-600">Seu usuário não tem acesso ao relatório completo.</p>
        ) : q.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-brand-600" aria-label="Carregando" /></div>
        ) : q.error || !d || !r ? (
          <QueryError message={q.error?.message ?? 'Não foi possível carregar o relatório'} onRetry={() => void q.refetch()} retrying={q.isFetching} />
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
            </div>

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
                {r.score.faixa && <div><p className="text-xs text-slate-500">Faixa</p><p className="text-sm text-slate-900">{r.score.faixa}</p></div>}
              </div>
              {r.score.textoInterpretacao && <p className="text-xs text-slate-500">Interpretação da fonte: {r.score.textoInterpretacao}</p>}
            </Secao>

            <Secao titulo="Anotações negativas">
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[480px] text-sm tabular-nums">
                  <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qtd</th><th className="px-3 py-2 text-right">Valor total</th><th className="px-3 py-2">Situação</th></tr>
                  </thead>
                  <tbody>
                    {GRUPOS.map(([k, nome]) => {
                      const g = r.anotacoes[k];
                      return (
                        <tr key={k} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-900">{nome}</td>
                          <td className="px-3 py-2 text-right">{g.consultado ? g.quantidade : '—'}</td>
                          <td className="px-3 py-2 text-right">{g.consultado && g.quantidade > 0 ? brl(g.valorTotal) : '—'}</td>
                          <td className="px-3 py-2"><Situacao g={g} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {GRUPOS.filter(([k]) => r.anotacoes[k].consultado && r.anotacoes[k].itens.length > 0).map(([k, nome]) => {
                const g = r.anotacoes[k];
                return (
                  <div key={k} className="space-y-1">
                    <p className="text-sm font-semibold text-slate-800">{nome} — {g.quantidade} ocorrência(s){g.valorTotal !== null ? `, total ${brl(g.valorTotal)}` : ''}</p>
                    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                      {g.itens.map((it, i) => {
                        const obs = atenuacaoDoItem(it, new Date(d.consultadoEm));
                        return (
                          <li key={`${i}-${it.descricao}`} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[6rem_1fr_auto] sm:gap-3">
                            <span className="text-xs text-slate-500">{dataBR(it.data)}</span>
                            <span className="min-w-0 break-words text-slate-800">
                              {it.descricao}
                              {it.credor && <span className="block text-xs text-slate-500">Credor: {it.credor}</span>}
                              {it.local && <span className="block text-xs text-slate-500">{it.local}</span>}
                              {obs && <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Estudar com calma: {obs}</span>}
                            </span>
                            <span className="text-right font-medium tabular-nums">{brl(it.valor)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </Secao>

            <Secao titulo="Dados cadastrais">
              <Campos pares={[
                ['Razão social', txt(r.cadastro.razaoSocial)], ['Nome fantasia', txt(r.cadastro.nomeFantasia)],
                [r.tipo, formatarDocumento(r.documento)], ['Situação cadastral', txt(r.cadastro.situacao)],
                ['Situação em', dataBR(r.cadastro.situacaoEm)], ['Fundação', dataBR(r.cadastro.fundacao)],
                ['Natureza jurídica', txt(r.cadastro.naturezaJuridica)], ['Capital social', brl(r.cadastro.capitalSocial)],
                ['CNAE principal', txt(r.cadastro.cnaePrincipal)], ['Atividade', txt(r.cadastro.atividade)],
                ['Opção tributária', txt(r.cadastro.opcaoTributaria)], ['Inscrição estadual', txt(r.cadastro.inscricaoEstadual)],
                ['Endereço', txt(r.cadastro.endereco)], ['Município / UF', [r.cadastro.municipio, r.cadastro.uf].filter(Boolean).join(' / ') || '—'],
                ['Telefone', txt(r.cadastro.telefone)], ['Número de filiais', txt(r.cadastro.numeroFiliais)],
              ]} />
            </Secao>

            {r.comportamento && (
              <Secao titulo="Movimentação comercial">
                <Campos pares={[
                  ['Última compra no mercado', dataBR(r.comportamento.ultimaCompraEm)],
                  ['Relacionamento comercial mais antigo', dataBR(r.comportamento.relacionamentoMaisAntigoEm)],
                  ['Fornecedores que informaram', txt(r.comportamento.fontesConsultadas)],
                  ['Pagamentos em dia', pct(r.comportamento.pagamentoPontualPct)],
                ]} />
              </Secao>
            )}

            {r.complementos && (
              <Secao titulo="Complementos da fonte">
                <Campos pares={[
                  ['Faturamento presumido (faixa)', txt(r.complementos.faturamentoPresumidoFaixa)],
                  ['Consultas nos últimos 12 meses', txt(r.complementos.consultas12Meses)],
                  ['Veículos da empresa', r.complementos.veiculos?.length ? r.complementos.veiculos.map((v) => [v.marcaModelo, v.placa].filter(Boolean).join(' ')).join('; ') : '—'],
                ]} />
              </Secao>
            )}

            <Secao titulo="Quadro societário e administradores">
              {r.socios.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum sócio ou administrador informado pela fonte.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                  {r.socios.map((s, i) => (
                    <li key={`${i}-${s.nome}`} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[1fr_9rem_9rem_5rem] sm:gap-3">
                      <span className="min-w-0 break-words font-medium text-slate-900">{s.nome}<span className="block text-xs font-normal text-slate-500">{txt(s.cargo)}</span></span>
                      <span className="tabular-nums text-slate-700">{mascararDocumentoSocio(s.documento)}</span>
                      <span className="text-slate-700">Entrada {dataBR(s.entrada)}</span>
                      <span className="tabular-nums text-slate-700 sm:text-right">{pct(s.participacao)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>

            <Secao titulo="Consultas recentes ao documento">
              {r.consultasRecentes.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma consulta recente informada pela fonte.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
                  {r.consultasRecentes.map((c, i) => (
                    <li key={`${i}-${c.data}`} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 break-words"><span className="mr-2 text-xs text-slate-500">{dataBR(c.data)}</span>{c.consultante}</span>
                      <span className="shrink-0 tabular-nums text-slate-700">{c.quantidade}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>

            <p className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              Fonte dos dados: {r.fonte.provedor} / {r.fonte.produto}. Documento confidencial, de uso interno da Sal Vita, destinado à análise de concessão de crédito (LGPD).
              {d.motivo ? ` Motivo da consulta: ${d.motivo}.` : ''}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Fechar</Button>
          {perm.administrar && d && (
            <Button variant="outline" size="lg" disabled={reprocessar.isPending} onClick={() => reprocessar.mutate({ id: d.id }, {
              onSuccess: () => { toast.success('Relatório refeito a partir da resposta já paga (sem custo).'); void utils.credito.invalidate(); },
              onError: (e) => toast.error(e.message),
            })}>
              {reprocessar.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Reprocessar (sem custo)
            </Button>
          )}
          {perm.baixarPdf && d && (
            <Button size="lg" onClick={() => void baixar(d.id)} disabled={baixandoId !== null}>
              {baixandoId === d.id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              Baixar PDF
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
