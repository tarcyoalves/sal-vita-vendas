import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';

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

export function signToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}

export function getCookieFromRequest(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.split(';').find(c => c.trim().startsWith(name + '='));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=').trim()) : undefined;
}

// Fixed dummy hash used for timing-safe login — prevents user enumeration via response time
export const DUMMY_HASH = (() => {
  const salt = 'a'.repeat(32);
  const hash = pbkdf2Sync('__dummy__', salt, 10_000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
})();
