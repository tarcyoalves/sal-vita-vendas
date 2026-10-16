import { Checkbox } from '../ui/checkbox';
import { StatusBadge } from '../StatusBadge';
import { cn } from '../../lib/utils';
import { formatBRL } from '../../lib/faturamento/calc';
import { itemSelecionavel, TEXTO_NAO_MEDIDO, type ItemCatalogoCredito } from '../../../../shared/creditoCatalogo';
import { dataCurta, textoReaproveita } from '../../lib/credito/selecao';

/** O que a consulta mostra: confirmado em verde, "a confirmar" em cinza claro. Usado no seletor e no painel. */
export function MostraDoProduto({ item }: { item: ItemCatalogoCredito }) {
  return (
    <ul className="space-y-0.5 text-xs">
      {item.mostra.confirmado.map((t) => (
        <li key={`c-${t}`} className="flex gap-1.5 break-words text-green-700"><span aria-hidden>✓</span><span className="min-w-0">{t}</span></li>
      ))}
      {item.mostra.aConfirmar.map((t) => (
        <li key={`a-${t}`} className="flex gap-1.5 break-words text-slate-400"><span aria-hidden>?</span><span className="min-w-0">{t} <em className="not-italic">(a confirmar)</em></span></li>
      ))}
    </ul>
  );
}

export interface ProdutoConsultaCardProps {
  item: ItemCatalogoCredito;
  marcado: boolean;
  /** Limite de 3 atingido e este não está marcado. */
  bloqueadoPeloLimite: boolean;
  /** Provedor simulado: o preço do catálogo aparece riscado e nada é cobrado. */
  simulado: boolean;
  /** Última consulta válida (<30 dias) deste produto neste documento e o que acontece com ela. */
  ultimaValidaEm: string | Date | null;
  /** 'reaproveita' = sem custo; 'cobra' = existe, mas "forçar nova consulta" está marcado. */
  modoUltima: 'reaproveita' | 'cobra' | null;
  onAlternar: () => void;
  desabilitado?: boolean;
}

export function ProdutoConsultaCard({ item, marcado, bloqueadoPeloLimite, simulado, ultimaValidaEm, modoUltima, onAlternar, desabilitado }: ProdutoConsultaCardProps) {
  const medido = itemSelecionavel(item);
  const off = !medido || desabilitado || (bloqueadoPeloLimite && !marcado);
  const preco = item.custoReais;
  return (
    <label
      className={cn(
        'flex min-w-0 gap-3 rounded-lg border p-3 text-sm',
        marcado ? 'border-brand-500 bg-brand-50/40' : 'border-slate-200 bg-white',
        off ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-slate-300',
      )}
    >
      <Checkbox
        checked={marcado}
        disabled={off}
        onCheckedChange={() => { if (!off) onAlternar(); }}
        className="mt-0.5"
        aria-label={`Consultar ${item.nome}`}
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-semibold text-slate-900">
            <span className="break-words">{item.nome}</span>
            {item.recomendado && <StatusBadge tone="success">Recomendado</StatusBadge>}
          </span>
          <span className="shrink-0 tabular-nums">
            {preco === null ? (
              <span className="text-xs text-slate-500">—</span>
            ) : simulado ? (
              <span className="text-xs text-slate-500"><s>{formatBRL(preco)}</s> simulado: sem custo</span>
            ) : (
              <strong className="text-slate-900">{formatBRL(preco)}</strong>
            )}
          </span>
        </div>
        {!medido && <p className="text-xs font-medium text-amber-700">{TEXTO_NAO_MEDIDO}</p>}
        <div>
          <p className="mb-0.5 text-xs font-medium text-slate-500">Mostra</p>
          <MostraDoProduto item={item} />
        </div>
        <p className="break-words text-xs text-slate-600"><span className="font-medium text-slate-500">Quando usar: </span>{item.quandoUsar}</p>
        {medido && ultimaValidaEm && modoUltima === 'reaproveita' && <p className="break-words text-xs font-medium text-green-700">{textoReaproveita(ultimaValidaEm)}</p>}
        {medido && ultimaValidaEm && modoUltima === 'cobra' && <p className="break-words text-xs font-medium text-amber-700">Já consultado em {dataCurta(ultimaValidaEm)} — será cobrado de novo</p>}
      </div>
    </label>
  );
}
