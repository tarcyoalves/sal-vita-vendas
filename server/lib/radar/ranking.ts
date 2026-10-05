// Buscador de Clientes — ordenação, paginação e telefone compartilhado.
// Funções puras (sem banco/rede): a procedure `search` em prospectingRadar.ts
// busca os dados e chama estas funções; os testes ficam em tests/radar-ranking.test.ts.
import { RADAR_TELEFONE_COMPARTILHADO_MIN, type RadarPhone } from '../../../shared/radar';

/** 0 = tem telefone próprio (não compartilhado), 1 = só telefone compartilhado, 2 = sem telefone. */
export type ClasseTelefone = 0 | 1 | 2;

export function telefoneCompartilhado(p: RadarPhone, min: number = RADAR_TELEFONE_COMPARTILHADO_MIN): boolean {
  return (p.compartilhadoPor ?? 0) >= min;
}

export function classeTelefone(phones: readonly RadarPhone[], min: number = RADAR_TELEFONE_COMPARTILHADO_MIN): ClasseTelefone {
  if (phones.length === 0) return 2;
  return phones.some((p) => !telefoneCompartilhado(p, min)) ? 0 : 1;
}

/** Porte maior primeiro: '05' demais (3) > '03' EPP (2) > '01' ME (1) > '00'/null/outro (0). */
export function pesoPorte(porte: string | null | undefined): number {
  switch (porte) {
    case '05': return 3;
    case '03': return 2;
    case '01': return 1;
    default: return 0;
  }
}

export interface ChaveRanking {
  distanceKm: number;
  phones: readonly RadarPhone[];
  porte: string | null;
  nome: string;
}

/** Mesma distância primeiro (menor antes); depois telefone próprio > só compartilhado > sem telefone;
 *  depois porte maior; por fim o nome (pt-BR). */
export function compararRanking(a: ChaveRanking, b: ChaveRanking): number {
  if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
  const ca = classeTelefone(a.phones);
  const cb = classeTelefone(b.phones);
  if (ca !== cb) return ca - cb;
  const pa = pesoPorte(a.porte);
  const pb = pesoPorte(b.porte);
  if (pa !== pb) return pb - pa;
  return a.nome.toLowerCase().localeCompare(b.nome.toLowerCase(), 'pt-BR');
}

/** Ordena uma cópia da lista; `chave` extrai os campos do ranking de cada item. */
export function ordenarPorRanking<T>(itens: readonly T[], chave: (item: T) => ChaveRanking): T[] {
  return itens
    .map((item) => ({ item, k: chave(item) }))
    .sort((x, y) => compararRanking(x.k, y.k))
    .map((x) => x.item);
}

/** Fatia `pagina` (0 = primeira) de `tamanho` itens, e se existe a próxima. */
export function paginar<T>(itens: readonly T[], pagina: number, tamanho: number): { fatia: T[]; hasMore: boolean } {
  const inicio = pagina * tamanho;
  return { fatia: itens.slice(inicio, inicio + tamanho), hasMore: itens.length > inicio + tamanho };
}

/** Preenche `compartilhadoPor` (quantas empresas da base usam o número). Número sem contagem fica como está. */
export function aplicarCompartilhado(phones: readonly RadarPhone[], contagem: ReadonlyMap<string, number>): RadarPhone[] {
  return phones.map((p) => {
    const n = contagem.get(p.digits);
    return n === undefined ? p : { ...p, compartilhadoPor: n };
  });
}

/** UFs (únicas, ordenadas) dos municípios do raio que não têm nenhuma empresa na base. */
export function ufsSemBase(
  ufsDoRaio: readonly string[],
  porUf: ReadonlyArray<{ uf: string; count: number }>,
): string[] {
  const comBase = new Set(porUf.filter((r) => r.count > 0).map((r) => r.uf.toUpperCase()));
  return [...new Set(ufsDoRaio.map((u) => u.toUpperCase()))].filter((u) => !comBase.has(u)).sort();
}
