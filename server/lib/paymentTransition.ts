// Transição do estado do pedido a partir do status do pagamento no Mercado Pago (pura).
// Espelha as condições SQL do webhook/reconcile (que continuam sendo a trava atômica):
// aqui só se decide, sem banco, o que pode acontecer.

export interface EstadoPedidoPagamento {
  paymentStatus: string | null; // awaiting | confirmed | failed
  status: string | null;        // ... | cancelled
}

export type TransicaoPagamento =
  | 'confirmar'        // approved: confirma o pedido e dispara os efeitos (1x)
  | 'ja_confirmado'    // approved em pedido já confirmado: idempotente
  | 'ignorar'          // approved em 'failed' CANCELADO (pagamento tardio não ressuscita)
  | 'rebaixar'         // rejected/cancelled em 'awaiting' → 'failed'
  | 'estornar'         // refunded/charged_back em 'confirmed' → cancela e devolve cupom
  | 'cancelar_aguardando' // refunded/charged_back em 'awaiting' → só registra
  | 'registrar_id'     // pending/in_process/authorized: só guarda o id do pagamento
  | 'nada';            // nenhuma mudança (ex.: confirmado + rejected tardio)

export function decidirTransicaoPagamento(estado: EstadoPedidoPagamento, statusMp: string): TransicaoPagamento {
  const pay = estado.paymentStatus;
  const cancelado = estado.status === 'cancelled';
  switch (statusMp) {
    case 'approved':
      if (pay === 'confirmed') return 'ja_confirmado';
      if (pay === 'awaiting') return 'confirmar';
      if (pay === 'failed' && !cancelado) return 'confirmar';
      return 'ignorar';
    case 'pending':
    case 'in_process':
    case 'authorized':
      return 'registrar_id';
    case 'rejected':
    case 'cancelled':
      return pay === 'awaiting' ? 'rebaixar' : 'nada';
    case 'refunded':
    case 'charged_back':
      if (pay === 'confirmed') return 'estornar';
      return pay === 'awaiting' ? 'cancelar_aguardando' : 'nada';
    default:
      return 'nada';
  }
}
