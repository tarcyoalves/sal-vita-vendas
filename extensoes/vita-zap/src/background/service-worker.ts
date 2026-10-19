// Service worker: só faz o ícone da extensão abrir o painel lateral.
// A lógica da campanha roda no painel (que precisa estar aberto): fechar o painel pausa tudo,
// o que é o comportamento seguro.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});
