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
  /**
   * 'novo' = WhatsApp Web atual: data-id é só o id da mensagem (sem true_/false_ nem JID),
   * a direção vem de .message-in/.message-out e o autor de data-pre-plain-text.
   * 'real' = WhatsApp Web de 20/10/2026 (coletado no console do dono): linhas '[role="row"]'
   * virtualizadas (data-virtualized), cada uma com um filho data-testid="conv-msg-<ID>" e SEM
   * data-id, SEM .message-in/.message-out; só as linhas renderizadas por completo têm
   * msg-container, selectable-text, msg-meta e .copyable-text[data-pre-plain-text]. A direção
   * só se deduz do autor. A busca é um <input role="textbox" data-tab="3" aria-label="">.
   * Padrão 'antigo' (data-id com JID).
   */
  formato?: 'antigo' | 'novo' | 'real';
  /** Formato novo: autores (data-pre-plain-text) das mensagens recebidas. Padrão: [nome]. */
  autores?: string[];
  /** Formato novo: ícone de grupo no cabeçalho da conversa aberta. */
  iconeGrupoNoCabecalho?: boolean;
  /** Formato novo: elemento com o nome do autor dentro da mensagem recebida. */
  autorEmElemento?: boolean;
  /** Formato novo: só mensagens suas (nenhuma recebida). */
  semRecebidas?: boolean;
  /** Formato real: quantas linhas iniciais ficam virtualizadas (só o conv-msg, sem texto nem autor). Padrão 2. */
  linhasVirtualizadas?: number;
  /** Formato real: nome que aparece como autor das mensagens enviadas pelo dono. Padrão "Tarcyo". */
  meuNome?: string;
}

export interface OpcoesFalso {
  /** Depois de abrir a conversa, o DOM mantém as mensagens da conversa anterior por tantos ms. */
  mensagensAntigasPorMs?: number;
  /** Quanto tempo depois de digitar na busca aparece uma segunda linha com este nome (homônimo tardio). */
  homonimoTardio?: { nome: string; aposMs: number };
  /**
   * Coluna da esquerda do WhatsApp de 20/10/2026: a busca é <input role="textbox" data-tab="3"
   * aria-label=""> (rótulo VAZIO) e o X de limpar é <button aria-label="End icon button">, que só
   * existe enquanto há texto; ao lado há o botão "Dados do perfil". Sem isto vale o layout antigo.
   */
  buscaSemRotulo?: boolean;
}

const EMOJI = /\p{Extended_Pictographic}/gu;

function html(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(EMOJI, (e) => `<img alt="${e}" data-plain-text="${e}">`);
}

