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
  | 'ignorar'          // approved em pedido CANCELADO ('awaiting' ou 'failed') (pagamento tardio não ressuscita)
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
      // Cancelado (mesmo ainda 'awaiting': o admin cancelou com um PIX em aberto) nunca confirma.
      if ((pay === 'awaiting' || pay === 'failed') && !cancelado) return 'confirmar';
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

// ── Pagamento x pedido: regras puras do webhook/reconcile ──────────────────

/** id de pagamento do MP: só dígitos (vai direto na URL da API). */
export function idPagamentoMpValido(id: unknown): id is string | number {
  return (typeof id === 'string' || typeof id === 'number') && /^\d+$/.test(String(id));
}

/** Pedido já confirmado por OUTRO pagamento aprovado → possível cobrança em duplicidade. */
export function pagamentoAprovadoDuplicado(mpPaymentIdDoPedido: string | null | undefined, idRecebido: string): boolean {
  return !!mpPaymentIdDoPedido && mpPaymentIdDoPedido !== idRecebido;
}

/** Estorno/chargeback só mexe no pedido se for do pagamento que o confirmou. */
export function estornoPertenceAoPedido(mpPaymentIdDoPedido: string | null | undefined, idRecebido: string): boolean {
  return !!mpPaymentIdDoPedido && mpPaymentIdDoPedido === idRecebido;
}

const brlTxt = (n: number) => n.toFixed(2).replace('.', ',');

export function motivoValorDivergente(pago: number, esperado: number, mpId: string): string {
  return `valor pago R$ ${brlTxt(pago)} difere do pedido R$ ${brlTxt(esperado)} — MP ${mpId}`;
}

/** Linha de `site_orders.notes` para pedido que precisa de revisão humana. */
export function linhaRevisar(motivo: string, agora: Date = new Date()): string {
  return `[REVISAR] ${agora.toISOString()} ${motivo}`;
}

/** Novo texto de `notes` com a linha anexada (nunca sobrescreve); null se o motivo já consta. */
export function anexarRevisar(notasAtuais: string | null | undefined, motivo: string, agora: Date = new Date()): string | null {
  const atual = notasAtuais ?? '';
  if (atual.includes(motivo)) return null;
  return atual ? `${atual}\n${linhaRevisar(motivo, agora)}` : linhaRevisar(motivo, agora);
}

/** Campos que o cliente pode corrigir entre um envio e outro do checkout. */
export interface DadosEditaveisPedido {
  customerName: string | null;
  customerEmail: string | null;
  customerCpf: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  shippingServiceName: string | null;
  couponCode: string | null;
}

/**
 * Só reaproveita o pedido anterior se NADA que o cliente digitou mudou. Quem fecha o
 * checkout para corrigir o número da casa (mesmo CEP) precisa de um pedido novo — senão
 * o sal vai para o endereço errado.
 */
export function mesmosDadosDoPedido(existente: DadosEditaveisPedido, novo: DadosEditaveisPedido): boolean {
  const n = (v: string | null | undefined) => (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const d = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
  const campos: (keyof DadosEditaveisPedido)[] = [
    'customerName', 'customerEmail', 'address', 'number', 'complement',
    'neighborhood', 'city', 'state', 'shippingServiceName', 'couponCode',
  ];
  return campos.every(k => n(existente[k]) === n(novo[k])) && d(existente.customerCpf) === d(novo.customerCpf);
}

// ── createOrder: regras puras ──────────────────────────────────────────────

/** `quantity` é em kg: tem de ser múltiplo positivo do kg-por-unidade do produto (1kg=1, trio=3, caixa=10). */
export function quantidadeValida(qty: number, kgPerUnit: number): boolean {
  return Number.isInteger(qty) && qty > 0 && kgPerUnit > 0 && qty % kgPerUnit === 0;
}

/** Cupom com valor mínimo só vale se o subtotal (calculado no servidor, antes do desconto) o atinge. */
export function cupomAtendeMinimo(subtotal: number, minOrderValue: string | number | null | undefined): boolean {
  const min = parseFloat(String(minOrderValue ?? '0'));
  return !(min > 0) || subtotal + 0.001 >= min;
}

export const IDEMPOTENCIA_PEDIDO_MS = 15 * 60 * 1000;

/** Só dígitos, sem o DDI 55 (11 ou 10 dígitos nacionais). */
export function telefoneNormalizado(p: string | null | undefined): string {
  const d = (p ?? '').replace(/\D/g, '');
  return d.length > 11 && d.startsWith('55') ? d.slice(2) : d;
}

export interface PedidoRecorrente {
  customerPhone: string;
  product: string | null;
  quantity: number;
  postalCode: string;
  paymentStatus: string | null;
  status: string | null;
  createdAt: Date | string | null;
}

/**
 * Duplo clique / reenvio: pedido igual (telefone, produto, quantidade, CEP) ainda 'awaiting',
 * não cancelado e criado há menos de 15 min. Devolve o mais recente que casa.
 */
export function acharPedidoDuplicado<T extends PedidoRecorrente>(
  candidatos: T[],
  novo: { customerPhone: string; product: string; quantity: number; postalCode: string },
  agoraMs: number = Date.now(),
): T | undefined {
  const fone = telefoneNormalizado(novo.customerPhone);
  const cep = novo.postalCode.replace(/\D/g, '');
  return candidatos
    .filter(o => {
      const criado = o.createdAt ? new Date(o.createdAt).getTime() : NaN;
      return o.paymentStatus === 'awaiting'
        && o.status !== 'cancelled'
        && o.product === novo.product
        && o.quantity === novo.quantity
        && o.postalCode.replace(/\D/g, '') === cep
        && telefoneNormalizado(o.customerPhone) === fone
        && Number.isFinite(criado)
        && agoraMs - criado >= 0
        && agoraMs - criado < IDEMPOTENCIA_PEDIDO_MS;
    })
    .sort((a, b) => new Date(b.createdAt as Date).getTime() - new Date(a.createdAt as Date).getTime())[0];
}
