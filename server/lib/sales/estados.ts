// Máquina de estados da jornada comercial (uma por contato elegível). V3.1, seção 8 e 16.5.
// Pura: recebe o estado e o evento, devolve o próximo estado ou a recusa. Quem grava no banco
// aplica a transição com `state_version` (controle otimista): evento fora de ordem não regride.
import type { JourneyState } from '../../../shared/sales';

export const JOURNEY_EVENTS = [
  'QUALIFICAR',          // evidência de compatibilidade encontrada
  'DESQUALIFICAR',       // evidência perdida/invalidada
  'ENTRAR_NO_LOTE',      // elegível e escolhida para o lote do dia
  'SAIR_DO_LOTE',        // cortada do lote pelo dono
  'PRIMEIRO_ENVIO',      // a 1ª mensagem foi aceita pelo servidor de e-mail
  'RESPOSTA_INTERESSE',  // resposta humana com interesse, ou conversa com o agente
  'RESPOSTA_NEGATIVA',   // resposta humana sem interesse
  'FIM_CADENCIA',        // última mensagem sem resposta
  'NEGOCIACAO',          // cotação ou pedido acima do limite do agente
  'PEDIDO_PAGO',         // pedido pago no site
  'RECUSA',              // negociação encerrada sem compra
  'JANELA_REPOSICAO',    // passou o intervalo esperado de reposição
  'SEM_COMPRA_180',      // 180 dias sem nova compra
  'SUPRIMIR',            // descadastro, reclamação, devolução permanente ou pedido de saída
  'REABRIR',             // ação manual do dono, auditada (nunca automática)
] as const;
export type JourneyEvent = (typeof JOURNEY_EVENTS)[number];

type Tabela = Partial<Record<JourneyState, Partial<Record<JourneyEvent, JourneyState>>>>;

const TABELA: Tabela = {
  IDENTIFIED: { QUALIFICAR: 'QUALIFIED', RESPOSTA_INTERESSE: 'INTERESTED', PEDIDO_PAGO: 'CUSTOMER' },
  QUALIFIED: {
    ENTRAR_NO_LOTE: 'CONTACT_REVIEW', DESQUALIFICAR: 'IDENTIFIED',
    RESPOSTA_INTERESSE: 'INTERESTED', PEDIDO_PAGO: 'CUSTOMER',
  },
  CONTACT_REVIEW: {
    PRIMEIRO_ENVIO: 'CONTACTED', SAIR_DO_LOTE: 'QUALIFIED',
    RESPOSTA_INTERESSE: 'INTERESTED', PEDIDO_PAGO: 'CUSTOMER',
  },
  CONTACTED: {
    RESPOSTA_INTERESSE: 'INTERESTED', RESPOSTA_NEGATIVA: 'CLOSED', FIM_CADENCIA: 'CLOSED',
    NEGOCIACAO: 'NEGOTIATION', PEDIDO_PAGO: 'CUSTOMER',
  },
  INTERESTED: { NEGOCIACAO: 'NEGOTIATION', PEDIDO_PAGO: 'CUSTOMER', RESPOSTA_NEGATIVA: 'CLOSED', RECUSA: 'CLOSED' },
  NEGOTIATION: { PEDIDO_PAGO: 'CUSTOMER', RECUSA: 'CLOSED' },
  CUSTOMER: { JANELA_REPOSICAO: 'REPLENISHMENT', PEDIDO_PAGO: 'CUSTOMER' },
  REPLENISHMENT: { PEDIDO_PAGO: 'CUSTOMER', SEM_COMPRA_180: 'CLOSED' },
  CLOSED: { PEDIDO_PAGO: 'CUSTOMER', RESPOSTA_INTERESSE: 'INTERESTED', REABRIR: 'QUALIFIED' },
  SUPPRESSED: {},
};

export type Transicao =
  | { ok: true; de: JourneyState; para: JourneyState; mudou: boolean }
  | { ok: false; de: JourneyState; evento: JourneyEvent; motivo: string };

/**
 * Aplica um evento. Regras gerais:
 *  - SUPRIMIR vale de qualquer estado e é terminal: nada tira um contato de SUPPRESSED
 *    (remoção de supressão é manual, auditada e fora desta máquina).
 *  - PEDIDO_PAGO sempre leva a CUSTOMER (salvo suprimido): compra é fato, não intenção.
 *  - Evento sem transição definida = recusa explícita (o chamador registra e não grava).
 */
export function transicionar(de: JourneyState, evento: JourneyEvent): Transicao {
  if (de === 'SUPPRESSED') {
    return evento === 'SUPRIMIR'
      ? { ok: true, de, para: 'SUPPRESSED', mudou: false }
      : { ok: false, de, evento, motivo: 'contato suprimido: nenhum evento muda o estado' };
  }
  if (evento === 'SUPRIMIR') return { ok: true, de, para: 'SUPPRESSED', mudou: true };
  const para = TABELA[de]?.[evento];
  if (!para) return { ok: false, de, evento, motivo: `evento ${evento} não se aplica ao estado ${de}` };
  return { ok: true, de, para, mudou: para !== de };
}

/** Estados em que a cadência de prospecção pode enviar a próxima mensagem. */
export function estadoPermiteProspeccao(estado: JourneyState, passo: number): boolean {
  if (passo === 0) return estado === 'CONTACT_REVIEW';
  return estado === 'CONTACTED';
}

/** Estados encerrados para prospecção: nunca recebem mensagem fria de novo. */
export function prospeccaoEncerrada(estado: JourneyState): boolean {
  return estado === 'INTERESTED' || estado === 'NEGOTIATION' || estado === 'CUSTOMER'
    || estado === 'REPLENISHMENT' || estado === 'CLOSED' || estado === 'SUPPRESSED';
}