export function montarWhatsAppFalso(contatos: ContatoFalso[], opcoes: OpcoesFalso = {}) {
  const colunaEsquerda = opcoes.buscaSemRotulo
    ? `<button type="button" aria-label="Dados do perfil" id="perfil"></button>
      <div><input role="textbox" data-tab="3" aria-label="" type="text" /></div>
      <button type="button" aria-label="End icon button" id="x-busca"></button>`
    : `<div><input role="textbox" aria-label="Pesquisar ou começar uma nova conversa" /></div>
      <button type="button" aria-label="Limpar pesquisa" id="x-busca"></button>`;
  document.body.innerHTML = `
    <div id="side">
      ${colunaEsquerda}
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
  const mostrarX = (): void => {
    // No layout novo o X só existe enquanto há texto na busca.
    if (!opcoes.buscaSemRotulo) return;
    if (busca.value === '') botaoX.remove();
    else if (!botaoX.isConnected) busca.parentElement?.after(botaoX);
  };
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
  const novo = (c: ContatoFalso | null) => c?.formato === 'novo';
  function msgNovaHtml(id: string, texto: string, direcao: 'in' | 'out', autor: string | null, comElementoAutor = false): string {
    const prePlain = autor == null ? '' : ` data-pre-plain-text="[10:00, 19/10/2026] ${autor}: "`;
    const elAutor = comElementoAutor && autor ? `<span data-testid="author">${autor}</span>` : '';
    return `<div data-id="${id}"><div class="message-${direcao}">${elAutor}<div class="copyable-text"${prePlain}><span class="selectable-text"><span>${html(texto)}</span></span></div></div></div>`;
  }
  const real = (c: ContatoFalso | null) => c?.formato === 'real';
  /** Linha do WhatsApp de 20/10/2026: sem data-id e sem in/out; virtualizada = só o id. */
  function msgRealHtml(id: string, texto: string | null, autor: string, comElementoAutor = false): string {
    if (texto == null) return `<div role="row" data-virtualized="true" class="x1n2onr6 xa0aww2"><div data-testid="conv-msg-${id}"></div></div>`;
    const elAutor = comElementoAutor ? `<span data-testid="author">${autor}</span>` : '';
    return `<div role="row" data-virtualized="false" class="x1n2onr6 xscbp6u"><div data-testid="conv-msg-${id}"><div data-testid="msg-container">${elAutor}<div class="copyable-text" data-pre-plain-text="[07:37, 20/10/2026] ${autor}: "><span class="selectable-text"><span>${html(texto)}</span></span></div><div data-testid="msg-meta"></div></div></div></div>`;
  }
  function msgHtml(id: string, texto: string, classe = ''): string {
    return `<div data-id="${id}" class="${classe}"><span class="selectable-text"><span>${html(texto)}</span></span></div>`;
  }
  function renderMensagens(c: ContatoFalso): void {
    if (!historico.has(c.jid)) {
      if (real(c)) {
        const sufixo = c.jid.replace(/\D/g, '');
        const virtualizadas = Array.from({ length: c.linhasVirtualizadas ?? 2 }, (_, i) => msgRealHtml(`3A0V${i}${sufixo}`, null, ''));
        const autores = c.autores ?? [c.nome];
        const recebidas = c.semRecebidas ? [] : [1, 2].map((i) => msgRealHtml(`3A00${i}${sufixo}`, `Mensagem ${i}`, autores[(i - 1) % autores.length], c.autorEmElemento));
        historico.set(c.jid, [...virtualizadas, ...recebidas]);
      } else if (novo(c)) {
        const autores = c.autores ?? [c.nome];
        const recebidas = c.semRecebidas ? [] : [1, 2].map((i) => msgNovaHtml(`3A00${i}${c.jid.replace(/\D/g, '')}`, `Mensagem ${i}`, 'in', autores[(i - 1) % autores.length], c.autorEmElemento));
        historico.set(c.jid, recebidas);
      } else {
        historico.set(c.jid, [1, 2].map((i) => msgHtml(`false_${c.jid}_M${i}`, `Mensagem ${i}`)));
      }
    }
    mensagens.innerHTML = (historico.get(c.jid) ?? []).join('');
  }

  function abrirConversa(c: ContatoFalso): void {
    const anterior = aberto;
    aberto = c;
    cabecalho.setAttribute('title', c.nome);
    cabecalho.textContent = c.nome;
    document.querySelector('#main header [data-icon]')?.remove();
    if (c.iconeGrupoNoCabecalho) document.querySelector('#main header')?.insertAdjacentHTML('beforeend', '<span data-icon="default-group"></span>');
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

  busca.addEventListener('input', () => {
    renderLista(busca.value);
    mostrarX();
  });
  botaoX.addEventListener('click', () => {
    cliques.push('limpar-busca');
    busca.value = '';
    renderLista('');
    mostrarX();
  });
  lista.addEventListener('click', (ev) => {
    const linha = (ev.target as HTMLElement).closest<HTMLElement>('[role="listitem"]');
    const c = contatos.find((x) => x.jid === linha?.getAttribute('data-jid') && x.nome === linha?.querySelector('span[title]')?.getAttribute('title'));
    cliques.push(`linha:${(ev.target as HTMLElement).tagName.toLowerCase()}`);
    if (c) abrirConversa(c);
  });
  renderLista('');
  mostrarX();

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
    idsDasMensagens: () =>
      [...mensagens.querySelectorAll('[data-id], [data-testid^="conv-msg-"]')].map((e) => e.getAttribute('data-id') ?? (e.getAttribute('data-testid') ?? '').replace('conv-msg-', '')),
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
      const id = comoClasse || novo(aberto) || real(aberto) ? `3EB0${contador}` : `true_${jid}_N${contador}`;
      const bloco = real(aberto)
        ? msgRealHtml(id, texto, aberto?.meuNome ?? 'Tarcyo')
        : novo(aberto)
          ? msgNovaHtml(id, texto, 'out', null)
          : msgHtml(id, texto, comoClasse ? 'message-out' : '');
      historico.set(jid, [...(historico.get(jid) ?? []), bloco]);
      mensagens.insertAdjacentHTML('beforeend', bloco);
    },
    trocarParaOutraConversa: (c: ContatoFalso) => abrirConversa(c),
  };
}
