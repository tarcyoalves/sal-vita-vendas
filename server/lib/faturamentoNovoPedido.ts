// Regras de pedido do ATENDENTE (não admin/gerente) no faturamento — puras, sem banco.
// Usadas por upsertPedido e importLocal: o cliente não escolhe status, preço de catálogo
// nem comissão fixa por item (o payload da tela é só uma sugestão).
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

/**
 * Pedido NOVO de atendente: preço, isenção de frete e comissão fixa vêm do catálogo pelo
 * produtoId. Produto inexistente (ou item livre, sem produtoId): mantém o valor do cliente,
 * mas sem comissão fixa.
 */
export function reconstruirItensPedidoNovo<T extends ItemBase>(itens: readonly T[], catalogo: Catalogo): T[] {
  return itens.map(it => {
    const prod = it.produtoId ? catalogo.get(it.produtoId) : undefined;
    if (!prod) return { ...it, comissaoFixaPct: null };
    return { ...it, valorUnitario: prod.valorUnitario, isentoFrete: prod.isentoFrete, comissaoFixaPct: prod.comissaoFixaPct };
  });
}

const mesmoPct = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == b : Math.abs(a - b) < 1e-9;

/**
 * Pedido EXISTENTE de atendente: a comissão fixa de cada item tem que bater com a gravada
 * (item já existente, por id ou produtoId) ou, em item novo, com a do catálogo. Se algum item
 * diverge, vale a lista de itens do banco (comissão é congelada na criação).
 */
export function itensPedidoExistente<T extends ItemBase>(entrada: readonly T[], gravados: readonly T[], catalogo: Catalogo): T[] {
  const ok = entrada.every(it => {
    const antigo = gravados.find(g => g.id === it.id) ?? (it.produtoId ? gravados.find(g => g.produtoId === it.produtoId) : undefined);
    if (antigo) return mesmoPct(it.comissaoFixaPct, antigo.comissaoFixaPct);
    const prod = it.produtoId ? catalogo.get(it.produtoId) : undefined;
    return mesmoPct(it.comissaoFixaPct, prod ? prod.comissaoFixaPct : null);
  });
  return ok ? [...entrada] : [...gravados];
}
