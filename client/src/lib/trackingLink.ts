/**
 * Link de rastreio que funciona para qualquer transportadora do Melhor Envio
 * (Correios, Jadlog, Azul Cargo, J&T). Espelha `trackingLink` de server/lib/meTracking.ts.
 */
export function trackingLink(code: string): string {
  return `https://melhorrastreio.com.br/rastreio/${encodeURIComponent(code.trim())}`;
}
