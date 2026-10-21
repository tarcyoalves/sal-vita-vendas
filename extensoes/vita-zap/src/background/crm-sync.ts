// Integração com o CRM Lembretes no service worker: atende as mensagens do WhatsApp Web e do painel,
// e consulta tasks.reminders a cada 5 minutos (chrome.alarms) para a central e os alarmes.

import { executarTrpc } from '../shared/crm-rede';
import { atenderMensagensCrm } from '../shared/crm-transporte';
import type { ArmazemChaves, LeadsCRM } from '../shared/leads';
import { ServicoCrm } from '../shared/servico-crm';

/** Não começa com "vz:" (prefixo dos alarmes de lembrete), para não ser confundido com um deles. */
export const ALARME_SYNC_CRM = 'vzcrm-sync';
export const INTERVALO_SYNC_MIN = 5;

/** Cria o alarme periódico se ainda não existe (recriar a cada despertar adiaria o disparo para sempre). */
export async function garantirAlarmeSync(): Promise<void> {
  const existente = await chrome.alarms.get(ALARME_SYNC_CRM);
  if (existente) return;
  await chrome.alarms.create(ALARME_SYNC_CRM, { delayInMinutes: 1, periodInMinutes: INTERVALO_SYNC_MIN });
}

/** Disparou o alarme de 5 minutos: busca os lembretes do CRM e reenvia a fila. Sem login não faz nada. */
export async function aoAlarmeSync(nome: string, servico: LeadsCRM): Promise<void> {
  if (nome !== ALARME_SYNC_CRM) return;
  await servico.sincronizarLembretes();
}

/**
 * Liga o serviço do CRM a este service worker. `armazem` e `registrar` vêm do service-worker.ts (o RepositorioLocal
 * e usarServicoCrm): só os pontos de entrada importam o repositório local.
 */
export function iniciarCrm(armazem: ArmazemChaves, registrar: (s: LeadsCRM) => void): ServicoCrm {
  const servico = new ServicoCrm(armazem, (pedido) => executarTrpc(globalThis.fetch.bind(globalThis), pedido));
  registrar(servico);
  const atender = atenderMensagensCrm(servico);
  chrome.runtime.onMessage.addListener((msg, remetente, responder) => atender(msg, remetente.id, chrome.runtime.id, responder));
  chrome.alarms.onAlarm.addListener((alarme) => void aoAlarmeSync(alarme.name, servico).catch(() => undefined));
  void garantirAlarmeSync().catch(() => undefined);
  void servico.sincronizarLembretes().catch(() => undefined);
  return servico;
}
