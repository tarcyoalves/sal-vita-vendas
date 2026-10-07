// Defesa CSRF do /api/trpc (cookie SameSite=Lax + CORS com credentials).
// Função pura: devolve o motivo da recusa ou null (liberado). Testável sem Express.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfRequestInfo {
  method: string;
  contentType?: string | null;
  secFetchSite?: string | null;
  origin?: string | null;
}

export function csrfRejection(req: CsrfRequestInfo, allowedOrigins: readonly string[]): string | null {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return null;
  // multipart/form-data e text/plain são "requisições simples" (sem preflight) e rodariam
  // procedures sem input vindas de qualquer site. O cliente tRPC sempre manda JSON.
  const ct = (req.contentType ?? '').toLowerCase().split(';')[0].trim();
  if (ct !== 'application/json') return 'Content-Type inválido';
  if (req.secFetchSite && req.secFetchSite.toLowerCase() === 'cross-site') return 'Origem cruzada não permitida';
  if (req.origin && !allowedOrigins.includes(req.origin)) return 'Origem não permitida';
  return null;
}
