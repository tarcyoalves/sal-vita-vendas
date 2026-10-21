// Service worker: abre o painel lateral ao clicar no ícone e cuida dos lembretes
// (alarmes, notificações e o selo de vencidos). Os ouvintes ficam no topo do arquivo porque o
// Chrome acorda o service worker por eles.
// A lógica da campanha roda no painel (que precisa estar aberto): fechar o painel pausa tudo,
// o que é o comportamento seguro.

import { aoAlarme, aoClicarNotificacao, sincronizar } from './lembretes';
import { CHAVES } from '../shared/crm-store';

function abrirPainelAoClicarNoIcone(): void {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(() => {
  abrirPainelAoClicarNoIcone();
  void sincronizar().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  abrirPainelAoClicarNoIcone();
  void sincronizar().catch(() => undefined);
});

// Lembrete criado, concluído, adiado ou apagado (no WhatsApp ou no painel): refaz os alarmes e o selo.
chrome.storage.onChanged.addListener((mudancas, area) => {
  if (area === 'local' && CHAVES.lembretes in mudancas) void sincronizar().catch(() => undefined);
});

chrome.alarms.onAlarm.addListener((alarme) => {
  void aoAlarme(alarme.name).catch(() => undefined);
});

chrome.notifications.onClicked.addListener((id) => {
  void aoClicarNotificacao(id).catch(() => undefined);
});

chrome.notifications.onButtonClicked.addListener((id) => {
  void aoClicarNotificacao(id).catch(() => undefined);
});

// O service worker pode ter sido reiniciado pelo Chrome: confere a agenda toda vez que carrega.
void sincronizar().catch(() => undefined);
