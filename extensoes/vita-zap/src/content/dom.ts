// Utilidades de DOM do content script: esperar, escrever texto num campo e limpá-lo.
//
// Escrever texto NÃO envia nada: o envio do WhatsApp só acontece com Enter (do usuário) ou com o
// clique do envio automático opcional, que mora isolado em envio-humano.ts. Aqui não existe
// evento de teclado nem clique (ver tests/envio-isolado.test.ts).

export function esperar(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Espera `condicao()` devolver algo "verdadeiro", checando a cada `passoMs`. */
export async function esperarAte<T>(condicao: () => T | null | undefined | false, limiteMs: number, passoMs = 150): Promise<T | null> {
  const fim = Date.now() + limiteMs;
  for (;;) {
    const v = condicao();
    if (v) return v;
    if (Date.now() >= fim) return null;
    await esperar(passoMs);
  }
}

export function aleatorioEntre(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function ehInput(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

export function textoDoCampo(el: HTMLElement): string {
  return ehInput(el) ? el.value : (el.innerText ?? el.textContent ?? '');
}

const BLOCOS = new Set(['DIV', 'P', 'LI', 'PRE', 'BLOCKQUOTE']);

/**
 * Texto de um campo/mensagem COM emoji. O WhatsApp troca cada emoji por <img alt="😀"> (ou
 * data-plain-text), e `innerText`/`textContent` ignoram imagens: sem isto, qualquer texto com emoji
 * pareceria diferente do colado. <br> e blocos viram quebra de linha (a comparação colapsa espaços).
 */
export function textoComEmoji(el: Node): string {
  if (el.nodeType === 3 /* Node.TEXT_NODE */) return el.textContent ?? '';
  if (el.nodeType !== 1 /* Node.ELEMENT_NODE */) return '';
  const e = el as HTMLElement;
  if (e.tagName === 'IMG') return e.getAttribute('alt') || e.getAttribute('data-plain-text') || '';
  if (e.tagName === 'BR') return '\n';
  const plain = e.getAttribute('data-plain-text');
  if (plain && e.children.length === 0 && (e.textContent ?? '') === '') return plain;
  let saida = '';
  for (const filho of e.childNodes) {
    const t = textoComEmoji(filho);
    if (filho.nodeType === 1 && BLOCOS.has((filho as HTMLElement).tagName) && saida !== '' && !saida.endsWith('\n')) saida += '\n';
    saida += t;
  }
  return saida;
}

/** Texto da caixa de digitação/mensagem, emoji incluído (input/textarea: o valor). */
export function textoDoCampoComEmoji(el: HTMLElement): string {
  return ehInput(el) ? el.value : textoComEmoji(el);
}

function selecionarConteudo(el: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Substitui o conteúdo do campo por `texto` (input/textarea ou contenteditable). */
export function escreverNoCampo(el: HTMLElement, texto: string): void {
  el.focus();
  if (ehInput(el)) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, texto);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  // Editor do WhatsApp (contenteditable): o caminho que o próprio editor entende é o de
  // "inserir texto" na seleção — o mesmo de colar.
  selecionarConteudo(el);
  document.execCommand('insertText', false, texto);
  if (textoDoCampoComEmoji(el).trim() === '') {
    try {
      el.textContent = texto;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {}
  }
}

/** Acrescenta `texto` no FIM do que já está no campo (não apaga nada). */
export function acrescentarNoCampo(el: HTMLElement, texto: string): void {
  el.focus();
  if (ehInput(el)) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, el.value + texto);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  const sel = window.getSelection();
  if (sel) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false); // cursor no fim
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.execCommand('insertText', false, texto);
}

export function limparCampo(el: HTMLElement): void {
  el.focus();
  if (ehInput(el)) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  selecionarConteudo(el);
  document.execCommand('delete', false);
  document.execCommand('insertText', false, '');
  if (textoDoCampoComEmoji(el).trim() !== '') {
    try {
      el.textContent = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {}
  }
}

/** Primeiro ancestral com rolagem vertical. */
export function ancestralRolavel(el: HTMLElement | null): HTMLElement | null {
  let atual = el?.parentElement ?? null;
  while (atual && atual !== document.body) {
    const estilo = getComputedStyle(atual);
    if (/(auto|scroll)/.test(estilo.overflowY) && atual.scrollHeight > atual.clientHeight + 4) return atual;
    atual = atual.parentElement;
  }
  return null;
}

export function limparMarcas(s: string): string {
  return s.replace(/[‎‏‪-‮]/g, '').trim();
}
