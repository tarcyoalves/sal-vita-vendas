// Cores de status do pedido, iguais às do SMBI: amarelo = faturado, azul = liberado (autorizado), branco = ainda não liberado.
interface PedidoCor { status: string; aprovadoEm?: string | null }

export function estadoCorPedido(p: PedidoCor): 'faturado' | 'liberado' | 'aguardando' {
  if (p.status === 'faturado') return 'faturado';
  return p.aprovadoEm ? 'liberado' : 'aguardando';
}

export const corLinhaPedido = (p: PedidoCor): string =>
  ({ faturado: 'bg-yellow-100 hover:bg-yellow-200', liberado: 'bg-blue-100 hover:bg-blue-200', aguardando: 'bg-white hover:bg-slate-50' })[estadoCorPedido(p)];

export const LEGENDA_CORES_PEDIDO = [
  { rotulo: 'Faturado', cls: 'bg-yellow-100' },
  { rotulo: 'Liberado', cls: 'bg-blue-100' },
  { rotulo: 'Ainda não liberado', cls: 'bg-white' },
] as const;
