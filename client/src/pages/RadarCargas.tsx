import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TRPCClientError } from '@trpc/client';
import { ChevronDown, ChevronRight, Loader2, Search, Truck, X } from 'lucide-react';
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
import { MessageTemplateDialog } from '../components/radar/MessageTemplateDialog';
import { BaseStatusCard } from '../components/radar/BaseStatusCard';
import { CarteiraList } from '../components/radar/CarteiraList';
import { enrichmentNeedsPolling } from '../components/radar/EnrichmentSection';
import {
  LEAD_SORT_OPTIONS,
  RECENT_CITIES_KEY,
  STATE_KEY,
  addRecentCity,
  coverageNotice,
  emptyAdvice,
  filterBySegments,
  filterByText,
  groupByMunicipio,
  groupTitle,
  mergeLeadPages,
  parseRecentCities,
  restoreState,
  safeGet,
  safeSet,
  segmentsPresent,
  serializeState,
  sortLeads,
  sortByContactedDesc,
  type LeadFilterKey,
  type LeadSort,
} from '../components/radar/buscadorLogic';
import {
  EMPTY_RADAR_ACTIVITY,
  RADAR_RADIUS_OPTIONS_KM,
  RADAR_SEGMENT_KEYS,
  RADAR_SEGMENTS,
  type RadarEnrichment,
  type RadarLead,
  type RadarLeadActivity,
  type RadarMunicipality,
  type RadarSegmentKey,
} from '../../../shared/radar';

// Pet shop e supermercado ficam desmarcados: são muitos e escondem os clientes de carga maior.
const DEFAULT_SEGMENTS = RADAR_SEGMENT_KEYS.filter((k) => k !== 'racao_varejo' && k !== 'supermercado');

// Teto de tempo de polling por busca — depois disso paramos de perguntar ao
// servidor mesmo que ainda reste algo pendente (robô pode ter travado).
// O robô faz ~170 empresas/hora, uma por vez: a fila de uma busca pode levar vários minutos.
// Pergunta a cada 4 s nos primeiros 5 min e a cada 15 s depois, até 30 min.
const ENRICH_POLL_CAP_MS = 30 * 60 * 1000;
const ENRICH_POLL_INTERVAL_MS = 4000;
const ENRICH_POLL_SLOW_AFTER_MS = 5 * 60 * 1000;
const ENRICH_POLL_SLOW_INTERVAL_MS = 15000;

// Filtros pedidos pelo dono: a busca é uma lista de "para contatar", não uma
// fila que empurra tarefa. "Para contatar" e "Todos" continuam mostrando o
// aviso amber de "excluído antes" (não é um filtro à parte).
type LeadFilter = LeadFilterKey;

