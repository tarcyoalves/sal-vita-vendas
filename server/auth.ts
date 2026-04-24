import { randomBytes, pbkdf2Sync } from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.error('WARNING: JWT_SECRET not set — sessions will be lost on restart. Set this env var in production!');
  return `sal-vita-${Date.now()}-${Math.random()}`;
})();

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const verifyHash = pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
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
