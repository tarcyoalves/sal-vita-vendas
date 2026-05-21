import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.SALLOG_JWT_SECRET ?? 'sallog-dev-secret';
const ITERATIONS = 310_000;
const KEYLEN = 64;
const DIGEST = 'sha512';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  return `${ITERATIONS}:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  let iterations: number, salt: string, hash: string;
  if (parts.length === 3) {
    iterations = parseInt(parts[0], 10);
    salt = parts[1];
    hash = parts[2];
  } else if (parts.length === 2) {
    iterations = ITERATIONS;
    salt = parts[0];
    hash = parts[1];
  } else {
    return false;
  }
  if (!salt || !hash || isNaN(iterations)) return false;
  const check = crypto.pbkdf2Sync(password, salt, iterations, KEYLEN, DIGEST).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
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

export const DUMMY_HASH = hashPassword('dummy-anti-timing');
export const COOKIE_NAME = 'sallog_session';
