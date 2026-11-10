import { eq, and } from 'drizzle-orm';
import { ordersDb } from '../db/ordersDb';
import { siteOrders } from '../db/schema';
import {
  decidirTransicaoPagamento, pagamentoAprovadoDuplicado, motivoValorDivergente,
} from './paymentTransition';
import { appendReviewNote, confirmOrderPaid, podeConfirmarPagamento } from './orderConfirmation';

type SiteOrder = typeof siteOrders.$inferSelect;

export type OrigemConfirmacao = 'webhook' | 'reconcile' | 'pixStatus';

export type ResultadoConfirmacao =
  | 'confirmado'      // este chamador virou a linha e rodou confirmOrderPaid
  | 'ja_confirmado'   // pedido já estava pago (idempotente)
  | 'ignorado'        // pedido cancelado: pagamento tardio não ressuscita
  | 'divergente'      // valor pago difere do pedido: fica para revisão
  | 'concorrente'     // outro chamador confirmou entre a leitura e o UPDATE
  | 'nao_aprovado';

/** Valor do MP diverge do total do pedido (tolerância de 1 centavo). Sem valor ou sem total: não diverge. */
export function valorDivergente(transactionAmount: number | undefined, totalPrice: string | null | undefined): boolean {
  if (transactionAmount === undefined) return false;
  const esperado = parseFloat(totalPrice ?? '0');
  return esperado > 0 && Math.abs(transactionAmount - esperado) > 0.01;
}

/**
 * Rotina ÚNICA para "o Mercado Pago diz que este pagamento está aprovado": usada pelo webhook,
 * pelo reconcile e pelo pixStatus. O UPDATE condicional é a trava atômica — só quem realmente
 * vira a linha roda confirmOrderPaid (webhook, reconcile e pixStatus podem chegar juntos).
 */
export async function confirmApprovedPayment(
  order: SiteOrder,
  payment: { status: string; id?: number | string; transaction_amount?: number },
  origem: OrigemConfirmacao,
): Promise<{ resultado: ResultadoConfirmacao; order?: SiteOrder }> {
  if (payment.status !== 'approved') return { resultado: 'nao_aprovado' };
  const orderId = order.id;
  const mpId = String(payment.id ?? '');
  const tag = origem === 'webhook' ? '[mp-webhook] order' : origem === 'reconcile' ? '[cron] reconcile: order' : '[pix-status] order';

  const transicao = decidirTransicaoPagamento(order, payment.status);
  if (transicao === 'ja_confirmado') {
    // Pedido já pago por OUTRO pagamento: o cliente pagou duas vezes (ex.: PIX e cartão). Sem estorno automático.
    if (pagamentoAprovadoDuplicado(order.mpPaymentId, mpId)) {
      console.error(`${tag} ${orderId}: second approved payment ${mpId} (confirmed with ${order.mpPaymentId})`);
      await appendReviewNote(orderId, `segundo pagamento aprovado — MP ${mpId} — possível cobrança em duplicidade, estornar`);
    }
    return { resultado: 'ja_confirmado' };
  }
  // Pedido cancelado ('awaiting' ou 'failed'): pagamento tardio não ressuscita o pedido (o UPDATE abaixo também barra).
  if (transicao === 'ignorar') {
    console.error(origem === 'reconcile'
      ? `[cron] reconcile: order ${orderId} cancelled but payment ${mpId} approved — refund manually`
      : `${tag} ${orderId}: approved payment ${mpId} on a cancelled order — refund manually`);
    await appendReviewNote(orderId, `pagamento aprovado em pedido cancelado — MP ${mpId} — estornar manualmente`);
    return { resultado: 'ignorado' };
  }
  // Valida o valor antes de marcar como pago (sem isso o reconcile/pixStatus seriam a porta dos fundos da checagem).
  if (valorDivergente(payment.transaction_amount, order.totalPrice)) {
    const exp = parseFloat(order.totalPrice ?? '0');
    console.warn(origem === 'reconcile'
      ? `[cron] reconcile amount mismatch for order ${orderId}: expected ${exp}, got ${payment.transaction_amount}`
      : `${origem === 'webhook' ? '[mp-webhook]' : '[pix-status]'} Amount mismatch for order ${orderId}: expected ${exp}, got ${payment.transaction_amount}`);
    // Sem retry do MP; fica 'awaiting' para revisão manual.
    await appendReviewNote(orderId, motivoValorDivergente(payment.transaction_amount as number, parseFloat(order.totalPrice ?? '0'), mpId));
    return { resultado: 'divergente' };
  }
  // Só as linhas ainda confirmáveis ('awaiting'/'failed', não canceladas) viram; só quem vira confirma.
  const updated = await ordersDb.update(siteOrders)
    .set({ status: 'confirmed', paymentStatus: 'confirmed', mpPaymentId: mpId, updatedAt: new Date() })
    .where(and(eq(siteOrders.id, orderId), podeConfirmarPagamento))
    .returning();
  if (updated.length === 0) {
    console.log(`${tag} ${orderId} was already confirmed elsewhere — skipping duplicate side effects`);
    return { resultado: 'concorrente' };
  }
  // Cupom, CAPI, automações, carrinho, WhatsApp/e-mail, aviso ao dono e etiqueta.
  await confirmOrderPaid(updated[0]);
  return { resultado: 'confirmado', order: updated[0] };
}

/** Falha da API do MP que vale um reenvio do webhook: 5xx e 429. 404/4xx não adiantam. */
export function deveReenviarWebhook(httpStatus: number): boolean {
  return httpStatus >= 500 || httpStatus === 429;
}
