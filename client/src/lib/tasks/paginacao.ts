/** Lista em pedaços: mostra `limite` itens por vez, com "Mostrar mais". A busca/filtro sempre vale sobre a lista inteira. */
export const PASSO_LISTA = 50;

export interface Pedaco<T> {
  visiveis: T[];
  mostrando: number;
  total: number;
  restante: number;
  temMais: boolean;
}

export function fatiarLista<T>(lista: readonly T[], limite: number): Pedaco<T> {
  const l = Number.isFinite(limite) ? Math.max(0, Math.floor(limite)) : PASSO_LISTA;
  const visiveis = lista.slice(0, l);
  return { visiveis, mostrando: visiveis.length, total: lista.length, restante: lista.length - visiveis.length, temMais: lista.length > visiveis.length };
}

export function proximoLimite(limite: number, passo = PASSO_LISTA): number {
  return Math.max(0, Math.floor(limite)) + passo;
}

/** Texto do contador: "Mostrando 50 de 3.120". */
export function textoContador(mostrando: number, total: number): string {
  return `Mostrando ${mostrando.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`;
}

/** Quantos itens o próximo clique em "Mostrar mais" revela. */
export function rotuloMostrarMais(restante: number, passo = PASSO_LISTA): string {
  return `Mostrar mais ${Math.min(restante, passo).toLocaleString('pt-BR')}`;
}

/**
 * Chave dos critérios da lista (busca, filtros, aba, ordem). Quando muda, o limite volta ao primeiro pedaço;
 * um refetch da mesma lista não muda a chave e não faz a rolagem "voltar".
 */
export function chaveCriterios(partes: ReadonlyArray<string | number | boolean | readonly string[] | null | undefined>): string {
  return JSON.stringify(partes);
}
