import { useState } from 'react';
import { toast } from 'sonner';
import { OctagonX, Play, FlaskConical } from 'lucide-react';
import { trpc } from '../../../lib/trpc';
import { btn, INPUT } from '../../../components/premium/admin/adminUi';
import { ConfirmDialog } from '../../../components/premium/admin/ConfirmDialog';
import { errorMessage } from '../../../components/premium/admin/adminLogic';
import { SALES_MODES, SALES_MODE_LABEL, JOURNEY_STATE_LABEL, type SalesMode, type JourneyState } from '../../../../../shared/sales';
import { Aviso, Card, Consulta, Pill, MotivoDialog, fmtData, haQuanto } from './ui';
import { DISPONIBILIDADE_LABEL, traduzirMotivo } from './motivos';

type Ciclo = NonNullable<ReturnType<typeof trpc.sales.ciclo.useMutation>['data']>;

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 min-w-0">
      <p className="text-[11px] text-slate-500 leading-tight">{rotulo}</p>
      <p className="text-xl font-bold text-slate-900 tabular-nums">{valor}</p>
    </div>
  );
}

function Contagens({ titulo, mapa }: { titulo: string; mapa: Record<string, number> }) {
  const itens = Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  if (itens.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-bold text-slate-700 mb-1">{titulo}</p>
      <ul className="space-y-1">
        {itens.map(([codigo, n]) => (
          <li key={codigo} className="flex justify-between gap-3 text-[13px]">
            <span className="text-slate-700 min-w-0 break-words">{traduzirMotivo(codigo)}</span>
            <span className="font-semibold tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultadoCicloView({ r }: { r: Ciclo }) {
  return (
    <div className="space-y-4">
      <Aviso tom={r.simulado ? 'sky' : 'emerald'} titulo={r.simulado ? 'Simulação: nada foi gravado' : 'Ciclo executado'}>
        {r.loteId ? `Lote do dia: nº ${r.loteId}.` : 'Nenhum lote foi montado.'}
      </Aviso>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Numero rotulo="Empresas sincronizadas" valor={r.empresasSincronizadas} />
        <Numero rotulo="Contatos novos" valor={r.contatosNovos} />
        <Numero rotulo="Qualificados" valor={r.qualificados} />
        <Numero rotulo="Mensagens geradas" valor={r.mensagensGeradas} />
        <Numero rotulo="Reservas liberadas" valor={r.reservasLiberadas} />
        <Numero rotulo="Marcadas sem confirmação" valor={r.marcadasDesconhecidas} />
        <Numero rotulo="Cadências avançadas" valor={r.cadenciasAvancadas} />
        <Numero rotulo="Tarefas no CRM" valor={r.tarefasCrmProcessadas} />
      </div>
      <Contagens titulo="Mensagens que não foram geradas, e por quê" mapa={r.mensagensNaoGeradas} />
      <Contagens titulo="Contatos que não podem receber, e por quê" mapa={r.inelegiveisPorMotivo} />
      {r.avisos.length > 0 && (
        <ul className="list-disc pl-5 text-[13px] text-amber-900 space-y-1">
          {r.avisos.map((a) => <li key={a}>{a}</li>)}
        </ul>
      )}
    </div>
  );
}

export default function PainelTab() {
  const utils = trpc.useUtils();
  const painel = trpc.sales.painel.useQuery(undefined, { refetchInterval: 30_000 });
  const settings = trpc.sales.settingsLer.useQuery();
  const [pausar, setPausar] = useState(false);
  const [novoModo, setNovoModo] = useState<SalesMode | null>(null);
  const [modoEscolhido, setModoEscolhido] = useState<SalesMode>('REVIEW');
  const [confirmo, setConfirmo] = useState(false);
  const [resultado, setResultado] = useState<Ciclo | null>(null);

  const modoMut = trpc.sales.definirModo.useMutation({
    onSuccess: (r) => {
      toast.success(`Modo agora: ${SALES_MODE_LABEL[r.modo]}. Reservas revogadas: ${r.reservasRevogadas}.`);
      setConfirmo(false);
      utils.sales.painel.invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cicloMut = trpc.sales.ciclo.useMutation({
    onSuccess: (r) => { setResultado(r); utils.sales.painel.invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const p = painel.data;
  const disp = settings.data?.disponibilidade;
  const escalar = novoModo === 'SEMI_AUTONOMOUS' || novoModo === 'AUTONOMOUS';

  return (
    <Consulta carregando={painel.isLoading} erro={painel.error} refazer={() => painel.refetch()}>
      {p && (
        <div className="space-y-4">
          {(p.modo === 'DRY_RUN' || !p.canal.ativo) && (
            <Aviso tom="amber" titulo="Nenhum e-mail comercial sai agora">
              Nenhum e-mail comercial sai enquanto {p.modo === 'DRY_RUN' ? 'o modo for Simulação' : ''}
              {p.modo === 'DRY_RUN' && !p.canal.ativo ? ' ou ' : ''}
              {!p.canal.ativo ? 'o canal de envio estiver desligado' : ''}. O que aparece aqui é só simulação.
            </Aviso>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card titulo="Modo de operação">
              <p className="text-lg font-bold text-slate-900 leading-snug">{SALES_MODE_LABEL[p.modo]}</p>
              <button type="button" onClick={() => setPausar(true)} className={`${btn.danger} w-full mt-3 !min-h-[56px] !text-base`}>
                <OctagonX className="w-5 h-5" aria-hidden="true" /> PAUSAR TUDO
              </button>
              <div className="mt-4 flex flex-col sm:flex-row gap-2">
                <select value={modoEscolhido} onChange={(e) => setModoEscolhido(e.target.value as SalesMode)} className={INPUT} aria-label="Escolher modo">
                  {SALES_MODES.map((m) => <option key={m} value={m}>{SALES_MODE_LABEL[m]}</option>)}
                </select>
                <button type="button" onClick={() => setNovoModo(modoEscolhido)} disabled={modoEscolhido === p.modo} className={`${btn.secondary} shrink-0`}>
                  Mudar modo
                </button>
              </div>
            </Card>

            <Card titulo="Situação">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-slate-600">Canal de envio</dt>
                  <dd>{p.canal.ativo ? <Pill tom="emerald">Ligado</Pill> : <Pill tom="rose">Desligado</Pill>}{' '}
                    {!p.canal.politicaAprovada && <Pill tom="amber">Política não aprovada</Pill>}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-600">Vendedor virtual</dt>
                  <dd>{p.agenteAtivo ? <Pill tom="emerald">Ligado</Pill> : <Pill tom="slate">Desligado</Pill>}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-600">Caixa de 10 kg</dt>
                  <dd className="text-right"><Pill tom={p.disponibilidade === 'disponivel' ? 'emerald' : p.disponibilidade === 'em_falta' ? 'rose' : 'slate'}>{DISPONIBILIDADE_LABEL[p.disponibilidade]}</Pill>
                    {disp && disp.status !== 'nao_informado' && (
                      <span className="block text-[11px] text-slate-500 mt-1">por {disp.responsavel ?? '—'} em {fmtData(disp.atualizadoEm)}</span>
                    )}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-600">Precisa de você</dt>
                  <dd>{p.excecoesAbertas > 0 ? <Pill tom="rose">{p.excecoesAbertas} aberta(s)</Pill> : <Pill tom="emerald">Nada pendente</Pill>}</dd></div>
              </dl>
            </Card>
          </div>

          <Card titulo="Executores (Hermes)">
            {p.executores.length === 0 ? (
              <Aviso tom="rose">Nenhum executor deu sinal ainda. Sem ele nenhum e-mail é enviado.</Aviso>
            ) : (
              <ul className="space-y-2">
                {p.executores.map((x) => (
                  <li key={x.executor} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-sm ${x.atrasado ? 'border-rose-300 bg-rose-50' : 'border-slate-200'}`}>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 break-all">{x.executor}</p>
                      <p className="text-[11px] text-slate-500">versão {x.versao ?? '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-semibold ${x.atrasado ? 'text-rose-700' : 'text-emerald-700'}`}>{x.atrasado ? 'Atrasado' : 'Em dia'}</p>
                      <p className="text-[11px] text-slate-500">{haQuanto(x.ultimoSinalEm)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card titulo={`Hoje (${p.hoje.dataSp})`}>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              <Numero rotulo="Empresas novas contatadas" valor={p.hoje.empresasNovasContatadas} />
              <Numero rotulo="Mensagens aceitas" valor={p.hoje.mensagensAceitas} />
              <Numero rotulo="Respostas de pessoas" valor={p.hoje.respostasHumanas} />
              <Numero rotulo="Pedidos para sair" valor={p.hoje.pedidosDeSaida} />
              <Numero rotulo="Devolvidas" valor={p.hoje.devolvidas} />
              <Numero rotulo="Sem confirmação" valor={p.hoje.desconhecidas} />
            </div>
            {p.loteDoDia && <p className="text-xs text-slate-600 mt-3">Lote do dia nº {p.loteDoDia.id}: {p.loteDoDia.tamanho} mensagem(ns), situação {p.loteDoDia.status}.</p>}
            {Object.keys(p.jornadasPorEstado).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {Object.entries(p.jornadasPorEstado).map(([estado, n]) => (
                  <Pill key={estado}>{JOURNEY_STATE_LABEL[estado as JourneyState] ?? estado}: {n}</Pill>
                ))}
              </div>
            )}
          </Card>

          <Card titulo="Ciclo diário">
            <p className="text-xs text-slate-600 mb-3">O ciclo busca empresas, confere quem pode receber e monta o lote do dia. "Simular" mostra o resultado sem gravar nada.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" disabled={cicloMut.isPending} onClick={() => cicloMut.mutate({ simular: true })} className={btn.secondary}>
                <FlaskConical className="w-4 h-4" aria-hidden="true" /> Simular ciclo
              </button>
              <button type="button" disabled={cicloMut.isPending} onClick={() => cicloMut.mutate({ simular: false })} className={btn.primary}>
                <Play className="w-4 h-4" aria-hidden="true" /> Rodar ciclo agora
              </button>
            </div>
            {cicloMut.isPending && <p className="text-xs text-slate-500 mt-3" role="status">Rodando...</p>}
            {resultado && <div className="mt-4"><ResultadoCicloView r={resultado} /></div>}
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={pausar}
        onOpenChange={setPausar}
        title="Pausar toda a operação?"
        description={<p>Nenhuma ação externa nova sai e as reservas de envio são revogadas. Você pode voltar a outro modo depois.</p>}
        confirmLabel="Pausar agora"
        destructive
        onConfirm={() => modoMut.mutate({ modo: 'PAUSED', motivo: 'Pausa pelo painel', confirmo: false })}
      />
      <MotivoDialog
        aberto={novoModo !== null}
        aoFechar={() => { setNovoModo(null); setConfirmo(false); }}
        titulo={novoModo ? `Mudar para: ${SALES_MODE_LABEL[novoModo]}` : ''}
        descricao={
          <>
            <p>O motivo fica registrado na auditoria.</p>
            {escalar && (
              <label className="flex items-start gap-2 text-sm text-slate-800 font-medium">
                <input type="checkbox" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} className="mt-1 w-4 h-4" />
                Entendo que neste modo e-mails comerciais saem sem a minha aprovação caso a caso.
              </label>
            )}
          </>
        }
        confirmar={escalar && !confirmo ? 'Marque a confirmação' : 'Mudar modo'}
        aoConfirmar={(motivo) => {
          if (novoModo && (!escalar || confirmo)) modoMut.mutate({ modo: novoModo, motivo, confirmo });
          else toast.error('Marque a caixa de confirmação para continuar.');
        }}
      />
    </Consulta>
  );
}
