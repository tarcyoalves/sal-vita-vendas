// Leitura (só leitura) de uma linha da lista de conversas. Sem efeitos colaterais.

import type { LinhaBruta } from '../shared/contatos';
import { pareceRotuloData } from '../shared/datas';
import { normalizarTexto } from '../shared/nomes';
import { limparMarcas } from './dom';
import { chaveDaConversa, telefoneDoNome, type LeituraConversa } from '../shared/crm-regras';
import { encontrar, existeAlgum, SECOES_SEM_CONVERSA } from './selectors';

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

export function lerLinha(el: HTMLElement): LeituraLinha {
  const titulo = encontrar(el, 'tituloLinha');
  if (!titulo) {
    const texto = normalizarTexto(limparMarcas(el.textContent ?? ''));
    if (SECOES_SEM_CONVERSA.includes(texto)) return { tipo: 'secaoSemConversa', texto };
    return { tipo: 'ignorar' };
  }
  const nome = limparMarcas(titulo.getAttribute('title') || titulo.textContent || '');
  if (nome === '') return { tipo: 'ignorar' };
  return {
    tipo: 'conversa',
    linha: {
      nome,
      rotuloData: rotuloDataDaLinha(el, titulo),
      posicao: posicaoDaLinha(el),
      pareceGrupo: encontrar(el, 'iconeGrupo') != null,
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

// ── Leitura para o CRM (só leitura) ──────────────────────────────────────────

export interface LeituraCrm extends LeituraConversa {
  chave: string;
  /** A prévia mostra "digitando…"/"gravando áudio…": não é uma mensagem, não mexe no estado. */
  digitando: boolean;
}

function idDaLinha(el: HTMLElement): string {
  const dono = encontrar(el, 'idDaLinha');
  const direto = el.getAttribute('data-id');
  return (direto && direto.includes('@') ? direto : dono?.getAttribute('data-id')) ?? '';
}

/** Texto mais longo da linha que não é o nome, a data nem o selo de não lida: a prévia da última mensagem. */
function previaDaLinha(el: HTMLElement, titulo: HTMLElement, rotuloData: string | null, selo: HTMLElement | null): string {
  let melhor = '';
  for (const f of el.querySelectorAll<HTMLElement>('*')) {
    if (f.children.length > 0) continue;
    if (titulo.contains(f) || f.contains(titulo) || selo?.contains(f)) continue;
    const texto = limparMarcas(f.textContent ?? '');
    if (!texto || texto === rotuloData) continue;
    if (texto.length > melhor.length) melhor = texto;
  }
  return melhor.slice(0, 200);
}

/**
 * Lê uma linha da lista como conversa do CRM. Devolve null para o que não é conversa
 * (cabeçalho de seção, linha "Arquivadas", linha sem nome).
 */
export function lerLinhaCrm(el: HTMLElement): LeituraCrm | null {
  const titulo = encontrar(el, 'tituloLinha');
  if (!titulo) return null;
  if (existeAlgum(el, 'linhaArquivadas')) return null;
  const nome = limparMarcas(titulo.getAttribute('title') || titulo.textContent || '');
  if (nome === '') return null;
  const rotuloData = rotuloDataDaLinha(el, titulo);
  const selo = encontrar(el, 'seloNaoLida');
  const naoLida = selo != null;
  const digitos = selo ? /\d+/.exec(selo.textContent ?? '') : null;
  const naoLidas = naoLida ? Math.max(1, digitos ? Number(digitos[0]) : 1) : 0;
  const previa = previaDaLinha(el, titulo, rotuloData, selo);
  const id = idDaLinha(el);
  const telefoneDoId = /^(?:true_|false_)?(\d{8,15})@c\.us/.exec(id)?.[1];
  const grupo = encontrar(el, 'iconeGrupo') != null || /@g\.us/.test(id);
  const digitando = /^(digitando|gravando|typing|recording)/i.test(previa);
  return {
    chave: chaveDaConversa(nome),
    nome,
    telefone: telefoneDoId ?? telefoneDoNome(nome),
    rotuloData,
    previa,
    // Sem prévia não dá para saber; com prévia, o ícone de entrega só existe nas mensagens minhas.
    ultimaDeMim: naoLida ? false : previa === '' ? null : existeAlgum(el, 'iconeMinhaMensagem'),
    naoLida,
    naoLidas,
    grupo,
    digitando,
  };
}
