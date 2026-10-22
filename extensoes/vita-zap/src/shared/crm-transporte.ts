// Ponte entre as partes da extensão e o ServicoCrm (que roda só no service worker): o content script
// e o painel lateral chamam os métodos do LeadsCRM por mensagem (chrome.runtime.sendMessage). Assim só
// o service worker faz fetch com o cookie do CRM (o content script sofreria o CORS do WhatsApp Web) e
// só ele mexe na fila de reenvio.

import type { ErroCrm } from './crm-rede';
import { ehLeadsCRM, METODOS_LEADS, type LeadsCRM } from './leads';

export interface MensagemCrm {
  vz: 'crm';
  metodo: (typeof METODOS_LEADS)[number];
  args: unknown[];
}

export type RespostaMensagemCrm = { ok: true; valor: unknown } | { ok: false; erro: string };

export function ehMensagemCrm(m: unknown): m is MensagemCrm {
  const x = m as Partial<MensagemCrm> | null;
  return typeof x === 'object' && x !== null && x.vz === 'crm' && typeof x.metodo === 'string' && (METODOS_LEADS as readonly string[]).includes(x.metodo) && Array.isArray(x.args);
}

export const ERRO_SEM_SERVICO: ErroCrm = { tipo: 'rede', mensagem: 'A extensão não respondeu. Recarregue a extensão em chrome://extensions e a aba do WhatsApp.' };

/** A extensão foi atualizada (↻) com esta aba aberta: o código antigo da aba perdeu a ligação. Só F5 resolve. */
export const ERRO_ABA_ANTIGA = 'O Vita Zap foi atualizado: dê F5 nesta aba do WhatsApp.';

export function abaFicouAntiga(e: unknown): boolean {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && !chrome.runtime.id) return true;
  } catch {
    return true;
  }
  return /context invalidated|contexto.*invalid/i.test(e instanceof Error ? e.message : String(e ?? ''));
}

/** Lado do service worker: atende as mensagens com o serviço real. */
export function atenderMensagensCrm(servico: LeadsCRM): (msg: unknown, remetenteId: string | undefined, meuId: string, responder: (r: RespostaMensagemCrm) => void) => boolean {
  return (msg, remetenteId, meuId, responder) => {
    // Só mensagens da própria extensão (content script, painel, service worker).
    if (remetenteId !== meuId || !ehMensagemCrm(msg)) return false;
    const metodo = servico[msg.metodo] as (...a: unknown[]) => Promise<unknown>;
    metodo.apply(servico, msg.args).then(
      (valor) => responder({ ok: true, valor }),
      (e: unknown) => responder({ ok: false, erro: e instanceof Error ? e.message : String(e) }),
    );
    return true; // resposta assíncrona
  };
}

/** Lado das outras partes: um LeadsCRM que fala com o service worker. */
export function criarProxyLeads(enviar: (m: MensagemCrm) => Promise<RespostaMensagemCrm | undefined> = (m) => chrome.runtime.sendMessage(m)): LeadsCRM {
  const proxy: Record<string, unknown> = {};
  for (const metodo of METODOS_LEADS) {
    proxy[metodo] = async (...args: unknown[]) => {
      let r: RespostaMensagemCrm | undefined;
      try {
        r = await enviar({ vz: 'crm', metodo, args });
      } catch (e) {
        throw new Error(abaFicouAntiga(e) ? ERRO_ABA_ANTIGA : ERRO_SEM_SERVICO.mensagem);
      }
      if (!r) throw new Error(ERRO_SEM_SERVICO.mensagem);
      if (!r.ok) throw new Error(r.erro);
      return r.valor;
    };
  }
  if (!ehLeadsCRM(proxy)) throw new Error('proxy do CRM incompleto');
  return proxy as unknown as LeadsCRM;
}
