// Integração com o CRM Lembretes no service worker: só atende as mensagens do WhatsApp Web e do painel.
//
// CONSUMO DO BANCO ("consulta só por uso, com teto"): o banco do CRM é um Neon grátis, que suspende
// depois de ~5 min sem consultas e tem horas de compute limitadas. Por isso NADA aqui consulta o CRM
// por timer ou ao acordar: não há alarme periódico e iniciarCrm() não faz rede. As notificações dos
// lembretes saem na hora certa por alarmes LOCAIS (background/lembretes.ts), criados a partir da lista
// em cache, sem ir ao servidor.

import { executarTrpc } from '../shared/crm-rede';
import { atenderMensagensCrm } from '../shared/crm-transporte';
import type { ArmazemChaves, LeadsCRM } from '../shared/leads';
import { ServicoCrm } from '../shared/servico-crm';

/** Alarme periódico das versões até 0.5.0 (mantinha o banco ligado o dia todo): é removido na instalação/atualização. */
export const ALARME_SYNC_ANTIGO = 'vzcrm-sync';

/** Remove o alarme `vzcrm-sync` que versões antigas deixaram agendado no Chrome. */
export async function limparAlarmeSyncAntigo(): Promise<void> {
  await chrome.alarms.clear(ALARME_SYNC_ANTIGO);
}

/**
 * Liga o serviço do CRM a este service worker. `armazem` e `registrar` vêm do service-worker.ts (o RepositorioLocal
 * e usarServicoCrm): só os pontos de entrada importam o repositório local. Não faz nenhuma chamada ao CRM.
 */
export function iniciarCrm(armazem: ArmazemChaves, registrar: (s: LeadsCRM) => void): ServicoCrm {
  const servico = new ServicoCrm(armazem, (pedido) => executarTrpc(globalThis.fetch.bind(globalThis), pedido));
  registrar(servico);
  const atender = atenderMensagensCrm(servico);
  chrome.runtime.onMessage.addListener((msg, remetente, responder) => atender(msg, remetente.id, chrome.runtime.id, responder));
  return servico;
}
