// Ponte painel → content script da aba do WhatsApp Web.

import type { PedidoConteudo, RespostaConteudo } from '../shared/mensagens';

const URL_WHATSAPP = 'https://web.whatsapp.com/*';

export async function abaDoWhatsApp(): Promise<chrome.tabs.Tab | null> {
  const abas = await chrome.tabs.query({ url: URL_WHATSAPP });
  if (abas.length === 0) return null;
  const janela = await chrome.windows.getCurrent();
  return abas.find((a) => a.windowId === janela.id && a.active) ?? abas.find((a) => a.windowId === janela.id) ?? abas[0];
}

/** Aba aberta antes da instalação/atualização não tem o content script: injeta o MESMO content.js do manifesto. */
async function injetarConteudo(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

export async function pedir(pedido: PedidoConteudo, trazerParaFrente = false): Promise<RespostaConteudo> {
  const aba = await abaDoWhatsApp().catch(() => null);
  if (!aba?.id) return { ok: false, codigo: 'nao_pronto', erro: 'Abra o WhatsApp Web (web.whatsapp.com) nesta janela do Chrome.' };
  const tabId = aba.id;
  const enviarPedido = () => chrome.tabs.sendMessage<PedidoConteudo, RespostaConteudo | undefined>(tabId, pedido);
  try {
    if (trazerParaFrente && !aba.active) await chrome.tabs.update(tabId, { active: true });
    let r: RespostaConteudo | undefined;
    try {
      r = await enviarPedido();
    } catch {
      await injetarConteudo(tabId);
      r = await enviarPedido();
    }
    return r ?? { ok: false, codigo: 'interno', erro: 'O WhatsApp Web não respondeu.' };
  } catch {
    return {
      ok: false,
      codigo: 'nao_pronto',
      erro: 'Não consegui falar com a aba do WhatsApp Web. Recarregue a aba (F5) — isso é necessário depois de instalar ou atualizar a extensão.',
    };
  }
}
