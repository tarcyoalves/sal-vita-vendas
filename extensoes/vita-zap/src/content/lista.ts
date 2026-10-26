// Acesso à lista de conversas / resultados da busca (só leitura).

import { escreverNoCampo, esperar, limparCampo, textoDoCampo } from './dom';
import { encontrar, encontrarTodos } from './selectors';

export class ErroSeletor extends Error {
  constructor(public readonly qual: string) {
    super(`Não encontrei "${qual}" no WhatsApp Web. O layout pode ter mudado — a extensão parou por segurança. Confira se a lista de Conversas está aberta (ícone de conversas à esquerda) e dê F5; se continuar, avise o suporte.`);
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

/** Tempos (ms) da busca que espera o resultado "assentar". Exportado para os testes encurtarem. */
export const TEMPOS_BUSCA = { minimo: 600, passo: 250, estaveis: 2, limite: 4000 };

/**
 * Escreve na busca e espera os resultados estabilizarem: a assinatura da lista ficou igual em `estaveis` leituras
 * seguidas (depois do tempo mínimo) ou passou do limite. Devolve a assinatura final.
 */
export async function buscarEstabilizando(termo: string, assinatura: () => string): Promise<string> {
  const caixa = exigir(encontrar(document, 'caixaBusca'), 'caixa de busca');
  escreverNoCampo(caixa, termo);
  await esperar(TEMPOS_BUSCA.minimo);
  const fim = Date.now() + TEMPOS_BUSCA.limite;
  let ultima = assinatura();
  let iguais = 0;
  while (Date.now() < fim) {
    await esperar(TEMPOS_BUSCA.passo);
    const atual = assinatura();
    iguais = atual === ultima ? iguais + 1 : 0;
    ultima = atual;
    if (iguais >= TEMPOS_BUSCA.estaveis) break;
  }
  return ultima;
}
