// ÚNICO arquivo que simula clique — e só numa LINHA DA LISTA DE CONVERSAS, para abrir o chat.
//
// Abrir uma conversa não envia nada. Clique no botão de enviar, Enter ou qualquer evento de
// teclado são proibidos em toda a extensão (tests/sem-envio-automatico.test.ts falha se
// aparecerem). O envio é sempre do usuário.

/** Abre a conversa de uma linha da lista (mousedown → mouseup → click no centro da linha). */
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
  for (const tipo of ['mousedown', 'mouseup', 'click'] as const) {
    linha.dispatchEvent(new MouseEvent(tipo, base));
  }
}
