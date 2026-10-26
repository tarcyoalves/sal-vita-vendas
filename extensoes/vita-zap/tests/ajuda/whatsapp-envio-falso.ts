// ⚠️ HTML SINTÉTICO (não é cópia do WhatsApp real): WhatsApp Web falso para testar o envio (abrirEColar, envio
// automático opcional, detector). Tem lista com busca (uma linha por contato), conversa com mensagens configuráveis,
// rodapé com caixa + botão Enviar e/ou microfone, e conta tudo o que o código fez (cliques, teclado).
//
// jsdom não tem execCommand: o stub imita "inserir texto"/"apagar" do editor e troca cada emoji por <img alt="😀">
// (como o WhatsApp faz), o que prova que a comparação do texto é "emoji-aware".

import { vi } from 'vitest';

export interface MsgFalsa {
  id: string;
  texto: string;
  minha?: boolean;
  /** Sinal de que a mensagem é MINHA (padrão 'icone'): ícone ✓✓ no msg-meta, classe message-out, prefixo true_ no id ou nenhum. */
  sinal?: 'icone' | 'classe' | 'trueId' | 'nenhum';
  /** Nome no data-pre-plain-text (mensagens recebidas). */
  autor?: string;
  /** Mostra o elemento de autor dentro da mensagem (só existe em grupo). */
  elementoDeAutor?: boolean;
}

export interface OpcoesConversaFalsa {
  nome: string;
  mensagens?: MsgFalsa[];
  /** Subtítulo do cabeçalho (ex.: "online" ou "Ana, Pedro, você"). */
  subtitulo?: string;
  iconeGrupoNoCabecalho?: boolean;
  iconeGrupoNaLinha?: boolean;
  /** 'enviar' (padrão): botão Enviar + microfone. 'so_microfone'. 'nenhum'. 'tender': só um botão cujo rótulo contém "end". */
  botao?: 'enviar' | 'so_microfone' | 'nenhum' | 'tender' | 'enviar_no_microfone';
  /** Se false, o clique no Enviar não faz nada (WhatsApp que não reage). */
  envia?: boolean;
  /** Texto que a caixa já tem ao abrir (rascunho do usuário). */
  rascunho?: string;
}

export interface EnvioFalso {
  cliques: { enviar: number; microfone: number; outros: number };
  teclado: number;
  caixa(): HTMLElement;
  main(): HTMLElement;
  textoDaCaixa(): string;
  adicionarMensagem(m: MsgFalsa): void;
  /** Simula o usuário digitando/alterando a caixa. */
  digitar(texto: string): void;
  /** Simula o usuário apertando Enter/Enviar na mão: manda o que está na caixa. */
  enviarComoUsuario(): void;
  abrirAviso(): void;
  trocarDeConversa(outroNome: string): void;
}

const EMOJI = /(\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*️?)/u;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Texto → HTML como o WhatsApp renderiza: emoji vira <img alt>, quebra de linha vira <br>. */
export function htmlDoTexto(texto: string): string {
  return texto
    .split('\n')
    .map((linha) =>
      linha
        .split(EMOJI)
        .map((p, i) => (i % 2 === 1 ? `<img alt="${p}" data-plain-text="${p}" src="x.png">` : esc(p)))
        .join(''),
    )
    .join('<br>');
}

function htmlMensagem(m: MsgFalsa): string {
  const sinal = m.minha ? (m.sinal ?? 'icone') : 'nenhum';
  const id = sinal === 'trueId' ? `true_${m.id}` : m.id;
  const classe = m.minha && sinal === 'classe' ? 'message-out' : m.minha ? '' : 'message-in';
  const meta = m.minha && sinal === 'icone' ? '<span data-testid="msg-meta"><span data-icon="msg-dblcheck"></span></span>' : '';
  const autorEl = m.elementoDeAutor ? `<span data-testid="author">${esc(m.autor ?? '')}</span>` : '';
  const pre = m.autor ? ` data-pre-plain-text="[10:30, 26/10/2026] ${esc(m.autor)}: "` : '';
  return `<div data-id="${esc(id)}" class="${classe}">${autorEl}<div class="copyable-text"${pre}><span class="selectable-text"><span dir="ltr">${htmlDoTexto(m.texto)}</span></span></div>${meta}</div>`;
}

/** jsdom: `view: window` recusa o window do vitest; nos testes os eventos de mouse/ponteiro ignoram o `view`. */
export function instalarEventosDeMouseSeguros(): void {
  const MouseEventReal = MouseEvent;
  vi.stubGlobal(
    'MouseEvent',
    class extends MouseEventReal {
      constructor(tipo: string, init?: MouseEventInit) {
        super(tipo, { ...init, view: null });
      }
    },
  );
  if (typeof PointerEvent === 'function') {
    const PointerEventReal = PointerEvent;
    vi.stubGlobal(
      'PointerEvent',
      class extends PointerEventReal {
        constructor(tipo: string, init?: PointerEventInit) {
          super(tipo, { ...init, view: null });
        }
      },
    );
  }
}

