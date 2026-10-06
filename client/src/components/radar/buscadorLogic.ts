// Lógica pura do Buscador de Clientes (sem React): agrupar, filtrar, ordenar,
// acumular páginas e guardar/restaurar o estado da tela. Fica separada para
// ser testada em tests/buscador-ui.test.ts.
import {
  RADAR_RADIUS_OPTIONS_KM,
  RADAR_SEGMENT_KEYS,
  type RadarLead,
  type RadarMunicipality,
  type RadarSegmentKey,
} from '../../../../shared/radar';

export type LeadSort = 'distancia' | 'porte' | 'antigas' | 'nome';
export const LEAD_SORT_OPTIONS: Array<[LeadSort, string]> = [
  ['distancia', 'Distância'],
  ['porte', 'Porte'],
  ['antigas', 'Mais antigas'],
  ['nome', 'Nome'],
];

export type LeadFilterKey = 'para_contatar' | 'contatados' | 'no_crm' | 'descartados' | 'all';
const LEAD_FILTER_KEYS: LeadFilterKey[] = ['para_contatar', 'contatados', 'no_crm', 'descartados', 'all'];

// ── Texto ───────────────────────────────────────────────────────────────────
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Filtra por nome fantasia, razão social, CNPJ (com ou sem pontuação) ou cidade. */
export function filterByText(leads: RadarLead[], query: string): RadarLead[] {
  const q = normalizeText(query);
  if (!q) return leads;
  const qDigits = q.replace(/\D/g, '');
  return leads.filter((l) => {
    const hay = normalizeText(`${l.nomeFantasia ?? ''} ${l.razaoSocial} ${l.municipio.nome}`);
    if (hay.includes(q)) return true;
    return qDigits.length >= 3 && l.cnpj.includes(qDigits);
  });
}

// ── Segmentos ───────────────────────────────────────────────────────────────
/** Segmentos presentes nos leads, na ordem canônica, com a contagem. */
export function segmentsPresent(leads: RadarLead[]): Array<{ key: RadarSegmentKey; count: number }> {
  const counts = new Map<RadarSegmentKey, number>();
  for (const l of leads) for (const s of l.segments) counts.set(s, (counts.get(s) ?? 0) + 1);
  return RADAR_SEGMENT_KEYS.filter((k) => counts.has(k)).map((k) => ({ key: k, count: counts.get(k) ?? 0 }));
}

/** Lista vazia = sem filtro. */
export function filterBySegments(leads: RadarLead[], selected: RadarSegmentKey[]): RadarLead[] {
  if (selected.length === 0) return leads;
  return leads.filter((l) => l.segments.some((s) => selected.includes(s)));
}

// ── Ordenação ───────────────────────────────────────────────────────────────
/** Porte da Receita: 05 demais (maior) > 03 EPP > 01 ME > o resto. */
export function porteRank(porte: string | null): number {
  if (porte === '05') return 3;
  if (porte === '03') return 2;
  if (porte === '01') return 1;
  return 0;
}

function leadName(l: RadarLead): string {
  return normalizeText(l.nomeFantasia || l.razaoSocial);
}

/** Ordenação estável (empata pela ordem original = distância do servidor). */
export function sortLeads(leads: RadarLead[], sort: LeadSort): RadarLead[] {
  if (sort === 'distancia') return leads;
  const indexed = leads.map((l, i) => ({ l, i }));
  indexed.sort((a, b) => {
    let d = 0;
    if (sort === 'porte') d = porteRank(b.l.porte) - porteRank(a.l.porte);
    else if (sort === 'antigas') {
      // Sem data vai para o fim.
      const da = a.l.dataInicio ?? '9999-99-99';
      const db = b.l.dataInicio ?? '9999-99-99';
      d = da < db ? -1 : da > db ? 1 : 0;
    } else d = leadName(a.l).localeCompare(leadName(b.l), 'pt-BR');
    return d !== 0 ? d : a.i - b.i;
  });
  return indexed.map((x) => x.l);
}

