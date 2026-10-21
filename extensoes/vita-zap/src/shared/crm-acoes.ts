// Ação "abrir a conversa e colar o rascunho", pedida pelo service worker (clique na notificação)
// ou pelo painel lateral. O pedido vai por chrome.storage.local e o content script do WhatsApp
// Web o executa: abre a conversa e COLA o texto na caixa. Nada é enviado.

import type { RepositorioContatos } from './repositorio';

const URL_WHATSAPP = 'https://web.whatsapp.com/';

/** WhatsApp Web abre a conversa do número (sem texto: nada é enviado nem preenchido). */
export function urlDaConversaPorTelefone(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, '');
  return digitos.length >= 10 && digitos.length <= 15 ? `${URL_WHATSAPP}send?phone=${digitos}` : null;
}

/**
 * Abre a conversa pelo TELEFONE (lembretes do CRM: o título do lead nem sempre é o nome salvo no WhatsApp).
 * Leva a aba do WhatsApp Web ao endereço /send?phone=... (recarrega a aba; o WhatsApp abre o chat). Não envia nada.
 */
export async function abrirConversaPorTelefone(telefone: string): Promise<boolean> {
  const url = urlDaConversaPorTelefone(telefone);
  if (!url) return false;
  const abas = await chrome.tabs.query({ url: `${URL_WHATSAPP}*` });
  const aba = abas.find((a) => a.active) ?? abas[0];
  if (aba?.id != null) {
    await chrome.tabs.update(aba.id, { url, active: true });
    if (aba.windowId != null) await chrome.windows.update(aba.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
  return true;
}

/** Grava o pedido e leva o usuário à aba do WhatsApp Web (abre uma se não houver). */
export async function abrirConversaNoWhatsApp(repo: RepositorioContatos, pedido: { nome: string; telefone?: string; rascunho?: string; lembreteId?: string }): Promise<void> {
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
