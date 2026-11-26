import { textoComEmoji } from './dom';

// Módulo do envio automático OPCIONAL (desligado por padrão; ativado a pedido do dono).
//
// É o ÚNICO lugar da extensão que clica no botão Enviar. Regras (testes em tests/envio-seguro.test.ts):
// 1. Janela de conferência: pausa de 2,2 s a 3,8 s depois de colar o texto (o atendente ainda pode intervir).
// 2. Reconferência imediatamente antes do clique (conversa, texto exato, caixa não vazia, sem aviso).
// 3. O botão só é procurado dentro de '#main footer', só com a caixa NÃO vazia (com a caixa vazia o botão
//    do mesmo lugar é o MICROFONE) e só por rótulo/ícone EXATO de "Enviar"/"Send" (0.7.64: nada de casamento por
//    pedaço do texto, lista negativa "programar/schedule/menu/..." e, se sobrar mais de um botão, NÃO clica).
//    Nada de adivinhar "o último botão à direita".
// 4. Sem confirmação não há sucesso: depois do clique o detector tem 20 s para ver a mensagem sair.
// 5. Não existe envio pelo teclado (Enter sintético): sem botão confiável, o envio é cancelado.

/** Prazo para o detector confirmar que a mensagem saiu depois do clique. */
export const PRAZO_CONFIRMACAO_MS = 20_000;

