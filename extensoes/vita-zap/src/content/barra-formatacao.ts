// Barra de formatação NATIVA do WhatsApp (B, I, tachado, código, listas, citação) que aparece ao
// selecionar texto na caixa de mensagem: ela abre por cima do próprio texto e atrapalha copiar.
// Aqui ela só é deslocada para acima da caixa de digitação (abaixo não há espaço: a caixa encosta
// no fim da janela). Não clica, não digita, não envia nada.

const BOTAO_ITALICO = '[aria-label^="Itálico"], [aria-label^="Italic"], [title^="Itálico"], [title^="Italic"]';
const MARCA = 'data-vz-formatacao';
const FOLGA_PX = 6;

/** Primeiro ancestral posicionado (absolute/fixed) do botão: é a barra flutuante inteira. */
export function barraDoBotao(botao: Element, limite = 8): HTMLElement | null {
  let el: HTMLElement | null = botao.parentElement;
  for (let i = 0; el && i < limite; i++, el = el.parentElement) {
    const pos = getComputedStyle(el).position;
    if (pos === 'absolute' || pos === 'fixed') return el;
  }
  return null;
}

/** Quanto subir (px) para a barra terminar acima do topo da caixa. 0 = já não cobre a caixa. */
export function deslocamento(barra: DOMRect, caixa: DOMRect, folga = FOLGA_PX): number {
  const cobre = barra.bottom > caixa.top && barra.top < caixa.bottom;
  return cobre ? Math.ceil(barra.bottom - caixa.top + folga) : 0;
}

function ajustar(): void {
  const caixa = document.querySelector('#main footer');
  const botao = caixa?.ownerDocument.querySelector(BOTAO_ITALICO);
  if (!caixa || !botao) return;
  const barra = barraDoBotao(botao);
  if (!barra) return;
  barra.style.transform = '';
  const d = deslocamento(barra.getBoundingClientRect(), caixa.getBoundingClientRect());
  if (d > 0) barra.style.transform = `translateY(-${d}px)`;
  barra.setAttribute(MARCA, String(d));
}

export function iniciarBarraFormatacao(): void {
  let agendado = false;
  const agendar = (): void => {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(() => {
      agendado = false;
      try {
        ajustar();
      } catch {
        // seletor do WhatsApp mudou: deixa a barra onde estava
      }
    });
  };
  document.addEventListener('selectionchange', agendar);
  new MutationObserver(agendar).observe(document.body, { childList: true, subtree: true });
}
