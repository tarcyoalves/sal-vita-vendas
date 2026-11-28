// Leitor de candidatos Premium para a ponte de vendas (Sales AI). SOMENTE LEITURA: este
// módulo nunca grava. Junta `radar_establishments` com `radar_enrichment` e devolve cada
// empresa do perfil Premium já com e-mails deduplicados (com a fonte), site, telefones e
// "sinais" (evidências textuais de que a empresa combina com a caixa de 10 kg).
//
// `montarCandidatoPremium` é pura (testada em tests/radar-premium.test.ts); só
// `listarCandidatosPremium` toca o banco.
import { and, asc, gt, inArray, sql } from 'drizzle-orm';

import type { RadarEnrichSource, RadarEnrichmentData, RadarEnrichStatus } from '../../../shared/radar';
import {
  PREMIUM_ALL_CNAES,
  PREMIUM_SEGMENTS,
  premiumNameSignals,
  premiumSegmentsFor,
  premiumKeywordsIn,
  PREMIUM_KEYWORDS,
  type PremiumKeywordId,
  type PremiumSegmentKey,
} from '../../../shared/radarPremium';
import type { RadarEstablishment } from '../../db/schema';
import { toRadarEnrichmentData } from './enrichment';

export type PremiumEmailFonte = 'receita' | RadarEnrichSource;

export interface PremiumCandidatoEmail {
  email: string;
  fonte: PremiumEmailFonte;
  url: string | null;
}

export interface PremiumCandidato {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  uf: string;
  municipioIbge: number;
  endereco: string | null;
  cep: string | null;
  segmentos: PremiumSegmentKey[];
  emails: PremiumCandidatoEmail[];
  site: string | null;
  telefones: string[];
  sinais: string[];
  enriquecimentoStatus: RadarEnrichStatus | 'nao_pedido';
  atualizadoEm: string | null;
}

/** O que o leitor precisa da linha de `radar_enrichment` (subconjunto de RadarEnrichmentRow). */
export interface PremiumEnriquecimentoLinha {
  status: string;
  result: unknown;
  finishedAt: Date | null;
  claimedAt?: Date | null;
  requestedAt?: Date | null;
}

const STATUS_VALIDOS: ReadonlySet<string> = new Set(['pendente', 'processando', 'pronto', 'falhou']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEYWORD_IDS = Object.keys(PREMIUM_KEYWORDS) as PremiumKeywordId[];

function cleanEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? '').trim().toLowerCase();
  return EMAIL_RE.test(e) ? e : null;
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

/** Telefones do estabelecimento e do enriquecimento, só dígitos (10 ou 11), sem repetir. */
function coletarTelefones(estab: Pick<RadarEstablishment, 'telefone1' | 'telefone2'>, data: RadarEnrichmentData | null): string[] {
  const raw = [
    estab.telefone1,
    estab.telefone2,
    ...(data?.whatsapps ?? []).map((f) => f.value),
    ...(data?.telefones ?? []).map((f) => f.value),
  ];
  const out: string[] = [];
  for (const r of raw) {
    const d = r ? digitsOnly(r) : '';
    if ((d.length === 10 || d.length === 11) && !out.includes(d)) out.push(d);
  }
  return out;
}

/** E-mails: o da Receita primeiro, depois os do enriquecimento; deduplicados por endereço,
 * ficando com a primeira fonte vista. */
function coletarEmails(estab: Pick<RadarEstablishment, 'email'>, data: RadarEnrichmentData | null): PremiumCandidatoEmail[] {
  const out: PremiumCandidatoEmail[] = [];
  const seen = new Set<string>();
  const add = (email: string | null, fonte: PremiumEmailFonte, url: string | null) => {
    if (!email || seen.has(email)) return;
    seen.add(email);
    out.push({ email, fonte, url });
  };
  add(cleanEmail(estab.email), 'receita', null);
  for (const f of data?.emails ?? []) add(cleanEmail(f.value), f.source, f.url);
  return out;
}

/** Evidências textuais, cada uma dizendo de onde veio. Só usa o que existe: nome da empresa e
 * os campos do enriquecimento (nome/categoria do Google Maps e endereços do site/redes). O
 * robô NÃO guarda o texto das páginas, então não há "palavra vista no site" — só no endereço. */
