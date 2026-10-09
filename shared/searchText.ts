// Busca sem acento e sem diferença de maiúsculas: "Laticínio" = "laticinio" = "LATICÍNIO".
// Usado pelo filtro de Tarefas (cliente) e pela busca nas observações (servidor).

/** Minúsculas e sem acentos/cedilha. */
export function foldText(s: string | null | undefined): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Termos de uma busca: separados por espaço, sem acento, sem vazios, sem repetidos. */
export function searchTerms(q: string, max = 6): string[] {
  const out: string[] = [];
  for (const t of foldText(q).split(/\s+/)) {
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/** Mesmas letras do SQL `translate` abaixo (mantenha as duas listas com o mesmo tamanho). */
export const SQL_ACENTOS = 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
export const SQL_SEM_ACENTOS = 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN';
