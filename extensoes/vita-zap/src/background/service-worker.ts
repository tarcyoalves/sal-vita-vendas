// Service worker: abre o painel lateral ao clicar no ícone e cuida dos lembretes
// (alarmes, notificações e o selo de vencidos). Os ouvintes ficam no topo do arquivo porque o
// Chrome acorda o service worker por eles.
// A lógica da campanha roda no painel (que precisa estar aberto): fechar o painel pausa tudo,
// o que é o comportamento seguro.

import { iniciarCrm, limparAlarmeSyncAntigo } from './crm-sync';
import { criarAtendenteExterno } from './externo';
import { aoAlarme, aoClicarNotificacao, sincronizar } from './lembretes';
import { ehPedidoPainelAberto } from '../shared/mensagens';
import { RepositorioLocal, repositorioPadrao, usarServicoCrm } from '../shared/repositorio-local';

// O serviço do CRM Lembretes (rede, fila, sincronização) precisa estar registrado ANTES de qualquer repositorioPadrao().
iniciarCrm(new RepositorioLocal(), usarServicoCrm);

function abrirPainelAoClicarNoIcone(): void {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(() => {
  abrirPainelAoClicarNoIcone();
  void limparAlarmeSyncAntigo().catch(() => undefined); // até a 0.5.0 havia um alarme de 5 min que mantinha o banco do CRM ligado
  void sincronizar().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  abrirPainelAoClicarNoIcone();
  void sincronizar().catch(() => undefined);
});

// Lembrete criado, concluído, adiado ou apagado (no WhatsApp ou no painel): refaz os alarmes e o selo.
repositorioPadrao().aoMudar((e) => {
  if (e.colecoes.includes('lembretes')) void sincronizar().catch(() => undefined);
});

// Botões "Clientes" e "Entrar no CRM" da barra superior do WhatsApp: abrem o painel lateral (precisa ser chamado
// direto no ouvinte, enquanto o gesto do usuário ainda vale). Em qual aba o painel abre vem da configuração.
chrome.runtime.onMessage.addListener((msg: unknown, remetente) => {
  if (remetente.id !== chrome.runtime.id || !ehPedidoPainelAberto(msg) || remetente.tab?.id == null) return false;
  chrome.sidePanel.open({ tabId: remetente.tab.id }).catch(() => undefined);
  return false;
});

// Página do CRM (/vita-zap) perguntando "você está instalado?": só origem do CRM e só o ping (ver externo.ts).
chrome.runtime.onMessageExternal.addListener(
  criarAtendenteExterno({
    versao: () => chrome.runtime.getManifest().version,
    conectadoAoCrm: async () => (await repositorioPadrao().conta()).usuario != null,
    temPermissao: async () => chrome.permissions.contains({ origins: [`${(await repositorioPadrao().conta()).baseUrl}/*`] }),
  }),
);

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
