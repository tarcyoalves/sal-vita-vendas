// Leitura (só leitura) de uma linha da lista de conversas. Sem efeitos colaterais.

import type { LinhaBruta } from '../shared/contatos';
import { pareceRotuloData } from '../shared/datas';
import { normalizarTexto } from '../shared/nomes';
import { limparMarcas } from './dom';
import { chaveDaConversa, telefoneDoNome, type LeituraConversa } from '../shared/crm-regras';
import { telefoneDoJid } from '../shared/telefone';
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

  // 1. Nós folha diretos (mais comum e preciso)
  for (const f of todos) {
    if (f.children.length > 0) continue;
    if (titulo.contains(f) || f.contains(titulo)) continue;
    const texto = limparMarcas(f.textContent ?? '');
    if (texto && pareceRotuloData(texto)) return texto;
  }

  // 2. Atributos title ou aria-label de elementos fora do título
  for (const f of todos) {
    if (titulo.contains(f) || f.contains(titulo)) continue;
    const aria = limparMarcas(f.getAttribute('aria-label') ?? '');
    if (aria && pareceRotuloData(aria)) return aria;
    const tit = limparMarcas(f.getAttribute('title') ?? '');
    if (tit && pareceRotuloData(tit)) return tit;
  }

  // 3. Nós de texto diretos de elementos com filhos (ex.: span com ícone/svg adjacente)
  for (const f of todos) {
    if (titulo.contains(f) || f.contains(titulo)) continue;
    for (const node of f.childNodes) {
      if (node.nodeType === 3 /* Node.TEXT_NODE */) {
        const txt = limparMarcas(node.textContent ?? '');
        if (txt && pareceRotuloData(txt)) return txt;
      }
    }
  }

  return null;
}

/**
 * A prévia da última mensagem da linha é minha? `true` com ícone de entrega/leitura/relógio (data-icon ou
 * <svg><title>, ver TITULOS_ICONE) ou com o prefixo "Você:"/"You:"; `false` com selo de não lida ou prévia sem
 * esses sinais; `null` sem prévia (contato da agenda, sem conversa).
 */
export function ultimaDeMimDaLinha(el: HTMLElement, titulo: HTMLElement): boolean | null {
  if (existeAlgum(el, 'iconeMinhaMensagem')) return true;
  for (const f of el.querySelectorAll<HTMLElement>('*')) {
    if (f.children.length > 0 || titulo.contains(f) || f.contains(titulo)) continue;
    if (/^(voc[eê]|you)\s*:/i.test(limparMarcas(f.textContent ?? ''))) return true;
  }
  if (encontrar(el, 'seloNaoLida')) return false;
  return previaDaLinha(el, titulo, rotuloDataDaLinha(el, titulo), null) === '' ? null : false;
}

/**
 * A linha da lista denuncia grupo/comunidade/transmissão? Ícone padrão (default-group/community/broadcast, em
 * data-icon ou no <title> do svg) OU id da conversa exposto pelo WhatsApp com @g.us/@broadcast/@newsletter.
 * Falso aqui NÃO prova conversa individual: quem decide isso é classificarConversa, ao abrir (sinal positivo).
 */
export function linhaPareceGrupo(el: HTMLElement): boolean {
  if (existeAlgum(el, 'iconeGrupo')) return true;
  return /@(g\.us|broadcast|newsletter)\b/.test(idDaLinha(el));
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
      pareceGrupo: linhaPareceGrupo(el),
      ultimaDeMim: ultimaDeMimDaLinha(el, titulo),
    },
  };
}

/**
 * Lê as linhas visíveis em ordem de posição. Linhas abaixo de um cabeçalho de seção sem
 * conversa ("Contatos", "Mensagens") são descartadas: lá não há conversa existente.
 */
export function lerConversasVisiveis(
  elementos: HTMLElement[],
  cortarEmSecaoSemConversa = true,
): {
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
      if (cortarEmSecaoSemConversa) break;
      continue;
    }
    if (leitura.tipo === 'conversa') conversas.push({ el, linha: leitura.linha });
  }
  return { conversas, achouSecaoSemConversa };
}

export function lerLinhasVisiveis(
  elementos: HTMLElement[],
  cortarEmSecaoSemConversa = true,
): { linhas: LinhaBruta[]; achouSecaoSemConversa: boolean } {
  const r = lerConversasVisiveis(elementos, cortarEmSecaoSemConversa);
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
  const telefoneDoId = telefoneDoJid(id);
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

// ── Resultados da busca (só leitura) ─────────────────────────────────────────

const SECOES_DE_MENSAGENS = ['mensagens', 'messages'];

/**
 * Linhas de CONVERSA ou CONTATO individual que a busca mostra, em ordem de posição. Para na seção
 * "Mensagens" (achados dentro de textos, não são contatos) e deixa de fora grupos.
 */
export function lerResultadosDaBusca(elementos: HTMLElement[]): Array<{ el: HTMLElement; linha: LinhaBruta }> {
  const lidas = elementos
    .map((el, ordem) => ({ el, leitura: lerLinha(el), pos: posicaoDaLinha(el), ordem }))
    .sort((a, b) => (a.pos != null && b.pos != null ? a.pos - b.pos : a.ordem - b.ordem));
  const saida: Array<{ el: HTMLElement; linha: LinhaBruta }> = [];
  for (const { el, leitura } of lidas) {
    if (leitura.tipo === 'secaoSemConversa') {
      if (SECOES_DE_MENSAGENS.includes(leitura.texto)) break;
      continue;
    }
    if (leitura.tipo === 'conversa' && !leitura.linha.pareceGrupo) saida.push({ el, linha: leitura.linha });
  }
  return saida;
}
