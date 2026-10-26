// ÚNICO arquivo que simula clique: numa LINHA DA LISTA DE CONVERSAS (abrir o chat) e, só para ler o telefone,
// no nome do cabeçalho da conversa e no botão de fechar do painel "Dados do contato".
//
// Abrir uma conversa não envia nada. Clique no botão de enviar, Enter ou qualquer evento de
// teclado são proibidos em toda a extensão (tests/sem-envio-automatico.test.ts falha se
// aparecerem). O envio é sempre do usuário.

/**
 * Clique de pessoa (pointer + mouse: down → up → click) no elemento que está no centro de `base`. O WhatsApp de
 * 10/2026 (inclusive o Business) não reage a eventos só no elemento externo nem só a MouseEvent; o alvo tem de
 * ser o elemento de dentro, como num clique real.
 */
function cliqueComoPessoa(base: HTMLElement): void {
  const r = base.getBoundingClientRect();
  const evento: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  };
  const noCentro = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(evento.clientX ?? 0, evento.clientY ?? 0) : null;
  const alvo = noCentro instanceof HTMLElement && base.contains(noCentro) ? noCentro : base;
  const ponteiro: PointerEventInit = { ...evento, pointerId: 1, pointerType: 'mouse', isPrimary: true };
  const temPointer = typeof PointerEvent === 'function';
  if (temPointer) alvo.dispatchEvent(new PointerEvent('pointerdown', ponteiro));
  alvo.dispatchEvent(new MouseEvent('mousedown', evento));
  if (temPointer) alvo.dispatchEvent(new PointerEvent('pointerup', ponteiro));
  alvo.dispatchEvent(new MouseEvent('mouseup', evento));
  alvo.dispatchEvent(new MouseEvent('click', evento));
}

/** Abre a conversa de uma linha da lista de conversas (ou dos resultados da busca). */
export function abrirLinhaDaLista(linha: HTMLElement): void {
  cliqueComoPessoa(linha);
}

// Os dois cliques abaixo existem SÓ para ler o telefone no painel "Dados do contato" (leitura de dados).
// Não enviam nada. tests/sem-envio-automatico.test.ts trava a lista de funções que clicam neste arquivo.

/** Abre o painel "Dados do contato": clique no NOME do cabeçalho da conversa aberta. */
export function abrirPainelDadosDoContato(nomeNoCabecalho: HTMLElement): void {
  cliqueComoPessoa(nomeNoCabecalho);
}

/** Fecha o painel "Dados do contato": clique no botão de fechar DENTRO do painel. */
export function fecharPainelDadosDoContato(botaoFechar: HTMLElement): void {
  cliqueComoPessoa(botaoFechar);
}