/** Sorteia a pausa da janela de conferência em ms. */
export function sortearPausaHumana(minMs = 2200, maxMs = 3800): number {
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

const ROTULOS_BOTAO = new Set(['enviar', 'send', 'enviar mensagem', 'send message', 'enviar mensagem de texto', 'send text message']);
const ICONES_BOTAO = new Set(['send', 'wds-ic-send-filled', 'wds-ic-send', 'send-light', 'send-dark', 'enviar']);

function ehRotuloEnviar(label: string): boolean {
  const l = label.trim().toLowerCase();
  if (ROTULOS_BOTAO.has(l)) return true;
  return /^(enviar|send)(\s+(mensagem|message|de texto|text message))?(\s*\(enter\))?$/i.test(l);
}
const ROTULO_MICROFONE = /voz|voice|microfone|microphone|\bmic\b|\bptt\b/i;
function ehMicrofone(el: HTMLElement): boolean {
  if (ROTULO_MICROFONE.test(el.getAttribute('aria-label') ?? '')) return true;
  if (el.querySelector('[data-icon="ptt"], [data-icon*="mic"]')) return true;
  for (const t of el.querySelectorAll('svg > title')) if (/^(wds-)?(ic-)?(ptt|mic|keyboard-voice)\b/i.test((t.textContent ?? '').trim())) return true;
  return false;
}

function botaoDe(el: Element): HTMLElement | null {
  return el.closest<HTMLElement>('button, [role="button"]');
}

/** Caixa de digitação do rodapé da conversa aberta. */
function caixaDoRodape(footer: Element): HTMLElement | null {
  return footer.querySelector<HTMLElement>('div[contenteditable="true"]');
}

/** Minúsculas, sem acento, espaços colapsados. */
function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lista NEGATIVA (0.7.64). O WhatsApp Web ganhou "Programar mensagem": um botão/ícone de programar no rodapé nunca pode
 * ser tomado por Enviar. Casamento por pedaço de propósito (só deixa o filtro MAIS rígido): programar/programada,
 * agendar/agendada, schedule(d), later, depois, clock/relógio, timer, alarm, calendar/calendário, menu, more/mais opções,
 * dropdown, chevron, down.
 */
const NEGATIVA = /programa|agenda|schedul|later|depois|clock|relogio|timer|alarm|calendar|calendario|menu|more|mais opcoes|dropdown|chevron|down/;

/** Rótulos/ícones/ids/títulos de um elemento (só ele, sem descendentes). Nunca o texto de mensagem. */
function marcasDoElemento(el: Element): string[] {
  const m: string[] = [];
  for (const a of ['aria-label', 'title', 'data-icon', 'data-testid']) {
    const v = el.getAttribute(a);
    if (v) m.push(v);
  }
  if (el.tagName.toLowerCase() === 'title' && el.parentElement?.tagName.toLowerCase() === 'svg') m.push(el.textContent ?? '');
  return m;
}

/** Marcas do botão, de todos os descendentes e (se o alvo é um descendente) dos ancestrais entre o alvo e o botão. */
function marcasDoBotao(botao: HTMLElement, alvo: Element | null = null): string[] {
  const m = marcasDoElemento(botao);
  for (const d of botao.querySelectorAll('*')) m.push(...marcasDoElemento(d));
  for (let a: Element | null = alvo; a && a !== botao && botao.contains(a); a = a.parentElement) m.push(...marcasDoElemento(a));
  const texto = (botao.textContent ?? '').trim();
  if (texto && texto.length <= 60) m.push(texto);
  return m;
}

/** Motivo (a marca) pelo qual o candidato cai na lista negativa, ou null. */
function motivoNegativo(botao: HTMLElement, alvo: Element | null = null): string | null {
  for (const marca of marcasDoBotao(botao, alvo)) {
    if (NEGATIVA.test(normalizar(marca))) return marca;
  }
  return null;
}

export interface DiagnosticoBotao {
  ariaLabel: string;
  title: string;
  dataIcon: string[];
  dataTestid: string[];
  svgTitle: string[];
  /** 'aceito' | 'microfone' | 'negativa:<marca>' | 'nao_parece_enviar' */
  situacao: string;
}

/** Descreve os botões do rodapé SEM conteúdo de mensagem: só rótulo, ícone, data-testid e título do svg. */
function descreverBotao(b: HTMLElement, situacao: string): DiagnosticoBotao {
  const todos = [b, ...Array.from(b.querySelectorAll<HTMLElement>('*'))];
  const vals = (attr: string) => todos.map((e) => e.getAttribute(attr) ?? '').filter(Boolean);
  return {
    ariaLabel: b.getAttribute('aria-label') ?? '',
    title: b.getAttribute('title') ?? '',
    dataIcon: vals('data-icon'),
    dataTestid: vals('data-testid'),
    svgTitle: Array.from(b.querySelectorAll('svg > title')).map((t) => (t.textContent ?? '').trim()),
    situacao,
  };
}

export interface AnaliseBotaoEnviar {
  /** O único botão Enviar aceito, ou null. */
  botao: HTMLElement | null;
  /** Mais de um botão distinto aceito (o WhatsApp mudou): não clicar. */
  ambiguo: boolean;
  /** Todos os botões do rodapé, para diagnóstico. */
  botoes: DiagnosticoBotao[];
}

/** Aceito só por igualdade exata (ícone do conjunto ICONES_BOTAO, rótulo de ehRotuloEnviar, data-testid de enviar). */
function analisarRodape(raiz: ParentNode): AnaliseBotaoEnviar {
  const footer = raiz.querySelector('#main footer');
  if (!footer) return { botao: null, ambiguo: false, botoes: [] };
  const caixa = caixaDoRodape(footer);
  const caixaPreenchida = !!caixa && textoComEmoji(caixa).trim() !== '';

  const brutos: Array<{ b: HTMLElement; alvo: Element }> = [];
  for (const el of footer.querySelectorAll<HTMLElement>('[data-testid="send"], [data-testid="compose-btn-send"]')) {
    brutos.push({ b: botaoDe(el) ?? el, alvo: el });
  }
  for (const el of footer.querySelectorAll<HTMLElement>('[aria-label]')) {
    if (ehRotuloEnviar(el.getAttribute('aria-label') ?? '')) brutos.push({ b: botaoDe(el) ?? el, alvo: el });
  }
  for (const ic of footer.querySelectorAll<HTMLElement>('[data-icon]')) {
    if (ICONES_BOTAO.has((ic.getAttribute('data-icon') ?? '').trim().toLowerCase())) {
      const b = botaoDe(ic);
      if (b) brutos.push({ b, alvo: ic });
    }
  }
  for (const t of footer.querySelectorAll('svg > title')) {
    if (ICONES_BOTAO.has((t.textContent ?? '').trim().toLowerCase())) {
      const b = botaoDe(t);
      if (b) brutos.push({ b, alvo: t });
    }
  }

  const aceitos: HTMLElement[] = [];
  const situacaoDe = new Map<HTMLElement, string>();
  for (const { b, alvo } of brutos) {
    if (!footer.contains(b)) continue;
    if (ehMicrofone(b)) {
      situacaoDe.set(b, 'microfone');
      continue;
    }
    const neg = motivoNegativo(b, alvo);
    if (neg !== null) {
      situacaoDe.set(b, `negativa:${neg}`);
      continue;
    }
    if (!aceitos.includes(b)) aceitos.push(b);
  }
  // Candidatos aninhados (um dentro do outro) são o mesmo botão: fica o mais interno.
  const distintos = aceitos.filter((a) => !aceitos.some((o) => o !== a && a.contains(o)));
  for (const a of distintos) situacaoDe.set(a, 'aceito');

  const botoes = Array.from(footer.querySelectorAll<HTMLElement>('button, [role="button"]')).map((b) =>
    descreverBotao(b, situacaoDe.get(b) ?? (ehMicrofone(b) ? 'microfone' : (motivoNegativo(b) ? `negativa:${motivoNegativo(b)}` : 'nao_parece_enviar'))),
  );
  if (!caixaPreenchida) return { botao: null, ambiguo: false, botoes };
  return { botao: distintos.length === 1 ? distintos[0] : null, ambiguo: distintos.length > 1, botoes };
}

/**
 * Localiza o botão Enviar. Só no rodapé da conversa aberta ('#main footer'), só se a caixa NÃO está vazia
 * (vazia, o botão ali é o microfone), só por rótulo ("Enviar"/"Send") ou ícone ("send"/"wds-ic-send-filled")
 * EXATOS e fora da lista negativa (programar/agendar/menu...). Nunca devolve o microfone. Sem candidato confiável,
 * ou com MAIS DE UM botão distinto aceito → null (o envio é cancelado).
 */
export function encontrarBotaoEnviar(raiz: ParentNode = document): HTMLElement | null {
  return analisarRodape(raiz).botao;
}

/** Linhas de diagnóstico dos botões do rodapé (rótulo, ícone, data-testid, título do svg). Sem conteúdo de mensagem. */
export function diagnosticarRodape(raiz: ParentNode = document): string[] {
  if (!raiz.querySelector('#main footer')) return ['Rodapé da conversa não encontrado (abra uma conversa).'];
  const a = analisarRodape(raiz);
  if (a.botoes.length === 0) return ['Nenhum botão no rodapé.'];
  return a.botoes.map((b, i) => {
    const partes = [`aria-label="${b.ariaLabel}"`, `title="${b.title}"`, `data-icon=[${b.dataIcon.join(',')}]`, `data-testid=[${b.dataTestid.join(',')}]`, `svg-title=[${b.svgTitle.join(',')}]`, `=> ${b.situacao}`];
    return `botão ${i + 1}: ${partes.join(' ')}`;
  });
}

/**
 * Simula um clique de mouse humano com coordenadas e tempo de pressão realista. `vetar` roda antes de qualquer
 * evento e de novo imediatamente antes do clique; se devolver um motivo, NÃO clica e devolve o motivo.
 */
export async function clicarBotaoEnviarHumano(botao: HTMLElement, vetar: () => string | null = () => null): Promise<string | null> {
  const veto0 = vetar();
  if (veto0) return veto0;
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

  // Pressão curta (30-60 ms, 0.7.64): nada que pareça toque longo. Nunca se dispara contextmenu.
  await new Promise((resolve) => setTimeout(resolve, 30 + Math.floor(Math.random() * 31)));

  // Reconferência IMEDIATAMENTE antes do clique: nada pode ter mudado nem o botão ter sumido.
  const veto = vetar();
  if (veto) return veto;
  if (!botao.isConnected) return 'o botão Enviar saiu da tela';

  if (temPointer) botao.dispatchEvent(new PointerEvent('pointerup', ponteiro));
  botao.dispatchEvent(new MouseEvent('mouseup', base));

  // Disparo ÚNICO de clique: tenta .click() nativo, ou MouseEvent click caso não funcione (nunca ambos)
  try {
    botao.click();
  } catch {
    botao.dispatchEvent(new MouseEvent('click', base));
  }
  return null;
}


/** Janela em que se vigia o diálogo de programar depois do clique. */
export const JANELA_PROGRAMAR_MS = 2_000;

const MOTIVO_PROGRAMAR = 'O WhatsApp abriu "Programar mensagem" em vez de enviar. Fechei sem programar e pausei: confira a conversa.';
const MOTIVO_PROGRAMAR_ABERTO = 'O WhatsApp abriu "Programar mensagem" em vez de enviar. Não consegui fechar com segurança e deixei aberto: feche sem programar e confira a conversa.';
const ROTULOS_FECHAR = new Set(['fechar', 'close', 'cancelar', 'cancel', 'x', 'close-refreshed', 'x-viewer', 'x-alt', 'wds-ic-close', 'wds-ic-cancel', 'cancel-refreshed']);
const NUNCA_FECHAR = /enviar|send|confirm|programar|agendar|schedul|salvar|save|^ok$|concluir|done|avancar|next/;

/** Diálogo/menu aberto cujo título/rótulo menciona programar/schedule. */
function acharDialogoProgramar(raiz: ParentNode): HTMLElement | null {
  const sel = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-animate-modal-popup], [data-testid*="modal"]';
  for (const d of raiz.querySelectorAll<HTMLElement>(sel)) {
    const rot = normalizar(`${d.getAttribute('aria-label') ?? ''} ${d.getAttribute('title') ?? ''}`);
    const cab = Array.from(d.querySelectorAll('h1,h2,h3,[role="heading"],[aria-label],svg > title')).map((e) => normalizar(e.getAttribute('aria-label') ?? e.textContent ?? ''));
    const txt = normalizar((d.textContent ?? '').slice(0, 300));
    if (/programar mensagem|schedule message|programa|schedul/.test(rot) || cab.some((c) => /programar|schedule/.test(c)) || /programar mensagem|schedule message/.test(txt)) return d;
  }
  return null;
}

