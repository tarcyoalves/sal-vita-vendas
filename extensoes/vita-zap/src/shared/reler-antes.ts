// Reler a conversa ANTES de cada envio automático (v0.7.59). Regra PURA, sem rede nem DOM.
//
// A decisão de cobrar/retomar foi tomada numa leitura anterior (minutos ou até 12 h antes). Nesse intervalo o cliente pode ter
// respondido. Imediatamente antes de abrir a conversa para enviar, o Executor lê a conversa de novo (lerConversa, só leitura) e
// só segue se a última mensagem ainda é NOSSA e o cliente não escreveu nada desde a decisão. Na dúvida, NÃO envia (falha fechada).

import type { MensagemLida } from './mensagens';
import { analisarLeitura } from './followup';

export interface BaseDaDecisao {
  /** Quando a conversa foi lida para decidir (ISO). Mensagem do cliente com carimbo desta hora em diante = respondeu. */
  desde: string | null;
  /** A nossa última mensagem (o disparo, a cobrança ou a etapa anterior da reativação): âncora para saber o que veio depois. */
  ancoraTexto?: string;
  ancoraEm?: string;
}

export type ResultadoReleitura = { ok: true } | { ok: false; respondeu: boolean; motivo: string };

const minuto = (iso: string): number => Math.floor(new Date(iso).getTime() / 60_000) * 60_000;

export function conferirAntesDeEnviar(mensagens: ReadonlyArray<MensagemLida>, base: BaseDaDecisao): ResultadoReleitura {
  if (mensagens.length === 0) return { ok: false, respondeu: false, motivo: 'a conversa não mostrou nenhuma mensagem' };
  const ultima = mensagens[mensagens.length - 1];
  if (ultima.de === 'cliente') return { ok: false, respondeu: true, motivo: 'a última mensagem da conversa é do cliente' };
  if (base.desde != null && Number.isFinite(new Date(base.desde).getTime())) {
    const corte = minuto(base.desde);
    const depois = mensagens.find((m) => m.de === 'cliente' && m.quando != null && Number.isFinite(new Date(m.quando).getTime()) && new Date(m.quando).getTime() >= corte);
    if (depois) return { ok: false, respondeu: true, motivo: 'chegou mensagem do cliente depois da leitura que gerou a decisão' };
  }
  if (base.ancoraTexto != null && base.ancoraEm != null) {
    const l = analisarLeitura(mensagens, base.ancoraTexto, base.ancoraEm);
    if (l.tipo === 'sem_resposta') return { ok: true };
    if (l.tipo === 'respondeu') return { ok: false, respondeu: true, motivo: 'o cliente respondeu à nossa última mensagem' };
    return { ok: false, respondeu: false, motivo: l.motivo };
  }
  return { ok: true };
}
