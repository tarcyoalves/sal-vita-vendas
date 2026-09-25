// Radar de Cargas — Enriquecimento por scraping (Fase 2).
// Contrato de tipos: shared/radar.ts (seção "Enriquecimento por scraping"). Visão
// geral: PLANO-RADAR-CARGAS.md.
//
// A tabela `radar_enrichment` é escrita por dois lados: este router enfileira
// (INSERT ... ON CONFLICT) e o robô Python da VPS processa (UPDATE, com
// FOR UPDATE SKIP LOCKED do lado dele — não implementado aqui). Como o JSONB de
// `result` é escrito por outro programa, ele nunca é confiável: as funções de
// validação abaixo descartam item por item o que não bate com o formato
// esperado, em vez de invalidar o resultado inteiro por um campo ruim.
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import { appSettings, radarEnrichment, type RadarEnrichmentRow } from '../../db/schema';
import {
  RADAR_ENRICHER_HEARTBEAT_KEY,
  RADAR_ENRICHER_ONLINE_MS,
  RADAR_ENRICH_SOURCES,
  type RadarEnrichFound,
  type RadarEnrichSource,
  type RadarEnrichSourceResult,
  type RadarEnrichStatus,
  type RadarEnrichment,
  type RadarEnrichmentData,
} from '../../../shared/radar';

const ENRICH_SOURCE_SET = new Set<string>(RADAR_ENRICH_SOURCES);
const ENRICH_STATUS_SET = new Set<string>(['pendente', 'processando', 'pronto', 'falhou']);

// Quantas tentativas automáticas (via `search`) antes de desistir de um CNPJ que
// falhou. "Automáticas" porque `enrichNow` com `force` sempre pode furar isso —
// é o atendente pedindo explicitamente.
export const RADAR_ENRICH_MAX_ATTEMPTS = 3;
// Intervalo mínimo entre duas tentativas automáticas depois de uma falha.
export const RADAR_ENRICH_RETRY_COOLDOWN_MS = 60 * 60 * 1000;

// ── Validação/normalização do JSON gravado pelo robô ────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function toEnrichFound(v: unknown): RadarEnrichFound | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isNonEmptyString(o.value)) return null;
  if (!isNonEmptyString(o.source) || !ENRICH_SOURCE_SET.has(o.source)) return null;
  return {
    value: o.value,
    source: o.source as RadarEnrichSource,
    url: isNonEmptyString(o.url) ? o.url : null,
  };
}

function toEnrichFoundList(v: unknown): RadarEnrichFound[] {
  if (!Array.isArray(v)) return [];
  return v.map(toEnrichFound).filter((x): x is RadarEnrichFound => x !== null);
}

function toSourceResult(v: unknown): RadarEnrichSourceResult | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isNonEmptyString(o.source) || !ENRICH_SOURCE_SET.has(o.source)) return null;
  if (typeof o.ok !== 'boolean') return null;
  return { source: o.source as RadarEnrichSource, ok: o.ok, note: isNonEmptyString(o.note) ? o.note : null };
}

function toSourceResultList(v: unknown): RadarEnrichSourceResult[] {
  if (!Array.isArray(v)) return [];
  return v.map(toSourceResult).filter((x): x is RadarEnrichSourceResult => x !== null);
}

function toMaps(v: unknown): RadarEnrichmentData['maps'] {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  // Sem URL o card de Maps não serve para nada (não dá para linkar) — descarta.
  if (!isNonEmptyString(o.url)) return null;
  return {
    url: o.url,
    nome: isNonEmptyString(o.nome) ? o.nome : null,
    categoria: isNonEmptyString(o.categoria) ? o.categoria : null,
    nota: isFiniteNumber(o.nota) ? o.nota : null,
    avaliacoes: isFiniteNumber(o.avaliacoes) ? o.avaliacoes : null,
    situacao: isNonEmptyString(o.situacao) ? o.situacao : null,
    endereco: isNonEmptyString(o.endereco) ? o.endereco : null,
  };
}

/**
 * Normaliza o JSONB gravado em `radar_enrichment.result`. Nunca lança: entrada
 * que não é objeto vira `null`; campo individual ruim (tipo errado, item de
 * array mal formado, fonte desconhecida) é descartado, o resto do resultado
 * continua de pé.
 */
export function toRadarEnrichmentData(raw: unknown): RadarEnrichmentData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    website: isNonEmptyString(o.website) ? o.website : null,
    maps: toMaps(o.maps),
    whatsapps: toEnrichFoundList(o.whatsapps),
    telefones: toEnrichFoundList(o.telefones),
    emails: toEnrichFoundList(o.emails),
    instagram: isNonEmptyString(o.instagram) ? o.instagram : null,
    facebook: isNonEmptyString(o.facebook) ? o.facebook : null,
    fontes: toSourceResultList(o.fontes),
  };
}

/**
 * Monta o `RadarEnrichment` que a tela consome a partir da linha crua do banco.
 * `null` só quando não há linha nenhuma (nunca foi pedido). Uma linha 'pronto'
 * vencida (expiresAt < now) ainda volta com o `data` que tem — quem decide se
 * precisa reenfileirar é `needsEnqueue`, não esta função.
 */
export function toRadarEnrichment(row: RadarEnrichmentRow | undefined, now: Date): RadarEnrichment | null {
  if (!row) return null;
  const status: RadarEnrichStatus = ENRICH_STATUS_SET.has(row.status) ? (row.status as RadarEnrichStatus) : 'falhou';
  const updatedAt = row.finishedAt ?? row.claimedAt ?? row.requestedAt ?? null;
  return {
    status,
    updatedAt: updatedAt ? updatedAt.toISOString() : null,
    data: toRadarEnrichmentData(row.result),
  };
}

