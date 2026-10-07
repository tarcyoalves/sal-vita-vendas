// Decide o que fazer ao pedir a etiqueta de um pedido (Melhor Envio), sem tocar em banco.
// O checkout do ME COBRA. Se ele deu certo mas generate/print falhou, o pedido fica com
// me_order_id real e me_label_url nulo: comprar de novo seria cobrar duas vezes, e recusar
// para sempre deixaria a etiqueta paga presa. Nesse caso só se retoma generate + print.

export type LabelStep =
  | 'done'     // já tem URL da etiqueta
  | 'resume'   // paga (me_order_id real), falta generate/print: pular cart/checkout
  | 'reserve'  // nada comprado: reservar e fazer o fluxo completo
  | 'busy';    // outra chamada em andamento

/** Tempo mínimo desde a última gravação para retomar (uma chamada em curso acabou de gravar o me_order_id). */
export const RESUME_MIN_AGE_MS = 30_000;
const PENDING_STALE_MS = 5 * 60_000;

export function decideLabelStep(
  order: { meOrderId: string | null; meLabelUrl: string | null; updatedAt: Date | string | null },
  now: Date,
): LabelStep {
  if (order.meLabelUrl) return 'done';
  const age = order.updatedAt ? now.getTime() - new Date(order.updatedAt).getTime() : Infinity;
  if (!order.meOrderId) return 'reserve';
  if (order.meOrderId === 'pending') return age >= PENDING_STALE_MS ? 'reserve' : 'busy';
  return age >= RESUME_MIN_AGE_MS ? 'resume' : 'busy';
}
