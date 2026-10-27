// Ação "abrir a conversa e colar o rascunho", pedida pelo service worker (clique na notificação)
// ou pelo painel lateral. O pedido vai por chrome.storage.local e o content script do WhatsApp
// Web o executa: abre a conversa e COLA o texto na caixa. Nada é enviado.

import { AVISO_FALLBACK_ENDERECO } from './abrir-por-telefone';
import type { PedidoConteudo, RespostaConteudo } from './mensagens';
import type { RepositorioContatos } from './repositorio';

const URL_WHATSAPP = 'https://web.whatsapp.com/';

/** WhatsApp Web abre a conversa do número (sem texto: nada é enviado nem preenchido). */
export function urlDaConversaPorTelefone(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, '');
  return digitos.length >= 10 && digitos.length <= 15 ? `${URL_WHATSAPP}send?phone=${digitos}` : null;
}

export type ViaAbertura =
  /** A busca do WhatsApp achou e abriu a conversa, sem recarregar a página. */
  | 'busca'
  /** A busca não resolveu (ou a página não respondeu): abriu pelo endereço /send?phone=, que RECARREGA a aba. */
  | 'endereco'
  /** Não havia aba do WhatsApp Web: abriu uma nova, já no endereço do telefone. */
  | 'nova-aba'
  /** A página ainda estava ocupada com outra abertura: nada foi mudado. */
  | 'ocupado';

export interface AberturaPorTelefone {
  via: ViaAbertura;
  /** Texto para mostrar ao usuário quando a abertura recarregou a página depois de a busca falhar. */
  aviso?: string;
}

/** Quanto esperar a página responder (até 6 formatos de busca, alguns segundos cada). */
const LIMITE_RESPOSTA_MS = 45_000;

function comLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    const t = setTimeout(() => rejeitar(new Error('sem resposta')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolver(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        rejeitar(e);
      },
    );
  });
}

/**
 * Abre a conversa pelo TELEFONE (lembretes do CRM: o título do lead nem sempre é o nome salvo no WhatsApp).
 * Primeiro pede ao content script do WhatsApp Web para BUSCAR o número e abrir o chat, sem recarregar a página.
 * Só se a busca não achar nada, achar mais de um contato ou a página não responder, cai no endereço
 * /send?phone=..., que recarrega a aba. Não envia nada. Devolve null se o telefone não serve.
 */
export async function abrirConversaPorTelefone(telefone: string, nomeDica?: string): Promise<AberturaPorTelefone | null> {
  const url = urlDaConversaPorTelefone(telefone);
  if (!url) return null;
  const abas = await chrome.tabs.query({ url: `${URL_WHATSAPP}*` });
  const aba = abas.find((a) => a.active) ?? abas[0];
  if (aba?.id == null) {
    await chrome.tabs.create({ url });
    return { via: 'nova-aba' };
  }
  await chrome.tabs.update(aba.id, { active: true });
  if (aba.windowId != null) await chrome.windows.update(aba.windowId, { focused: true });
  const pedido: PedidoConteudo = { tipo: 'abrirPorTelefone', telefone, ...(nomeDica ? { nomeDica } : {}) };
  try {
    const r = (await comLimite(chrome.tabs.sendMessage(aba.id, pedido), LIMITE_RESPOSTA_MS)) as RespostaConteudo | undefined;
    if (r?.ok) return { via: 'busca' };
    if (r && !r.ok && r.codigo === 'ocupado') return { via: 'ocupado' };
  } catch {
    /* a página não tem o content script (aba antiga) ou não respondeu: cai no endereço */
  }
  await chrome.tabs.update(aba.id, { url, active: true });
  return { via: 'endereco', aviso: AVISO_FALLBACK_ENDERECO };
}

/** Frase para o painel dizer o que aconteceu ao abrir por telefone. */
export function textoDaAbertura(a: AberturaPorTelefone, nome: string): string {
  switch (a.via) {
    case 'busca':
      return `Conversa de ${nome} aberta pela busca do WhatsApp Web (sem recarregar). Nada é enviado.`;
    case 'endereco':
      return a.aviso ?? AVISO_FALLBACK_ENDERECO;
    case 'nova-aba':
      return `Abrindo o WhatsApp Web na conversa de ${nome}. Nada é enviado.`;
    case 'ocupado':
      return 'O WhatsApp Web ainda está abrindo outra conversa. Espere um instante e tente de novo.';
  }
}

/** Grava o pedido e leva o usuário à aba do WhatsApp Web (abre uma se não houver). */
export async function abrirConversaNoWhatsApp(repo: RepositorioContatos, pedido: { nome: string; telefone?: string; rascunho?: string; lembreteId?: string; enviarAutomatico?: boolean }): Promise<void> {
  await repo.pedirAbertura(pedido);
  const abas = await chrome.tabs.query({ url: `${URL_WHATSAPP}*` });
  const aba = abas.find((a) => a.active) ?? abas[0];
  if (aba?.id != null) {
    await chrome.tabs.update(aba.id, { active: true });
    if (aba.windowId != null) await chrome.windows.update(aba.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: URL_WHATSAPP });
  }
}
