// ÚNICO arquivo que simula clique — e só em DOIS lugares:
//   1. numa LINHA DA LISTA DE CONVERSAS, para abrir o chat (abrirLinhaDaLista);
//   2. no botão X do WhatsApp que LIMPA A BUSCA (limparBuscaPeloX).
//
// Abrir uma conversa ou limpar a busca não envia nada. Clique no botão de enviar, Enter ou
// qualquer evento de teclado são proibidos em toda a extensão
// (tests/sem-envio-automatico.test.ts falha se aparecerem). O envio é sempre do usuário.

function criarEventoMouse(tipo: 'mousedown' | 'mouseup' | 'click', base: MouseEventInit): MouseEvent {
  try {
    return new MouseEvent(tipo, { ...base, view: window });
  } catch {
    // Ambientes onde `window` não é um Window de verdade (jsdom nos testes): sem `view`.
    return new MouseEvent(tipo, base);
  }
}

function dispararCliqueEm(alvo: HTMLElement, x: number, y: number): void {
  const base: MouseEventInit = { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y };
  for (const tipo of ['mousedown', 'mouseup', 'click'] as const) {
    alvo.dispatchEvent(criarEventoMouse(tipo, base));
  }
}

/**
 * Abre a conversa de uma linha da lista (mousedown → mouseup → click). O evento vai no
 * elemento recebido — o TÍTULO da linha, que é onde o clique de uma pessoa cairia (o evento
 * sobe até a linha). Se o elemento for a própria linha, o alvo passa a ser o que está no
 * centro dela.
 */
export function abrirLinhaDaLista(elemento: HTMLElement): void {
  const r = elemento.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const noCentro = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  const alvo = noCentro instanceof HTMLElement && elemento.contains(noCentro) ? noCentro : elemento;
  dispararCliqueEm(alvo, x, y);
}

/** Clica no X que limpa a busca. O chamador já garantiu que `botao` é o X de limpar busca. */
export function limparBuscaPeloX(botao: HTMLElement): void {
  const r = botao.getBoundingClientRect();
  dispararCliqueEm(botao, r.left + r.width / 2, r.top + r.height / 2);
}
