// Decisões puras das rotas do Hermes (server/salesRoutes.ts): autenticação por escopo, validação do
// corpo e limite de tamanho. Testadas em tests/sales-rotas.test.ts.
import type { ZodType, ZodTypeDef } from 'zod';
import { HERMES_SCOPES, type HermesScope } from '../../../shared/sales';
import { safeEqual } from '../safeEqual';

/** Segredo mais curto que isto é tratado como ausente (escopo fecha): evita segredo fraco por engano. */
export const SEGREDO_MIN = 16;

export type DecisaoAuth = { ok: true } | { ok: false; http: 401 | 503; corpo: { error: string } };

/**
 * `Authorization: Bearer <segredo>` comparado em tempo constante.
 *  - variável ausente/curta → 503 `{error:'escopo desativado'}` (falha fechado; nenhum banco é tocado);
 *  - cabeçalho ausente ou segredo errado → 401.
 */
export function decidirAutenticacao(segredo: string | undefined, authorization: string | string[] | undefined): DecisaoAuth {
  const s = (segredo ?? '').trim();
  if (s.length < SEGREDO_MIN) return { ok: false, http: 503, corpo: { error: 'escopo desativado' } };
  const h = Array.isArray(authorization) ? authorization[0] : authorization;
  const m = /^Bearer\s+(\S+)$/.exec(h ?? '');
  if (!m || !safeEqual(m[1], s)) return { ok: false, http: 401, corpo: { error: 'Unauthorized' } };
  return { ok: true };
}

/** Segredo do escopo, lido do ambiente na hora (girar a variável não exige redeploy do código). */
export function segredoDoEscopo(escopo: HermesScope, env: Record<string, string | undefined> = process.env): string | undefined {
  return env[HERMES_SCOPES[escopo]];
}

/** Limites de corpo por rota (bytes). O `express.json` global de api/index.ts aceita 4 MB; este teto vale antes. */
export const LIMITE_CORPO = {
  pequeno: 2 * 1024,   // reservar, autorizar, resultado, heartbeat, ciclo
  evento: 8 * 1024,    // eventos da caixa (trecho ≤ 600 caracteres)
  proposta: 16 * 1024, // propostas (detalhe ≤ 4000 caracteres)
} as const;

/** true se o Content-Length declarado passa do limite (sem cabeçalho: o tamanho real é conferido depois). */
export function corpoExcedeLimite(contentLength: string | undefined, limite: number): boolean {
  if (!contentLength) return false;
  const n = Number(contentLength);
  return !Number.isFinite(n) || n < 0 || n > limite;
}

/** Tamanho do corpo já interpretado (o parser global pode ter lido sem Content-Length). */
export function tamanhoJson(corpo: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(corpo ?? null), 'utf8'); } catch { return Number.POSITIVE_INFINITY; }
}

export type Validacao<T> = { ok: true; dados: T } | { ok: false; http: 400; corpo: { error: string; detalhes: unknown } };

export function validarCorpo<T>(schema: ZodType<T, ZodTypeDef, unknown>, corpo: unknown): Validacao<T> {
  const r = schema.safeParse(corpo);
  if (r.success) return { ok: true, dados: r.data };
  return { ok: false, http: 400, corpo: { error: 'corpo inválido', detalhes: r.error.flatten() } };
}

/** `:id` da rota → inteiro positivo, ou null. */
export function idDaRota(v: string | undefined): number | null {
  if (!v || !/^\d{1,10}$/.test(v)) return null;
  const n = Number(v);
  return n > 0 && n <= 2_147_483_647 ? n : null;
}
