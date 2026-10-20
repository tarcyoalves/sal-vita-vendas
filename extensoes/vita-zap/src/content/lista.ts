// Acesso à lista de conversas / resultados da busca (só leitura).

import { campoVazio, escreverNoCampo, esperar, limparCampo } from './dom';
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

/** O foco está num campo com texto do usuário: a extensão não mexe (nem muda o foco). */
export class ErroUsuarioDigitando extends Error {
  constructor() {
    super('O WhatsApp tem um campo com texto que você está digitando. Termine ou apague e tente de novo — a extensão não muda o foco enquanto você digita.');
  }
}

/**
 * Escreve na busca da lista de conversas e espera os resultados assentarem. Com termo vazio,
 * limpa a busca: primeiro pelo botão X do próprio WhatsApp (`limparPeloBotao`), e só se o
 * texto continuar lá, pelo campo.
 */
export async function buscar(termo: string, limparPeloBotao: (() => boolean) | null = null): Promise<void> {
  const caixa = exigir(encontrar(document, 'caixaBusca'), 'caixa de busca');
  if (termo.trim() === '') {
    if (!campoVazio(caixa)) {
      if (limparPeloBotao?.()) await esperar(300);
      if (!campoVazio(caixa) && !limparCampo(caixa)) throw new ErroUsuarioDigitando();
    }
  } else if (!escreverNoCampo(caixa, termo)) {
    throw new ErroUsuarioDigitando();
  }
  await esperar(1800);
}
