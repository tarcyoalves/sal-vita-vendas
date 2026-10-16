import type { RelatorioConsolidado } from '../../../../shared/credito';
import { linhasDaMatriz, type TomMatriz, type VisualMatriz } from '../../../../shared/creditoMatriz';

const COR: Record<TomMatriz, string> = {
  verde: 'text-green-800', vermelho: 'text-red-800', cinza: 'text-slate-600', ambar: 'text-amber-900', neutro: 'text-slate-900', texto: 'text-slate-900',
};
const FUNDO: Record<TomMatriz, string> = {
  verde: 'bg-green-50', vermelho: 'bg-red-50', cinza: 'bg-slate-100', ambar: 'bg-amber-50', neutro: 'bg-brand-50/60', texto: '',
};

function Celula({ v }: { v: VisualMatriz }) {
  return (
    <div className={`min-w-0 rounded-md px-2 py-1.5 ${v.fundo ? FUNDO[v.tom] : ''} ${COR[v.tom]}`}>
      <p className="break-words text-sm font-semibold">{v.principal}</p>
      {v.sub && <p className="break-words text-xs opacity-90">{v.sub}</p>}
    </div>
  );
}

/**
 * Comparação por fonte (peça central): uma linha por tipo de restrição e, por fonte, o que ela disse (quantidade e valor, "nada consta"
 * ou "não consultado"), com a coluna "Leitura" marcando "Divergem" quando as fontes discordam. Em tela estreita vira cartões empilhados.
 */
export function MatrizComparacao({ consolidado }: { consolidado: RelatorioConsolidado }) {
  const linhas = linhasDaMatriz(consolidado);
  const fontes = consolidado.fontes;
  return (
    <div className="space-y-2">
      {/* ≥ 640px: tabela alinhada, larguras fixas */}
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
        <table className="w-full table-fixed text-left">
          <thead className="bg-brand-700 text-xs font-semibold text-white">
            <tr>
              <th className="w-[22%] px-2 py-2">Item</th>
              {fontes.map((f) => <th key={f.produto} className="px-2 py-2">{f.produtoNome}</th>)}
              <th className="w-[22%] px-2 py-2">Leitura</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className="border-t border-slate-100 align-top">
                <th scope="row" className="px-2 py-2 text-sm font-semibold text-slate-900">{l.rotulo}</th>
                {l.celulas.map((c, j) => <td key={fontes[j]?.produto ?? j} className="p-1"><Celula v={c} /></td>)}
                <td className="p-1"><Celula v={l.leitura} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* celular: um cartão por item; dentro, uma linha por fonte */}
      <ul className="space-y-2 sm:hidden">
        {linhas.map((l) => (
          <li key={l.rotulo} className="space-y-1.5 rounded-lg border border-slate-200 p-2.5">
            <p className="text-sm font-semibold text-slate-900">{l.rotulo}</p>
            {l.celulas.map((c, j) => (
              <div key={fontes[j]?.produto ?? j} className="space-y-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{fontes[j]?.produtoNome}</p>
                <Celula v={c} />
              </div>
            ))}
            <div className="space-y-0.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Leitura</p>
              <Celula v={l.leitura} />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-slate-500">
        Verde: a fonte consultou e nada consta. Vermelho: há ocorrências. Cinza: a fonte não consulta este item. &quot;Divergem&quot; = as fontes discordam; os números não são fundidos.
      </p>
    </div>
  );
}
