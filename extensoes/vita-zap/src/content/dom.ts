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

/** Último texto que a extensão escreveu e em qual campo (para não confundir com texto do usuário). */
let escritoPorNos: { el: HTMLElement; texto: string } | null = null;

function comparavel(t: string): string {
  return t.replace(/\s+/g, ' ').trim();
}

const BLOCOS = new Set(['DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3']);

/**
 * Texto de um nó percorrendo a árvore (não depende de innerText). Emoji do WhatsApp é uma
 * <img alt="😀" data-plain-text="😀">: sem ler o alt, um rascunho só com emoji pareceria vazio
 * e seria sobrescrito. <br> e blocos viram "\n".
 */
export function textoDoNo(raiz: Node): string {
  let saida = '';
  const visitar = (no: Node): void => {
    if (no.nodeType === Node.TEXT_NODE) {
      saida += no.nodeValue ?? '';
      return;
    }
    if (!(no instanceof HTMLElement)) return;
    if (no.tagName === 'IMG') {
      saida += no.getAttribute('alt') || no.getAttribute('data-plain-text') || '';
      return;
    }
    if (no.tagName === 'BR') {
      saida += '\n';
      return;
    }
    if (no.hasAttribute('data-plain-text') && no.children.length === 0 && !no.textContent) {
      saida += no.getAttribute('data-plain-text') ?? '';
      return;
    }
    for (const filho of no.childNodes) visitar(filho);
    if (no !== raiz && BLOCOS.has(no.tagName) && saida !== '' && !saida.endsWith('\n')) saida += '\n';
  };
  visitar(raiz);
  return saida;
}

export function textoDoCampo(el: HTMLElement): string {
  return ehInput(el) ? el.value : textoDoNo(el);
}

/** Sem nenhum caractere visível? (espaço, quebra e caracteres invisíveis não contam; emoji conta.) */
export function textoVazio(texto: string): boolean {
  return texto.replace(/[\s\u200b-\u200f\u2060\ufeff]/g, '') === '';
}

export function campoVazio(el: HTMLElement): boolean {
  return textoVazio(textoDoCampo(el));
}

/**
 * O foco do documento está num campo editável COM texto (o usuário digitando)? Aí não podemos
 * chamar focus() em outro campo — nem escrever, porque o execCommand age onde está o foco.
 */
export function usuarioDigitando(): boolean {
  const ativo = document.activeElement;
  if (!(ativo instanceof HTMLElement) || ativo === document.body) return false;
  const editavel = ehInput(ativo) ? ativo : ativo.closest<HTMLElement>('[contenteditable="true"], [contenteditable=""]');
  if (!editavel) return false;
  if (campoVazio(editavel)) return false;
  // Texto que nós mesmos escrevemos (ex.: o termo da busca) e que o usuário não mexeu.
  if (escritoPorNos && escritoPorNos.el === editavel && comparavel(textoDoCampo(editavel)) === escritoPorNos.texto) return false;
  return true;
}

/** Só leva o foco para `el` se isso não tira o foco de um campo com texto do usuário. */
function focarComSeguranca(el: HTMLElement): boolean {
  if (document.activeElement === el || el.contains(document.activeElement)) return true;
  if (usuarioDigitando()) return false;
  el.focus();
  return true;
}

function selecionarConteudo(el: HTMLElement): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Substitui o conteúdo do campo por `texto` (input/textarea ou contenteditable).
 * Devolve false (sem escrever nada) se o foco está num campo com texto do usuário.
 */
export function escreverNoCampo(el: HTMLElement, texto: string): boolean {
  if (!focarComSeguranca(el)) return false;
  if (ehInput(el)) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, texto);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    escritoPorNos = { el, texto: comparavel(texto) };
    return true;
  }
  // Editor do WhatsApp (contenteditable): o caminho que o próprio editor entende é o de
  // "inserir texto" na seleção — o mesmo de colar.
  selecionarConteudo(el);
  document.execCommand('insertText', false, texto);
  escritoPorNos = { el, texto: comparavel(texto) };
  return true;
}

/** Esvazia o campo. Devolve false (sem mexer) se o foco está num campo com texto do usuário. */
export function limparCampo(el: HTMLElement): boolean {
  if (!focarComSeguranca(el)) return false;
  if (ehInput(el)) {
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  selecionarConteudo(el);
  document.execCommand('delete', false);
  return true;
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
