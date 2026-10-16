import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../_core/hooks/useAuth';
import { formatBRL } from '../../lib/faturamento/calc';
import { formatarDocumento, soDigitos } from '../../lib/credito/documento';
import { permissoesCredito } from '../../lib/credito/regras';
import {
  alternarProduto, estadoDaConsulta, limiteDeSelecaoAtingido, planoDaSelecao, selecaoInicial, textoReaproveita,
} from '../../lib/credito/selecao';
import { CATALOGO_CREDITO, MAX_PRODUTOS_POR_CONSULTA, PRECOS_MEDIDOS_EM, TEXTO_RECOMENDACAO, nomeDoProduto } from '../../../../shared/creditoCatalogo';
import { deveAbrirConsolidado, produtosComFalha, produtosComRelatorio, type ResultadoDoProduto } from '../../lib/credito/resultado';
import { useLiberarScrollTravado } from '../../lib/credito/scrollTravado';
import { ProdutoConsultaCard } from './ProdutoConsultaCard';
import { ResultadoConsulta } from './ResultadoConsulta';
import { RelatorioCreditoDialog } from './RelatorioCreditoDialog';

export interface ConsultarCreditoDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  documento: string;
  razaoSocial?: string | null;
  taskId?: number;
  pedidoId?: string;
  /**
   * Consulta de UM produto que deu certo: recebe o id do relatório (novo ou reaproveitado). Com 2+ produtos o próprio
   * diálogo abre o RELATÓRIO CONSOLIDADO do documento (todas as fontes juntas) e `onConcluido` não é chamado.
   */
  onConcluido?: (reportId: number) => void;
}

