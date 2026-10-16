import { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Panel, PanelHeader } from '../layout/Page';
import { QueryError } from '../QueryError';
import { StatusBadge } from '../StatusBadge';
import { trpc } from '../../lib/trpc';
import { formatBRL } from '../../lib/faturamento/calc';
import { CATALOGO_CREDITO, PRECOS_MEDIDOS_EM, TEXTO_NAO_MEDIDO, TEXTO_RECOMENDACAO, type ItemCatalogoCredito } from '../../../../shared/creditoCatalogo';
import { MostraDoProduto } from './ProdutoConsultaCard';

const Preco = ({ item }: { item: ItemCatalogoCredito }) =>
  item.custoReais === null
    ? <span className="text-xs font-medium text-amber-700">{TEXTO_NAO_MEDIDO}</span>
    : <strong className="tabular-nums text-slate-900">{formatBRL(item.custoReais)}</strong>;

/** "O que cada consulta mostra": a referência de preços e conteúdo do dono, em tabela (PC) ou cartões (celular). */
export function CatalogoComparativo() {
  const [aberto, setAberto] = useState(false);
  const q = trpc.credito.catalogo.useQuery({}, { retry: false, staleTime: 5 * 60_000, enabled: aberto });
  const itens = q.data?.itens ?? CATALOGO_CREDITO;
  return (
    <Panel>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-900">O que cada consulta mostra</span>
          <span className="block text-xs text-slate-500">{TEXTO_RECOMENDACAO}</span>
        </span>
        <ChevronDown aria-hidden className={`size-4 shrink-0 text-slate-500 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <>
      <p className="border-y border-slate-200 px-4 py-2 text-xs text-slate-500">{`Preço medido em ${q.data?.precosMedidosEm ?? PRECOS_MEDIDOS_EM} (pode mudar). Em verde, o que já foi visto nas respostas reais; em cinza, a confirmar.`}</p>
      {q.error ? (
        <div className="p-4"><QueryError message={q.error.message} onRetry={() => void q.refetch()} retrying={q.isFetching} /></div>
      ) : q.isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-brand-600" aria-label="Carregando" /></div>
      ) : (
        <>
          <ul className="divide-y divide-slate-200 md:hidden">
            {itens.map((i) => (
              <li key={i.chave} className="min-w-0 space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
                    <span className="break-words">{i.nome}</span>{i.recomendado && <StatusBadge tone="success">Recomendado</StatusBadge>}
                  </span>
                  <Preco item={i} />
                </div>
                <MostraDoProduto item={i} />
                <p className="break-words text-xs text-slate-600"><span className="font-medium text-slate-500">Quando usar: </span>{i.quandoUsar}</p>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Consulta</th>
                  <th className="px-3 py-2.5">Preço</th>
                  <th className="px-3 py-2.5">Mostra (confirmado / a confirmar)</th>
                  <th className="px-3 py-2.5">Quando usar</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.chave} className="border-b border-slate-100 align-top">
                    <td className="max-w-[200px] px-3 py-3 font-medium text-slate-900">
                      <span className="break-words">{i.nome}</span>
                      {i.recomendado && <span className="mt-1 block"><StatusBadge tone="success">Recomendado</StatusBadge></span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3"><Preco item={i} /></td>
                    <td className="min-w-[260px] px-3 py-3"><MostraDoProduto item={i} /></td>
                    <td className="max-w-[260px] break-words px-3 py-3 text-xs text-slate-600">{i.quandoUsar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
        </>
      )}
    </Panel>
  );
}
