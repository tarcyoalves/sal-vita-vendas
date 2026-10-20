// Dono do pedido: atendente sem cadastro de vendedor (sellerId nulo) NÃO é dono de pedido sem vendedor.
// Antes, `pedido.sellerId !== mySellerId` com os dois null dava "é dono" (null === null) e o atendente
// sem cadastro removia, enviava por e-mail e baixava o PDF de qualquer pedido órfão.
export function atendenteEhDonoDoPedido(mySellerId: number | null | undefined, pedidoSellerId: number | null | undefined): boolean {
  return mySellerId != null && pedidoSellerId != null && mySellerId === pedidoSellerId;
}
