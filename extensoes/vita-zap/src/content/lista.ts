// Acesso à lista de conversas / resultados da busca (só leitura).

import { escreverNoCampo, esperar, limparCampo, textoDoCampo } from './dom';
import { encontrar, encontrarTodos } from './selectors';

export class ErroSeletor extends Error {
  constructor(public readonly qual: string) {
    super(`Não encontrei "${qual}" no WhatsApp Web. O layout pode ter mudado — a extensão parou por segurança.`);
  }
}

export function exigir<T>(v: T | null | undefined, qual: string): T {
  if (v == null) throw new ErroSeletor(qual);
  return v;
}

/** Linhas da lista (ou dos resultados da busca) presentes no DOM agora. */
export function linhasDaLista(): HTMLElement[] {
  const raiz = encontrar(document, 'colunaEsquerda') ?? encontrar(document, 'painelLateral');
  return raiz ? encontrarTodos(raiz, 'linhaConversa') : [];
}

/** Escreve na busca da lista de conversas e espera os resultados assentarem. */
export async function buscar(termo: string): Promise<void> {
  const caixa = exigir(encontrar(document, 'caixaBusca'), 'caixa de busca');
  if (termo.trim() === '') {
    if (textoDoCampo(caixa).trim() !== '') limparCampo(caixa);
  } else {
    escreverNoCampo(caixa, termo);
  }
  await esperar(1800);
}
