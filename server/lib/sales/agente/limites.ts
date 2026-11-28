// Limites e identificação do visitante do vendedor virtual (puro).
import { createHmac } from 'node:crypto';
import type { SalesAgente } from '../../../../shared/sales';

export const RETENCAO_DIAS = 90;
/** Quantos bloqueios graves na mesma conversa viram a exceção `alegacao_barrada`. */
export const BLOQUEIOS_PARA_ESCALAR = 2;

export type DecisaoLimite = { permitido: true } | { permitido: false; motivo: 'desligado' | 'limite_conversa' | 'limite_dia' };

/**
 * Camada 7 + 8: agente desligado, conversa cheia ou teto diário de conversas novas → formulário de contato.
 * `mensagensNaConversa` = mensagens do visitante já recebidas (null = conversa nova).
 */
export function decidirLimites(a: Pick<SalesAgente, 'ativo' | 'maxMensagensPorConversa' | 'maxConversasPorDia'>, mensagensNaConversa: number | null, conversasNas24h: number): DecisaoLimite {
  if (!a.ativo) return { permitido: false, motivo: 'desligado' };
  if (mensagensNaConversa !== null) {
    return mensagensNaConversa >= a.maxMensagensPorConversa ? { permitido: false, motivo: 'limite_conversa' } : { permitido: true };
  }
  return conversasNas24h >= a.maxConversasPorDia ? { permitido: false, motivo: 'limite_dia' } : { permitido: true };
}

export function deveEscalarBloqueios(bloqueiosGraves: number): boolean {
  return bloqueiosGraves >= BLOQUEIOS_PARA_ESCALAR;
}

export function expiraEm(agora: Date): Date {
  return new Date(agora.getTime() + RETENCAO_DIAS * 86_400_000);
}

/** HMAC de IP + user agent com o segredo do servidor. O IP bruto nunca é gravado. */
export function hashVisitante(ip: string, userAgent: string, segredo: string): string {
  return createHmac('sha256', segredo).update(`${ip}|${userAgent.slice(0, 300)}`).digest('hex').slice(0, 40);
}

/** O consentimento é um flag da interface. Só `true` literal conta; nada vindo do modelo chega aqui. */
export function consentimentoDaInterface(flag: unknown): boolean {
  return flag === true;
}
