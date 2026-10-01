import { useMemo } from 'react';
import { ultimoMesComPedidos } from '../../lib/faturamento/calc';
import type { FiltroMes, Pedido } from '../../lib/faturamento/types';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** No começo do mês os painéis ficam zerados; este aviso diz isso e leva ao último mês com pedidos. */
export function AvisoMesSemPedidos({ pedidos, filtro, onIr }: {
  pedidos: Pedido[];
  filtro: FiltroMes;
  onIr: (mes: FiltroMes) => void;
}) {
  const ultimo = useMemo(() => ultimoMesComPedidos(pedidos, filtro), [pedidos, filtro]);
  if (!ultimo) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <p>
        <span className="font-semibold">{MESES[filtro.mes]}/{filtro.ano} ainda não tem pedidos.</span>{' '}
        Os pedidos de {MESES[ultimo.mes.mes]}/{ultimo.mes.ano} ({ultimo.qtd}) continuam salvos.
      </p>
      <button
        type="button"
        onClick={() => onIr(ultimo.mes)}
        className="rounded-md border border-amber-400 bg-white px-2.5 py-1 font-semibold hover:bg-amber-100"
      >
        Ver {MESES[ultimo.mes.mes]}/{ultimo.mes.ano}
      </button>
    </div>
  );
}
