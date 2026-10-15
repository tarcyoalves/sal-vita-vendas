// Filtros do arquivo de análises (página AnaliseCredito) -> entrada de `credito.listar`. Puro e testado.
import type { Veredito } from '../../../../shared/credito';

export interface FiltrosArquivo {
  busca: string;
  uf: string; // '' = todas
  veredito: '' | Veredito;
  de: string; // yyyy-mm-dd do <input type="date">, '' = sem limite
  ate: string;
}

export const FILTROS_VAZIOS: FiltrosArquivo = { busca: '', uf: '', veredito: '', de: '', ate: '' };
export const POR_PAGINA_ARQUIVO = 20;

/** yyyy-mm-dd -> Date no começo (ou fim) do dia no fuso local do navegador; data inválida vira undefined. */
export function dataDoFiltro(v: string, fim: boolean): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return undefined;
  const d = fim ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999) : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
  return Number.isFinite(d.getTime()) && d.getMonth() === +m[2] - 1 ? d : undefined;
}

export function periodoInvertido(f: Pick<FiltrosArquivo, 'de' | 'ate'>): boolean {
  const de = dataDoFiltro(f.de, false); const ate = dataDoFiltro(f.ate, true);
  return !!de && !!ate && de.getTime() > ate.getTime();
}

export function entradaListar(f: FiltrosArquivo, pagina: number, porPagina = POR_PAGINA_ARQUIVO) {
  const busca = f.busca.trim();
  return {
    busca: busca || undefined,
    uf: f.uf.trim() ? f.uf.trim().toUpperCase().slice(0, 2) : undefined,
    veredito: f.veredito || undefined,
    de: dataDoFiltro(f.de, false),
    ate: dataDoFiltro(f.ate, true),
    pagina: Math.max(1, Math.trunc(pagina) || 1),
    porPagina,
  };
}

export function filtrosAtivos(f: FiltrosArquivo): number {
  return [f.busca.trim(), f.uf, f.veredito, f.de, f.ate].filter(Boolean).length;
}

export function totalPaginas(total: number, porPagina = POR_PAGINA_ARQUIVO): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / porPagina));
}
