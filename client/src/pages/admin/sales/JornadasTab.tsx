import { useState } from 'react';
import { toast } from 'sonner';
import { Ban, Pause, Play, Search } from 'lucide-react';
import { trpc } from '../../../lib/trpc';
import { btn, INPUT } from '../../../components/premium/admin/adminUi';
import { errorMessage } from '../../../components/premium/admin/adminLogic';
import { JOURNEY_STATES, JOURNEY_STATE_LABEL, type JourneyState } from '../../../../../shared/sales';
import { Card, Consulta, MotivoDialog, Pill, Vazio, fmtData } from './ui';
import { traduzirMotivo } from './motivos';

const POR_PAGINA = 20;

export default function JornadasTab() {
  const utils = trpc.useUtils();
  const [estado, setEstado] = useState<JourneyState | ''>('');
  const [campo, setCampo] = useState('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const q = trpc.sales.jornadas.useQuery({ estado: estado || undefined, busca: busca || undefined, pagina, porPagina: POR_PAGINA });
  const [pausar, setPausar] = useState<number | null>(null);
  const [suprimir, setSuprimir] = useState<string | null>(null);

  const refazer = () => { utils.sales.jornadas.invalidate(); utils.sales.painel.invalidate(); };
  const pausarMut = trpc.sales.pausarJornada.useMutation({ onSuccess: () => { toast.success('Jornada pausada.'); refazer(); }, onError: (e) => toast.error(errorMessage(e)) });
  const retomarMut = trpc.sales.retomarJornada.useMutation({ onSuccess: () => { toast.success('Jornada retomada.'); refazer(); }, onError: (e) => toast.error(errorMessage(e)) });
  const suprimirMut = trpc.sales.suprimir.useMutation({
    onSuccess: (r) => {
      if (r.ok) toast.success('Contato suprimido nos dois bancos.');
      else toast.error(`Suprimido só em parte. Falhas: ${r.falhas.join('; ')}`);
      refazer();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const total = q.data?.total ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="flex flex-col sm:flex-row gap-2"
          onSubmit={(e) => { e.preventDefault(); setBusca(campo.trim()); setPagina(1); }}
        >
          <select value={estado} onChange={(e) => { setEstado(e.target.value as JourneyState | ''); setPagina(1); }} className={`${INPUT} sm:!w-56`} aria-label="Filtrar por situação">
            <option value="">Todas as situações</option>
            {JOURNEY_STATES.map((s) => <option key={s} value={s}>{JOURNEY_STATE_LABEL[s]}</option>)}
          </select>
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" aria-hidden="true" />
            <input value={campo} onChange={(e) => setCampo(e.target.value)} placeholder="Buscar empresa ou e-mail" className={`${INPUT} pl-10`} aria-label="Buscar" />
          </div>
          <button type="submit" className={btn.primary}>Buscar</button>
        </form>
      </Card>

      <Consulta carregando={q.isLoading} erro={q.error} refazer={() => q.refetch()}>
        {q.data && q.data.itens.length === 0 ? (
          <Card><Vazio>Nenhuma jornada encontrada.</Vazio></Card>
        ) : (
          <ul className="space-y-3">
            {q.data?.itens.map((j) => (
              <li key={j.journeyId} className="bg-white rounded-2xl border border-slate-200/80 p-4 min-w-0 md:grid md:grid-cols-12 md:gap-4 md:items-start">
                <div className="md:col-span-4 min-w-0">
                  <p className="font-bold text-slate-900 break-words">{j.empresa}</p>
                  <p className="text-xs text-slate-500">{j.cidadeUf ?? 'Local não informado'}</p>
                  <p className="text-xs text-slate-700 break-all">{j.email}</p>
                </div>
                <div className="md:col-span-4 mt-2 md:mt-0 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <Pill tom={j.estado === 'SUPPRESSED' ? 'rose' : j.estado === 'CUSTOMER' ? 'emerald' : 'blue'}>{JOURNEY_STATE_LABEL[j.estado]}</Pill>
                    <Pill>Passo {j.passo + 1}</Pill>
                    <Pill>Nota {j.score ?? '—'}</Pill>
                    {j.pausada && <Pill tom="amber">Pausada</Pill>}
                  </div>
                  {j.pausada && <p className="text-[12px] text-amber-900 break-words">Motivo: {j.pausada}</p>}
                  {j.elegivel === false && j.motivosInelegivel.length > 0 && (
                    <ul className="text-[12px] text-slate-600 list-disc pl-5">
                      {j.motivosInelegivel.map((m) => <li key={m}>{traduzirMotivo(m)}</li>)}
                    </ul>
                  )}
                  {j.elegivel === true && <p className="text-[12px] text-emerald-700">Pode receber mensagem.</p>}
                  <p className="text-[11px] text-slate-500">Último contato: {fmtData(j.ultimoContatoEm)} · último evento: {fmtData(j.ultimoEventoEm)}</p>
                </div>
                <div className="md:col-span-4 mt-3 md:mt-0 flex flex-col sm:flex-row md:flex-col lg:flex-row gap-2 md:justify-end">
                  {j.pausada ? (
                    <button type="button" onClick={() => retomarMut.mutate({ journeyId: j.journeyId })} className={btn.secondary}><Play className="w-4 h-4" aria-hidden="true" /> Retomar</button>
                  ) : (
                    <button type="button" onClick={() => setPausar(j.journeyId)} disabled={j.estado === 'SUPPRESSED'} className={btn.secondary}><Pause className="w-4 h-4" aria-hidden="true" /> Pausar</button>
                  )}
                  <button type="button" onClick={() => setSuprimir(j.email)} disabled={j.estado === 'SUPPRESSED'} className={btn.danger}><Ban className="w-4 h-4" aria-hidden="true" /> Suprimir contato</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {total > POR_PAGINA && (
          <div className="flex items-center justify-between gap-3 mt-4">
            <button type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} className={btn.secondary}>Anterior</button>
            <span className="text-xs text-slate-600">Página {pagina} de {paginas} ({total})</span>
            <button type="button" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)} className={btn.secondary}>Próxima</button>
          </div>
        )}
      </Consulta>

      <MotivoDialog
        aberto={pausar !== null}
        aoFechar={() => setPausar(null)}
        titulo="Pausar esta jornada?"
        descricao={<p>Nenhuma mensagem nova sai para esta empresa até você retomar.</p>}
        confirmar="Pausar"
        aoConfirmar={(motivo) => { if (pausar !== null) pausarMut.mutate({ journeyId: pausar, motivo }); }}
      />
      <MotivoDialog
        aberto={suprimir !== null}
        aoFechar={() => setSuprimir(null)}
        titulo="Suprimir este contato?"
        descricao={<><p className="break-all font-semibold">{suprimir}</p><p>O e-mail entra na lista de quem não deve receber, nos dois bancos, e as mensagens pendentes são canceladas. Não dá para desfazer por aqui.</p></>}
        confirmar="Suprimir"
        perigoso
        aoConfirmar={(motivo) => { if (suprimir) suprimirMut.mutate({ email: suprimir, motivo }); }}
      />
    </div>
  );
}
