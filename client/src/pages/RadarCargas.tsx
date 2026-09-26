import { useEffect, useMemo, useState } from 'react';
import { TRPCClientError } from '@trpc/client';
import { ChevronDown, ChevronRight, Loader2, Search, Truck } from 'lucide-react';
import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Skeleton } from '../components/ui/skeleton';
import { Progress } from '../components/ui/progress';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '../components/ui/empty';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '../components/ui/select';
import { CityAutocomplete } from '../components/radar/CityAutocomplete';
import { SegmentChips } from '../components/radar/SegmentChips';
import { LeadCard } from '../components/radar/LeadCard';
import { enrichmentNeedsPolling } from '../components/radar/EnrichmentSection';
import {
  EMPTY_RADAR_ACTIVITY,
  RADAR_RADIUS_OPTIONS_KM,
  RADAR_SEGMENT_KEYS,
  type RadarEnrichment,
  type RadarLead,
  type RadarLeadActivity,
  type RadarMunicipality,
  type RadarSegmentKey,
} from '../../../shared/radar';

const DEFAULT_SEGMENTS = RADAR_SEGMENT_KEYS.filter((k) => k !== 'racao_varejo');

// Teto de tempo de polling por busca — depois disso paramos de perguntar ao
// servidor mesmo que ainda reste algo pendente (robô pode ter travado).
const ENRICH_POLL_CAP_MS = 5 * 60 * 1000;
const ENRICH_POLL_INTERVAL_MS = 4000;

// Filtros pedidos pelo dono: a busca é uma lista de "para contatar", não uma
// fila que empurra tarefa. "Para contatar" e "Todos" continuam mostrando o
// aviso amber de "excluído antes" (não é um filtro à parte).
type LeadFilter = 'para_contatar' | 'contatados' | 'no_crm' | 'descartados' | 'all';

