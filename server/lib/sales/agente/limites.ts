// Limites e identificação do visitante do vendedor virtual (puro).
import { createHmac } from 'node:crypto';
import type { ExceptionKind, SalesAgente } from '../../../../shared/sales';

export const RETENCAO_DIAS = 90;
/** Quantos bloqueios graves na mesma conversa viram a exceção `alegacao_barrada`. */
export const BLOQUEIOS_PARA_ESCALAR = 2;

/**
 * Teto diário de mensagens por visitante (hash de IP + user agent), somando todas as conversas dele
 * nas últimas 24 h. Impede que um visitante abra conversa nova atrás de conversa nova e gaste a cota
 * de IA. Nunca fica abaixo do teto por conversa (que o dono pode subir até 60).
 */
export const MAX_MENSAGENS_VISITANTE_DIA = 30;

export function limiteVisitanteDia(a: Pick<SalesAgente, 'maxMensagensPorConversa'>): number {
  return Math.max(MAX_MENSAGENS_VISITANTE_DIA, a.maxMensagensPorConversa);
}

/**
 * Chave de idempotência da exceção (e, por tabela, da tarefa do CRM: `tarefa:<chave>`) por conversa e
 * tipo. `registrarExcecao` usa ON CONFLICT nessa chave, então repetir o pedido, ou dois turnos
 * simultâneos, nunca criam a segunda exceção nem a segunda tarefa.
 */
export function chaveExcecaoAgente(kind: ExceptionKind, conversaId: string): string {
  return `agente:${kind}:${conversaId}`;
}

/**
 * Ações de um turno sem repetição: no máximo uma exceção de cada tipo e um opt-in. O modelo pode chamar
 * a mesma ferramenta várias vezes no turno; o banco já é idempotente, isto só evita idas à toa.
 */
export function acoesSemRepeticao<T extends { tipo: string; kind?: string }>(acoes: readonly T[]): T[] {
  const vistas = new Set<string>();
  const out: T[] = [];
  for (const a of acoes) {
    const chave = a.tipo === 'excecao' ? `excecao:${a.kind ?? ''}` : a.tipo;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    out.push(a);
  }
  return out;
}

export type DecisaoLimite = { permitido: true } | { permitido: false; motivo: 'desligado' | 'limite_conversa' | 'limite_dia' };

/**
 * Camada 7 + 8: agente desligado, conversa cheia ou teto diário de conversas novas → formulário de contato.
 * `mensagensNaConversa` = mensagens do visitante já recebidas (null = conversa nova).
 * É só a pré-checagem barata (sem consulta extra). A garantia é atômica, no banco: `servico.ts` incrementa
 * o contador com `UPDATE ... WHERE message_count < max` e cria conversa com `INSERT ... SELECT ... WHERE`
 * contando as conversas do dia e as mensagens do visitante.
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
