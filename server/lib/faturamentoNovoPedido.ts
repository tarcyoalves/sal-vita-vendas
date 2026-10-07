// Regras de pedido do ATENDENTE (não admin/gerente) no faturamento — puras, sem banco.
// Usadas por upsertPedido e importLocal: o cliente não escolhe status nem comissão fixa /
// isenção de frete por item (o payload da tela é só uma sugestão). Preço e quantidade são
// do vendedor (o SMBI é a verdade; o ajuste de preço é legítimo).
/** Forma mínima do item (o tipo do zod e o do banco diferem só em opcionais). */
export interface ItemBase {
  id: string;
  produtoId: string | null;
  valorUnitario: number;
  comissaoFixaPct?: number | null;
  isentoFrete?: boolean;
}

/** Só o que importa do catálogo (fat_products). */
export interface ProdutoCatalogo {
  id: string;
  valorUnitario: number;
  comissaoFixaPct: number | null;
  isentoFrete: boolean;
}
export type Catalogo = ReadonlyMap<string, ProdutoCatalogo>;

export function catalogoPorId(produtos: readonly ProdutoCatalogo[]): Catalogo {
  return new Map(produtos.map(p => [p.id, p]));
}

/** Campos que um pedido NOVO de atendente nunca traz da tela. */
export function camposPedidoNovoAtendente(pctDoVendedor: number) {
  return {
    status: 'estimado' as const,
    faturadoEm: null,
    valorPago: 0,
    aprovadoEm: null,
    aprovadoPor: null,
    comissaoPct: pctDoVendedor,
  };
}

const mesmoPct = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == b : Math.abs(a - b) < 1e-9;

/**
 * Valores de REFERÊNCIA (comissão fixa e isenção de frete) de um item de atendente:
 *  1. item já gravado no pedido (mesmo id e mesmo produto, ou mesmo produtoId): vale o gravado —
 *     a comissão é congelada na criação, mesmo que o catálogo mude depois;
 *  2. item novo ou com produto trocado: vale o catálogo pelo produtoId;
 *  3. item livre / produto inexistente: sem comissão fixa e SEM isenção de frete. Isenção é
 *     propriedade do produto do catálogo (preço final fixo, frete nunca soma); o item livre da
 *     tela nasce com `isentoFrete: false` (OrderItemsEditor) e o atendente não pode se auto-isentar.
 */
function referenciaDoItem(it: ItemBase, gravados: readonly ItemBase[], catalogo: Catalogo): { comissaoFixaPct: number | null; isentoFrete: boolean } {
  const antigo = gravados.find(g => g.id === it.id && g.produtoId === it.produtoId)
    ?? (it.produtoId ? gravados.find(g => g.produtoId === it.produtoId) : undefined);
  if (antigo) return { comissaoFixaPct: antigo.comissaoFixaPct ?? null, isentoFrete: !!antigo.isentoFrete };
  const prod = it.produtoId ? catalogo.get(it.produtoId) : undefined;
  return { comissaoFixaPct: prod ? prod.comissaoFixaPct : null, isentoFrete: prod ? prod.isentoFrete : false };
}

/**
 * Regra única para pedido NOVO e EXISTENTE de atendente: o vendedor ajusta preço, quantidade e
 * descrição livremente (ex.: baixa o valor do sal e migra para o frete para atingir o piso de
 * frete); do servidor vêm só `comissaoFixaPct` e `isentoFrete`, item a item. `ajustados` avisa
 * que algum item veio da tela com valor diferente do de referência (cache velho ou adulteração).
 */
function aplicarReferencia<T extends ItemBase>(entrada: readonly T[], gravados: readonly ItemBase[], catalogo: Catalogo): { itens: T[]; ajustados: boolean } {
  let ajustados = false;
  const itens = entrada.map(it => {
    const ref = referenciaDoItem(it, gravados, catalogo);
    if (mesmoPct(it.comissaoFixaPct, ref.comissaoFixaPct) && !!it.isentoFrete === ref.isentoFrete) return it;
    ajustados = true;
    return { ...it, comissaoFixaPct: ref.comissaoFixaPct, isentoFrete: ref.isentoFrete };
  });
  return { itens, ajustados };
}

/** Pedido NOVO de atendente: referência = catálogo (não há itens gravados). */
export function reconstruirItensPedidoNovo<T extends ItemBase>(itens: readonly T[], catalogo: Catalogo) {
  return aplicarReferencia(itens, [], catalogo);
}

/** Pedido EXISTENTE de atendente: referência = itens gravados (por id) e, para itens novos, o catálogo. */
export function itensPedidoExistente<T extends ItemBase>(entrada: readonly T[], gravados: readonly ItemBase[], catalogo: Catalogo) {
  return aplicarReferencia(entrada, gravados, catalogo);
}
