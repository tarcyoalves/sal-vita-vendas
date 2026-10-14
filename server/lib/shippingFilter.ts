// Transportadoras com as quais a Sal Vita realmente despacha (decisão do dono):
// Correios, Jadlog, Azul Cargo Express e J&T Express. O Melhor Envio devolve outras
// (LATAM Cargo, Loggi...) que NUNCA podem chegar ao cliente. Nomes vistos na API:
// "Correios", "Jadlog", "Azul Cargo Express", "JeT"; aceitamos também "J&T"/"J&T Express".
export type QuoteOption = { serviceId: string; name: string; company: string; price: number; days: string };

export const ALLOWED_CARRIERS: readonly RegExp[] = [
  /^correios\b/i,
  /^jadlog\b/i,
  /^azul\s*cargo\b/i,
  /^(j\s*&\s*t|jet)\b/i,
];

export const isAllowedCarrier = (company: string | null | undefined) =>
  ALLOWED_CARRIERS.some((re) => re.test((company ?? '').trim()));

/** Mantém só as transportadoras permitidas, com preço válido, do mais barato ao mais caro. */
export function filterAllowedCarriersSorted<T extends QuoteOption>(options: T[]): T[] {
  return options
    .filter((o) => isAllowedCarrier(o.company) && Number.isFinite(o.price) && o.price > 0)
    .sort((a, b) => a.price - b.price);
}
