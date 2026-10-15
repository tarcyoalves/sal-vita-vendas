import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Download, FileText, Loader2, Search, ShieldCheck, X } from 'lucide-react';
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
import { ConsultarCreditoDialog } from '../components/credito/ConsultarCreditoDialog';
import { RelatorioCreditoDialog } from '../components/credito/RelatorioCreditoDialog';
import { useBaixarPdfCredito } from '../components/credito/useBaixarPdfCredito';
import { formatBRL } from '../lib/faturamento/calc';
import { formatarDocumento, mascararDocumentoDigitando, soDigitos, validarDocumentoLocal } from '../lib/credito/documento';
import { dataHoraBR, permissoesCredito } from '../lib/credito/regras';
import {
  FILTROS_VAZIOS, POR_PAGINA_ARQUIVO, entradaListar, filtrosAtivos, periodoInvertido, totalPaginas, type FiltrosArquivo,
} from '../lib/credito/filtros';
import { ROTULO_VEREDITO, type Veredito } from '../../../shared/credito';

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];
const CAMPO = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm';

function ControlesAdmin() {
  const utils = trpc.useUtils();
  const status = trpc.credito.status.useQuery();
  const [confirmarBloqueio, setConfirmarBloqueio] = useState<boolean | null>(null);
  const [limite, setLimite] = useState('');
  useEffect(() => { if (status.data) setLimite(String(status.data.limiteMensal)); }, [status.data?.limiteMensal]); // eslint-disable-line react-hooks/exhaustive-deps

  const setBloqueio = trpc.credito.setBloqueioAtivo.useMutation({
    onSuccess: (r) => { toast.success(r.bloqueioAtivo ? 'Bloqueio de crédito ligado' : 'Bloqueio de crédito desligado'); void utils.credito.status.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const setLimiteMut = trpc.credito.setLimiteMensal.useMutation({
    onSuccess: (r) => { toast.success(`Limite mensal: ${r.limiteMensal} consultas`); void utils.credito.status.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  if (!status.data) return null;
  const n = Number(limite);
  const limiteOk = limite.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 10_000;

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
          onSubmit={(e) => { e.preventDefault(); if (limiteOk && !setLimiteMut.isPending) setLimiteMut.mutate({ limite: n }); }}
        >
          <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium text-slate-700">
            Limite mensal de consultas pagas
            <Input inputMode="numeric" value={limite} onChange={(e) => setLimite(e.target.value.replace(/\D/g, ''))} className="h-10" />
          </label>
          <Button type="submit" size="lg" disabled={!limiteOk || n === status.data.limiteMensal || setLimiteMut.isPending}>
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
        <ConsultarCreditoDialog open={aberto} onOpenChange={setAberto} documento={documento} onConcluido={(id) => setRelatorioId(id)} />
      )}
      <RelatorioCreditoDialog reportId={relatorioId} open={relatorioId !== null} onOpenChange={(o) => { if (!o) setRelatorioId(null); }} />
    </Panel>
  );
}

function Arquivo() {
  const [filtros, setFiltros] = useState<FiltrosArquivo>(FILTROS_VAZIOS);
  const [buscaDigitada, setBuscaDigitada] = useState('');
  const [pagina, setPagina] = useState(1);
  const [relatorioId, setRelatorioId] = useState<number | null>(null);
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

  const acoes = (id: number) => (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" variant="outline" className="h-10" onClick={() => setRelatorioId(id)}><FileText aria-hidden />Ver relatório</Button>
      <Button size="lg" variant="outline" className="h-10" onClick={() => void baixar(id)} disabled={baixandoId !== null}>
        {baixandoId === id ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}Baixar PDF
      </Button>
    </div>
  );

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
                  {dataHoraBR(i.consultadoEm)} · {i.consultadoPor ?? 'sem autor'} · {i.custoReais != null ? formatBRL(i.custoReais) : 'sem custo informado'} · {i.pedidosVinculados} pedido(s)
                </p>
                {acoes(i.id)}
              </li>
            ))}
          </ul>
          {/* PC: tabela */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm tabular-nums">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-3 py-2.5"><span className="sr-only">Semáforo</span></th>
                  <th className="px-3 py-2.5">Razão social</th>
                  <th className="px-3 py-2.5">CNPJ</th>
                  <th className="px-3 py-2.5">Cidade/UF</th>
                  <th className="px-3 py-2.5 text-right">Score</th>
                  <th className="px-3 py-2.5">Data</th>
                  <th className="px-3 py-2.5">Consultado por</th>
                  <th className="px-3 py-2.5 text-right">Custo</th>
                  <th className="px-3 py-2.5 text-right">Pedidos</th>
                  <th className="px-3 py-2.5"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-3"><CreditoSemaforo relatorio={{ veredito: i.veredito, valido: true }} size="md" /></td>
                    <td className="max-w-[240px] break-words px-3 py-3 font-medium text-slate-900">{i.razaoSocial || '—'}<span className="block text-xs font-normal text-slate-500">{ROTULO_VEREDITO[i.veredito]}</span></td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-700">{formatarDocumento(i.documento)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-700">{[i.municipio, i.uf].filter(Boolean).join('/') || '—'}</td>
                    <td className="px-3 py-3 text-right">{i.score ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-700">{dataHoraBR(i.consultadoEm)}</td>
                    <td className="px-3 py-3 text-xs text-slate-700">{i.consultadoPor ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right text-xs">{i.custoReais != null ? formatBRL(i.custoReais) : '—'}</td>
                    <td className="px-3 py-3 text-right">{i.pedidosVinculados}</td>
                    <td className="px-3 py-3">{acoes(i.id)}</td>
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
        <StatStrip>
          <Stat
            label="Provedor"
            value={s ? (s.simulado ? <StatusBadge tone="danger">SIMULADO</StatusBadge> : <span className="break-words text-base">{s.provedor}</span>) : '--'}
          />
          {perm.administrar && (
            <Stat
              label="Saldo (API Full)"
              value={s?.simulado ? '—' : saldo.isLoading ? '…' : saldo.data?.saldo != null ? formatBRL(saldo.data.saldo) : 'Indisponível'}
              hint={s?.simulado ? 'Não se aplica ao simulado' : undefined}
            />
          )}
          <Stat label="Consultas no mês" value={s ? `${s.usadasNoMes}/${s.limiteMensal}` : '--'} tone={s && s.usadasNoMes >= s.limiteMensal ? 'danger' : 'default'} />
          <Stat label="Bloqueio no SMBI" value={s ? (s.bloqueioAtivo ? 'Ligado' : 'Desligado') : '--'} tone={s?.bloqueioAtivo ? 'warning' : 'default'} />
        </StatStrip>
      )}

      {perm.administrar && <ControlesAdmin />}
      <ConsultaAvulsa podeConsultar={perm.consultar} />
      <Arquivo />
    </Page>
  );
}
