// Proteção contra "contexto da extensão invalidado".
//
// Quando a extensão é recarregada/atualizada/desativada, o content script que já está na aba
// fica órfão: `chrome.runtime` (ou `chrome.runtime.id`) passa a ser indefinido e qualquer
// chamada lança `Cannot read properties of undefined`. Aqui: toda chamada a chrome.runtime.*
// passa por try/catch + checagem, e um vigia desliga tudo em silêncio quando o contexto morre.
// Nada daqui escreve no console da página.

import type { EventoConteudo } from '../shared/mensagens';

/** `chrome.runtime.id` só existe enquanto o contexto da extensão é válido. */
export function contextoValido(): boolean {
  try {
    return typeof chrome !== 'undefined' && chrome.runtime !== undefined && chrome.runtime !== null && !!chrome.runtime.id;
  } catch {
    return false;
  }
}

/** Id da extensão, ou null se o contexto morreu. */
export function idDaExtensao(): string | null {
  try {
    return contextoValido() ? chrome.runtime.id : null;
  } catch {
    return null;
  }
}

/**
 * Avisa o painel. Devolve false se o contexto está invalidado, se a chamada falhou ou se não há
 * painel ouvindo (fechado: o Chrome rejeita — ignorado). Nunca lança nem escreve no console.
 */
export async function emitirSeguro(evento: EventoConteudo, aoInvalidar?: () => void): Promise<boolean> {
  if (!contextoValido()) {
    aoInvalidar?.();
    return false;
  }
  try {
    await chrome.runtime.sendMessage(evento);
    return true;
  } catch {
    if (!contextoValido()) aoInvalidar?.();
    return false;
  }
}

export interface Vigia {
  parar: () => void;
}

/**
 * Confere periodicamente se o contexto continua válido. Na primeira vez que não estiver,
 * chama `aoInvalidar` uma única vez e para de conferir.
 */
export function iniciarVigiaDeContexto(aoInvalidar: () => void, intervaloMs = 3000): Vigia {
  let invalidou = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const parar = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const conferir = (): void => {
    if (contextoValido() || invalidou) return;
    invalidou = true;
    parar();
    try {
      aoInvalidar();
    } catch {
      // silêncio: a página não pode ganhar erro por causa de uma extensão morta
    }
  };
  timer = setInterval(conferir, intervaloMs);
  return { parar };
}
