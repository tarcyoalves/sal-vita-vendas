// Módulo de envio humano automático (ativado a pedido do dono).
//
// Simula o comportamento de um usuário real:
// 1. Pausa humana entre 2.2s e 3.8s após digitar (tempo de leitura e conferência).
// 2. Movimentação e clique do ponteiro com coordenadas realistas e tempo de pressão (80-160ms).
// 3. Fallback de Enter no campo se o clique no botão não esvaziar a caixa.

/** Sorteia uma pausa humana em ms. */
export function sortearPausaHumana(minMs = 2200, maxMs = 3800): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

/** Localiza o botão de enviar no rodapé do WhatsApp Web de forma resiliente. */
export function encontrarBotaoEnviar(raiz: ParentNode = document): HTMLElement | null {
  const footer = raiz.querySelector('#main footer') ?? raiz;

  // 1. Por aria-label ou data-tab
  const porAria = footer.querySelector<HTMLElement>(
    'button[aria-label*="nviar" i], button[aria-label*="end" i], button[data-tab="11"]',
  );
  if (porAria) return porAria;

  // 2. Por data-icon="send"
  const iconeSend = footer.querySelector<HTMLElement>('[data-icon="send"], [data-icon*="send"]');
  if (iconeSend) {
    return iconeSend.closest('button') ?? iconeSend;
  }

  // 3. Por <svg><title> contendo send ou enviar (ex.: wds-ic-send de 10/2026)
  for (const t of footer.querySelectorAll('svg > title')) {
    const txt = (t.textContent ?? '').trim().toLowerCase();
    if (txt.includes('send') || txt.includes('enviar')) {
      const btn = t.closest('button');
      if (btn) return btn;
      return (t.parentElement?.parentElement as HTMLElement) ?? null;
    }
  }

  // 4. Fallback estrutural: no rodapé do WhatsApp, o único botão à direita da caixa de texto é o Enviar
  const caixa = footer.querySelector('div[contenteditable="true"]');
  if (caixa) {
    const botoes = [...footer.querySelectorAll<HTMLElement>('button')];
    const botoesADireita = botoes.filter((b) => {
      const pos = b.compareDocumentPosition(caixa);
      return (pos & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
    });
    if (botoesADireita.length > 0) {
      return botoesADireita[botoesADireita.length - 1];
    }
  }

  return null;
}

/** Simula um clique de mouse humano com coordenadas e tempo de pressão realista. */
export async function clicarBotaoEnviarHumano(botao: HTMLElement): Promise<void> {
  const r = botao.getBoundingClientRect();
  const x = r.left + r.width * (0.35 + Math.random() * 0.3);
  const y = r.top + r.height * (0.35 + Math.random() * 0.3);

  const base: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    clientX: x,
    clientY: y,
    screenX: window.screenX + x,
    screenY: window.screenY + y,
  };

  const ponteiro: PointerEventInit = {
    ...base,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    width: 1,
    height: 1,
    pressure: 0.5,
  };

  const temPointer = typeof PointerEvent === 'function';
  if (temPointer) {
    botao.dispatchEvent(new PointerEvent('pointerover', ponteiro));
    botao.dispatchEvent(new PointerEvent('pointerenter', ponteiro));
    botao.dispatchEvent(new PointerEvent('pointermove', ponteiro));
  }
  botao.dispatchEvent(new MouseEvent('mouseover', base));
  botao.dispatchEvent(new MouseEvent('mousemove', base));

  if (temPointer) botao.dispatchEvent(new PointerEvent('pointerdown', ponteiro));
  botao.dispatchEvent(new MouseEvent('mousedown', { ...base, buttons: 1 }));

  // Tempo de pressão de um dedo humano real no botão
  await new Promise((resolve) => setTimeout(resolve, 80 + Math.floor(Math.random() * 80)));

  if (temPointer) botao.dispatchEvent(new PointerEvent('pointerup', ponteiro));
  botao.dispatchEvent(new MouseEvent('mouseup', base));

  // Disparo ÚNICO de clique: tenta .click() nativo, ou MouseEvent click caso não funcione (nunca ambos)
  try {
    botao.click();
  } catch {
    botao.dispatchEvent(new MouseEvent('click', base));
  }
}

/**
 * Executa um ÚNICO envio humano.
 * Encontra o botão de enviar e clica nele uma única vez.
 * Se o botão não existir no layout, envia pelo teclado na caixa.
 * Nunca dispara duas vezes.
 */
export async function enviarHumano(raiz: ParentNode = document): Promise<boolean> {
  const botao = encontrarBotaoEnviar(raiz);
  if (botao) {
    await clicarBotaoEnviarHumano(botao);
    return true;
  }
  const caixa = (raiz.querySelector('#main footer div[contenteditable="true"]') ??
    raiz.querySelector('div[contenteditable="true"]')) as HTMLElement | null;
  if (caixa) {
    enviarPeloTecladoHumano(caixa);
    return true;
  }
  return false;
}

/** Envia pressionando Enter na caixa de digitação caso o botão não reaja. */
export function enviarPeloTecladoHumano(caixa: HTMLElement): void {
  caixa.focus();
  const opcoes = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  caixa.dispatchEvent(new KeyboardEvent('keydown', opcoes));
  caixa.dispatchEvent(new KeyboardEvent('keypress', opcoes));
  caixa.dispatchEvent(new KeyboardEvent('keyup', opcoes));
}

/** Agenda o envio automático com pausa humana e devolve a função para cancelar. */
export function agendarEnvioHumano(aoDisparar: () => Promise<void> | void, minMs = 2200, maxMs = 3800): () => void {
  const delay = sortearPausaHumana(minMs, maxMs);
  const timer = setTimeout(() => {
    void aoDisparar();
  }, delay);

  return () => {
    clearTimeout(timer);
  };
}
