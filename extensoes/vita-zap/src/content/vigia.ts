// Vigia dos avisos do WhatsApp Web: telefone desconectado, banner de alerta/restrição, modal de
// falha e mensagem sua presa no relógio. Só LÊ a tela; quando acha algo, avisa o painel, que
// PAUSA a campanha. Nunca clica em nada.

import { ehTextoDeFalha, ehTextoDeRestricao } from '../shared/avisos';
import { ehMensagemSua } from './chat';
import { limparMarcas, textoDoNo } from './dom';
import { encontrar, encontrarTodos } from './selectors';

/** Mensagem sua com o relógio por mais que isto = não saiu. */
export const RELOGIO_LIMITE_MS = 60_000;
const INTERVALO_VIGIA_MS = 5000;

export interface EstadoVigia {
  /** data-id da mensagem com relógio → quando foi vista assim pela primeira vez. */
  relogios: Map<string, number>;
}

export function novoEstadoVigia(): EstadoVigia {
  return { relogios: new Map() };
}

function textoLimpo(el: HTMLElement): string {
  return limparMarcas(textoDoNo(el)).replace(/\s+/g, ' ').trim();
}

/** O aviso do WhatsApp visível agora (texto em português para o painel), ou null. */
export function lerAvisoWhatsApp(estado: EstadoVigia, agora: number): string | null {
  if (encontrar(document, 'avisoTelefone')) {
    return 'O WhatsApp avisou que o telefone está desconectado. Confira o celular e a internet.';
  }
  const banner = encontrar(document, 'avisoBanner');
  if (banner) {
    const t = textoLimpo(banner);
    if (t !== '') return `O WhatsApp mostrou um alerta: "${t.slice(0, 140)}"`;
  }
  for (const modal of encontrarTodos(document, 'modal')) {
    const t = textoLimpo(modal);
    if (ehTextoDeFalha(t)) return `O WhatsApp avisou que uma mensagem não saiu: "${t.slice(0, 140)}"`;
    if (ehTextoDeRestricao(t)) return `O WhatsApp mostrou um aviso de conta/conexão: "${t.slice(0, 140)}"`;
  }

  const vistos = new Set<string>();
  let presa = false;
  for (const msg of encontrarTodos(document, 'mensagem')) {
    if (!ehMensagemSua(msg) || !encontrar(msg, 'relogioPendente')) continue;
    const id = msg.getAttribute('data-id') ?? '';
    vistos.add(id);
    const desde = estado.relogios.get(id) ?? agora;
    estado.relogios.set(id, desde);
    if (agora - desde > RELOGIO_LIMITE_MS) presa = true;
  }
  for (const id of [...estado.relogios.keys()]) if (!vistos.has(id)) estado.relogios.delete(id);
  if (presa) return 'Uma mensagem sua está há mais de 1 minuto com o relógio (ainda não saiu). Confira a conexão do telefone.';
  return null;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function pararVigia(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Confere a tela a cada poucos segundos (até `pararVigia`); chama `aoAviso` quando surge um aviso novo. */
export function iniciarVigia(aoAviso: (texto: string) => void, intervaloMs = INTERVALO_VIGIA_MS): void {
  if (timer) return; // já vigiando (manter o estado dos relógios entre um contato e outro)
  const estado = novoEstadoVigia();
  let ultimo: string | null = null;
  timer = setInterval(() => {
    const aviso = lerAvisoWhatsApp(estado, Date.now());
    if (aviso && aviso !== ultimo) aoAviso(aviso);
    ultimo = aviso;
  }, intervaloMs);
}
