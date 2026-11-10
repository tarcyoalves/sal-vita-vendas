import { telefoneNormalizado } from './paymentTransition';

const HORA_MS = 60 * 60 * 1000;

/** Início da janela em que um pedido conta como "o cliente comprou": criação do carrinho − 1 h (compra logo antes do registro do carrinho). */
export function inicioJanelaCompra(cartCreatedAt: Date | string | null | undefined, agoraMs: number = Date.now()): Date {
  const t = cartCreatedAt ? new Date(cartCreatedAt).getTime() : NaN;
  return new Date(Number.isFinite(t) ? t - HORA_MS : agoraMs - 30 * 24 * HORA_MS);
}

/** Dígitos nacionais (sem DDI 55) para comparar no SQL; '' se curto demais para identificar alguém. */
export function telefoneParaBusca(p: string | null | undefined): string {
  const n = telefoneNormalizado(p);
  return n.length >= 10 ? n : '';
}

/**
 * No máximo um toque por telefone por rodada: o primeiro da fila (já ordenada por scheduled_for) vai;
 * os demais NÃO são cancelados — voltam para 'scheduled' e saem na próxima rodada.
 */
export function selecionarUmPorTelefone<T extends { customerPhone: string }>(runs: T[]): { enviar: T[]; adiar: T[] } {
  const vistos = new Set<string>();
  const enviar: T[] = [];
  const adiar: T[] = [];
  for (const r of runs) {
    const chave = telefoneNormalizado(r.customerPhone) || r.customerPhone;
    if (vistos.has(chave)) adiar.push(r); else { vistos.add(chave); enviar.push(r); }
  }
  return { enviar, adiar };
}

/** Terceiro toque sem cupom ativo não pode renderizar "Use o cupom **": cai no template simples. */
export function regraDeAbandono(
  cfg: { slug: string; coupon: string } | undefined,
): { slug: string; coupon: string } {
  const c = cfg ?? { slug: 'abandoned_simples', coupon: '' };
  return c.slug === 'abandoned_cupom' && !c.coupon ? { slug: 'abandoned_simples', coupon: '' } : c;
}

/** Cobrança de pedido não pago: não vale para pedido em revisão humana nem se o cliente já tem pedido mais novo pago. */
export function deveSuprimirCobranca(notes: string | null | undefined, temPedidoMaisNovoConfirmado: boolean): boolean {
  return temPedidoMaisNovoConfirmado || (notes ?? '').includes('[REVISAR]');
}

/** Sem o código PIX, o template de PIX ({pix} vazio) não serve: usa o lembrete com link. */
export function podeUsarTemplatePix(code: string | null | undefined): code is string {
  return typeof code === 'string' && code.trim().length > 0;
}
