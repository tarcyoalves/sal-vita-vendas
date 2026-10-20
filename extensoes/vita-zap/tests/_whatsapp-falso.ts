// ⚠️ WhatsApp Web FALSO, escrito à mão (HTML sintético) só para exercitar a lógica do content
// script com jsdom. Não é uma cópia do HTML real: os seletores reais só se validam no checklist
// manual do README.

import { vi } from 'vitest';

export interface ContatoFalso {
  nome: string;
  jid: string;
  previa?: string;
  data?: string;
  grupoPeloIcone?: boolean;
}

export interface OpcoesFalso {
  /** Depois de abrir a conversa, o DOM mantém as mensagens da conversa anterior por tantos ms. */
  mensagensAntigasPorMs?: number;
  /** Quanto tempo depois de digitar na busca aparece uma segunda linha com este nome (homônimo tardio). */
  homonimoTardio?: { nome: string; aposMs: number };
}

const EMOJI = /\p{Extended_Pictographic}/gu;

function html(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(EMOJI, (e) => `<img alt="${e}" data-plain-text="${e}">`);
}

export function montarWhatsAppFalso(contatos: ContatoFalso[], opcoes: OpcoesFalso = {}) {
  document.body.innerHTML = `
    <div id="side">
      <div><input role="textbox" aria-label="Pesquisar ou começar uma nova conversa" /></div>
      <button type="button" aria-label="Limpar pesquisa" id="x-busca"></button>
      <div id="pane-side"><div id="lista"></div></div>
    </div>
    <div id="main">
      <header><span dir="auto" title=""></span></header>
      <div id="mensagens"></div>
      <footer><div contenteditable="true" role="textbox" tabindex="0" id="caixa"></div></footer>
    </div>`;

  const busca = document.querySelector<HTMLInputElement>('#side input') as HTMLInputElement;
  const lista = document.getElementById('lista') as HTMLElement;
  const cabecalho = document.querySelector<HTMLElement>('#main header span') as HTMLElement;
  const mensagens = document.getElementById('mensagens') as HTMLElement;
  const caixa = document.getElementById('caixa') as HTMLElement;
  const botaoX = document.getElementById('x-busca') as HTMLButtonElement;
  let aberto: ContatoFalso | null = null;
  let contador = 0;
  const cliques: string[] = [];

  // execCommand não existe no jsdom: imita o editor (substitui o conteúdo do campo com foco).
  document.execCommand = vi.fn((cmd: string, _ui?: boolean, valor?: string) => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el.getAttribute('contenteditable') !== 'true') return false;
    if (cmd === 'insertText') el.innerHTML = html(valor ?? '');
    else if (cmd === 'delete') el.innerHTML = '';
    return true;
  });

  const linhaHtml = (c: ContatoFalso, y: number) => `
    <div role="listitem" data-jid="${c.jid}" style="transform: translateY(${y}px)">
      <div><div><span dir="auto" title="${c.nome}">${c.nome}</span></div><div>${c.data ?? 'Ontem'}</div></div>
      <div><span title="${c.previa ?? 'Bom dia'}"><span>${c.previa ?? 'Bom dia'}</span></span>${c.grupoPeloIcone ? '<span data-icon="default-group"></span>' : ''}</div>
    </div>`;

  // Histórico por conversa: reabrir a conversa mostra o que já estava lá (inclusive o que o usuário enviou).
  const historico = new Map<string, string[]>();
  function msgHtml(id: string, texto: string, classe = ''): string {
    return `<div data-id="${id}" class="${classe}"><span class="selectable-text"><span>${html(texto)}</span></span></div>`;
  }
  function renderMensagens(c: ContatoFalso): void {
    if (!historico.has(c.jid)) historico.set(c.jid, [1, 2].map((i) => msgHtml(`false_${c.jid}_M${i}`, `Mensagem ${i}`)));
    mensagens.innerHTML = (historico.get(c.jid) ?? []).join('');
  }

  function abrirConversa(c: ContatoFalso): void {
    const anterior = aberto;
    aberto = c;
    cabecalho.setAttribute('title', c.nome);
    cabecalho.textContent = c.nome;
    if (opcoes.mensagensAntigasPorMs && anterior == null) {
      mensagens.innerHTML = `<div data-id="false_antigo@c.us_Z1"><span class="selectable-text"><span>antiga</span></span></div>`;
      setTimeout(() => aberto === c && renderMensagens(c), opcoes.mensagensAntigasPorMs);
      return;
    }
    renderMensagens(c);
  }

  function renderLista(termo: string): void {
    const t = termo.trim().toLowerCase();
    const achados = contatos.filter((c) => t === '' || c.nome.toLowerCase().includes(t));
    lista.innerHTML = achados.map((c, i) => linhaHtml(c, i * 72)).join('');
    const tardio = opcoes.homonimoTardio;
    if (tardio && t === tardio.nome.toLowerCase()) {
      setTimeout(() => {
        if (busca.value.trim().toLowerCase() !== t) return;
        lista.insertAdjacentHTML('beforeend', linhaHtml({ nome: tardio.nome, jid: 'outro@c.us' }, achados.length * 72));
      }, tardio.aposMs);
    }
  }

  busca.addEventListener('input', () => renderLista(busca.value));
  botaoX.addEventListener('click', () => {
    cliques.push('limpar-busca');
    busca.value = '';
    renderLista('');
  });
  lista.addEventListener('click', (ev) => {
    const linha = (ev.target as HTMLElement).closest<HTMLElement>('[role="listitem"]');
    const c = contatos.find((x) => x.jid === linha?.getAttribute('data-jid') && x.nome === linha?.querySelector('span[title]')?.getAttribute('title'));
    cliques.push(`linha:${(ev.target as HTMLElement).tagName.toLowerCase()}`);
    if (c) abrirConversa(c);
  });
  renderLista('');

  return {
    busca,
    caixa,
    mensagens,
    lista,
    botaoX,
    cliques,
    get aberto() {
      return aberto;
    },
    abrir: abrirConversa,
    idsDasMensagens: () => [...mensagens.querySelectorAll('[data-id]')].map((e) => e.getAttribute('data-id') ?? ''),
    /** O usuário escreve na caixa (rascunho dele). */
    digitar: (texto: string) => {
      caixa.focus();
      caixa.innerHTML = html(texto);
    },
    /** O usuário aperta Enter: a caixa esvazia e a mensagem aparece no chat como sua. */
    enviarComoUsuario: (texto: string, comoClasse = false) => {
      caixa.innerHTML = '';
      contador += 1;
      const jid = aberto?.jid ?? 'x@c.us';
      const id = comoClasse ? `3EB0${contador}` : `true_${jid}_N${contador}`;
      const bloco = msgHtml(id, texto, comoClasse ? 'message-out' : '');
      historico.set(jid, [...(historico.get(jid) ?? []), bloco]);
      mensagens.insertAdjacentHTML('beforeend', bloco);
    },
    trocarParaOutraConversa: (c: ContatoFalso) => abrirConversa(c),
  };
}
