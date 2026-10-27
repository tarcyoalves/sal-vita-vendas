// HTML SINTÉTICO, mas montado a partir do DOM REAL coletado em campo no WhatsApp Web (out/2026). Cada decisão de
// estrutura abaixo vem de uma observação do dono; o que NÃO foi observado está marcado como "suposição".
//
// Observado em campo:
// - Busca: `#side input[role="textbox"][data-tab="3"]`; o aria-label fica VAZIO quando há texto; com texto aparece
//   `button[aria-label="End icon button"]` (X) dentro de #side. Não há `type="text"` nem placeholder.
// - Lista: `#pane-side` com linhas `[role="row"]` virtualizadas por `translateY`; nome em `span[dir="auto"][title]`;
//   data "14:32" | "Ontem" | dia da semana | "17/09/2026"; ícones são `<svg><title>msg-dblcheck|msg-check|msg-time|
//   default-group</title></svg>`; prefixo "Você:"; contato não salvo = "+55 84 9xxxx-xxxx"; grupo: prévia "Fulano: texto".
// - Conversa: `#main header span[dir="auto"]` com o nome; mensagens em `#main [role="row"][data-virtualized]` com filho
//   `[data-testid="conv-msg-<ID>"]`; `data-id` só o hash (sem true_/false_ e sem JID); NÃO existem .message-in/.message-out;
//   texto em `.copyable-text[data-pre-plain-text="[07:37, 20/10/2026] Nome: "] span.selectable-text`; minhas mensagens têm
//   ícone de status (svg title) em `[data-testid="msg-meta"]`; mensagens de sistema não têm copyable-text.
// - Rodapé: `#main footer div[contenteditable="true"][role="textbox"]`; `button[aria-label="Enviar"]` com svg title
//   "wds-ic-send-filled" só COM texto (sem texto é o microfone).
//
// Suposições (não observadas): os cabeçalhos de seção da busca ("Contatos", "Mensagens"); em qual elemento fica o data-id
// (aqui: no filho conv-msg); o subtítulo do cabeçalho; o histórico carregar com atraso.

import { vi } from 'vitest';
import { instalarEventosDeMouseSeguros } from './whatsapp-envio-falso';

export type Icone = 'msg-dblcheck' | 'msg-check' | 'msg-time';

export interface ChatFalso {
  nome: string;
  /** Rótulo de data exatamente como a lista mostra. Ausente em contato da agenda (sem conversa). */
  data?: string;
  /** Ícone de status: a última mensagem é minha. */
  icone?: Icone;
  /** Prévia (texto). Se começar por "Você:" o prefixo vai num span próprio, como no WhatsApp. */
  previa?: string;
  grupo?: 'icone' | 'foto';
  /** Seção da busca em que aparece quando há termo: conversa (padrão), contato da agenda ou achado em mensagem. */
  secao?: 'conversas' | 'contatos' | 'mensagens';
  /** Mensagens da conversa aberta (padrão: derivadas da linha). */
  mensagens?: MensagemFalsa[];
  /** Subtítulo do cabeçalho da conversa. */
  subtitulo?: string;
}

export interface MensagemFalsa {
  id: string;
  texto: string;
  minha?: boolean;
  autor?: string;
  hora?: string;
  data?: string;
}

export interface WhatsAppWeb2026 {
  /** Tudo o que o código fez que NÃO deveria acontecer. Deve terminar vazio. */
  proibido: string[];
  eventos: string[];
  aberta(): string | null;
  textoDaCaixa(): string;
  buscaTexto(): string;
  linhasNoDom(): number;
  /** Quantas vezes a lista foi redesenhada por rolagem (prova a virtualização). */
  redesenhos(): number;
  mensagensNoDom(): number;
  /** O atendente aperta Enter: a mensagem da caixa vira uma mensagem minha (ícone de relógio) e a caixa esvazia. */
  enviarComoUsuario(): void;
  /** Textos das mensagens já no chat aberto (fora da caixa). */
  textosNoChat(): string[];
}

const ALTURA = 72;
const JANELA_PX = 640;

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const sem = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const svg = (titulo: string): string => `<svg viewBox="0 0 16 11" width="16" height="11"><title>${titulo}</title><path d="M0 0"/></svg>`;

/** Hash do WhatsApp (sem true_/false_ e sem JID), estável por nome+índice. */
function hash(nome: string, i: number): string {
  let h = 0;
  for (const c of `${nome}#${i}`) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `3EB0${h.toString(16).toUpperCase().padStart(8, '0')}${'B7F92F1CA'}`.slice(0, 22);
}