export default function RadarCargas() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Duas formas de buscar: quem o CRM já conhece (funciona sem a base da Receita) e empresas novas.
  // Estado guardado na sessão: ao voltar para a tela (ex.: depois de "Ir para a
  // tarefa") o formulário volta como estava e a última busca é refeita.
  const [saved] = useState(() => restoreState(safeGet('session', STATE_KEY), DEFAULT_SEGMENTS));
  const [mode, setMode] = useState<'carteira' | 'novas'>(saved.mode);

  // ── Formulário de busca ──
  const [city, setCityState] = useState<RadarMunicipality | null>(saved.city);
  const [radiusKm, setRadiusKm] = useState(saved.radiusKm);
  const [bagsInput, setBagsInput] = useState(saved.bagsInput);
  const [segments, setSegments] = useState<RadarSegmentKey[]>(saved.segments);
  const [includeSecondary, setIncludeSecondary] = useState(saved.includeSecondary);
  const [minAnosAbertura, setMinAnosAbertura] = useState(saved.minAnosAbertura);
  const [detailsOpen, setDetailsOpen] = useState(!!(saved.loadDate || saved.freightNote));
  const [loadDate, setLoadDate] = useState(saved.loadDate);
  const [freightNote, setFreightNote] = useState(saved.freightNote);
  const [leadFilter, setLeadFilter] = useState<LeadFilter>(saved.leadFilter);
  // Ferramentas dos resultados (só sobre o que já foi carregado).
  const [textFilter, setTextFilter] = useState(saved.textFilter);
  const [segmentFilter, setSegmentFilter] = useState<RadarSegmentKey[]>(saved.segmentFilter);
  const [sort, setSort] = useState<LeadSort>(saved.sort);
  const [lastSearch, setLastSearch] = useState<'carteira' | 'novas' | null>(saved.lastSearch);

  // Cidades recentes (preferência de interface, fica no aparelho).
  const [recentCities, setRecentCities] = useState<RadarMunicipality[]>(() =>
    parseRecentCities(safeGet('local', RECENT_CITIES_KEY)),
  );
  // Troca a chave do autocomplete para ele reler o valor ao clicar num chip.
  const [cityBoxKey, setCityBoxKey] = useState(0);
  const setCity = (m: RadarMunicipality | null) => {
    setCityState(m);
    if (m) {
      setRecentCities((prev) => {
        const next = addRecentCity(prev, m);
        safeSet('local', RECENT_CITIES_KEY, JSON.stringify(next));
        return next;
      });
    }
  };
  const pickRecentCity = (m: RadarMunicipality) => {
    setCity(m);
    setCityBoxKey((k) => k + 1);
  };

  const bags = Number(bagsInput);
  const bagsValid = Number.isInteger(bags) && bags >= 1 && bags <= 2000;
  const canSearch = !!city && segments.length > 0 && bagsValid;

  const searchInput = useMemo(
    () => ({
      originIbge: city?.ibge ?? 0,
      radiusKm,
      segments,
      includeSecondary,
      minAnosAbertura,
    }),
    [city, radiusKm, segments, includeSecondary, minAnosAbertura],
  );

  const searchQuery = trpc.prospectingRadar.search.useQuery(searchInput, {
    enabled: false,
    retry: false,
  });

  // "Mostrar mais empresas": páginas seguintes acrescentadas à primeira.
  const utils = trpc.useUtils();
  const [extraPages, setExtraPages] = useState<Array<{ leads: RadarLead[]; hasMore: boolean }>>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  // Mudou o formulário: as páginas acumuladas não valem mais.
  useEffect(() => {
    setExtraPages([]);
    setLoadMoreError(null);
  }, [searchInput]);

  const carteiraQuery = trpc.prospectingRadar.carteira.useQuery(
    { originIbge: city?.ibge ?? 0, radiusKm },
    { enabled: false, retry: false },
  );
  const canSearchCarteira = !!city && bagsValid;

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
    if (mode === 'carteira') {
      if (canSearchCarteira) carteiraQuery.refetch();
      return;
    }
    if (!canSearch) return;
    setEnrichmentByCnpj({});
    setActivityByCnpj({});
    setEnrichUnavailable(false);
    setPollTimedOut(false);
    setPollDeadline(Date.now() + ENRICH_POLL_CAP_MS);
    setExtraPages([]);
    setLoadMoreError(null);
    searchQuery.refetch();
  };

  // Refaz sozinho a última busca que tinha resultado ao voltar para a tela.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (!saved.lastSearch || !saved.city) return;
    if (saved.lastSearch !== saved.mode) return;
    handleSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const notImplemented =
    searchQuery.error instanceof TRPCClientError && searchQuery.error.data?.code === 'NOT_IMPLEMENTED';

  const data = searchQuery.data;
  const leads = useMemo(
    () => mergeLeadPages(data?.leads ?? [], ...extraPages.map((p) => p.leads)),
    [data, extraPages],
  );
  const hasMore = extraPages.length > 0 ? extraPages[extraPages.length - 1].hasMore : !!data?.hasMore;

  const handleLoadMore = async () => {
    if (!data || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = (data.pagina ?? 0) + extraPages.length + 1;
      const res = await utils.prospectingRadar.search.fetch({ ...searchInput, pagina: next });
      setExtraPages((prev) => [...prev, { leads: res.leads, hasMore: !!res.hasMore }]);
      // Reabre a janela de polling: as novas empresas podem ter entrado na fila.
      setPollTimedOut(false);
      setPollDeadline(Date.now() + ENRICH_POLL_CAP_MS);
    } catch (e) {
      setLoadMoreError(e instanceof Error ? e.message : 'Não foi possível carregar mais empresas.');
    } finally {
      setLoadingMore(false);
    }
  };
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
  // O servidor aceita até 200 CNPJs por consulta: perguntamos só pelos que estão na fila (as mais próximas).
  const pollCnpjs = trackedCnpjs.slice(0, 200);
  const enrichPending = trackedCnpjs.some((c) => enrichmentNeedsPolling(effectiveEnrichment(c)));

  const enrichmentStatusQuery = trpc.prospectingRadar.enrichmentStatus.useQuery(
    { cnpjs: pollCnpjs },
    {
      enabled: pollCnpjs.length > 0 && enrichPending && enricherOnline && !enrichUnavailable && !pollTimedOut,
      retry: false,
      // React Query já não refaz em background quando a aba está oculta
      // (refetchIntervalInBackground é false por padrão) — é o que dá a
      // pausa pedida quando o atendente troca de aba.
      refetchInterval: (query) => {
        if (query.state.error) return false;
        if (pollDeadline !== null && Date.now() > pollDeadline) return false;
        const res = query.state.data;
        if (res && !res.enricherOnline) return false;
        const stillPending = pollCnpjs.some((c) => enrichmentNeedsPolling(res?.items[c] ?? effectiveEnrichment(c)));
        if (!stillPending) return false;
        const elapsed = pollDeadline !== null ? Date.now() - (pollDeadline - ENRICH_POLL_CAP_MS) : 0;
        return elapsed > ENRICH_POLL_SLOW_AFTER_MS ? ENRICH_POLL_SLOW_INTERVAL_MS : ENRICH_POLL_INTERVAL_MS;
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
  const leadActivity = useMemo(() => new Map(leads.map((l) => [l.cnpj, l.activity] as const)), [leads]);
  const effectiveActivity = (cnpj: string): RadarLeadActivity =>
    activityByCnpj[cnpj] ?? leadActivity.get(cnpj) ?? EMPTY_RADAR_ACTIVITY;

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

  // Texto e segmento reduzem o conjunto; os contadores dos filtros (Para
  // contatar, Contatados...) contam esse conjunto, então batem com a lista.
  const segmentOptions = useMemo(() => segmentsPresent(leads), [leads]);
  const scopedLeads = useMemo(
    () => filterBySegments(filterByText(leads, textFilter), segmentFilter),
    [leads, textFilter, segmentFilter],
  );

  const counts = useMemo(() => {
    const c = { all: scopedLeads.length, para_contatar: 0, contatados: 0, no_crm: 0, descartados: 0 };
    for (const l of scopedLeads) c[bucketFor(l)]++;
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedLeads, activityByCnpj]);

  const filteredLeads = useMemo(() => {
    const byBucket = leadFilter === 'all' ? scopedLeads : scopedLeads.filter((l) => bucketFor(l) === leadFilter);
    // Contatados seguem a ordem cronológica dos contatos (mais recente no topo),
    // para o acompanhamento não depender da distância nem do acaso.
    if (leadFilter === 'contatados') return sortByContactedDesc(byBucket, (c) => effectiveActivity(c).contactedAt);
    return sortLeads(byBucket, sort);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedLeads, leadFilter, sort, activityByCnpj]);

  // Por distância os cartões ficam agrupados por município; nas outras
  // ordenações a lista é corrida (agrupar quebraria a ordem escolhida).
  const groups = useMemo(
    () => (sort === 'distancia' && leadFilter !== 'contatados' ? groupByMunicipio(filteredLeads) : null),
    [filteredLeads, sort, leadFilter],
  );

  const toolsActive = textFilter.trim() !== '' || segmentFilter.length > 0;
  const clearTools = () => {
    setTextFilter('');
    setSegmentFilter([]);
  };

  // UFs que a base cobre (para explicar o aviso de cobertura).
  const baseStatus = trpc.prospectingRadar.baseStatus.useQuery(undefined, { staleTime: 60_000 });
  const ufsCobertas = useMemo(() => (baseStatus.data?.porUf ?? []).map((u) => u.uf), [baseStatus.data]);
  const coverage = coverageNotice(data?.ufsSemBase, ufsCobertas);

  // ── Guardar a busca (sessionStorage) ──
  // Lembra que a última busca teve resultado, para refazê-la ao voltar.
  useEffect(() => {
    if (mode === 'novas' && data && data.leads.length > 0) setLastSearch('novas');
  }, [mode, data]);
  useEffect(() => {
    if (mode === 'carteira' && carteiraQuery.data && carteiraQuery.data.itens.length > 0) setLastSearch('carteira');
  }, [mode, carteiraQuery.data]);

  const rootRef = useRef<HTMLDivElement>(null);
  const getScroller = useCallback((): HTMLElement | null => {
    let el = rootRef.current?.parentElement ?? null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return document.scrollingElement as HTMLElement | null;
  }, []);

  const scrollTopRef = useRef(saved.scrollTop);
  const persist = useCallback(() => {
    safeSet(
      'session',
      STATE_KEY,
      serializeState({
        mode, city, radiusKm, bagsInput, segments, includeSecondary, minAnosAbertura,
        loadDate, freightNote, leadFilter, textFilter, segmentFilter, sort, lastSearch,
        scrollTop: scrollTopRef.current,
      }),
    );
  }, [mode, city, radiusKm, bagsInput, segments, includeSecondary, minAnosAbertura, loadDate, freightNote, leadFilter, textFilter, segmentFilter, sort, lastSearch]);
  useEffect(() => { persist(); }, [persist]);

  // Posição de rolagem: guarda ao rolar (e ao sair da tela) e restaura quando os resultados voltam.
  useEffect(() => {
    const el = getScroller();
    if (!el) return;
    const onScroll = () => { scrollTopRef.current = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      persist();
    };
  }, [getScroller, persist]);

  const scrollRestored = useRef(false);
  const resultsReady = mode === 'novas' ? !!data : !!carteiraQuery.data;
  useEffect(() => {
    if (scrollRestored.current || !resultsReady) return;
    scrollRestored.current = true;
    if (saved.scrollTop <= 0 || saved.lastSearch !== saved.mode) return;
    // Espera os cartões entrarem no DOM antes de rolar.
    const t = setTimeout(() => {
      const el = getScroller();
      if (el) el.scrollTop = saved.scrollTop;
    }, 150);
    return () => clearTimeout(t);
  }, [resultsReady, saved, getScroller]);

  const renderCard = (lead: RadarLead) => (
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
  );

  return (
    <div ref={rootRef} className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2 text-slate-500 text-sm">
        <Truck size={16} />
        <p>
          Encontre empresas dos segmentos que compram sal perto da cidade da carga, para
          completar o espaço que sobrou na carreta.
        </p>
      </div>

      <BaseStatusCard isAdmin={isAdmin} />

      {/* Duas formas de buscar */}
      <div className="grid grid-cols-2 gap-2">
        {([
          ['carteira', 'Minha carteira', 'Clientes e leads que já temos perto da carga'],
          ['novas', 'Empresas novas', 'Base da Receita por segmento (CNAE)'],
        ] as const).map(([key, titulo, sub]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`rounded-xl border px-3 py-2.5 text-left transition ${
              mode === key ? 'border-blue-900 bg-blue-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <p className="text-sm font-semibold">{titulo}</p>
            <p className={`text-[11px] ${mode === key ? 'text-blue-100' : 'text-slate-500'}`}>{sub}</p>
          </button>
        ))}
      </div>

      {/* ── Busca ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{mode === 'carteira' ? 'Buscar na minha carteira' : 'Buscar empresas'}</CardTitle>
            <MessageTemplateDialog />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-500 mb-1.5">Cidade da carga</Label>
              <CityAutocomplete key={cityBoxKey} value={city} onChange={setCity} />
              {recentCities.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Recentes:</span>
                  {recentCities.map((m) => (
                    <button
                      key={m.ibge}
                      type="button"
                      onClick={() => pickRecentCity(m)}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition ${
                        city?.ibge === m.ibge
                          ? 'bg-blue-900 text-white border-blue-900'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {m.nome} - {m.uf}
                    </button>
                  ))}
                </div>
              )}
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

          {mode === 'novas' && (<>
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

          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-slate-700">Tempo de abertura</p>
              <p className="text-[11px] text-slate-400">Esconde as empresas abertas há menos tempo que isso</p>
            </div>
            <Select value={String(minAnosAbertura)} onValueChange={(v) => setMinAnosAbertura(Number(v))}>
              <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Qualquer</SelectItem>
                <SelectItem value="1">Mais de 1 ano</SelectItem>
                <SelectItem value="2">Mais de 2 anos</SelectItem>
                <SelectItem value="3">Mais de 3 anos</SelectItem>
                <SelectItem value="5">Mais de 5 anos</SelectItem>
                <SelectItem value="10">Mais de 10 anos</SelectItem>
              </SelectContent>
            </Select>
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

          </>)}

          <Button
            type="button"
            className="w-full"
            disabled={(mode === 'carteira' ? !canSearchCarteira || carteiraQuery.isFetching : !canSearch || searchQuery.isFetching)}
            onClick={handleSearch}
          >
            <Search size={15} />
            {(mode === 'carteira' ? carteiraQuery.isFetching : searchQuery.isFetching) ? 'Buscando...' : 'Buscar'}
          </Button>
          {/* Por que o botão está cinza */}
          {(mode === 'carteira' ? !canSearchCarteira : !canSearch) && (
            <p className="text-[11px] text-slate-500 -mt-2">
              {!city
                ? 'Escolha a cidade da carga na lista que aparece ao digitar (mínimo 2 letras).'
                : !bagsValid
                  ? 'Informe o saldo de sacos (1 a 2000).'
                  : 'Marque ao menos um segmento.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Resultados: minha carteira ── */}
      {mode === 'carteira' && carteiraQuery.isFetching && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      )}
      {mode === 'carteira' && !carteiraQuery.isFetching && carteiraQuery.error && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Não foi possível buscar</EmptyTitle>
            <EmptyDescription>{carteiraQuery.error.message}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {mode === 'carteira' && !carteiraQuery.isFetching && carteiraQuery.data && (
        carteiraQuery.data.itens.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Truck /></EmptyMedia>
              <EmptyTitle>Ninguém da carteira neste raio</EmptyTitle>
              <EmptyDescription>
                O CRM não tem clientes nem leads em {carteiraQuery.data.municipalitiesInRadius} município(s) ao redor de {originLabel}.
                Aumente o raio ou use "Empresas novas".
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <CarteiraList result={carteiraQuery.data} originLabel={originLabel} bags={bags} />
        )
      )}

      {/* ── Resultados: empresas novas (Receita) ── */}
      {mode === 'novas' && searchQuery.isFetching && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      )}

      {mode === 'novas' && !searchQuery.isFetching && notImplemented && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Buscador em implantação</EmptyTitle>
            <EmptyDescription>
              Essa funcionalidade ainda está sendo construída. Volte em breve.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {mode === 'novas' && !searchQuery.isFetching && !notImplemented && searchQuery.error && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Não foi possível buscar</EmptyTitle>
            <EmptyDescription>{searchQuery.error.message}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {mode === 'novas' && !searchQuery.isFetching && !notImplemented && data && data.datasetRelease === null && (
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

      {mode === 'novas' && !searchQuery.isFetching && !notImplemented && data && data.datasetRelease !== null && (
        <div className="space-y-3">
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              {leads.length} {leads.length === 1 ? 'empresa' : 'empresas'} em {data.municipalitiesInRadius}{' '}
              {data.municipalitiesInRadius === 1 ? 'município' : 'municípios'} · base Receita {data.datasetRelease}
            </p>
            {!(user?.role === 'admin' || user?.role === 'manager') && (
              <p className="text-[11px] text-slate-500">
                Clientes que já compraram não aparecem aqui. Se outro atendente já acompanha uma empresa, o cartão avisa.
              </p>
            )}
            {data.truncated && data.hasMore === undefined && (
              <p className="text-xs text-amber-600">Mostrando apenas as 200 empresas mais próximas.</p>
            )}
            {coverage && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                {coverage}
              </p>
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
            {/* Passou o tempo de acompanhar e ainda há cartões na fila: o robô continua trabalhando. */}
            {pollTimedOut && enrichPending && enricherOnline && !enrichUnavailable && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-600">
                  O robô ainda está buscando dados na web ({enrichmentDoneCount} de {trackedCnpjs.length} prontos).
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setPollTimedOut(false);
                    setPollDeadline(Date.now() + ENRICH_POLL_CAP_MS);
                    enrichmentStatusQuery.refetch();
                  }}
                >
                  Atualizar dados da web
                </Button>
              </div>
            )}
            {showEnricherOffline && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                Robô de busca na web desligado — mostrando só os dados da Receita.
                {isAdmin && ' Veja scripts/radar/enricher/README.md.'}
              </p>
            )}

            {/* Ferramentas sobre o que já foi carregado */}
            {leads.length > 0 && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={textFilter}
                      onChange={(e) => setTextFilter(e.target.value)}
                      placeholder="Filtrar por nome, CNPJ ou cidade"
                      aria-label="Filtrar empresas carregadas"
                      className="pl-8 pr-8 h-9 text-sm"
                    />
                    {textFilter && (
                      <button
                        type="button"
                        onClick={() => setTextFilter('')}
                        aria-label="Limpar filtro de texto"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <Select value={sort} onValueChange={(v) => setSort(v as LeadSort)}>
                    <SelectTrigger className="w-full sm:w-52 h-9 text-xs" aria-label="Ordenar por">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEAD_SORT_OPTIONS.map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          Ordenar: {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {segmentOptions.length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {segmentOptions.map(({ key, count }) => {
                      const on = segmentFilter.includes(key);
                      const label = RADAR_SEGMENTS.find((x) => x.key === key)?.label ?? key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            setSegmentFilter((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
                          }
                          className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition ${
                            on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {label} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}
                {toolsActive && (
                  <button type="button" onClick={clearTools} className="text-[11px] font-semibold text-blue-900 hover:underline">
                    Limpar filtros de texto e segmento
                  </button>
                )}
              </div>
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
            {leadFilter === 'contatados' && (
              <p className="text-[11px] text-slate-500">Do contato mais recente para o mais antigo.</p>
            )}
          </div>

          {leads.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><Truck /></EmptyMedia>
                <EmptyTitle>Nenhuma empresa encontrada</EmptyTitle>
                <EmptyDescription>
                  {(() => {
                    const advice = emptyAdvice({ minAnosAbertura, segmentsCount: segments.length });
                    if (advice === 'abertura')
                      return 'O filtro "Tempo de abertura" pode estar escondendo empresas. Troque para "Qualquer" e busque de novo.';
                    if (advice === 'segmentos')
                      return 'Só alguns segmentos estão marcados. Marque mais segmentos (ou o CNAE secundário) e busque de novo.';
                    return 'Aumente o raio da busca ou escolha outra cidade.';
                  })()}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : filteredLeads.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nenhuma empresa neste filtro</EmptyTitle>
                <EmptyDescription>
                  {toolsActive
                    ? 'Nenhuma empresa carregada combina com o texto ou segmento escolhido. Limpe os filtros acima.'
                    : 'Tente outro filtro (por exemplo "Todos") ou aumente o raio da busca.'}
                  {hasMore && ' Também há mais empresas para carregar abaixo.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : groups ? (
            <div className="space-y-4">
              {groups.map((g) => (
                <Fragment key={g.ibge}>
                  <section>
                    <h3 className="sticky top-0 z-10 -mx-1 px-2 py-1.5 mb-2 bg-slate-50/95 backdrop-blur text-xs font-semibold text-slate-700 border-b border-slate-200">
                      {groupTitle(g)}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{g.leads.map(renderCard)}</div>
                  </section>
                </Fragment>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{filteredLeads.map(renderCard)}</div>
          )}

          {hasMore && (
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={loadingMore} onClick={handleLoadMore}>
                {loadingMore ? <Loader2 size={15} className="animate-spin" /> : null}
                {loadingMore ? 'Carregando...' : 'Mostrar mais empresas'}
              </Button>
              {loadMoreError && <p className="text-xs text-red-600">{loadMoreError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
