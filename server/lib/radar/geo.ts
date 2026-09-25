// Municípios brasileiros com coordenadas, para o Radar de Cargas.
//
// Fonte: github.com/kelvins/municipios-brasileiros (licença MIT), convertida para
// server/data/municipios.json como [ibge, nome, uf, lat, lon, siafi].
// `siafi` é o código de município que a base aberta de CNPJ da Receita usa — por
// isso ele fica aqui: é a ponte entre a Receita e o IBGE.
//
// A distância é em LINHA RETA entre os centros dos municípios. Estrada costuma dar
// 20–40% a mais; a tela deve dizer "linha reta".
import raw from '../../data/municipios.json';

export interface Municipio {
  ibge: number;
  nome: string;
  uf: string;
  lat: number;
  lon: number;
  siafi: string;
}

type Row = [number, string, string, number, number, string];

export const MUNICIPIOS: readonly Municipio[] = (raw as Row[]).map(([ibge, nome, uf, lat, lon, siafi]) => ({
  ibge, nome, uf, lat, lon, siafi,
}));

const byIbge = new Map(MUNICIPIOS.map((m) => [m.ibge, m]));
const bySiafi = new Map(MUNICIPIOS.map((m) => [m.siafi, m]));

export function municipioByIbge(ibge: number): Municipio | undefined {
  return byIbge.get(ibge);
}

export function municipioBySiafi(siafi: string): Municipio | undefined {
  return bySiafi.get(siafi.padStart(4, '0'));
}

export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Autocomplete. Existem nomes repetidos entre estados (há Barracão no PR e no RS),
// por isso a tela sempre mostra e envia o código IBGE, nunca só o nome.
export function searchMunicipios(query: string, uf?: string, limit = 15): Municipio[] {
  const q = normalizeName(query);
  if (!q) return [];
  const pool = uf ? MUNICIPIOS.filter((m) => m.uf === uf) : MUNICIPIOS;
  const starts: Municipio[] = [];
  const contains: Municipio[] = [];
  for (const m of pool) {
    const n = normalizeName(m.nome);
    if (n.startsWith(q)) starts.push(m);
    else if (n.includes(q)) contains.push(m);
  }
  return [...starts, ...contains].slice(0, limit);
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Municípios cujo centro está a até `radiusKm` do centro da origem (inclui a origem),
// ordenados por distância. Cruza divisa de estado normalmente.
export function municipiosWithinRadius(origin: Municipio, radiusKm: number): Array<Municipio & { distanceKm: number }> {
  const out: Array<Municipio & { distanceKm: number }> = [];
  for (const m of MUNICIPIOS) {
    const d = haversineKm(origin.lat, origin.lon, m.lat, m.lon);
    if (d <= radiusKm) out.push({ ...m, distanceKm: d });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm);
}
