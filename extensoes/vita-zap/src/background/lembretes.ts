// Lembretes no service worker: chrome.alarms (um por lembrete), chrome.notifications e o selo
// com a contagem de vencidos no ícone. Nada aqui envia mensagem: o clique na notificação só pede
// ao content script para abrir a conversa e colar o rascunho.

import { abrirConversaNoWhatsApp } from '../shared/crm-acoes';
import { agendaDeAlarmes, contarVencidos, idDoAlarme, PREFIXO_ALARME } from '../shared/crm-lembretes';
import { CHAVES, sanearDados } from '../shared/crm-store';
import type { Lembrete } from '../shared/crm-tipos';

const PREFIXO_NOTIFICACAO = 'vz-';

async function lerLembretes(): Promise<Lembrete[]> {
  const bruto = await chrome.storage.local.get(CHAVES.lembretes);
  return sanearDados({ lembretes: bruto[CHAVES.lembretes] }).lembretes ?? [];
}

/** Selo vermelho no ícone com o número de lembretes vencidos (vazio quando não há). */
export async function atualizarSelo(agora: Date = new Date()): Promise<void> {
  const n = contarVencidos(await lerLembretes(), agora);
  await chrome.action.setBadgeText({ text: n > 0 ? (n > 99 ? '99+' : String(n)) : '' });
  if (n > 0) await chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
}

/** Deixa os alarmes do Chrome iguais à agenda (cria o que falta, tira o que sobra) e atualiza o selo. */
export async function sincronizar(agora: Date = new Date()): Promise<void> {
  const agenda = agendaDeAlarmes(await lerLembretes(), agora);
  const existentes = (await chrome.alarms.getAll()).filter((a) => a.name.startsWith(PREFIXO_ALARME));
  const desejados = new Map(agenda.map((a) => [a.nome, a.quando]));
  for (const a of existentes) {
    if (!desejados.has(a.name)) await chrome.alarms.clear(a.name);
  }
  for (const a of agenda) {
    const atual = existentes.find((e) => e.name === a.nome);
    // Já agendado para (quase) a mesma hora, ou lembrete atrasado cujo alarme já está a caminho:
    // não recria (evita adiar o disparo a cada sincronização).
    const atrasado = a.quando - agora.getTime() < 2500;
    if (atual && (atrasado || Math.abs(atual.scheduledTime - a.quando) < 1500)) continue;
    await chrome.alarms.create(a.nome, { when: a.quando });
  }
  await atualizarSelo(agora);
}

function trecho(texto: string, max = 90): string {
  const t = texto.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Disparou o alarme de um lembrete: marca como disparado e mostra a notificação. */
export async function aoAlarme(nome: string, agora: Date = new Date()): Promise<void> {
  const id = idDoAlarme(nome);
  if (!id) return;
  const lista = await lerLembretes();
  const l = lista.find((x) => x.id === id);
  if (!l || l.status !== 'pendente') return;
  l.status = 'disparado';
  l.disparadoEm = agora.getTime();
  await chrome.storage.local.set({ [CHAVES.lembretes]: lista });
  await chrome.notifications.create(`${PREFIXO_NOTIFICACAO}${l.id}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icon-128.png'),
    title: `Lembrete: ${l.nome}`,
    message: l.rascunho ? `Rascunho pronto: ${trecho(l.rascunho)}` : 'Hora de retomar a conversa.',
    buttons: [{ title: 'Abrir conversa' }],
    requireInteraction: true,
    priority: 2,
  });
  await atualizarSelo(agora);
}

/** Clique na notificação (ou no botão): abre a conversa no WhatsApp Web e cola o rascunho. */
export async function aoClicarNotificacao(notificacaoId: string): Promise<void> {
  if (!notificacaoId.startsWith(PREFIXO_NOTIFICACAO)) return;
  const id = notificacaoId.slice(PREFIXO_NOTIFICACAO.length);
  const l = (await lerLembretes()).find((x) => x.id === id);
  await chrome.notifications.clear(notificacaoId);
  if (!l) return;
  await abrirConversaNoWhatsApp(l.nome, l.rascunho, l.id);
}
