// ÚNICO arquivo que simula clique — e só numa LINHA DA LISTA DE CONVERSAS, para abrir o chat.
//
// Abrir uma conversa não envia nada. Clique no botão de enviar, Enter ou qualquer evento de
// teclado são proibidos em toda a extensão (tests/sem-envio-automatico.test.ts falha se
// aparecerem). O envio é sempre do usuário.

/**
 * Abre a conversa de uma linha da lista: pointer + mouse (down → up → click) no elemento que está no
 * centro da linha. O WhatsApp de 10/2026 (inclusive o Business) não abre a conversa com eventos só na
 * linha externa nem só com MouseEvent; o alvo tem de ser o elemento de dentro, como num clique real.
 */
export function abrirLinhaDaLista(linha: HTMLElement): void {
  const r = linha.getBoundingClientRect();
  const base: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  };
  const noCentro = document.elementFromPoint(base.clientX ?? 0, base.clientY ?? 0);
  const alvo = noCentro instanceof HTMLElement && linha.contains(noCentro) ? noCentro : linha;
  const ponteiro: PointerEventInit = { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  const temPointer = typeof PointerEvent === 'function';
  if (temPointer) alvo.dispatchEvent(new PointerEvent('pointerdown', ponteiro));
  alvo.dispatchEvent(new MouseEvent('mousedown', base));
  if (temPointer) alvo.dispatchEvent(new PointerEvent('pointerup', ponteiro));
  alvo.dispatchEvent(new MouseEvent('mouseup', base));
  alvo.dispatchEvent(new MouseEvent('click', base));
}