function mensagensPadrao(c: ChatFalso): MensagemFalsa[] {
  const minha = c.icone != null || /^voc[eê]:/i.test(c.previa ?? '');
  const txt = (c.previa ?? 'oi').replace(/^voc[eê]:\s*/i, '');
  if (c.grupo) {
    return [
      { id: hash(c.nome, 1), texto: 'Bom dia pessoal', autor: 'Ana', hora: '07:37', data: '20/10/2026' },
      { id: hash(c.nome, 2), texto: 'Tabela nova', autor: 'Pedro Souza', hora: '07:50', data: '20/10/2026' },
      { id: hash(c.nome, 3), texto: txt, minha, autor: minha ? undefined : 'Ana', hora: '08:10', data: '20/10/2026' },
    ];
  }
  const antigas: MensagemFalsa[] = [
    { id: hash(c.nome, 1), texto: 'Bom dia, preciso de sal', autor: c.nome, hora: '07:37', data: '20/10/2026' },
    { id: hash(c.nome, 2), texto: 'Claro, quantas toneladas?', minha: true, hora: '07:40', data: '20/10/2026' },
  ];
  return [...antigas, { id: hash(c.nome, 3), texto: txt, minha, autor: minha ? undefined : c.nome, hora: '08:10', data: '20/10/2026' }];
}

function htmlMensagem(m: MensagemFalsa): string {
  const quem = m.minha ? 'Atendente Sal Vita' : (m.autor ?? '');
  const pre = `[${m.hora ?? '07:37'}, ${m.data ?? '20/10/2026'}] ${quem}: `;
  const meta = m.minha
    ? `<div data-testid="msg-meta"><span>${m.hora ?? '07:37'}</span><span aria-hidden="true">${svg('msg-dblcheck')}</span></div>`
    : `<div data-testid="msg-meta"><span>${m.hora ?? '07:37'}</span></div>`;
  return `<div role="row" data-virtualized="false"><div data-testid="conv-msg-${m.id}" data-id="${m.id}" tabindex="-1"><div class="copyable-text" data-pre-plain-text="${esc(pre)}"><div><span class="selectable-text copyable-text" dir="ltr"><span>${esc(m.texto)}</span></span></div></div>${meta}</div></div>`;
}

/** Mensagem de sistema: sem copyable-text, sem data-id. */
const SISTEMA_HTML = [
  '<div role="row" data-virtualized="false"><div><span>Clique neste aviso para carregar mensagens mais antigas</span></div></div>',
  '<div role="row" data-virtualized="false"><div><span>Seu código de segurança mudou. Clique para saber mais.</span></div></div>',
];

export interface OpcoesWeb2026 {
  /** Atraso do histórico depois de abrir a conversa (ms). */
  atrasoHistorico?: number;
}

