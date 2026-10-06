// Procedures com rate limit próprio em api/index.ts. Uma chamada em lote
// (`/api/trpc/a.x,b.y?batch=1`) não casa o prefixo dos limiters, então
// lotes que contenham qualquer uma delas são recusados.
export const RATE_LIMITED_PROCEDURES = [
  'auth.login',
  'auth.emergencyReset',
  'shipping.calculate',
  'shipping.trackOrder',
  'shipping.createOrder',
  'shipping.createPayment',
  'shipping.createPixPayment',
  'shipping.pixStatus',
  'recovery.trackCart',
  'recovery.validateCoupon',
  'recovery.chat',
  'ai.chat',
  'ai.testConnection',
] as const;

const LIMITED = new Set<string>(RATE_LIMITED_PROCEDURES.map(p => p.toLowerCase()));

export function isRateLimitedProcedure(path: string): boolean {
  return LIMITED.has(path.toLowerCase());
}

/** path = req.path dentro de app.use('/api/trpc'), ex.: '/tasks.list,auth.me'. true = bloquear. */
export function isForbiddenBatch(path: string): boolean {
  let decoded = path;
  try { decoded = decodeURIComponent(path); } catch { /* mantém o original */ }
  if (!decoded.includes(',')) return false;
  return decoded.replace(/^\/+/, '').split(',').some(p => LIMITED.has(p.trim().toLowerCase()));
}

/** E-mail do corpo tRPC ({json:{email}} ou lote {"0":{json:{email}}}) para a chave do limiter. */
export function emailFromTrpcBody(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const b = body as Record<string, unknown>;
  const pick = (v: unknown): string => {
    if (!v || typeof v !== 'object') return '';
    const o = v as Record<string, unknown>;
    const inner = (o.json && typeof o.json === 'object' ? o.json : o) as Record<string, unknown>;
    return typeof inner.email === 'string' ? inner.email.trim().toLowerCase() : '';
  };
  return pick(b) || pick(b['0']);
}