/** Seletor de consultas com preço: o admin marca o que quer, vê o total somando e confirma. Só admin (o servidor também exige). */
export function ConsultarCreditoDialog({ open, onOpenChange, documento, razaoSocial, taskId, pedidoId, onConcluido }: ConsultarCreditoDialogProps) {
  const { user } = useAuth();
  const perm = permissoesCredito(user?.role);
  const utils = trpc.useUtils();
  const doc = soDigitos(documento);
  const [motivo, setMotivo] = useState('');
  const [forcarNova, setForcarNova] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>(selecaoInicial);
  const [resultados, setResultados] = useState<ResultadoDoProduto[] | null>(null);
  const [consolidadoAberto, setConsolidadoAberto] = useState(false);
  const enviando = useRef(false);
  useLiberarScrollTravado(open || consolidadoAberto);

  useEffect(() => {
    if (open) { setMotivo(''); setForcarNova(false); setSelecionados(selecaoInicial()); setResultados(null); enviando.current = false; }
  }, [open, doc]);

  const habilitado = open && perm.consultar;
  const status = trpc.credito.status.useQuery(undefined, { enabled: habilitado });
  const catalogo = trpc.credito.catalogo.useQuery({ documento: doc }, { enabled: habilitado && doc.length > 0, retry: false });
  const simulado = status.data?.simulado ?? false;
  const saldoQ = trpc.credito.saldo.useQuery(undefined, { enabled: habilitado && status.data?.simulado === false, retry: false });

  const consultar = trpc.credito.consultar.useMutation({
    onSuccess: (r) => {
      void utils.credito.invalidate();
      const falhas = r.resultados.filter((x) => !x.ok);
      if (falhas.length === 0) {
        toast.success(r.custoCobradoReais > 0 ? `Consulta realizada (${formatBRL(r.custoCobradoReais)})` : 'Relatório reaproveitado (sem custo)');
        onOpenChange(false);
        // 2+ produtos: UM relatório do CNPJ com as fontes combinadas (não o de um produto só).
        if (deveAbrirConsolidado(r.resultados)) window.setTimeout(() => setConsolidadoAberto(true), 350);
        else if (r.id != null) onConcluido?.(r.id);
      } else {
        // Resultado parcial: o diálogo FICA aberto mostrando, por produto, o que deu certo, o que falhou (em vermelho,
        // com a mensagem) e o que JÁ foi cobrado. O aviso também sai como toast longo.
        setResultados(r.resultados);
        toast.error(
          `Consulta parcial. ${falhas.map((x) => `${nomeDoProduto(x.produto)}: ${x.erro ?? 'falhou'}${x.cobrado ? ' (COBRADO)' : ''}`).join(' | ')}. Total cobrado: ${formatBRL(r.custoCobradoReais)}.`,
          { duration: 15000 },
        );
      }
    },
    onError: (e) => toast.error(e.message),
    onSettled: () => { enviando.current = false; },
  });

  const itens = catalogo.data?.itens ?? CATALOGO_CREDITO;
  const ultimoPorProduto = catalogo.data?.ultimoPorProduto ?? null;
  const plano = useMemo(
    () => planoDaSelecao({ itens, selecionados, ultimoPorProduto, forcarNova, simulado, provedorAtual: status.data?.provedor }),
    [itens, selecionados, ultimoPorProduto, forcarNova, simulado, status.data?.provedor],
  );
  const saldo = simulado ? null : saldoQ.data?.saldo ?? null;
  const carregado = status.isSuccess && catalogo.isSuccess;
  const estado = estadoDaConsulta({
    plano, saldo, tetoPorConsultaReais: status.data?.tetoPorConsultaReais ?? catalogo.data?.tetoPorConsultaReais ?? 30,
    usadasNoMes: status.data?.usadasNoMes ?? 0, limiteMensal: status.data?.limiteMensal ?? Number.MAX_SAFE_INTEGER,
    motivo, ocupado: consultar.isPending, carregado,
  });

  if (!perm.consultar) return null;

  const confirmar = () => {
    if (!estado.podeConsultar || enviando.current) return;
    enviando.current = true; // trava imediata: o isPending só chega no próximo render
    consultar.mutate({ documento: doc, motivo: motivo.trim(), forcarNova: forcarNova || undefined, taskId, pedidoId, produtos: selecionados });
  };

  const reaproveitados = plano.linhas.filter((l) => l.reaproveitado);
  const consolidado = <RelatorioCreditoDialog documento={doc} open={consolidadoAberto} onOpenChange={setConsolidadoAberto} />;

  // Consulta parcial: mostra o resultado de CADA produto (nada de erro engolido) e deixa abrir o relatório do CNPJ.
  if (resultados) {
    const cobrado = resultados.reduce((s, x) => s + (x.cobrado ? x.custoReais : 0), 0);
    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="sm:max-w-2xl">
            <div className="grid min-w-0 gap-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-brand-700" aria-hidden />Resultado da consulta</DialogTitle>
                <DialogDescription className="break-words">
                  {razaoSocial ? `${razaoSocial} · ` : ''}{formatarDocumento(doc)} · {produtosComRelatorio(resultados)} de {resultados.length} consulta(s) com relatório; {produtosComFalha(resultados)} falhou(aram)
                </DialogDescription>
              </DialogHeader>
              <ResultadoConsulta resultados={resultados} />
              <p className="text-sm font-semibold text-slate-900">Total cobrado: {formatBRL(cobrado)}</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" size="lg" className="h-10 max-sm:flex-1" onClick={() => onOpenChange(false)}>Fechar</Button>
                {produtosComRelatorio(resultados) > 0 && (
                  <Button type="button" size="lg" className="h-10 max-sm:flex-1" onClick={() => { onOpenChange(false); window.setTimeout(() => setConsolidadoAberto(true), 350); }}>
                    Ver relatório do CNPJ
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
        {consolidado}
      </>
    );
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!consultar.isPending) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl">
        <form className="grid min-w-0 gap-4" onSubmit={(e) => { e.preventDefault(); confirmar(); }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-brand-700" aria-hidden />Consultar crédito</DialogTitle>
            <DialogDescription className="break-words">
              {razaoSocial ? `${razaoSocial} · ` : ''}{formatarDocumento(doc)}
            </DialogDescription>
          </DialogHeader>

          {status.isLoading ? (
            <p className="text-sm text-slate-500">Carregando…</p>
          ) : simulado ? (
            <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              Provedor simulado: sem custo, dados fictícios.
            </div>
          ) : (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Cada consulta marcada é cobrada da conta API Full. Escolha até {MAX_PRODUTOS_POR_CONSULTA}; o total aparece abaixo antes de confirmar.
            </div>
          )}

          <p className="rounded-md bg-brand-50/60 px-3 py-2 text-xs text-slate-700">{TEXTO_RECOMENDACAO}</p>

          <fieldset className="grid min-w-0 gap-2" disabled={consultar.isPending}>
            <legend className="sr-only">Consultas disponíveis</legend>
            {itens.map((item) => {
              const ult = ultimoPorProduto?.[item.chave];
              const linha = plano.linhas.find((l) => l.chave === item.chave);
              const existe = !!ult?.valido && item.custoReais !== null;
              return (
                <ProdutoConsultaCard
                  key={item.chave}
                  item={item}
                  marcado={selecionados.includes(item.chave)}
                  bloqueadoPeloLimite={limiteDeSelecaoAtingido(selecionados)}
                  simulado={simulado}
                  ultimaValidaEm={existe ? ult.consultadoEm : null}
                  modoUltima={!existe ? null : linha?.reaproveitado ? 'reaproveita' : forcarNova ? 'cobra' : null}
                  onAlternar={() => setSelecionados((s) => alternarProduto(s, item.chave, itens))}
                />
              );
            })}
            <p className="text-xs text-slate-400">Preços medidos em {PRECOS_MEDIDOS_EM} (podem mudar).</p>
          </fieldset>

          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Motivo da consulta (obrigatório)
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className="h-10" placeholder="Ex.: pedido a prazo de cliente novo" />
            <span className="text-xs font-normal text-slate-500">Mínimo de 5 caracteres. Fica registrado (LGPD).</span>
          </label>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <Checkbox checked={forcarNova} onCheckedChange={(v) => setForcarNova(v === true)} className="mt-0.5" />
            <span>Forçar nova consulta (cobra de novo)</span>
          </label>

          {/* Rodapé fixo: total, saldo e botões ficam sempre à vista enquanto a lista rola. */}
          <div className="sticky bottom-0 -mx-5 -mb-5 grid gap-2 border-t border-slate-200 bg-surface px-5 pb-5 pt-3">
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Total</dt>
                <dd className="break-words text-lg font-bold tabular-nums text-slate-900">{formatBRL(plano.totalReais)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Saldo atual</dt>
                <dd className="break-words font-semibold tabular-nums text-slate-900">
                  {simulado ? 'Não se aplica' : saldoQ.isLoading ? '…' : saldo != null ? formatBRL(saldo) : 'Indisponível'}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-slate-500">Saldo após a consulta</dt>
                <dd className={`break-words font-semibold tabular-nums ${estado.saldoNegativo ? 'text-red-700' : 'text-slate-900'}`}>
                  {estado.saldoApos != null ? formatBRL(estado.saldoApos) : '—'}
                </dd>
              </div>
            </dl>
            {reaproveitados.map((l) => (
              <p key={l.chave} className="break-words text-xs text-green-700">{l.nome}: {textoReaproveita(l.ultimaEm)}</p>
            ))}
            {estado.bloqueios.map((m) => <p key={m} role="alert" className="break-words rounded-md bg-red-50 px-3 py-2 text-xs text-red-800">{m}</p>)}
            {/* Erro do servidor (ex.: todas as consultas falharam, sem cobrança): fica na tela, além do toast. */}
            {consultar.error && !consultar.isPending && (
              <p role="alert" className="break-words rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">{consultar.error.message}</p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="lg" className="h-10 max-sm:flex-1" onClick={() => onOpenChange(false)} disabled={consultar.isPending}>Cancelar</Button>
              <Button type="submit" size="lg" className="h-10 max-sm:flex-1" disabled={!estado.podeConsultar}>
                {consultar.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {consultar.isPending ? 'Consultando…' : `Consultar (${formatBRL(plano.totalReais)})`}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    {consolidado}
    </>
  );
}
