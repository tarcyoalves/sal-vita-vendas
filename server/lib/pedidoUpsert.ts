// Colunas que o `upsertPedido` regrava em pedido que já existe.
//
// smbiMovsaiId, numeroNfe e numeroCte pertencem ao ROBÔ SMBI (POST /api/smbi/pedidos/:id/retorno). O upsert
// lia `existing` no começo e gravava no `set` ~300 ms depois, copiando o valor lido: se o robô gravou o
// vínculo nesse intervalo, o upsert devolvia null e o pedido voltava à fila do robô (pedido DUPLICADO no ERP).
// Por isso essas três colunas NUNCA entram no `set` do UPDATE — o valor que o robô gravou fica como está.
// comissaoComercialProtegida só muda por admin (valor explícito); para os demais também fica fora do `set`.
import type { fatOrders } from '../db/schema';

export type PedidoValores = typeof fatOrders.$inferInsert;
export type SetPedido = Partial<PedidoValores>;

/** Colunas de posse do robô: proibidas no `set` de qualquer UPDATE feito pela tela. */
export const COLUNAS_DO_ROBO = ['smbiMovsaiId', 'numeroNfe', 'numeroCte'] as const;

export function montarSetUpsertPedido(
  values: PedidoValores,
  atualizadoEm: string,
  quem: { isAdmin: boolean },
): SetPedido {
  const set: SetPedido = {
    atualizadoEm,
    taskId: values.taskId,
    sellerId: values.sellerId,
    sellerName: values.sellerName,
    clienteNome: values.clienteNome,
    cnpj: values.cnpj,
    razaoSocial: values.razaoSocial,
    cidade: values.cidade,
    uf: values.uf,
    status: values.status,
    comissaoPct: values.comissaoPct,
    itens: values.itens,
    itensEstimadoSnapshot: values.itensEstimadoSnapshot,
    prazoPagamentoSal: values.prazoPagamentoSal,
    prazoPagamentoFrete: values.prazoPagamentoFrete,
    valorFretePorUnidade: values.valorFretePorUnidade,
    observacoes: values.observacoes,
    previsaoFaturamentoEm: values.previsaoFaturamentoEm,
    faturadoEm: values.faturadoEm,
    valorPago: values.valorPago,
    smbiCondpagSalCod: values.smbiCondpagSalCod,
    smbiCondpagFreteCod: values.smbiCondpagFreteCod,
  };
  // Admin com valor explícito altera a comissão protegida; payload nulo/ausente nunca a zera.
  if (quem.isAdmin && values.comissaoComercialProtegida != null) set.comissaoComercialProtegida = values.comissaoComercialProtegida;
  return set;
}
