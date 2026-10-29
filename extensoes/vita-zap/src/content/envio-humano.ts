import { textoComEmoji } from './dom';

// Módulo do envio automático OPCIONAL (desligado por padrão; ativado a pedido do dono).
//
// É o ÚNICO lugar da extensão que clica no botão Enviar. Regras (testes em tests/envio-seguro.test.ts):
// 1. Janela de conferência: pausa de 2,2 s a 3,8 s depois de colar o texto (o atendente ainda pode intervir).
// 2. Reconferência imediatamente antes do clique (conversa, texto exato, caixa não vazia, sem aviso).
// 3. O botão só é procurado dentro de '#main footer', só com a caixa NÃO vazia (com a caixa vazia o botão
//    do mesmo lugar é o MICROFONE) e só por rótulo/ícone exato de "Enviar"/"Send". Nada de adivinhar
//    "o último botão à direita".
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

/**
 * Localiza o botão Enviar. Só no rodapé da conversa aberta ('#main footer'), só se a caixa NÃO está vazia
 * (vazia, o botão ali é o microfone) e só por rótulo ("Enviar"/"Send") ou ícone ("send"/"wds-ic-send-filled")
 * exatos. Nunca devolve o microfone. Sem candidato confiável → null (o envio é cancelado).
 */
export function encontrarBotaoEnviar(raiz: ParentNode = document): HTMLElement | null {
  const footer = raiz.querySelector('#main footer');
  if (!footer) return null;
  const caixa = caixaDoRodape(footer);
  if (!caixa || textoComEmoji(caixa).trim() === '') return null;

  const candidatos: HTMLElement[] = [];
  const sendTestId = footer.querySelector<HTMLElement>('[data-testid="send"], [data-testid="compose-btn-send"], [data-tab="11"]');
  if (sendTestId) {
    const b = botaoDe(sendTestId) ?? sendTestId;
    if (!ehMicrofone(b)) candidatos.push(b);
  }
  for (const b of footer.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    if (ehRotuloEnviar(b.getAttribute('aria-label') ?? '')) candidatos.push(b);
  }
  for (const el of footer.querySelectorAll<HTMLElement>('[aria-label]')) {
    if (ehRotuloEnviar(el.getAttribute('aria-label') ?? '')) {
      const b = botaoDe(el) ?? el;
      candidatos.push(b);
    }
  }
  for (const ic of footer.querySelectorAll<HTMLElement>('[data-icon]')) {
    const val = (ic.getAttribute('data-icon') ?? '').toLowerCase();
    if (ICONES_BOTAO.has(val) || val.includes('send')) {
      const b = botaoDe(ic);
      if (b) candidatos.push(b);
    }
  }
  for (const t of footer.querySelectorAll('svg > title')) {
    const val = (t.textContent ?? '').trim().toLowerCase();
    if (ICONES_BOTAO.has(val) || val.includes('send') || val.includes('enviar')) {
      const b = botaoDe(t);
      if (b) candidatos.push(b);
    }
  }
  return candidatos.find((b) => !ehMicrofone(b) && footer.contains(b)) ?? null;
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

  // Tempo de pressão de um dedo humano real no botão
  await new Promise((resolve) => setTimeout(resolve, 80 + Math.floor(Math.random() * 80)));

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

export type ResultadoEnvio =
  | { ok: true }
  | { ok: false; codigo: 'reconferencia_falhou' | 'botao_enviar_ausente' | 'envio_nao_confirmado'; motivo: string };

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
  const botao = encontrarBotaoEnviar(raiz);
  if (!botao) return { ok: false, codigo: 'botao_enviar_ausente', motivo: 'Não achei o botão Enviar no rodapé da conversa (com a caixa preenchida). Não cliquei em nada.' };
  const vetoDoClique = await clicarBotaoEnviarHumano(botao, opcoes.reconferir);
  if (vetoDoClique) return { ok: false, codigo: 'reconferencia_falhou', motivo: vetoDoClique };

  const prazo = opcoes.prazoConfirmacaoMs ?? PRAZO_CONFIRMACAO_MS;
  const passo = opcoes.passoMs ?? 250;
  const fim = Date.now() + prazo;
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