export default function RadarCargas() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // ── Formulário de busca ──
  const [city, setCity] = useState<RadarMunicipality | null>(null);
  const [radiusKm, setRadiusKm] = useState(50);
  const [bagsInput, setBagsInput] = useState('400');
  const [segments, setSegments] = useState<RadarSegmentKey[]>(DEFAULT_SEGMENTS);
  const [includeSecondary, setIncludeSecondary] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loadDate, setLoadDate] = useState('');
  const [freightNote, setFreightNote] = useState('');
  const [leadFilter, setLeadFilter] = useState<LeadFilter>('para_contatar');

  const bags = Number(bagsInput);
  const bagsValid = Number.isInteger(bags) && bags >= 1 && bags <= 2000;
  const canSearch = !!city && segments.length > 0 && bagsValid;

  const searchInput = useMemo(
    () => ({
      originIbge: city?.ibge ?? 0,
      radiusKm,
      segments,
      includeSecondary,
    }),
    [city, radiusKm, segments, includeSecondary],
  );

  const searchQuery = trpc.prospectingRadar.search.useQuery(searchInput, {
    enabled: false,
    retry: false,
  });

  // "Cidade da carga" para a mensagem padrão de contato (não é a cidade do
  // lead, é de onde a carreta está saindo).
  const originLabel = city ? `${city.nome} - ${city.uf}` : '';

  // ── Contato antes da tarefa: mapa local cnpj → atividade ──
  // Igual ao padrão de enrichmentByCnpj: mescla o que markContacted/discard/
  // restore devolvem, sem refazer a busca inteira (o dono pediu que os
  // filtros/contadores reajam na hora).
  const [activityByCnpj, setActivityByCnpj] = useState<Record<string, RadarLeadActivity>>({});
  const handleActivityChange = (cnpj: string, activity: RadarLeadActivity) => {
    setActivityByCnpj((prev) => ({ ...prev, [cnpj]: activity }));
  };

  // ── Enriquecimento por scraping (Fase 2) ──
  // Mapa local cnpj → enrichment, mesclado a cada resposta de enrichmentStatus
  // (polling) ou de um enrichNow individual — nunca refaz a busca inteira.
  const [enrichmentByCnpj, setEnrichmentByCnpj] = useState<Record<string, RadarEnrichment>>({});
  const [enricherOnline, setEnricherOnline] = useState(false);
  const [enrichUnavailable, setEnrichUnavailable] = useState(false); // enrichmentStatus NOT_IMPLEMENTED
  const [pollDeadline, setPollDeadline] = useState<number | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const handleSearch = () => {
    if (!canSearch) return;
    setEnrichmentByCnpj({});
    setActivityByCnpj({});
    setEnrichUnavailable(false);
    setPollTimedOut(false);
    setPollDeadline(Date.now() + ENRICH_POLL_CAP_MS);
    searchQuery.refetch();
  };

  const notImplemented =
    searchQuery.error instanceof TRPCClientError && searchQuery.error.data?.code === 'NOT_IMPLEMENTED';

  const data = searchQuery.data;
  const leads = data?.leads ?? [];
  const leadCnpjs = useMemo(() => leads.map((l) => l.cnpj), [leads]);

  // O status de "robô ligado" mais recente que já vimos — a resposta da
  // própria busca já traz um primeiro valor, o polling atualiza depois.
  useEffect(() => {
    if (data) setEnricherOnline(data.enricherOnline);
  }, [data]);

  // Encerra o cap de 5 min mesmo sem nenhuma outra atualização de estado
  // (senão a barra "buscando" ficaria presa até o próximo re-render).
  useEffect(() => {
    if (pollDeadline === null) return;
    const remaining = pollDeadline - Date.now();
    if (remaining <= 0) {
      setPollTimedOut(true);
      return;
    }
    const timer = setTimeout(() => setPollTimedOut(true), remaining);
    return () => clearTimeout(timer);
  }, [pollDeadline]);

  // Estado efetivo de cada card: o que o polling trouxe, senão o que veio na própria busca.
  const leadEnrichment = useMemo(
    () => new Map(leads.map((l) => [l.cnpj, l.enrichment] as const)),
    [leads],
  );
  const effectiveEnrichment = (cnpj: string): RadarEnrichment | null =>
    enrichmentByCnpj[cnpj] ?? leadEnrichment.get(cnpj) ?? null;
  // Só as empresas que foram para a fila contam no progresso (a busca enfileira
  // as mais próximas; as demais ficam sem pedido até o "Varrer agora").
  const trackedCnpjs = leadCnpjs.filter((c) => effectiveEnrichment(c) !== null);
  const enrichPending = trackedCnpjs.some((c) => enrichmentNeedsPolling(effectiveEnrichment(c)));

  const enrichmentStatusQuery = trpc.prospectingRadar.enrichmentStatus.useQuery(
    { cnpjs: leadCnpjs },
    {
      enabled: leadCnpjs.length > 0 && enrichPending && enricherOnline && !enrichUnavailable && !pollTimedOut,
      retry: false,
      // React Query já não refaz em background quando a aba está oculta
      // (refetchIntervalInBackground é false por padrão) — é o que dá a
      // pausa pedida quando o atendente troca de aba.
      refetchInterval: (query) => {
        if (query.state.error) return false;
        if (pollDeadline !== null && Date.now() > pollDeadline) return false;
        const res = query.state.data;
        if (res && !res.enricherOnline) return false;
        const stillPending = leadCnpjs.some((c) => enrichmentNeedsPolling(res?.items[c] ?? effectiveEnrichment(c)));
        return stillPending ? ENRICH_POLL_INTERVAL_MS : false;
      },
    },
  );

  useEffect(() => {
    const err = enrichmentStatusQuery.error;
    if (err instanceof TRPCClientError && err.data?.code === 'NOT_IMPLEMENTED') {
      setEnrichUnavailable(true);
    }
  }, [enrichmentStatusQuery.error]);

  useEffect(() => {
    const res = enrichmentStatusQuery.data;
    if (!res) return;
    setEnricherOnline(res.enricherOnline);
    setEnrichmentByCnpj((prev) => ({ ...prev, ...res.items }));
  }, [enrichmentStatusQuery.data]);

  // Chamado pelo card depois de um "Varrer agora" individual: mescla o
  // resultado e, se ainda houver algo pendente, reabre a janela de polling
  // (o intervalo pode ter parado se tudo já estivesse resolvido antes).
  const handleEnrichmentChange = (cnpj: string, next: RadarEnrichment) => {
    setEnrichmentByCnpj((prev) => ({ ...prev, [cnpj]: next }));
    if (enrichmentNeedsPolling(next)) {
      setPollTimedOut(false);
      setPollDeadline(Date.now() + ENRICH_POLL_CAP_MS);
      enrichmentStatusQuery.refetch();
    }
  };

  const enrichmentDoneCount = trackedCnpjs.filter((c) => !enrichmentNeedsPolling(effectiveEnrichment(c))).length;
  const showEnrichProgress =
    leadCnpjs.length > 0 && enricherOnline && !enrichUnavailable && !pollTimedOut && enrichPending;
  const showEnricherOffline = leadCnpjs.length > 0 && !!data && !enricherOnline;

  // Atividade efetiva de cada lead: o que markContacted/discard/restore
  // devolveram por último, senão o que já veio na busca.
  const effectiveActivity = (cnpj: string): RadarLeadActivity =>
    activityByCnpj[cnpj] ?? leads.find((l) => l.cnpj === cnpj)?.activity ?? EMPTY_RADAR_ACTIVITY;

  // Balde (mutuamente exclusivo) de cada lead nos novos filtros pedidos pelo
  // dono. "Já no CRM" manda em qualquer outro estado (é o comportamento de
  // sempre); descartado vem depois; contatado por último.
  function bucketFor(lead: RadarLead): Exclude<LeadFilter, 'all'> {
    if (lead.crm.kind === 'no_crm') return 'no_crm';
    const activity = effectiveActivity(lead.cnpj);
    if (activity.discarded) return 'descartados';
    if (activity.contactedAt) return 'contatados';
    return 'para_contatar';
  }

  const counts = useMemo(() => {
    const c = { all: leads.length, para_contatar: 0, contatados: 0, no_crm: 0, descartados: 0 };
    for (const l of leads) c[bucketFor(l)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, activityByCnpj]);

  const filteredLeads = useMemo(() => {
    if (leadFilter === 'all') return leads;
    return leads.filter((l) => bucketFor(l) === leadFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, leadFilter, activityByCnpj]);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <Truck size={16} />
        <p>
          Encontre empresas dos segmentos que compram sal perto da cidade da carga, para
          completar o espaço que sobrou na carreta.
        </p>
      </div>

      {/* ── Busca ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buscar empresas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-500 mb-1.5">Cidade da carga</Label>
              <CityAutocomplete value={city} onChange={setCity} />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-500 mb-1.5">Raio</Label>
              <Select value={String(radiusKm)} onValueChange={(v) => setRadiusKm(Number(v))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RADAR_RADIUS_OPTIONS_KM.map((km) => (
                    <SelectItem key={km} value={String(km)}>
                      {km} km (linha reta)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="bags" className="text-xs font-semibold text-slate-500 mb-1.5">
              Saldo de sacos (25 kg)
            </Label>
            <Input
              id="bags"
              type="number"
              min={1}
              max={2000}
              value={bagsInput}
              onChange={(e) => setBagsInput(e.target.value)}
              className={!bagsValid ? 'border-red-300' : ''}
              required
            />
            {!bagsValid && (
              <p className="text-[11px] text-red-500 mt-1">Informe de 1 a 2000 sacos.</p>
            )}
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-500 mb-1.5">Segmentos</Label>
            <SegmentChips selected={segments} onChange={setSegments} />
            {segments.length === 0 && (
              <p className="text-[11px] text-red-500 mt-1">Marque ao menos um segmento.</p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-700">Incluir CNAE secundário</p>
              <p className="text-[11px] text-slate-400">Mais resultados, menos precisos</p>
            </div>
            <Switch checked={includeSecondary} onCheckedChange={setIncludeSecondary} />
          </div>

          {/* Detalhes opcionais da carga */}
          <div>
            <button
              type="button"
              onClick={() => setDetailsOpen((o) => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              {detailsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Detalhes da carga (opcional)
            </button>
            {detailsOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div>
                  <Label htmlFor="loadDate" className="text-xs font-semibold text-slate-500 mb-1.5">
                    Data da carga
                  </Label>
                  <Input
                    id="loadDate"
                    type="date"
                    value={loadDate}
                    onChange={(e) => setLoadDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="freightNote" className="text-xs font-semibold text-slate-500 mb-1.5">
                    Condição de frete
                  </Label>
                  <Input
                    id="freightNote"
                    maxLength={200}
                    placeholder="Ex.: frete grátis para pedidos acima de 200 sacos"
                    value={freightNote}
                    onChange={(e) => setFreightNote(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <Button
            type="button"
            className="w-full"
            disabled={!canSearch || searchQuery.isFetching}
            onClick={handleSearch}
          >
            <Search size={15} />
            {searchQuery.isFetching ? 'Buscando...' : 'Buscar'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Resultados ── */}
      {searchQuery.isFetching && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      )}

      {!searchQuery.isFetching && notImplemented && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Radar em implantação</EmptyTitle>
            <EmptyDescription>
              Essa funcionalidade ainda está sendo construída. Volte em breve.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!searchQuery.isFetching && !notImplemented && searchQuery.error && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Não foi possível buscar</EmptyTitle>
            <EmptyDescription>{searchQuery.error.message}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!searchQuery.isFetching && !notImplemented && data && data.datasetRelease === null && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Truck />
            </EmptyMedia>
            <EmptyTitle>Base de empresas indisponível</EmptyTitle>
            <EmptyDescription>
              {isAdmin
                ? 'A base ainda não foi importada — veja scripts/radar/README.md'
                : 'A base de empresas ainda não foi carregada. Fale com o administrador.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!searchQuery.isFetching && !notImplemented && data && data.datasetRelease !== null && (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              {leads.length} {leads.length === 1 ? 'empresa' : 'empresas'} em {data.municipalitiesInRadius}{' '}
              {data.municipalitiesInRadius === 1 ? 'município' : 'municípios'} · base Receita {data.datasetRelease}
            </p>
            {data.truncated && (
              <p className="text-xs text-amber-600">Mostrando apenas as 200 empresas mais próximas.</p>
            )}

            {/* Progresso do enriquecimento por scraping (Fase 2) */}
            {showEnrichProgress && (
              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-600 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin text-slate-400" />
                  Buscando dados na web: {enrichmentDoneCount} de {trackedCnpjs.length} concluídos
                </p>
                <Progress value={trackedCnpjs.length ? (enrichmentDoneCount / trackedCnpjs.length) * 100 : 0} className="h-1.5" />
              </div>
            )}
            {showEnricherOffline && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                Robô de busca na web desligado — mostrando só os dados da Receita.
                {isAdmin && ' Veja scripts/radar/enricher/README.md.'}
              </p>
            )}

            {/* Filtros: a busca é uma lista — o atendente decide depois do contato */}
            <div className="flex flex-wrap gap-1.5">
              {([
                ['para_contatar', 'Para contatar', counts.para_contatar],
                ['contatados', 'Contatados', counts.contatados],
                ['no_crm', 'Já no CRM', counts.no_crm],
                ['descartados', 'Descartados', counts.descartados],
                ['all', 'Todos', counts.all],
              ] as [LeadFilter, string, number][]).map(([key, label, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLeadFilter(key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                    leadFilter === key
                      ? 'bg-blue-900 text-white border-blue-900'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </div>

          {filteredLeads.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nenhuma empresa neste filtro</EmptyTitle>
                <EmptyDescription>Tente outro filtro ou aumente o raio da busca.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredLeads.map((lead) => (
                <LeadCard
                  key={lead.cnpj}
                  lead={lead}
                  originIbge={searchInput.originIbge}
                  originLabel={originLabel}
                  bags={bags}
                  loadDate={loadDate || undefined}
                  freightNote={freightNote.trim() || undefined}
                  activity={effectiveActivity(lead.cnpj)}
                  onActivityChange={handleActivityChange}
                  enrichment={effectiveEnrichment(lead.cnpj)}
                  onEnrichmentChange={handleEnrichmentChange}
                  onConverted={() => searchQuery.refetch()}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
