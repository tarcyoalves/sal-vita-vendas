// Radar de Cargas — contrato compartilhado entre servidor e cliente.
// Visão geral e decisões: PLANO-RADAR-CARGAS.md.

// Segmentos compradores de sal → CNAEs (formato da Receita: 7 dígitos, sem pontuação).
//
// A lista veio da proposta do Hermes (PROPOSTA-RADAR-LEADS-CARGAS-CRM.md) e AINDA NÃO
// foi validada contra quem de fato compra da Sal Vita. Atenção ao 4789-0/04: a descrição
// oficial é "animais vivos e artigos e alimentos para animais de ESTIMAÇÃO" — tende a
// trazer pet shop. Ajuste aqui quando o perfil real da carteira for levantado.
export const RADAR_SEGMENTS = [
  { key: 'racao_atacado', label: 'Atacado de rações', cnaes: ['4623109'] },
  { key: 'racao_varejo', label: 'Varejo de rações / pet', cnaes: ['4789004'] },
  { key: 'laticinio', label: 'Laticínios', cnaes: ['1052000'] },
  { key: 'frigorifico', label: 'Frigoríficos (abate de bovinos)', cnaes: ['1011201'] },
  { key: 'atacado_alimentos', label: 'Atacado de alimentos em geral', cnaes: ['4639701'] },
] as const;

export type RadarSegmentKey = (typeof RADAR_SEGMENTS)[number]['key'];

export const RADAR_SEGMENT_KEYS = RADAR_SEGMENTS.map((s) => s.key) as [RadarSegmentKey, ...RadarSegmentKey[]];

// Todos os CNAEs-alvo — o importador só grava estabelecimentos que tenham ao menos um
// destes como CNAE principal ou secundário.
export const RADAR_ALL_CNAES: string[] = RADAR_SEGMENTS.flatMap((s) => [...s.cnaes]);

export function segmentsForCnaes(cnaes: readonly string[]): RadarSegmentKey[] {
  return RADAR_SEGMENTS.filter((s) => s.cnaes.some((c) => cnaes.includes(c))).map((s) => s.key);
}

// Carreta padrão: 30–32 t ≈ 1.200–1.280 sacos de 25 kg (dado da proposta, informado pelo dono).
export const SACO_KG = 25;

export const RADAR_RADIUS_OPTIONS_KM = [25, 50, 80, 120, 200] as const;
export const RADAR_MAX_RADIUS_KM = 300;
export const RADAR_MAX_RESULTS = 200;

export interface RadarMunicipality {
  ibge: number;
  nome: string;
  uf: string;
}

export interface RadarPhone {
  digits: string;          // DDD + número, só dígitos (ex.: "4935441234")
  formatted: string;       // "(49) 3544-1234"
  // Heurística honesta: celular brasileiro tem 9 dígitos começando com 9. NÃO significa
  // que o número tem WhatsApp — isso não dá para verificar legitimamente.
  likelyMobile: boolean;
}

export type RadarCrmStatus =
  | { kind: 'novo' }
  | { kind: 'no_crm'; taskId: number; assignedTo: string | null; converted: boolean }
  // Já foi lead e alguém excluiu (task_deletion_logs, por CNPJ ou telefone) — o motivo
  // pode ser "pediu para não ser contatado". A tela mostra o motivo e não esconde.
  | { kind: 'excluido_antes'; reason: string; deletedByName: string };

export interface RadarLead {
  cnpj: string;                  // 14 dígitos
  razaoSocial: string;
  nomeFantasia: string | null;
  cnaePrincipal: string;
  segments: RadarSegmentKey[];
  matchedByPrincipal: boolean;   // false = só casou por CNAE secundário
  municipio: RadarMunicipality;
  distanceKm: number;            // linha reta entre centros dos municípios, arredondada
  endereco: string | null;
  cep: string | null;
  phones: RadarPhone[];
  email: string | null;
  emailSuppressed: boolean;      // e-mail está em email_suppressions (descadastro/bounce)
  porte: string | null;          // código da Receita: 01 ME, 03 EPP, 05 demais, 00 não informado
  dataInicio: string | null;     // YYYY-MM-DD
  crm: RadarCrmStatus;
  // Dados raspados da web pelo enriquecedor da VPS (null = ainda não pedido).
  enrichment: RadarEnrichment | null;
  // Contato feito pela lista e descarte — compartilhado entre todos os atendentes.
  activity: RadarLeadActivity;
}

export interface RadarSearchResult {
  origin: RadarMunicipality & { lat: number; lon: number };
  municipalitiesInRadius: number;
  leads: RadarLead[];
  truncated: boolean;            // true = havia mais que o limite
  // Mês da base da Receita importada (ex.: "2026-09"); null = base vazia (importador nunca rodou)
  datasetRelease: string | null;
  // O robô da VPS deu sinal de vida nos últimos 3 minutos. false = os cards não vão se completar.
  enricherOnline: boolean;
}

