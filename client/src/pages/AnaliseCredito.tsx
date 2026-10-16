import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Download, FileText, Layers, Loader2, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Page, PageHeader, Panel, PanelHeader, Stat, StatStrip, EmptyState, AccessDenied } from '../components/layout/Page';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { StatusBadge } from '../components/StatusBadge';
import { QueryError } from '../components/QueryError';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CreditoCard } from '../components/credito/CreditoCard';
import { CreditoSemaforo } from '../components/credito/CreditoSemaforo';
import { useLiberarScrollTravado } from '../lib/credito/scrollTravado';
import { ConsultarCreditoDialog } from '../components/credito/ConsultarCreditoDialog';
import { CatalogoComparativo } from '../components/credito/CatalogoComparativo';
import { RelatorioCreditoDialog } from '../components/credito/RelatorioCreditoDialog';
import { useBaixarPdfCredito } from '../components/credito/useBaixarPdfCredito';
import { formatBRL } from '../lib/faturamento/calc';
import { formatarDocumento, mascararDocumentoDigitando, soDigitos, validarDocumentoLocal } from '../lib/credito/documento';
import { dataHoraBR, permissoesCredito, saldoEstaBaixo } from '../lib/credito/regras';
import {
  FILTROS_VAZIOS, POR_PAGINA_ARQUIVO, entradaListar, filtrosAtivos, periodoInvertido, totalPaginas, type FiltrosArquivo,
} from '../lib/credito/filtros';
import { ROTULO_VEREDITO, SALDO_BAIXO_REAIS, type Veredito } from '../../../shared/credito';
import { tetoPorConsultaValido } from '../../../shared/creditoCatalogo';

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
const CAMPO = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm';