/** Robô mudo há mais de `RADAR_ENRICHER_ONLINE_MS` == desligado, para efeitos da tela. */
export function isEnricherOnline(heartbeatIso: string | null, now: Date): boolean {
  if (!heartbeatIso) return false;
  const t = Date.parse(heartbeatIso);
  if (Number.isNaN(t)) return false;
  return now.getTime() - t < RADAR_ENRICHER_ONLINE_MS;
}

/**
 * true quando vale a pena colocar (ou recolocar) este CNPJ na fila:
 * - nunca foi pedido (sem linha);
 * - falhou, ainda não estourou o teto de tentativas automáticas e já passou o
 *   tempo de espera desde a última tentativa;
 * - terminou 'pronto' mas o resultado venceu (TTL).
 * 'pendente' e 'processando' nunca precisam — já estão na fila ou em execução,
 * e reenfileirar resetaria o trabalho que o robô já reservou.
 */
export function needsEnqueue(row: RadarEnrichmentRow | undefined, now: Date): boolean {
  if (!row) return true;
  if (row.status === 'pendente' || row.status === 'processando') return false;
  if (row.status === 'falhou') {
    if (row.attempts >= RADAR_ENRICH_MAX_ATTEMPTS) return false;
    const last = row.finishedAt ?? row.requestedAt;
    return now.getTime() - last.getTime() > RADAR_ENRICH_RETRY_COOLDOWN_MS;
  }
  if (row.status === 'pronto') {
    return !row.expiresAt || row.expiresAt.getTime() < now.getTime();
  }
  // Status corrompido/desconhecido (não devia acontecer — a coluna não tem
  // enum no Postgres) — trata como se nunca tivesse rodado.
  return true;
}

// ── Acesso a dados ───────────────────────────────────────────────────────────

/** Uma consulta em lote, por CNPJ. Vazio não bate no banco. */
export async function loadEnrichments(cnpjs: readonly string[]): Promise<Map<string, RadarEnrichmentRow>> {
  if (cnpjs.length === 0) return new Map();
  const rows = await db.select().from(radarEnrichment).where(inArray(radarEnrichment.cnpj, cnpjs as string[]));
  return new Map(rows.map((r) => [r.cnpj, r]));
}

/** ISO do último sinal de vida do robô, ou `null` se ele nunca escreveu um. */
export async function loadHeartbeat(): Promise<string | null> {
  const [row] = await db.select({ value: appSettings.value }).from(appSettings)
    .where(eq(appSettings.key, RADAR_ENRICHER_HEARTBEAT_KEY));
  return row?.value ?? null;
}

export interface EnqueueOptions {
  priority: number;
  userId: number;
  // true = ignora o critério de `needsEnqueue` (mas nunca reseta 'processando')
  // — usado por `enrichNow` quando o atendente pede explicitamente para varrer
  // de novo um card que já está 'pronto' e ainda não venceu.
  force?: boolean;
}

// Condição da linha ATUAL (antes do upsert) sob a qual vale reenfileirar —
// espelha `needsEnqueue` em SQL. Só é avaliada em conflito (CNPJ já tem
// linha); sem linha, o INSERT simples sempre acontece.
const NEEDS_ENQUEUE_SQL = sql`(
  ${radarEnrichment.status} = 'falhou'
  AND ${radarEnrichment.attempts} < ${RADAR_ENRICH_MAX_ATTEMPTS}
  AND coalesce(${radarEnrichment.finishedAt}, ${radarEnrichment.requestedAt}) < now() - interval '1 hour'
) OR (
  ${radarEnrichment.status} = 'pronto'
  AND (${radarEnrichment.expiresAt} IS NULL OR ${radarEnrichment.expiresAt} < now())
) OR ${radarEnrichment.status} NOT IN ('pendente', 'processando', 'falhou', 'pronto')`;

/**
 * Coloca (ou recoloca) uma lista de CNPJs na fila do robô, num único
 * INSERT ... ON CONFLICT DO UPDATE (sem N+1). Nunca mexe numa linha
 * 'processando' — o robô já reservou aquele trabalho (claim via
 * FOR UPDATE SKIP LOCKED do lado dele) e reenfileirar destruiria isso.
 */
export async function enqueue(cnpjs: readonly string[], opts: EnqueueOptions): Promise<void> {
  if (cnpjs.length === 0) return;

  const setWhere = opts.force
    ? sql`${radarEnrichment.status} <> 'processando'`
    : NEEDS_ENQUEUE_SQL;

  await db.insert(radarEnrichment).values(
    cnpjs.map((cnpj) => ({
      cnpj,
      status: 'pendente',
      priority: opts.priority,
      requestedAt: new Date(),
      requestedByUserId: opts.userId,
    })),
  ).onConflictDoUpdate({
    target: radarEnrichment.cnpj,
    set: {
      status: sql`'pendente'`,
      priority: sql`greatest(${radarEnrichment.priority}, excluded.priority)`,
      requestedAt: sql`now()`,
      requestedByUserId: sql`excluded.requested_by_user_id`,
      // 'pronto' que foi reenfileirado (TTL vencido ou force) começa um ciclo
      // novo de tentativas; um retry de 'falhou' mantém a contagem.
      attempts: sql`case when ${radarEnrichment.status} = 'pronto' then 0 else ${radarEnrichment.attempts} end`,
    },
    setWhere,
  });
}