export function montarEnvioFalso(op: OpcoesConversaFalsa): EnvioFalso {
  instalarEventosDeMouseSeguros();

  document.body.className = '';
  document.body.innerHTML = `
  <div id="app">
    <div id="side">
      <header><span>Conversas</span></header>
      <div><input role="textbox" aria-label="Pesquisar ou começar uma nova conversa" value="" /></div>
      <div id="pane-side"><div id="lista"></div></div>
    </div>
    <div id="main"></div>
  </div>`;

  const cliques = { enviar: 0, microfone: 0, outros: 0 };
  const estado = { teclado: 0, nomeAtual: op.nome };
  for (const tipo of ['keydown', 'keyup', 'keypress']) document.addEventListener(tipo, () => (estado.teclado += 1), true);

  const lista = document.getElementById('lista')!;
  const main = document.getElementById('main')!;
  const busca = document.querySelector('input')!;
  let proximo = 1;

  const caixa = (): HTMLElement => main.querySelector<HTMLElement>('footer div[contenteditable="true"]')!;
  const textoDaCaixa = (): string => (caixa() as HTMLElement & { _texto?: string })._texto ?? '';

  (document as unknown as { execCommand: unknown }).execCommand = (cmd: string, _ui: boolean, valor?: string) => {
    const el = caixa();
    if (cmd === 'insertText') {
      const atual = (el as HTMLElement & { _texto?: string })._texto ?? '';
      const novo = atual + (valor ?? '');
      (el as HTMLElement & { _texto?: string })._texto = novo;
      el.innerHTML = htmlDoTexto(novo);
    }
    if (cmd === 'delete') {
      (el as HTMLElement & { _texto?: string })._texto = '';
      el.innerHTML = '';
    }
    return true;
  };

  const definirCaixa = (texto: string): void => {
    (caixa() as HTMLElement & { _texto?: string })._texto = texto;
    caixa().innerHTML = htmlDoTexto(texto);
  };

  const adicionarMensagem = (m: MsgFalsa): void => {
    main.querySelector('#conversa')!.insertAdjacentHTML('beforeend', htmlMensagem(m));
  };

  const enviarComoUsuario = (): void => {
    const texto = ((caixa() as HTMLElement & { _texto?: string })._texto ?? '').trim();
    if (texto === '') return;
    adicionarMensagem({ id: `ENV${proximo++}`, texto, minha: true });
    definirCaixa('');
  };

  const botoes = (): string => {
    const mic = '<button aria-label="Mensagem de voz" data-k="mic"><span data-icon="ptt"></span></button>';
    const enviar = '<button aria-label="Enviar" data-k="enviar"><span data-icon="send"></span></button>';
    const anexo = '<button aria-label="Anexar" data-k="outro"><span data-icon="plus"></span></button>';
    switch (op.botao ?? 'enviar') {
      case 'so_microfone':
        return anexo + mic;
      case 'nenhum':
        return anexo;
      case 'tender':
        return `${anexo}<button aria-label="Tender" data-k="outro">?</button>`;
      case 'enviar_no_microfone':
        return '<button aria-label="Enviar" data-k="mic"><span data-icon="ptt"></span></button>';
      default:
        return anexo + enviar + mic;
    }
  };

  const abrir = (nome: string): void => {
    estado.nomeAtual = nome;
    const sub = op.subtitulo ? `<div><span>${esc(op.subtitulo)}</span></div>` : '';
    const iconeG = op.iconeGrupoNoCabecalho ? '<span data-icon="default-group"></span>' : '';
    main.innerHTML = `<header>${iconeG}<div><span dir="auto" title="${esc(nome)}">${esc(nome)}</span></div>${sub}</header>
      <div id="conversa">${(op.mensagens ?? []).map(htmlMensagem).join('')}</div>
      <footer><div><div contenteditable="true" role="textbox"></div></div><div>${botoes()}</div></footer>`;
    if (op.rascunho) definirCaixa(op.rascunho);
    main.querySelector('footer')!.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('button');
      if (!b) return;
      const k = b.getAttribute('data-k');
      if (k === 'enviar' && op.envia !== false) {
        cliques.enviar += 1;
        enviarComoUsuario();
      } else if (k === 'enviar') cliques.enviar += 1;
      else if (k === 'mic') cliques.microfone += 1;
      else cliques.outros += 1;
    });
  };

  const linha = (nome: string): HTMLElement => {
    const el = document.createElement('div');
    el.setAttribute('role', 'listitem');
    el.style.transform = 'translateY(72px)';
    const grupo = op.iconeGrupoNaLinha ? '<span data-icon="default-group"></span>' : '';
    el.innerHTML = `${grupo}<div><span dir="auto" title="${esc(nome)}">${esc(nome)}</span><div>11:40</div></div><div><span title="prévia"><span>prévia</span></span></div>`;
    el.addEventListener('click', () => abrir(nome));
    return el;
  };
  busca.addEventListener('input', () => {
    lista.replaceChildren();
    if (busca.value.trim() !== '') lista.append(linha(op.nome));
  });

  return {
    cliques,
    get teclado() {
      return estado.teclado;
    },
    caixa,
    main: () => main,
    textoDaCaixa,
    adicionarMensagem,
    digitar: (texto) => definirCaixa(texto),
    enviarComoUsuario,
    abrirAviso: () => {
      document.body.insertAdjacentHTML('beforeend', '<div role="dialog" id="aviso">Não foi possível enviar</div>');
    },
    trocarDeConversa: (outro) => abrir(outro),
  } as EnvioFalso;
}