/** Contatados: o contato mais recente primeiro (quem acabou de ser contatado abre a lista). Empate mantém a ordem recebida. */
export function sortByContactedDesc(leads: RadarLead[], contactedAt: (cnpj: string) => string | null): RadarLead[] {
  const indexed = leads.map((l, i) => ({ l, i, t: Date.parse(contactedAt(l.cnpj) ?? '') }));
  indexed.sort((a, b) => {
    const ta = Number.isNaN(a.t) ? -Infinity : a.t;
    const tb = Number.isNaN(b.t) ? -Infinity : b.t;
    if (ta !== tb) return tb > ta ? 1 : -1;
    return a.i - b.i;
  });
  return indexed.map((x) => x.l);
}

// ── Agrupamento por município ───────────────────────────────────────────────
export interface MunicipioGroup {
  ibge: number;
  nome: string;
  uf: string;
  distanceKm: number;
  leads: RadarLead[];
}

/** Agrupa mantendo a ordem em que cada município apareceu (distância, vinda do servidor). */
export function groupByMunicipio(leads: RadarLead[]): MunicipioGroup[] {
  const groups = new Map<number, MunicipioGroup>();
  for (const l of leads) {
    let g = groups.get(l.municipio.ibge);
    if (!g) {
      g = { ibge: l.municipio.ibge, nome: l.municipio.nome, uf: l.municipio.uf, distanceKm: l.distanceKm, leads: [] };
      groups.set(l.municipio.ibge, g);
    }
    g.leads.push(l);
  }
  return [...groups.values()];
}

export function groupTitle(g: MunicipioGroup): string {
  return `${g.nome}/${g.uf} · ${g.distanceKm} km · ${g.leads.length} ${g.leads.length === 1 ? 'empresa' : 'empresas'}`;
}

// ── Páginas acumuladas ──────────────────────────────────────────────────────
/** Junta páginas na ordem, sem repetir CNPJ (vale a primeira ocorrência). */
export function mergeLeadPages(...pages: RadarLead[][]): RadarLead[] {
  const seen = new Set<string>();
  const out: RadarLead[] = [];
  for (const page of pages) {
    for (const l of page) {
      if (seen.has(l.cnpj)) continue;
      seen.add(l.cnpj);
      out.push(l);
    }
  }
  return out;
}

// ── Cobertura da base ───────────────────────────────────────────────────────
export function coverageNotice(ufsSemBase: string[] | undefined, ufsCobertas: string[]): string | null {
  if (!ufsSemBase || ufsSemBase.length === 0) return null;
  const base = `A base de empresas ainda não cobre: ${ufsSemBase.join(', ')}.`;
  return ufsCobertas.length > 0 ? `${base} Só aparecem empresas de ${ufsCobertas.join(', ')}.` : base;
}

// ── Estado vazio ────────────────────────────────────────────────────────────
export type EmptyAdvice = 'abertura' | 'segmentos' | 'raio';

/** Por que a busca voltou vazia: o que o atendente pode afrouxar primeiro. */
export function emptyAdvice(opts: { minAnosAbertura: number; segmentsCount: number }): EmptyAdvice {
  if (opts.minAnosAbertura > 0) return 'abertura';
  if (opts.segmentsCount < RADAR_SEGMENT_KEYS.length) return 'segmentos';
  return 'raio';
}

// ── Estado salvo (sessionStorage) e cidades recentes (localStorage) ─────────
export const STATE_KEY = 'radar-buscador-estado-v1';
export const RECENT_CITIES_KEY = 'radar-cidades-recentes-v1';
export const MAX_RECENT_CITIES = 5;

export interface SavedBuscadorState {
  mode: 'carteira' | 'novas';
  city: RadarMunicipality | null;
  radiusKm: number;
  bagsInput: string;
  segments: RadarSegmentKey[];
  includeSecondary: boolean;
  minAnosAbertura: number;
  loadDate: string;
  freightNote: string;
  leadFilter: LeadFilterKey;
  textFilter: string;
  segmentFilter: RadarSegmentKey[];
  sort: LeadSort;
  /** Última busca que teve resultado (refeita sozinha ao voltar para a tela). */
  lastSearch: 'carteira' | 'novas' | null;
  scrollTop: number;
}

export function defaultState(defaultSegments: RadarSegmentKey[]): SavedBuscadorState {
  return {
    mode: 'carteira',
    city: null,
    radiusKm: 50,
    bagsInput: '400',
    segments: defaultSegments,
    includeSecondary: false,
    minAnosAbertura: 2,
    loadDate: '',
    freightNote: '',
    leadFilter: 'para_contatar',
    textFilter: '',
    segmentFilter: [],
    sort: 'distancia',
    lastSearch: null,
    scrollTop: 0,
  };
}