/** Botão de fechar/cancelar do PRÓPRIO diálogo (nunca o verde de confirmar). Rótulo/ícone exato. */
function acharFechar(dialogo: HTMLElement): HTMLElement | null {
  for (const b of dialogo.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    const marcas = marcasDoBotao(b).map(normalizar);
    if (marcas.some((m) => NUNCA_FECHAR.test(m))) continue;
    const ic = Array.from(b.querySelectorAll('[data-icon], svg > title')).map((e) => normalizar(e.getAttribute('data-icon') ?? e.textContent ?? ''));
    const rot = normalizar(`${b.getAttribute('aria-label') ?? ''}`);
    const tit = normalizar(`${b.getAttribute('title') ?? ''}`);
    const txt = normalizar((b.textContent ?? '').trim());
    if (ROTULOS_FECHAR.has(rot) || ROTULOS_FECHAR.has(tit) || ic.some((i) => ROTULOS_FECHAR.has(i)) || ROTULOS_FECHAR.has(txt)) return b;
  }
  return null;
}

async function fecharDialogoProgramar(dialogo: HTMLElement): Promise<ResultadoEnvio> {
  const fechar = acharFechar(dialogo);
  if (!fechar) return { ok: false, codigo: 'abriu_programar', motivo: MOTIVO_PROGRAMAR_ABERTO, fechou: false };
  try {
    fechar.click();
  } catch {
    fechar.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (dialogo.isConnected && acharDialogoProgramar(document) === dialogo) return { ok: false, codigo: 'abriu_programar', motivo: MOTIVO_PROGRAMAR_ABERTO, fechou: false };
  return { ok: false, codigo: 'abriu_programar', motivo: MOTIVO_PROGRAMAR, fechou: true };
}

export type ResultadoEnvio =
  | { ok: true }
  | { ok: false; codigo: 'reconferencia_falhou' | 'botao_enviar_ausente' | 'envio_nao_confirmado' | 'abriu_programar'; motivo: string; fechou?: boolean };

export interface OpcoesEnvioHumano {
  /** Devolve o motivo do veto (não clicar) ou null se tudo confere. Roda antes de procurar o botão e de novo logo antes do clique. */
  reconferir: () => string | null;
  /** O detector viu a mensagem sair? Chamado em intervalos depois do clique. */
  confirmar: () => boolean;
  prazoConfirmacaoMs?: number;
  passoMs?: number;
}

/**
 * Executa um ÚNICO envio. `ok: true` SÓ depois que `confirmar()` viu a mensagem sair dentro do prazo.
 * Nunca clica duas vezes, nunca usa o teclado e nunca devolve sucesso sem confirmação.
 */
export async function enviarHumano(raiz: ParentNode = document, opcoes: OpcoesEnvioHumano): Promise<ResultadoEnvio> {
  const veto = opcoes.reconferir();
  if (veto) return { ok: false, codigo: 'reconferencia_falhou', motivo: veto };
  const analise = analisarRodape(raiz);
  if (analise.ambiguo) {
    // Diagnóstico (rótulos/ícones, sem texto de mensagem) no console da aba do WhatsApp.
    console.warn('[Vita Zap] Mais de um botão parecido com Enviar no rodapé:', diagnosticarRodape(raiz));
    return { ok: false, codigo: 'botao_enviar_ausente', motivo: 'Achei mais de um botão parecido com Enviar no rodapé (o WhatsApp mudou). Não cliquei em nada.' };
  }
  const botao = analise.botao;
  if (!botao) return { ok: false, codigo: 'botao_enviar_ausente', motivo: 'Não achei o botão Enviar no rodapé da conversa (com a caixa preenchida). Não cliquei em nada.' };
  const vetoDoClique = await clicarBotaoEnviarHumano(botao, opcoes.reconferir);
  if (vetoDoClique) return { ok: false, codigo: 'reconferencia_falhou', motivo: vetoDoClique };

  const prazo = opcoes.prazoConfirmacaoMs ?? PRAZO_CONFIRMACAO_MS;
  const passo = opcoes.passoMs ?? 250;
  const fim = Date.now() + prazo;

  // Rede de segurança: até 2 s depois do clique, um diálogo "Programar mensagem" NÃO é sucesso. Nunca se confirma nada nele.
  const fimVigia = Date.now() + JANELA_PROGRAMAR_MS;
  for (;;) {
    if (opcoes.confirmar()) return { ok: true };
    const dialogo = acharDialogoProgramar(raiz);
    if (dialogo) return await fecharDialogoProgramar(dialogo);
    if (Date.now() >= fimVigia || Date.now() >= fim) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  for (;;) {
    if (opcoes.confirmar()) return { ok: true };
    if (Date.now() >= fim) break;
    await new Promise((resolve) => setTimeout(resolve, passo));
  }
  return {
    ok: false,
    codigo: 'envio_nao_confirmado',
    motivo: `Cliquei em Enviar, mas não vi a mensagem sair em ${Math.round(prazo / 1000)} s. Ela PODE ter saído: confira a conversa.`,
  };
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
