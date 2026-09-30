// Arquivo intermediário do importador: o resultado JÁ filtrado (algumas centenas de milhares
// de linhas) guardado em NDJSON, para a gravação não reler os ~20 GB da Receita.
// Primeira linha = metadados; demais = uma empresa por linha.
import type { RadarEstablishmentRow } from './receitaParse';

export interface FilteredMeta {
  version: 1;
  release: string;
  ufs: string[];
  cnaes: string[];          // lista de CNAEs-alvo usada para filtrar
  baseCompleta: boolean;    // os 10 arquivos de estabelecimentos foram lidos
  rows: number;
  createdAt: string;
}

/** Devolve o motivo de o arquivo não servir para esta execução, ou null se servir. */
export function motivoFiltradoInvalido(
  meta: Partial<FilteredMeta> | null | undefined,
  esperado: { release: string; ufs: readonly string[]; cnaes: readonly string[] },
): string | null {
  if (!meta || meta.version !== 1) return 'arquivo sem cabeçalho válido (versão 1)';
  if (meta.release !== esperado.release) return `release do arquivo (${meta.release}) difere da pedida (${esperado.release})`;
  const mesmo = (a: readonly string[] | undefined, b: readonly string[]) =>
    !!a && a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
  if (!mesmo(meta.ufs, esperado.ufs)) return `UFs do arquivo (${(meta.ufs ?? []).join(',')}) diferem das pedidas (${esperado.ufs.join(',')})`;
  if (!mesmo(meta.cnaes, esperado.cnaes)) {
    return 'a lista de CNAEs-alvo mudou desde que o arquivo foi gerado — gere de novo (--save-filtered)';
  }
  return null;
}

/** Valida a forma mínima de uma linha lida do arquivo (falha cedo em arquivo corrompido). */
export function linhaFiltradaValida(row: unknown, ufs: readonly string[]): row is RadarEstablishmentRow {
  const r = row as Partial<RadarEstablishmentRow> | null;
  return !!r
    && typeof r.cnpj === 'string' && /^\d{14}$/.test(r.cnpj)
    && typeof r.uf === 'string' && ufs.includes(r.uf)
    && typeof r.razaoSocial === 'string'
    && Array.isArray(r.cnaesAlvo) && r.cnaesAlvo.length > 0
    && typeof r.municipioIbge === 'number';
}
