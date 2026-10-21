// Ação "abrir a conversa e colar o rascunho", pedida pelo service worker (clique na notificação)
// ou pelo painel lateral. O pedido vai por chrome.storage.local e o content script do WhatsApp
// Web o executa: abre a conversa e COLA o texto na caixa. Nada é enviado.

import type { RepositorioContatos } from './repositorio';

const URL_WHATSAPP = 'https://web.whatsapp.com/';

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
