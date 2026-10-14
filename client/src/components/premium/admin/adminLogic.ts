/**
 * Regras puras do painel admin da loja Premium (sem React) — testáveis em vitest.
 */

/** Rotas que abrem o painel admin unificado (a URL só escolhe a seção inicial). */
export const ADMIN_PATHS = [
  '/sal-vita-admin',
  '/sal-vita-recovery',
  '/sal-vita-b2b',
  '/sal-vita-email-marketing',
] as const;

export function isAdminPath(path: string): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return (ADMIN_PATHS as readonly string[]).includes(p);
}

export const BATCH_LABEL_MAX = 25; // espelha .max(25) de shipping.batchGenerateLabels

export type OrderLike = {
  id: number;
  status?: string | null;
  paymentStatus?: string | null;
  totalPrice?: string | null;
  shippingPrice?: string | null;
  meLabelUrl?: string | null;
  createdAt?: string | Date | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerCpf?: string | null;
  city?: string | null;
  trackingCode?: string | null;
};

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? n : 0;
};

export const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

/** Por que um pedido NÃO pode entrar em etiqueta em lote (null = pode). */
export function batchBlockReason(o: OrderLike): string | null {
  if (o.status === 'cancelled') return 'cancelado';
  if (o.paymentStatus !== 'confirmed') return 'pagamento não confirmado';
  if (o.meLabelUrl) return 'já tem etiqueta';
  return null;
}

export function splitBatchSelection(orders: OrderLike[], selectedIds: number[]) {
  const sel = new Set(selectedIds);
  const eligible: OrderLike[] = [];
  const blocked: { order: OrderLike; reason: string }[] = [];
  for (const o of orders) {
    if (!sel.has(o.id)) continue;
    const reason = batchBlockReason(o);
    if (reason) blocked.push({ order: o, reason });
    else eligible.push(o);
  }
  return { eligible, blocked };
}

export function computeKpis(orders: OrderLike[], now = new Date()) {
  const today = now.toDateString();
  const live = orders.filter(o => o.status !== 'cancelled');
  const paid = live.filter(o => o.paymentStatus === 'confirmed');
  const total = paid.reduce((s, o) => s + num(o.totalPrice), 0);
  const shipping = paid.reduce((s, o) => s + num(o.shippingPrice), 0);
  const toShip = paid.filter(o => !['shipped', 'delivered'].includes(o.status ?? ''));
  return {
    activeOrders: live.length,
    cancelled: orders.length - live.length,
    newToday: orders.filter(o => o.createdAt && new Date(o.createdAt).toDateString() === today).length,
    awaiting: live.filter(o => o.paymentStatus === 'awaiting').length,
    paidCount: paid.length,
    revenueTotal: total, // com frete (totalPrice)
    revenueShipping: shipping,
    revenueProducts: total - shipping,
    ticketTotal: paid.length ? total / paid.length : 0,
    // Pago e ainda não despachado: inclui quem ainda não tem etiqueta.
    toShip: toShip.length,
    toShipNoLabel: toShip.filter(o => o.status !== 'label_generated').length,
    toShipWithLabel: toShip.filter(o => o.status === 'label_generated').length,
  };
}

/** Busca tolerante: telefone/CPF comparam só dígitos; id aceita "123" ou "#123". */
export function matchesSearch(o: OrderLike, raw: string): boolean {
  const q = raw.toLowerCase().trim();
  if (!q) return true;
  const qDigits = q.replace(/\D/g, '');
  const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '');
  return (
    (o.customerName ?? '').toLowerCase().includes(q) ||
    (o.customerEmail ?? '').toLowerCase().includes(q) ||
    (o.city ?? '').toLowerCase().includes(q) ||
    (o.trackingCode ?? '').toLowerCase().includes(q) ||
    String(o.id) === q.replace(/^#/, '') ||
    (qDigits.length >= 3 && (digits(o.customerPhone).includes(qDigits) || digits(o.customerCpf).includes(qDigits)))
  );
}

/** Evita que o Excel trate a célula como fórmula (=, +, -, @). */
export function csvText(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export function errorMessage(e: unknown): string {
  const m = (e as { message?: string } | null)?.message;
  return m && m.trim() ? m : 'Não foi possível carregar. Verifique a conexão ou entre de novo.';
}