function coletarSinais(
  segmentos: readonly PremiumSegmentKey[],
  estab: Pick<RadarEstablishment, 'nomeFantasia' | 'razaoSocial'>,
  data: RadarEnrichmentData | null,
): string[] {
  const sinais: string[] = [];
  for (const id of premiumNameSignals(segmentos, estab.nomeFantasia, estab.razaoSocial)) sinais.push(`nome:${id}`);
  if (data?.maps?.categoria) sinais.push(`maps_categoria:${data.maps.categoria}`);
  const keywordsDosSegmentos = [
    ...new Set(PREMIUM_SEGMENTS.filter((s) => (segmentos as readonly string[]).includes(s.key)).flatMap((s) => [...s.keywords] as PremiumKeywordId[])),
  ];
  const doEnriquecimento: Array<[string, string | null | undefined]> = [
    ['maps_nome', data?.maps?.nome],
    ['maps_categoria', data?.maps?.categoria],
    ['site', data?.website],
    ['instagram', data?.instagram],
    ['facebook', data?.facebook],
  ];
  for (const [origem, texto] of doEnriquecimento) {
    for (const id of premiumKeywordsIn(texto, keywordsDosSegmentos.length ? keywordsDosSegmentos : KEYWORD_IDS)) {
      sinais.push(`${origem}_palavra:${id}`);
    }
  }
  return [...new Set(sinais)];
}

export function montarCandidatoPremium(
  estab: Pick<
    RadarEstablishment,
    'cnpj' | 'razaoSocial' | 'nomeFantasia' | 'uf' | 'municipioIbge' | 'endereco' | 'cep' | 'cnaesAlvo' | 'telefone1' | 'telefone2' | 'email'
  >,
  enrichment: unknown,
): PremiumCandidato {
  const linha = isEnriquecimentoLinha(enrichment) ? enrichment : null;
  // Aceita a linha inteira de radar_enrichment OU só o `result` cru (JSON do robô).
  const data = toRadarEnrichmentData(linha ? linha.result : enrichment);
  const segmentos = premiumSegmentsFor(estab.cnaesAlvo, estab.nomeFantasia, estab.razaoSocial);
  const when = linha ? (linha.finishedAt ?? linha.claimedAt ?? linha.requestedAt ?? null) : null;
  return {
    cnpj: estab.cnpj,
    razaoSocial: estab.razaoSocial,
    nomeFantasia: estab.nomeFantasia,
    uf: estab.uf,
    municipioIbge: estab.municipioIbge,
    endereco: estab.endereco,
    cep: estab.cep,
    segmentos,
    emails: coletarEmails(estab, data),
    site: data?.website ?? null,
    telefones: coletarTelefones(estab, data),
    sinais: coletarSinais(segmentos, estab, data),
    enriquecimentoStatus: linha ? (STATUS_VALIDOS.has(linha.status) ? (linha.status as RadarEnrichStatus) : 'falhou') : 'nao_pedido',
    atualizadoEm: when ? when.toISOString() : null,
  };
}

function isEnriquecimentoLinha(v: unknown): v is PremiumEnriquecimentoLinha {
  return !!v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { status?: unknown }).status === 'string' && 'result' in v;
}

export interface ListarCandidatosPremiumInput {
  ufs: readonly string[];
  limite: number;
  /** Cursor (keyset): devolve só CNPJs maiores que este. */
  aposCnpj?: string;
}

export const PREMIUM_CANDIDATOS_LIMITE_MAX = 500;

/** Lê candidatos Premium, ordenados por CNPJ (paginação por cursor). Só SELECT. */
export async function listarCandidatosPremium(input: ListarCandidatosPremiumInput): Promise<PremiumCandidato[]> {
  const ufs = input.ufs.map((u) => u.trim().toUpperCase()).filter(Boolean);
  if (ufs.length === 0) return [];
  const limite = Math.max(1, Math.min(Math.floor(input.limite), PREMIUM_CANDIDATOS_LIMITE_MAX));

  // Import dinâmico: não exige DATABASE_URL só para carregar este módulo nos testes puros.
  const { db } = await import('../../db');
  const { radarEstablishments, radarEnrichment } = await import('../../db/schema');

  const rows = await db
    .select({ estab: radarEstablishments, enr: radarEnrichment })
    .from(radarEstablishments)
    .leftJoin(radarEnrichment, sql`${radarEnrichment.cnpj} = ${radarEstablishments.cnpj}`)
    .where(
      and(
        inArray(radarEstablishments.uf, ufs),
        sql`${radarEstablishments.cnaesAlvo} && ARRAY[${sql.join(PREMIUM_ALL_CNAES.map((c) => sql`${c}`), sql`, `)}]::text[]`,
        input.aposCnpj ? gt(radarEstablishments.cnpj, input.aposCnpj) : undefined,
      ),
    )
    .orderBy(asc(radarEstablishments.cnpj))
    .limit(limite);

  // O filtro de CNAE acima já separa do Radar de Cargas (a regra de nome roda na importação).
  // Não filtramos de novo depois do LIMIT: a página seguinte parte do último CNPJ devolvido.
  return rows.map((r) => montarCandidatoPremium(r.estab, r.enr));
}
