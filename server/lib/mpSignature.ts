// Mercado Pago webhook signature helpers (pure, no I/O).
// Documented template: id:[data.id_url];request-id:[x-request-id_header];ts:[ts_header];

/** Manifest signed by MP. Note the TRAILING semicolon. Alphanumeric ids must be lowercased. */
export function mpSignatureManifest(dataId: string | undefined | null, requestId: string, ts: string): string {
  const id = String(dataId ?? '');
  const normalized = /^[0-9]+$/.test(id) ? id : id.toLowerCase();
  return `id:${normalized};request-id:${requestId};ts:${ts};`;
}

/** Parses the `x-signature` header (`ts=...,v1=...`). */
export function parseMpSignatureHeader(header: string | undefined | null): { ts?: string; v1?: string } {
  const out: { ts?: string; v1?: string } = {};
  for (const part of String(header ?? '').split(',')) {
    const [k, ...v] = part.split('=');
    const key = k.trim();
    if (key === 'ts') out.ts = v.join('=').trim();
    else if (key === 'v1') out.v1 = v.join('=').trim();
  }
  return out;
}
