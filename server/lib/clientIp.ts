import { isIP } from 'net';

/** Subconjunto de Request do Express que o helper lê (facilita testar). */
export interface IpRequestLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string } | null;
}

export const UNKNOWN_IP = 'desconhecido';

function firstHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Valida e normaliza (::ffff:1.2.3.4 -> 1.2.3.4; IPv6 em minúsculas). Lixo vira null. */
export function sanitizeIp(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s || s.length > 64) return null;
  // Remove colchetes de "[::1]" e porta de "1.2.3.4:5678".
  if (s.startsWith('[') && s.includes(']')) s = s.slice(1, s.indexOf(']'));
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(s)) s = s.slice(0, s.lastIndexOf(':'));
  if (s.toLowerCase().startsWith('::ffff:') && isIP(s.slice(7)) === 4) s = s.slice(7);
  return isIP(s) ? s.toLowerCase() : null;
}

/**
 * IP do cliente que NÃO pode ser forjado pelo atacante.
 * Ordem: x-vercel-forwarded-for (a Vercel sobrescreve na borda) > x-real-ip >
 * ÚLTIMO hop de x-forwarded-for (o primeiro é controlado pelo cliente) > req.ip > socket.
 */
export function getClientIp(req: IpRequestLike): string {
  const h = req.headers ?? {};
  const vercel = sanitizeIp(firstHeader(h['x-vercel-forwarded-for'])?.split(',')[0]);
  if (vercel) return vercel;
  const real = sanitizeIp(firstHeader(h['x-real-ip']));
  if (real) return real;
  const xff = h['x-forwarded-for'];
  const hops = (Array.isArray(xff) ? xff.join(',') : xff ?? '').split(',');
  const last = sanitizeIp(hops[hops.length - 1]);
  if (last) return last;
  return sanitizeIp(req.ip) ?? sanitizeIp(req.socket?.remoteAddress) ?? UNKNOWN_IP;
}
