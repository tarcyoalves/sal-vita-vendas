// Filtros PUROS do arquivo de análises de crédito (procedure `listar`). O router só traduz o resultado em SQL.
import { foldText, searchTerms } from '../../../shared/searchText';
import type { Veredito } from '../../../shared/credito';

export interface EntradaListagem {
  busca?: string;
  documento?: string;
  uf?: string;
  municipio?: string;
  veredito?: Veredito;
  de?: Date;
  ate?: Date;
  pagina: number;
  porPagina: number;
}

export interface FiltrosListagem {
  /** Cada termo (sem acento, minúsculo) deve aparecer na razão social OU no município. */
  termosTexto: string[];
  /** Trecho numérico: casa por prefixo/trecho do documento. */
  digitosBusca: string | null;
  documento: string | null;
  uf: string | null;
  municipioFold: string | null;
  veredito: Veredito | null;
  de: Date | null;
  ate: Date | null;
  limite: number;
  offset: number;
}

export const POR_PAGINA_MAX = 50;

export function montarFiltrosListagem(e: EntradaListagem): FiltrosListagem {
  const busca = (e.busca ?? '').trim();
  const digitos = busca.replace(/\D/g, '');
  // Busca puramente numérica (2+ dígitos, formatada ou não) procura no documento; o resto vira termos de texto.
  const numerica = digitos.length >= 2 && /^[\d.\-/\s]+$/.test(busca);
  const porPagina = Math.min(Math.max(Math.trunc(e.porPagina) || 20, 1), POR_PAGINA_MAX);
  const pagina = Math.max(Math.trunc(e.pagina) || 1, 1);
  const doc = (e.documento ?? '').replace(/\D/g, '');
  return {
    termosTexto: numerica ? [] : searchTerms(busca, 6),
    digitosBusca: numerica ? digitos : null,
    documento: doc || null,
    uf: e.uf?.trim() ? e.uf.trim().toUpperCase().slice(0, 2) : null,
    municipioFold: e.municipio?.trim() ? foldText(e.municipio.trim()) : null,
    veredito: e.veredito ?? null,
    de: e.de ?? null,
    ate: e.ate ?? null,
    limite: porPagina,
    offset: (pagina - 1) * porPagina,
  };
}
