import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { passwordVersion } from './lib/sessionToken';
import { COOKIE_NAME } from '../shared/const';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required');
}
const JWT_SECRET = process.env.JWT_SECRET;

// OWASP 2023: PBKDF2-HMAC-SHA512 minimum 210k iterations
const CURRENT_ITERATIONS = 310_000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, CURRENT_ITERATIONS, 64, 'sha512').toString('hex');
  // Format: {iterations}:{salt}:{hash} — iterations prefix enables future migration
  return `${CURRENT_ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  let iterations: number;
  let salt: string;
  let hash: string;

  if (parts.length === 3) {
    // New format: {iterations}:{salt}:{hash}
    iterations = parseInt(parts[0], 10);
    salt = parts[1];
    hash = parts[2];
  } else if (parts.length === 2) {
    // Legacy format: {salt}:{hash} — used 10k iterations
    iterations = 10_000;
    salt = parts[0];
    hash = parts[1];
  } else {
    return false;
  }

  if (!salt || !hash || isNaN(iterations)) return false;

  const verifyHash = pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
  // timing-safe comparison — prevents oracle attacks on hash value
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
  } catch {
    return false;
  }
}

/** Emite o JWT já com `pv` (impressão digital da senha atual) — toda emissão passa por aqui. */
export function signToken(payload: object, passwordHash: string): string {
  return jwt.sign({ ...payload, pv: passwordVersion(JWT_SECRET, passwordHash) }, JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
}

export function currentPasswordVersion(passwordHash: string): string {
  return passwordVersion(JWT_SECRET, passwordHash);
}

export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
}

/** Mesmo Set-Cookie para login e reemissão (troca de senha). */
export function sessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly${secure}; Path=/; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

export function getCookieFromRequest(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.split(';').find(c => c.trim().startsWith(name + '='));
  if (!match) return undefined;
  // %-malformado no cookie lançava URIError (500); trata como sem cookie.
  try {
    return decodeURIComponent(match.split('=').slice(1).join('=').trim());
  } catch {
    return undefined;
  }
}

// Hash falso do login para igualar o tempo de resposta quando o e-mail não existe
// (evita enumeração de usuários por tempo). Usa as MESMAS iterações dos usuários reais —
// com menos iterações o login de e-mail inexistente respondia visivelmente mais rápido.
// Preguiçoso: calcula uma vez, na primeira necessidade, e não no carregamento do módulo.
let dummyHash: string | null = null;
export function getDummyHash(): string {
  if (!dummyHash) dummyHash = hashPassword('__dummy__');
  return dummyHash;
}
