/**
 * Regras puras do painel admin da loja Premium (sem banco, sem rede) — testáveis em vitest.
 * Usadas por shipping.ts: transições de status, cancelamento e valor declarado do frete.
 */

// ── Transições de status (updateStatus / updateTracking) ─────────────────────

export type ContextoTransicao = {
  /** paymentStatus efetivo: o que o pedido terá depois desta chamada (pode vir na mesma chamada). */
  paymentStatus: string | null | undefined;
  trackingCode?: string | null;
};

export type ResultadoTransicao = { ok: true } | { ok: false; message: string };

/**
 * Se o admin pode mover o pedido de `from` para `to`. Só restringe o fluxo de envio
 * (shipped/delivered); os demais status continuam livres como antes.
 * Os fluxos automáticos (webhook/cron do Melhor Envio) não passam por aqui.
 */
export function transicaoAdminPermitida(
  from: string | null | undefined,
  to: string,
  ctx: ContextoTransicao,
): ResultadoTransicao {
  const atual = from ?? 'pending';
  if (atual === to) return { ok: true };
  if (to !== 'shipped' && to !== 'delivered') return { ok: true };

  if (atual === 'cancelled') {
    return { ok: false, message: 'Pedido cancelado não pode ser marcado como enviado ou entregue.' };
  }
  if (to === 'shipped') {
    if (ctx.paymentStatus !== 'confirmed') {
      return { ok: false, message: 'Só é possível marcar como enviado um pedido com pagamento confirmado.' };
    }
    if (atual === 'delivered') {
      return { ok: false, message: 'Pedido já entregue não pode voltar para enviado.' };
    }
    return { ok: true };
  }
  // to === 'delivered'
  if (atual === 'shipped') return { ok: true };
  if (atual === 'label_generated' && (ctx.trackingCode ?? '').trim()) return { ok: true };
  return { ok: false, message: 'Só é possível marcar como entregue um pedido já enviado (ou com etiqueta e código de rastreio).' };
}

/**
 * O que updateTracking pode fazer com o status ao salvar um código de rastreio:
 * 'shipped' só para pedido pago e ainda não enviado/entregue/cancelado; senão não mexe no status.
 */
export function statusAoSalvarRastreio(
  from: string | null | undefined,
  paymentStatus: string | null | undefined,
): 'shipped' | null {
  const atual = from ?? 'pending';
  if (paymentStatus !== 'confirmed') return null;
  if (atual === 'cancelled' || atual === 'delivered' || atual === 'shipped') return null;
  return 'shipped';
}

// ── Cancelamento ─────────────────────────────────────────────────────────────

export type ReembolsoCancelamento = 'mercadopago' | 'manual' | 'none';

/**
 * Como o dinheiro volta ao cancelar: pago com id do Mercado Pago → reembolso automático;
 * pago SEM id (confirmação manual) → a equipe reembolsa por fora; não pago → nada a devolver.
 */
export function modoReembolso(o: { paymentStatus?: string | null; mpPaymentId?: string | null }): ReembolsoCancelamento {
  if (o.paymentStatus !== 'confirmed') return 'none';
  return o.mpPaymentId ? 'mercadopago' : 'manual';
}

/** Pedido já postado/entregue só é cancelado com `force: true` explícito. */
export function cancelamentoExigeForce(status: string | null | undefined): boolean {
  return status === 'shipped' || status === 'delivered';
}

// ── Valor declarado (seguro) do frete ────────────────────────────────────────

const arredonda = (n: number) => +n.toFixed(2);
const valido = (n: number) => Number.isFinite(n) && n > 0;

/**
 * Valor declarado na COTAÇÃO: preço de catálogo × pacotes, sem frete. A cotação acontece antes
 * de o cupom ser conhecido, então pode ficar um pouco acima do declarado na etiqueta (que usa o
 * subtotal já com desconto); a diferença no frete é de centavos e a etiqueta é o que vale.
 */
export function insuranceValueCotacao(catalogPrice: number, packs: number): number {
  return arredonda(catalogPrice * Math.max(1, packs));
}

/**
 * Valor declarado na ETIQUETA: subtotal dos produtos depois do cupom, SEM o frete — o mesmo
 * critério da cotação, para o frete cotado ser o frete cobrado. Prefere total − frete (o que o
 * cliente realmente pagou); se faltar dado, cai em preço unitário × pacotes − desconto.
 */
export function insuranceValueEtiqueta(o: {
  totalPrice?: string | null;
  shippingPrice?: string | null;
  unitPrice?: string | null;
  couponDiscount?: string | null;
  packs: number;
  catalogPrice: number;
}): number {
  const total = parseFloat(o.totalPrice ?? '');
  if (valido(total)) {
    const frete = parseFloat(o.shippingPrice ?? '0');
    const sub = total - (Number.isFinite(frete) && frete > 0 ? frete : 0);
    if (valido(sub)) return arredonda(sub);
  }
  const unit = parseFloat(o.unitPrice ?? '');
  const desconto = parseFloat(o.couponDiscount ?? '0');
  const sub = (valido(unit) ? unit : o.catalogPrice) * Math.max(1, o.packs) - (Number.isFinite(desconto) && desconto > 0 ? desconto : 0);
  return valido(sub) ? arredonda(sub) : insuranceValueCotacao(o.catalogPrice, o.packs);
}

// ── Frete estimado ───────────────────────────────────────────────────────────

export const NOTA_FRETE_ESTIMADO = 'frete estimado (Melhor Envio indisponível) — conferir custo da etiqueta';

export function notaFreteEstimado(source: 'api' | 'static'): string | null {
  return source === 'static' ? NOTA_FRETE_ESTIMADO : null;
}
