// Leitura (só leitura) de uma linha da lista de conversas. Sem efeitos colaterais.

import type { LinhaBruta } from '../shared/contatos';
import { previaTemPrefixoDeGrupo } from '../shared/avisos';
import { pareceRotuloData } from '../shared/datas';
import { normalizarTexto } from '../shared/nomes';
import { limparMarcas, textoDoNo } from './dom';
import { encontrar, SECOES_SEM_CONVERSA } from './selectors';

export type LeituraLinha =
  | { tipo: 'conversa'; linha: LinhaBruta }
  | { tipo: 'secaoSemConversa'; texto: string }
  | { tipo: 'ignorar' };

/** Deslocamento vertical da linha na lista virtualizada (style transform: translateY(Npx)). */
export function posicaoDaLinha(el: HTMLElement): number | null {
  let atual: HTMLElement | null = el;
  for (let i = 0; i < 4 && atual; i += 1) {
    const m = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(atual.style?.transform ?? '');
    if (m) return Number(m[1]);
    atual = atual.parentElement;
  }
  return null;
}

/** Primeiro "texto folha" da linha com cara de data/hora, fora do título. */
export function rotuloDataDaLinha(el: HTMLElement, titulo: HTMLElement): string | null {
  const todos = el.querySelectorAll<HTMLElement>('*');
  for (const f of todos) {
    if (f.children.length > 0) continue;
    if (titulo.contains(f) || f.contains(titulo)) continue;
    const texto = limparMarcas(f.textContent ?? '');
    if (texto && pareceRotuloData(texto)) return texto;
  }
  return null;
}

/**
 * Texto da prévia da última mensagem: tudo que sobra na linha depois de tirar o título e o
 * rótulo de data (peças de texto folha juntadas com espaço, na ordem do DOM).
 */
export function previaDaLinha(el: HTMLElement, titulo: HTMLElement, rotuloData: string | null): string {
  const pecas: string[] = [];
  for (const f of el.querySelectorAll<HTMLElement>('*')) {
    if (f.children.length > 0) continue; // só folhas
    if (titulo.contains(f) || f.contains(titulo)) continue;
    const texto = limparMarcas(textoDoNo(f)).trim();
    if (texto === '' || texto === rotuloData) continue;
    pecas.push(texto);
  }
  return pecas.join(' ');
}

export function lerLinha(el: HTMLElement): LeituraLinha {
  const titulo = encontrar(el, 'tituloLinha');
  if (!titulo) {
    const texto = normalizarTexto(limparMarcas(el.textContent ?? ''));
    if (SECOES_SEM_CONVERSA.includes(texto)) return { tipo: 'secaoSemConversa', texto };
    return { tipo: 'ignorar' };
  }
  const nome = limparMarcas(titulo.getAttribute('title') || titulo.textContent || '');
  if (nome === '') return { tipo: 'ignorar' };
  const rotuloData = rotuloDataDaLinha(el, titulo);
  return {
    tipo: 'conversa',
    linha: {
      nome,
      rotuloData,
      posicao: posicaoDaLinha(el),
      // Ícone de grupo OU prévia no formato "Fulano: texto" (quem falou por último).
      pareceGrupo: encontrar(el, 'iconeGrupo') != null || previaTemPrefixoDeGrupo(previaDaLinha(el, titulo, rotuloData)),
    },
  };
}

/**
 * Lê as linhas visíveis em ordem de posição. Linhas abaixo de um cabeçalho de seção sem
 * conversa ("Contatos", "Mensagens") são descartadas: lá não há conversa existente.
 */
export function lerConversasVisiveis(elementos: HTMLElement[]): {
  conversas: Array<{ el: HTMLElement; linha: LinhaBruta }>;
  achouSecaoSemConversa: boolean;
} {
  const lidas = elementos
    .map((el, ordem) => ({ el, leitura: lerLinha(el), pos: posicaoDaLinha(el), ordem }))
    // Sem posição (lista não virtualizada), vale a ordem do DOM.
    .sort((a, b) => (a.pos != null && b.pos != null ? a.pos - b.pos : a.ordem - b.ordem));
  const conversas: Array<{ el: HTMLElement; linha: LinhaBruta }> = [];
  let achouSecaoSemConversa = false;
  for (const { el, leitura } of lidas) {
    if (leitura.tipo === 'secaoSemConversa') {
      achouSecaoSemConversa = true;
      break; // tudo daqui para baixo: contatos sem conversa / mensagens
    }
    if (leitura.tipo === 'conversa') conversas.push({ el, linha: leitura.linha });
  }
  return { conversas, achouSecaoSemConversa };
}

export function lerLinhasVisiveis(elementos: HTMLElement[]): { linhas: LinhaBruta[]; achouSecaoSemConversa: boolean } {
  const r = lerConversasVisiveis(elementos);
  return { linhas: r.conversas.map((c) => c.linha), achouSecaoSemConversa: r.achouSecaoSemConversa };
}