export function serializeState(s: SavedBuscadorState): string {
  return JSON.stringify(s);
}

function isMunicipality(v: unknown): v is RadarMunicipality {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return typeof m.ibge === 'number' && Number.isFinite(m.ibge) && typeof m.nome === 'string' && typeof m.uf === 'string';
}

function segmentList(v: unknown): RadarSegmentKey[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((k): k is RadarSegmentKey => (RADAR_SEGMENT_KEYS as string[]).includes(k as string));
}

/** Lê o JSON salvo, campo a campo; qualquer coisa inválida cai no padrão. Nunca lança. */
export function restoreState(raw: string | null, defaultSegments: RadarSegmentKey[]): SavedBuscadorState {
  const base = defaultState(defaultSegments);
  if (!raw) return base;
  let o: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return base;
    o = parsed as Record<string, unknown>;
  } catch {
    return base;
  }
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const modeOk = (v: unknown): v is 'carteira' | 'novas' => v === 'carteira' || v === 'novas';
  const sortOk = (v: unknown): v is LeadSort => LEAD_SORT_OPTIONS.some(([k]) => k === v);
  const filterOk = (v: unknown): v is LeadFilterKey => LEAD_FILTER_KEYS.includes(v as LeadFilterKey);
  const radius =
    typeof o.radiusKm === 'number' && (RADAR_RADIUS_OPTIONS_KM as readonly number[]).includes(o.radiusKm)
      ? o.radiusKm
      : base.radiusKm;
  const anos =
    typeof o.minAnosAbertura === 'number' && Number.isInteger(o.minAnosAbertura) && o.minAnosAbertura >= 0 && o.minAnosAbertura <= 50
      ? o.minAnosAbertura
      : base.minAnosAbertura;
  return {
    mode: modeOk(o.mode) ? o.mode : base.mode,
    city: isMunicipality(o.city) ? { ibge: o.city.ibge, nome: o.city.nome, uf: o.city.uf } : null,
    radiusKm: radius,
    bagsInput: str(o.bagsInput, base.bagsInput).slice(0, 6),
    segments: segmentList(o.segments) ?? base.segments,
    includeSecondary: bool(o.includeSecondary, base.includeSecondary),
    minAnosAbertura: anos,
    loadDate: str(o.loadDate, '').slice(0, 10),
    freightNote: str(o.freightNote, '').slice(0, 200),
    leadFilter: filterOk(o.leadFilter) ? o.leadFilter : base.leadFilter,
    textFilter: str(o.textFilter, '').slice(0, 100),
    segmentFilter: segmentList(o.segmentFilter) ?? [],
    sort: sortOk(o.sort) ? o.sort : base.sort,
    lastSearch: o.lastSearch === 'carteira' || o.lastSearch === 'novas' ? o.lastSearch : null,
    scrollTop: typeof o.scrollTop === 'number' && o.scrollTop > 0 ? Math.floor(o.scrollTop) : 0,
  };
}

/** Põe a cidade no topo, sem repetir (por IBGE), no máximo 5. */
export function addRecentCity(list: RadarMunicipality[], city: RadarMunicipality): RadarMunicipality[] {
  return [city, ...list.filter((c) => c.ibge !== city.ibge)].slice(0, MAX_RECENT_CITIES);
}

export function parseRecentCities(raw: string | null): RadarMunicipality[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isMunicipality)
      .map((m) => ({ ibge: m.ibge, nome: m.nome, uf: m.uf }))
      .slice(0, MAX_RECENT_CITIES);
  } catch {
    return [];
  }
}

// ── Acesso ao storage (nunca lança) ─────────────────────────────────────────
export function safeGet(kind: 'session' | 'local', key: string): string | null {
  try {
    return (kind === 'session' ? window.sessionStorage : window.localStorage).getItem(key);
  } catch {
    return null;
  }
}

export function safeSet(kind: 'session' | 'local', key: string, value: string): void {
  try {
    (kind === 'session' ? window.sessionStorage : window.localStorage).setItem(key, value);
  } catch {
    /* storage cheio, bloqueado ou modo privado: a tela segue sem guardar */
  }
}
