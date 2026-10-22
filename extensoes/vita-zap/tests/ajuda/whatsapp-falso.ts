// ⚠️ HTML SINTÉTICO que imita a estrutura esperada do WhatsApp Web (não é cópia do HTML real).
// Serve para provar que a lógica de injeção/filtro funciona; os seletores reais só são
// validados pelo checklist manual do README.

export interface LinhaFalsa {
  nome: string;
  data: string;
  previa: string;
  minha?: boolean;
  naoLidas?: number;
  grupo?: boolean;
}

export function htmlDaLinha(l: LinhaFalsa, y: number): string {
  const icone = l.minha ? '<span data-icon="msg-dblcheck"></span>' : '';
  const grupo = l.grupo ? '<span data-icon="default-group"></span>' : '';
  const selo = l.naoLidas ? `<span aria-label="${l.naoLidas} mensagens não lidas"><span>${l.naoLidas}</span></span>` : '';
  return `<div role="listitem" data-nome="${l.nome}" style="transform: translateY(${y}px)">
    ${grupo}
    <div><span dir="auto" title="${l.nome}">${l.nome}</span><div>${l.data}</div></div>
    <div>${icone}<span title="${l.previa}"><span>${l.previa}</span></span>${selo}</div>
  </div>`;
}

export function montarWhatsApp(linhas: LinhaFalsa[], abertaNome: string | null = null): void {
  document.body.className = '';
  document.body.innerHTML = `
  <div id="app">
    <div id="side">
      <header><span>Conversas</span></header>
      <div><input role="textbox" aria-label="Pesquisar ou começar uma nova conversa" value="" /></div>
      <div id="pane-side">
        <div id="lista">${linhas.map((l, i) => htmlDaLinha(l, i * 72)).join('')}</div>
      </div>
    </div>
    <div id="main">
      ${
        abertaNome
          ? `<header><span dir="auto" title="${abertaNome}">${abertaNome}</span></header>
             <div data-id="false_5584999990000@c.us_ABC"></div>
             <footer><div><div contenteditable="true" role="textbox"></div></div><div><button aria-label="Mensagem de voz"><span data-icon="ptt"></span></button></div></footer>`
          : ''
      }
    </div>
  </div>`;
}

/** Linhas que estão visíveis (sem display:none) na lista falsa. */
export function nomesVisiveis(): string[] {
  return [...document.querySelectorAll<HTMLElement>('#lista [role="listitem"]')].filter((el) => el.style.display !== 'none').map((el) => el.getAttribute('data-nome') ?? '');
}