function ControlesAdmin() {
  const utils = trpc.useUtils();
  const status = trpc.credito.status.useQuery();
  const [confirmarBloqueio, setConfirmarBloqueio] = useState<boolean | null>(null);
  const [limite, setLimite] = useState('');
  const [teto, setTeto] = useState('');
  useEffect(() => { if (status.data) setLimite(String(status.data.limiteMensal)); }, [status.data?.limiteMensal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (status.data) setTeto(String(status.data.tetoPorConsultaReais).replace('.', ',')); }, [status.data?.tetoPorConsultaReais]); // eslint-disable-line react-hooks/exhaustive-deps

  const setBloqueio = trpc.credito.setBloqueioAtivo.useMutation({
    onSuccess: (r) => { toast.success(r.bloqueioAtivo ? 'Bloqueio de crédito ligado' : 'Bloqueio de crédito desligado'); void utils.credito.status.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const setLimiteMut = trpc.credito.setLimites.useMutation({
    onSuccess: (r) => { toast.success(`Limites salvos: ${r.limiteMensal} consultas/mês, teto de ${formatBRL(r.tetoPorConsultaReais)} por consulta`); void utils.credito.status.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  if (!status.data) return null;
  const n = Number(limite);
  const limiteOk = limite.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 10_000;
  const tetoNum = Number(teto.replace(',', '.'));
  const tetoOk = teto.trim() !== '' && tetoPorConsultaValido(tetoNum);
  const mudou = n !== status.data.limiteMensal || tetoNum !== status.data.tetoPorConsultaReais;

  return (
    <Panel>
      <PanelHeader title="Controles do administrador" description="Só administradores veem e alteram estes ajustes." />
      <div className="grid gap-4 p-4 md:grid-cols-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">Bloquear envio ao SMBI de pedido a prazo de cliente reprovado</p>
            <p className="text-xs text-slate-500">Desligado por padrão. Sem análise ou com análise vencida, o pedido segue só com aviso. O admin pode liberar pedido a pedido.</p>
          </div>
          <Switch
            checked={status.data.bloqueioAtivo}
            disabled={setBloqueio.isPending}
            onCheckedChange={(v) => setConfirmarBloqueio(v)}
            aria-label="Bloquear envio ao SMBI de pedido a prazo de cliente reprovado"
          />
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); if (limiteOk && tetoOk && !setLimiteMut.isPending) setLimiteMut.mutate({ limiteMensal: n, tetoPorConsultaReais: tetoNum }); }}
        >
          <label className="grid min-w-0 flex-1 basis-32 gap-1 text-sm font-medium text-slate-700">
            Limite mensal (nº de consultas pagas)
            <Input inputMode="numeric" value={limite} onChange={(e) => setLimite(e.target.value.replace(/\D/g, ''))} className="h-10" />
          </label>
          <label className="grid min-w-0 flex-1 basis-32 gap-1 text-sm font-medium text-slate-700">
            Teto por consulta (R$)
            <Input inputMode="decimal" value={teto} onChange={(e) => setTeto(e.target.value.replace(/[^\d.,]/g, ''))} className="h-10" aria-invalid={!tetoOk} />
          </label>
          <Button type="submit" size="lg" disabled={!limiteOk || !tetoOk || !mudou || setLimiteMut.isPending}>
            {setLimiteMut.isPending && <Loader2 className="animate-spin" aria-hidden />}Salvar
          </Button>
        </form>
      </div>
      <ConfirmDialog
        open={confirmarBloqueio !== null}
        onOpenChange={(o) => { if (!o) setConfirmarBloqueio(null); }}
        title={confirmarBloqueio ? 'Ligar o bloqueio de crédito?' : 'Desligar o bloqueio de crédito?'}
        description={confirmarBloqueio
          ? 'Pedidos a prazo de cliente com crédito reprovado (análise de até 30 dias) deixam de ser enviados ao SMBI, a menos que você libere o pedido.'
          : 'Pedidos a prazo de cliente reprovado voltam a ser enviados ao SMBI sem checagem de crédito.'}
        confirmLabel={confirmarBloqueio ? 'Ligar bloqueio' : 'Desligar bloqueio'}
        onConfirm={() => { if (confirmarBloqueio !== null) setBloqueio.mutate({ ativo: confirmarBloqueio }); setConfirmarBloqueio(null); }}
      />
    </Panel>
  );
}

function ConsultaAvulsa({ podeConsultar }: { podeConsultar: boolean }) {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const [relatorioId, setRelatorioId] = useState<number | null>(null);
  useLiberarScrollTravado(aberto || relatorioId !== null);
  const digitos = soDigitos(texto);
  const v = validarDocumentoLocal(texto);
  const erro = digitos.length >= 11 && !v.ok ? v.erro : null;
  const documento = v.ok ? v.documento : '';

  return (
    <Panel>
      <PanelHeader title="Consulta avulsa" description="Digite um CNPJ ou CPF. Se já houver relatório recente, ele aparece abaixo." />
      <div className="space-y-4 p-4">
        <form className="flex flex-wrap items-start gap-2" onSubmit={(e) => { e.preventDefault(); if (podeConsultar && v.ok) setAberto(true); }}>
          <div className="min-w-0 flex-1 basis-56">
            <Input
              inputMode="numeric"
              value={texto}
              onChange={(e) => setTexto(mascararDocumentoDigitando(e.target.value))}
              placeholder="CNPJ ou CPF"
              aria-label="CNPJ ou CPF"
              aria-invalid={!!erro}
              className="h-10"
            />
            {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
          </div>
          {podeConsultar && (
            <Button type="submit" size="lg" disabled={!v.ok}><ShieldCheck aria-hidden />Consultar</Button>
          )}
        </form>
        {documento && <CreditoCard documento={documento} semConsultar />}
      </div>
      {podeConsultar && documento && (
        <ConsultarCreditoDialog open={aberto} onOpenChange={setAberto} documento={documento} onConcluido={(id) => { window.setTimeout(() => setRelatorioId(id), 350); }} />
      )}
      <RelatorioCreditoDialog reportId={relatorioId} open={relatorioId !== null} onOpenChange={(o) => { if (!o) setRelatorioId(null); }} />
    </Panel>
  );
}

function Arquivo({ administrar }: { administrar: boolean }) {
  const utils = trpc.useUtils();
  const reprocessar = trpc.credito.reprocessar.useMutation({
    onSuccess: (r) => {
      toast.success(`Relatório #${r.id} reprocessado sem custo: ${ROTULO_VEREDITO[r.veredito]}`);
      void utils.credito.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const [filtros, setFiltros] = useState<FiltrosArquivo>(FILTROS_VAZIOS);
  const [buscaDigitada, setBuscaDigitada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [relatorioId, setRelatorioId] = useState<number | null>(null);
  const [documentoRelatorio, setDocumentoRelatorio] = useState<string | null>(null);
  useLiberarScrollTravado(relatorioId !== null || documentoRelatorio !== null);
  const { baixar, baixandoId } = useBaixarPdfCredito();

  // Busca com atraso curto: não consulta o servidor a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => { setFiltros((f) => (f.busca === buscaDigitada ? f : { ...f, busca: buscaDigitada })); setPagina(1); }, 300);
    return () => clearTimeout(t);
  }, [buscaDigitada]);

  const muda = (parcial: Partial<FiltrosArquivo>) => { setFiltros((f) => ({ ...f, ...parcial })); setPagina(1); };
  const invertido = periodoInvertido(filtros);
  const q = trpc.credito.listar.useQuery(entradaListar(filtros, pagina), {
    enabled: !invertido, placeholderData: (prev) => prev, retry: false,
  });
  const total = q.data?.total ?? 0;
  const paginas = totalPaginas(total);
  const itens = q.data?.itens ?? [];
  const ativos = filtrosAtivos(filtros);

  const acoes = (id: number, documento: string, fontes: number) => (
    <div className="flex flex-wrap gap-2">
      {fontes >= 2 && (
        <Button size="lg" variant="outline" className="h-10" onClick={() => setDocumentoRelatorio(documento)} title="Todas as consultas deste documento num relatório só">
          <Layers aria-hidden />Relatório do CNPJ
        </Button>
      )}
      <Button size="lg" variant="outline" className="h-10" onClick={() => setRelatorioId(id)}><FileText aria-hidden />Ver relatório</Button>
      <Button size="lg" variant="outline" className="h-10" onClick={() => void baixar(id)} disabled={baixandoId !== null}>
        {baixandoId === id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}Baixar PDF
      </Button>
      {administrar && (
        <Button
          size="lg" variant="outline" className="h-10" title="Refaz a análise com a resposta já paga, sem nova cobrança"
          onClick={() => reprocessar.mutate({ id })} disabled={reprocessar.isPending}
        >
          {reprocessar.isPending && reprocessar.variables?.id === id ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}Reprocessar
        </Button>
      )}
    </div>
  );

  const iconeCls = 'h-8 w-8 p-0';
  const acoesCompactas = (id: number, documento: string, fontes: number) => (
    <div className="flex items-center justify-end gap-1">
      {fontes >= 2 && (
        <Button variant="outline" className={iconeCls} title="Relatório do CNPJ (todas as fontes juntas)" aria-label="Relatório do CNPJ" onClick={() => setDocumentoRelatorio(documento)}><Layers aria-hidden /></Button>
      )}
      <Button variant="outline" className={iconeCls} title="Ver relatório" aria-label="Ver relatório" onClick={() => setRelatorioId(id)}><FileText aria-hidden /></Button>
      <Button variant="outline" className={iconeCls} title="Baixar PDF" aria-label="Baixar PDF" onClick={() => void baixar(id)} disabled={baixandoId !== null}>
        {baixandoId === id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      </Button>
      {administrar && (
        <Button
          variant="outline" className={iconeCls} title="Reprocessar: refaz a análise com a resposta já paga, sem nova cobrança" aria-label="Reprocessar (sem custo)"
          onClick={() => reprocessar.mutate({ id })} disabled={reprocessar.isPending}
        >
          {reprocessar.isPending && reprocessar.variables?.id === id ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
        </Button>
      )}
    </div>
  );
  const vereditoCurto = { APROVADO: 'Aprovado', COM_RESTRICAO: 'Com restrição', REPROVADO_A_PRAZO: 'Só à vista' } as const;

  return (
    <Panel>
      <PanelHeader title="Arquivo de análises" description="Todas as consultas já feitas, da mais recente para a mais antiga." />
      <div className="space-y-3 border-b border-slate-200 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <Input
            value={buscaDigitada}
            onChange={(e) => setBuscaDigitada(e.target.value)}
            placeholder="Buscar por nome, cidade ou CNPJ"
            aria-label="Buscar por nome, cidade ou CNPJ"
            className="h-10 pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <label className="grid gap-1 text-xs font-medium text-slate-600">UF
            <select className={CAMPO} value={filtros.uf} onChange={(e) => muda({ uf: e.target.value })}>
              <option value="">Todas</option>
              {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">Veredito
            <select className={CAMPO} value={filtros.veredito} onChange={(e) => muda({ veredito: e.target.value as FiltrosArquivo['veredito'] })}>
              <option value="">Todos</option>
              {(Object.keys(ROTULO_VEREDITO) as Veredito[]).map((k) => <option key={k} value={k}>{ROTULO_VEREDITO[k]}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">De
            <input type="date" className={CAMPO} value={filtros.de} onChange={(e) => muda({ de: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">Até
            <input type="date" className={CAMPO} value={filtros.ate} onChange={(e) => muda({ ate: e.target.value })} />
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500" aria-live="polite">
            {invertido ? <span className="text-red-600">A data inicial é depois da final.</span> : `${total} análise(s)${ativos ? ' com os filtros aplicados' : ''}`}
          </p>
          {ativos > 0 && (
            <Button type="button" variant="ghost" size="lg" className="h-10" onClick={() => { setFiltros(FILTROS_VAZIOS); setBuscaDigitada(''); setPagina(1); }}>
              <X aria-hidden />Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {q.error ? (
        <div className="p-4"><QueryError message={q.error.message} onRetry={() => void q.refetch()} retrying={q.isFetching} /></div>
      ) : q.isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-brand-600" aria-label="Carregando" /></div>
      ) : itens.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title={ativos ? 'Nenhuma análise com estes filtros' : 'Nenhuma análise de crédito ainda'}
          description={ativos ? 'Tire algum filtro ou mude o período.' : 'Quando o administrador consultar um CNPJ, a análise aparece aqui.'}
        />
      ) : (
        <>
          {/* Celular: um cartão por análise */}
          <ul className="divide-y divide-slate-200 md:hidden">
            {itens.map((i) => (
              <li key={i.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start gap-2">
                  <CreditoSemaforo relatorio={{ veredito: i.veredito, valido: true }} size="lg" className="mt-0.5" />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-900">{i.razaoSocial || 'Sem razão social'}</p>
                    <p className="text-xs tabular-nums text-slate-500">{formatarDocumento(i.documento)}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600">
                  {ROTULO_VEREDITO[i.veredito]} · Score {i.score ?? 'n/i'} · {[i.municipio, i.uf].filter(Boolean).join('/') || 'sem cidade'}
                </p>
                <p className="text-xs text-slate-500">
                  {i.produtoNome}{i.fontes >= 2 ? ` (${i.fontes} fontes)` : ''} · {dataHoraBR(i.consultadoEm)} · {i.consultadoPor ?? 'sem autor'} · {i.custoReais != null ? formatBRL(i.custoReais) : 'sem custo informado'} · {i.pedidosVinculados} pedido(s)
                </p>
                {acoes(i.id, i.documento, i.fontes)}
              </li>
            ))}
          </ul>
          {/* PC: tabela compacta, uma linha por análise */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-[13px] tabular-nums">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 py-2 pl-3"><span className="sr-only">Semáforo</span></th>
                  <th className="px-2 py-2">Empresa</th>
                  <th className="px-2 py-2">CNPJ</th>
                  <th className="px-2 py-2">Cidade/UF</th>
                  <th className="px-2 py-2 text-right">Score</th>
                  <th className="px-2 py-2">Veredito</th>
                  <th className="px-2 py-2">Consulta</th>
                  <th className="px-2 py-2">Data</th>
                  <th className="px-2 py-2 text-right">Custo</th>
                  <th className="py-2 pl-2 pr-3"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-1.5 pl-3"><CreditoSemaforo relatorio={{ veredito: i.veredito, valido: true }} size="md" /></td>
                    <td className="max-w-[260px] truncate px-2 py-1.5 font-medium text-slate-900" title={i.razaoSocial || undefined}>{i.razaoSocial || '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-700">{formatarDocumento(i.documento)}</td>
                    <td className="max-w-[170px] truncate px-2 py-1.5 text-slate-700" title={[i.municipio, i.uf].filter(Boolean).join('/') || undefined}>{[i.municipio, i.uf].filter(Boolean).join('/') || '—'}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{i.score ?? '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-700">{vereditoCurto[i.veredito]}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">
                      {i.produtoNome}
                      {i.fontes >= 2 && <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700" title="Este documento tem consultas de mais de uma fonte nos últimos 30 dias">{i.fontes} fontes</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-slate-600" title={`Consultado por ${i.consultadoPor ?? 'sem autor'} · ${i.pedidosVinculados} pedido(s) vinculado(s)`}>{dataHoraBR(i.consultadoEm)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right text-slate-600">{i.custoReais != null ? formatBRL(i.custoReais) : '—'}</td>
                    <td className="py-1.5 pl-2 pr-3">{acoesCompactas(i.id, i.documento, i.fontes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
            <Button variant="outline" size="lg" className="h-10" disabled={pagina <= 1 || q.isFetching} onClick={() => setPagina((p) => Math.max(1, p - 1))}>Anterior</Button>
            <span className="text-xs text-slate-600">Página {pagina} de {paginas} ({POR_PAGINA_ARQUIVO} por página)</span>
            <Button variant="outline" size="lg" className="h-10" disabled={pagina >= paginas || q.isFetching} onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
          </div>
        </>
      )}
      <RelatorioCreditoDialog reportId={relatorioId} open={relatorioId !== null} onOpenChange={(o) => { if (!o) setRelatorioId(null); }} />
      <RelatorioCreditoDialog documento={documentoRelatorio} open={documentoRelatorio !== null} onOpenChange={(o) => { if (!o) setDocumentoRelatorio(null); }} />
    </Panel>
  );
}

export default function AnaliseCredito() {
  const { user, loading } = useAuth();
  const perm = permissoesCredito(user?.role);
  const status = trpc.credito.status.useQuery(undefined, { enabled: perm.verPagina });
  const saldo = trpc.credito.saldo.useQuery(undefined, { enabled: perm.administrar && status.data?.simulado === false, retry: false });

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand-600" aria-label="Carregando" /></div>;
  }
  if (!perm.verPagina) return <AccessDenied area="Análise de crédito" />;

  const s = status.data;
  const saldoValor = s?.simulado ? null : saldo.data?.saldo ?? null;
  const baixo = !s?.simulado && saldoEstaBaixo(saldoValor);
  return (
    <Page>
      <PageHeader title="Análise de crédito" description="Consulte o crédito de clientes, veja o arquivo de análises e baixe os relatórios em PDF." />

      {s?.simulado && (
        <div role="alert" className="rounded-md border-2 border-dashed border-red-600 bg-red-50 px-3 py-2 text-sm font-bold uppercase text-red-700">
          Provedor simulado — os dados são fictícios e não servem para decisão.
        </div>
      )}

      {status.error ? (
        <QueryError message={status.error.message} onRetry={() => void status.refetch()} retrying={status.isFetching} />
      ) : (
        <>
          {perm.administrar && (
            <Panel>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Saldo na conta API Full</p>
                  <p className={`mt-1 break-words text-3xl font-bold tabular-nums ${baixo ? 'text-amber-700' : 'text-slate-900'}`}>
                    {s?.simulado ? '—' : saldo.isLoading ? '…' : saldoValor != null ? formatBRL(saldoValor) : 'Indisponível'}
                  </p>
                  {s?.simulado && <p className="text-xs text-slate-500">Não se aplica ao provedor simulado</p>}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">Gasto no mês</p>
                  <p className="mt-1 break-words text-3xl font-bold tabular-nums text-slate-900">{s ? formatBRL(s.gastoNoMesReais) : '--'}</p>
                  <p className="text-xs text-slate-500">Soma das consultas pagas concluídas neste mês</p>
                </div>
              </div>
              {baixo && (
                <div role="alert" className="flex items-start gap-2 border-t border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span><strong>Saldo baixo.</strong> Restam {formatBRL(saldoValor ?? 0)} (aviso abaixo de {formatBRL(SALDO_BAIXO_REAIS)}). Recarregue a conta API Full antes de consultar.</span>
                </div>
              )}
            </Panel>
          )}
          <StatStrip>
            <Stat
              label="Provedor"
              value={s ? (s.simulado ? <StatusBadge tone="danger">SIMULADO</StatusBadge> : <span className="break-words text-base">{s.provedor}</span>) : '--'}
            />
            <Stat label="Consultas no mês" value={s ? `${s.usadasNoMes}/${s.limiteMensal}` : '--'} tone={s && s.usadasNoMes >= s.limiteMensal ? 'danger' : 'default'} />
            <Stat label="Bloqueio no SMBI" value={s ? (s.bloqueioAtivo ? 'Ligado' : 'Desligado') : '--'} tone={s?.bloqueioAtivo ? 'warning' : 'default'} />
          </StatStrip>
        </>
      )}

      {perm.administrar && <ControlesAdmin />}
      <ConsultaAvulsa podeConsultar={perm.consultar} />
      <CatalogoComparativo />
      <Arquivo administrar={perm.administrar} />
    </Page>
  );
}
