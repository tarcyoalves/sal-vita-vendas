// Utilidades de DOM do content script: esperar, escrever texto num campo e limpá-lo.
//
// Escrever texto NÃO envia nada: o envio do WhatsApp só acontece com Enter/botão, que são
// sempre do usuário. Aqui não existe evento de teclado (ver tests/sem-envio-automatico.test.ts).

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
