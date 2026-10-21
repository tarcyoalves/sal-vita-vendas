// Pequenas utilidades de interface: criar elementos, ícones SVG próprios e o host em Shadow DOM.
//
// Toda a UI do CRM vive em Shadow DOM: o CSS do WhatsApp não entra e o nosso não vaza.
// Nada aqui dispara evento sintético — só escuta (addEventListener).

import { existeAlgum } from '../selectors';
import { ESTILO } from './estilo';

type Valor = string | number | boolean | null | undefined | ((e: Event) => void);
type Filho = Node | string | null | false | undefined | Filho[];

/** Cria um elemento. Atributos `onX` viram ouvintes; `value` é propriedade; o resto é atributo. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, Valor> = {}, ...filhos: Filho[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (k === 'value') (el as unknown as HTMLInputElement).value = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const f of (filhos as unknown[]).flat(Infinity) as Array<Node | string | null | false | undefined>) {
    if (f == null || f === false) continue;
    el.append(typeof f === 'string' ? document.createTextNode(f) : f);
  }
  return el;
}

// Ícones simples (traço), desenhados para este projeto. viewBox 24x24.
const ICONES = {
  sino: '<path d="M6 17h12l-1.5-2.5V10a4.5 4.5 0 0 0-9 0v4.5z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  etiqueta: '<path d="M3.5 12.5v-8h8l8 8-8 8z"/><path d="M8 8.5h.01"/>',
  pessoa: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5"/>',
  balao: '<path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  relogio: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>',
  seta: '<path d="M7 10l5 5 5-5"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
} as const;

export type NomeIcone = keyof typeof ICONES;

export function icone(nome: NomeIcone, tamanho = 18): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(tamanho));
  svg.setAttribute('height', String(tamanho));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONES[nome];
  return svg;
}

export interface Host {
  host: HTMLElement;
  raiz: ShadowRoot;
  /** Contêiner dentro do Shadow DOM, onde a UI é montada. */
  conteudo: HTMLElement;
}

export function criarHost(id: string): Host {
  const host = document.createElement('div');
  host.id = id;
  host.setAttribute('data-vita-zap', '');
  const raiz = host.attachShadow({ mode: 'open' });
  raiz.append(h('style', {}, ESTILO));
  const conteudo = h('div', { class: 'vz' });
  raiz.append(conteudo);
  sincronizarTema(host);
  return { host, raiz, conteudo };
}

/** Tema escuro do WhatsApp Web: classe "dark" no body/html; sem sinal, segue o sistema. */
export function temaEscuro(): boolean {
  if (existeAlgum(document, 'temaEscuro')) return true;
  if (document.body?.classList.contains('light')) return false;
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
  } catch {
    return false;
  }
}

export function sincronizarTema(host: HTMLElement): void {
  const esc = temaEscuro() ? 'escuro' : 'claro';
  if (host.getAttribute('data-tema') !== esc) host.setAttribute('data-tema', esc);
}

/** Impede que o clique de um botão nosso chegue ao WhatsApp (que abriria a conversa da linha). */
export function isolarCliques(el: HTMLElement): void {
  for (const tipo of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick', 'contextmenu']) {
    el.addEventListener(tipo, (e) => e.stopPropagation());
  }
}

const jaAvisou = new Set<string>();

/** console.warn uma única vez por motivo: a extensão degrada em silêncio, sem inundar o console. */
export function avisarUmaVez(chave: string, mensagem: string, detalhe?: unknown): void {
  if (jaAvisou.has(chave)) return;
  jaAvisou.add(chave);
  console.warn(`[Vita Zap] ${mensagem}`, detalhe ?? '');
}

export function limparAvisos(): void {
  jaAvisou.clear();
}