export function montarWhatsAppWeb2026(chats: ChatFalso[], op: OpcoesWeb2026 = {}): WhatsAppWeb2026 {
  instalarEventosDeMouseSeguros();
  document.documentElement.lang = 'pt-BR';
  document.body.className = '';
  document.body.innerHTML = `
  <div id="app"><div class="wrapper">
    <div id="side">
      <header><div role="button" aria-label="Nova conversa"><span>${svg('new-chat-outline')}</span></div></header>
      <div class="busca"><div class="lupa"></div><input role="textbox" data-tab="3" aria-label="Pesquisar ou começar uma nova conversa" /><div id="x-busca"></div></div>
      <div id="pane-side" style="overflow-y:auto"><div id="altura" style="position:relative"></div></div>
    </div>
    <div id="main-slot"></div>
  </div></div>`;

  const proibido: string[] = [];
  const eventos: string[] = [];
  for (const tipo of ['keydown', 'keyup', 'keypress']) document.addEventListener(tipo, () => proibido.push(`teclado:${tipo}`), true);
  window.addEventListener('beforeunload', () => proibido.push('recarregou'));

  const pane = document.getElementById('pane-side') as HTMLElement;
  const altura = document.getElementById('altura') as HTMLElement;
  const busca = document.querySelector<HTMLInputElement>('#side input[role="textbox"]')!;
  const slot = document.getElementById('main-slot') as HTMLElement;
  let aberta: string | null = null;
  let redesenhos = 0;
  let rolagem = 0;
  let linhasDaTela: Array<{ y: number; html: string; chat: ChatFalso | null }> = [];

  // ── Busca: aria-label vazio com texto + botão X ────────────────────────────
  const sincronizarBusca = (): void => {
    const tem = busca.value !== '';
    busca.setAttribute('aria-label', tem ? '' : 'Pesquisar ou começar uma nova conversa');
    document.getElementById('x-busca')!.innerHTML = tem ? `<button aria-label="End icon button"><span>${svg('x-alt')}</span></button>` : '';
  };

  // ── Lista virtualizada ─────────────────────────────────────────────────────
  const linhaChat = (c: ChatFalso): string => {
    const avatar = c.grupo === 'icone' ? `<span>${svg('default-group')}</span>` : c.grupo === 'foto' ? '<img src="blob:foto" alt="">' : `<span>${svg('default-user')}</span>`;
    const icone = c.icone ? `<span aria-hidden="true">${svg(c.icone)}</span>` : '';
    const voce = c.previa && /^voc[eê]:/i.test(c.previa);
    const prefixo = voce ? '<span>Você:</span> ' : '';
    const corpo = c.previa ? esc(c.previa.replace(/^voc[eê]:\s*/i, '')) : '';
    const data = c.data ? `<div class="data">${esc(c.data)}</div>` : '';
    const previa = c.previa ? `<div class="previa">${icone}${prefixo}<span dir="auto" title="${esc(corpo)}" class="x">${corpo}</span></div>` : '';
    return `<div role="gridcell"><div class="item"><div class="avatar">${avatar}</div><div class="texto"><div class="topo"><span dir="auto" title="${esc(c.nome)}" class="nome">${esc(c.nome)}</span>${data}</div>${previa}</div></div></div>`;
  };
  const linhaSecao = (t: string): string => `<div role="gridcell"><div><span>${t}</span></div></div>`;

  const montarResultados = (termo: string): Array<{ html: string; chat: ChatFalso | null }> => {
    if (termo.trim() === '') return chats.filter((c) => (c.secao ?? 'conversas') === 'conversas' && c.data).map((c) => ({ html: linhaChat(c), chat: c }));
    const t = sem(termo);
    const por = (s: NonNullable<ChatFalso['secao']>): ChatFalso[] => chats.filter((c) => (c.secao ?? 'conversas') === s);
    const saida: Array<{ html: string; chat: ChatFalso | null }> = [];
    for (const c of por('conversas')) if (sem(c.nome).includes(t)) saida.push({ html: linhaChat(c), chat: c });
    const agenda = por('contatos');
    if (agenda.length > 0) {
      saida.push({ html: linhaSecao('Contatos'), chat: null });
      for (const c of agenda) saida.push({ html: linhaChat(c), chat: c });
    }
    const achados = por('mensagens');
    if (achados.length > 0) {
      saida.push({ html: linhaSecao('Mensagens'), chat: null });
      for (const c of achados) saida.push({ html: linhaChat(c), chat: c });
    }
    return saida;
  };

  let resultados = montarResultados('');
  const desenhar = (): void => {
    redesenhos += 1;
    const topo = Math.max(0, Math.floor(rolagem / ALTURA) - 1);
    const fim = Math.ceil((rolagem + JANELA_PX) / ALTURA) + 1;
    linhasDaTela = [];
    resultados.forEach((r, i) => {
      if (i < topo || i > fim) return;
      linhasDaTela.push({ y: i * ALTURA, html: r.html, chat: r.chat });
    });
    altura.style.height = `${resultados.length * ALTURA}px`;
    altura.replaceChildren();
    for (const l of linhasDaTela) {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      row.style.cssText = `position:absolute;left:0;right:0;height:${ALTURA}px;transform:translateY(${l.y}px);`;
      row.innerHTML = l.html;
      const chat = l.chat;
      if (chat) row.addEventListener('click', () => abrir(chat));
      altura.append(row);
    }
  };

  // jsdom não tem layout: o painel é "rolável" por propriedades próprias.
  Object.defineProperty(pane, 'clientHeight', { configurable: true, get: () => JANELA_PX });
  Object.defineProperty(pane, 'scrollHeight', { configurable: true, get: () => resultados.length * ALTURA });
  Object.defineProperty(pane, 'scrollTop', {
    configurable: true,
    get: () => rolagem,
    set: (v: number) => {
      const novo = Math.max(0, Math.min(v, Math.max(0, resultados.length * ALTURA - JANELA_PX)));
      if (novo === rolagem) return;
      rolagem = novo;
      setTimeout(desenhar, 120); // o WhatsApp redesenha depois do evento de rolagem, não na hora
    },
  });

  busca.addEventListener('input', () => {
    sincronizarBusca();
    resultados = montarResultados(busca.value);
    rolagem = 0;
    setTimeout(desenhar, 200);
  });
  document.getElementById('x-busca')!.addEventListener('click', () => {
    busca.value = '';
    busca.dispatchEvent(new Event('input', { bubbles: true }));
  });
  sincronizarBusca();
  desenhar();

  // ── Conversa aberta ────────────────────────────────────────────────────────
  const caixa = (): HTMLElement | null => slot.querySelector<HTMLElement>('#main footer div[contenteditable="true"][role="textbox"]');
  const textoDaCaixa = (): string => caixa()?.textContent ?? '';
  const atualizarBotao = (): void => {
    const lado = slot.querySelector('#botao-lado');
    if (!lado) return;
    lado.innerHTML =
      textoDaCaixa().trim() === ''
        ? `<button aria-label="Mensagem de voz" data-k="mic"><span>${svg('ptt')}</span></button>`
        : `<button aria-label="Enviar" data-k="enviar"><span>${svg('wds-ic-send-filled')}</span></button>`;
  };

  (document as unknown as { execCommand: unknown }).execCommand = (cmd: string, _ui: boolean, valor?: string) => {
    const el = caixa();
    if (!el) return false;
    if (cmd === 'insertText') {
      el.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'selectable-text copyable-text';
      p.textContent = valor ?? '';
      el.append(p);
    }
    if (cmd === 'delete') el.innerHTML = '';
    atualizarBotao();
    return true;
  };

  function abrir(c: ChatFalso): void {
    aberta = c.nome;
    eventos.push(`abriu:${c.nome}`);
    const sub = c.subtitulo ?? (c.grupo ? 'Ana, Pedro Souza, Você' : 'online');
    const icone = c.grupo === 'icone' ? `<span>${svg('default-group')}</span>` : '';
    slot.innerHTML = `<div id="main"><header><div role="button">${icone}</div><div role="button"><div><span dir="auto" class="nome-cab">${esc(c.nome)}</span></div><div><span dir="auto" class="sub">${esc(sub)}</span></div></div></header>
      <div class="painel-msgs"><div id="conversa" role="application"></div></div>
      <footer><div><div contenteditable="true" role="textbox" data-tab="10" aria-label="Digite uma mensagem"></div></div><div id="botao-lado"></div></footer></div>`;
    atualizarBotao();
    slot.querySelector('footer')!.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('button');
      if (b) proibido.push(`clicou-botao-rodape:${b.getAttribute('aria-label')}`);
    });
    const msgs = c.mensagens ?? mensagensPadrao(c);
    const carregar = (): void => {
      if (aberta !== c.nome) return;
      const conv = slot.querySelector('#conversa');
      if (conv) conv.innerHTML = SISTEMA_HTML.join('') + msgs.map(htmlMensagem).join('');
    };
    setTimeout(carregar, op.atrasoHistorico ?? 400);
  }

  let enviadas = 0;
  const enviarComoUsuario = (): void => {
    const texto = textoDaCaixa().trim();
    if (texto === '') return;
    enviadas += 1;
    const m: MensagemFalsa = { id: hash('enviada', enviadas), texto, minha: true, hora: '15:01', data: '27/10/2026' };
    slot.querySelector('#conversa')!.insertAdjacentHTML('beforeend', htmlMensagem(m).replace('msg-dblcheck', 'msg-time'));
    const c = caixa();
    if (c) c.innerHTML = '';
    atualizarBotao();
  };

  return {
    enviarComoUsuario,
    textosNoChat: () => [...slot.querySelectorAll('[data-testid^="conv-msg-"] .selectable-text')].map((x) => x.textContent ?? ''),
    proibido,
    eventos,
    aberta: () => aberta,
    textoDaCaixa,
    buscaTexto: () => busca.value,
    linhasNoDom: () => altura.querySelectorAll('[role="row"]').length,
    redesenhos: () => redesenhos,
    mensagensNoDom: () => slot.querySelectorAll('[data-testid^="conv-msg-"]').length,
  };
}

/** Roda o relógio falso até a promessa terminar (a varredura e a abertura usam esperas reais de 0,6 a 5 s). */
export async function rodar<T>(promessa: Promise<T>, passoMs = 250, limiteMs = 120_000): Promise<T> {
  let pronto = false;
  let valor!: T;
  let erro: unknown = null;
  promessa.then(
    (v) => {
      valor = v;
      pronto = true;
    },
    (e: unknown) => {
      erro = e;
      pronto = true;
    },
  );
  for (let t = 0; !pronto && t < limiteMs; t += passoMs) await vi.advanceTimersByTimeAsync(passoMs);
  if (!pronto) throw new Error('a operação não terminou no tempo limite do relógio falso');
  if (erro) throw erro;
  return valor;
}
