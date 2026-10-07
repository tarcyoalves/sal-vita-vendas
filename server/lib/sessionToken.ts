// Revogação do JWT sem coluna nova: o token carrega `pv`, uma impressão digital da
// senha (HMAC do passwordHash com o JWT_SECRET). Trocou/redefiniu a senha → o pv do
// banco muda → tokens antigos deixam de valer. Funções puras (sem env, sem banco).
import { createHmac } from 'crypto';
import { safeEqual } from './safeEqual';

/** Momento do deploy que introduziu o `pv` (2026-10-06T00:00:00Z), em segundos. */
export const PV_DEPLOY_TS = Date.parse('2026-10-06T00:00:00Z') / 1000;
/** Tokens emitidos antes do deploy (sem pv) valem até DEPLOY_TS + 7 dias (a vida máxima de um token). */
export const PV_LEGACY_GRACE_S = 7 * 24 * 3600;

/** 16 hex do HMAC-SHA256(secret, passwordHash). Nunca guarde o hash em cache: só o pv. */
export function passwordVersion(secret: string, passwordHash: string): string {
  return createHmac('sha256', secret).update(passwordHash).digest('hex').slice(0, 16);
}

/**
 * true = o token vale para a senha atual (`currentPv`, calculado do banco).
 * Sem pv: aceito só enquanto iat < DEPLOY_TS + 7 dias (compatibilidade); depois, exige pv.
 */
export function tokenMatchesPassword(
  decoded: { pv?: unknown; iat?: unknown } | null | undefined,
  currentPv: string,
): boolean {
  if (!decoded || typeof decoded !== 'object') return false;
  if (typeof decoded.pv === 'string') return safeEqual(decoded.pv, currentPv);
  if (decoded.pv !== undefined) return false;
  return typeof decoded.iat === 'number' && decoded.iat < PV_DEPLOY_TS + PV_LEGACY_GRACE_S;
}