export interface RadarCnpjCheck {
  cnpj: string;
  ativa: boolean;
  situacao: string;              // descrição da Receita, ex.: "ATIVA", "BAIXADA"
  razaoSocial: string;
  checkedAt: string;             // ISO
  source: 'brasilapi';
}

export function formatCnpj(cnpj: string): string {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

// Link para o ATENDENTE abrir e enviar à mão. Nunca usar para disparo automático.
export function waMeLink(phoneDigits: string, text: string): string {
  const d = phoneDigits.replace(/\D/g, '');
  const full = d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

// ── Enriquecimento por scraping (Fase 2) ─────────────────────────────────────
// Um robô Python (scripts/radar/enricher/, roda na VPS do dono) consome a fila
// `radar_enrichment` e varre, para cada empresa: buscador → site da empresa →
// Google Maps → Instagram/Facebook públicos. Nunca resolve captcha nem faz login.
// Cada dado guarda a fonte e a URL de onde veio.

export const RADAR_ENRICH_SOURCES = ['busca', 'site', 'maps', 'social'] as const;
export type RadarEnrichSource = (typeof RADAR_ENRICH_SOURCES)[number];

export type RadarEnrichStatus = 'pendente' | 'processando' | 'pronto' | 'falhou';

export interface RadarEnrichFound {
  value: string;                 // telefone/WhatsApp em dígitos (DDD+número), e-mail minúsculo, ou URL
  source: RadarEnrichSource;
  url: string | null;            // página onde foi encontrado
}

export interface RadarEnrichSourceResult {
  source: RadarEnrichSource;
  ok: boolean;
  note: string | null;           // "bloqueado", "sem site", "perfil exige login"...
}

export interface RadarEnrichmentData {
  website: string | null;
  maps: {
    url: string;
    nome: string | null;
    categoria: string | null;    // ex.: "Loja de produtos agropecuários" — ajuda a separar de pet shop
    nota: number | null;
    avaliacoes: number | null;
    situacao: string | null;     // ex.: "Aberto", "Fechado permanentemente"
    endereco: string | null;
  } | null;
  whatsapps: RadarEnrichFound[]; // só números vindos de link wa.me / api.whatsapp.com — esses SÃO WhatsApp
  telefones: RadarEnrichFound[];
  emails: RadarEnrichFound[];
  instagram: string | null;
  facebook: string | null;
  fontes: RadarEnrichSourceResult[];
}

export interface RadarEnrichment {
  status: RadarEnrichStatus;
  updatedAt: string | null;      // ISO
  data: RadarEnrichmentData | null;
}

// Validade do resultado: depois disso uma nova busca pede de novo.
export const RADAR_ENRICH_TTL_DAYS = 30;
// Quantas empresas de cada busca entram na fila (as mais próximas).
export const RADAR_ENRICH_PER_SEARCH = 60;
export const RADAR_ENRICHER_HEARTBEAT_KEY = 'radar_enricher_heartbeat';
export const RADAR_ENRICHER_ONLINE_MS = 3 * 60 * 1000;

// ── Contato antes da tarefa ──────────────────────────────────────────────────
// Fluxo pedido pelo dono (26/09): a busca é só uma LISTA. O atendente contata
// direto do card (WhatsApp/telefone, à mão) e depois decide: transformar em
// tarefa ou descartar. Nada vira tarefa sem esse clique.

export const RADAR_CONTACT_CHANNELS = ['whatsapp', 'telefone'] as const;
export type RadarContactChannel = (typeof RADAR_CONTACT_CHANNELS)[number];

export const RADAR_DISCARD_REASONS = [
  { key: 'nao_compra', label: 'Não compra sal / fora do perfil' },
  { key: 'sem_interesse', label: 'Sem interesse agora' },
  { key: 'nao_contatar', label: 'Pediu para não ser contatado' },
  { key: 'contato_invalido', label: 'Telefone/contato não existe' },
  { key: 'fechada', label: 'Empresa fechada' },
  { key: 'outro', label: 'Outro motivo' },
] as const;
export type RadarDiscardReason = (typeof RADAR_DISCARD_REASONS)[number]['key'];
export const RADAR_DISCARD_REASON_KEYS = RADAR_DISCARD_REASONS.map((r) => r.key) as [RadarDiscardReason, ...RadarDiscardReason[]];

export function discardReasonLabel(key: string): string {
  return RADAR_DISCARD_REASONS.find((r) => r.key === key)?.label ?? key;
}

export interface RadarLeadActivity {
  contactedAt: string | null;           // ISO do último contato registrado
  contactedByName: string | null;
  contactChannel: RadarContactChannel | null;
  contactCount: number;
  discarded: {
    at: string;                         // ISO
    byName: string;
    reason: RadarDiscardReason;
    note: string | null;
  } | null;
}

export const EMPTY_RADAR_ACTIVITY: RadarLeadActivity = {
  contactedAt: null, contactedByName: null, contactChannel: null, contactCount: 0, discarded: null,
};
