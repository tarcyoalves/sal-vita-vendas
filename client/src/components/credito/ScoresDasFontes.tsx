import type { RelatorioConsolidado, ScoreDaFonte } from '../../../../shared/credito';
import { frasePelaFonte } from '../../../../shared/creditoRotulos';

const pct = (n: number | null) => (n === null ? 'não informada' : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`);

/** Régua 0 a 1000 (vermelho até 400, amarelo até 600, verde acima) com um marcador no score. */
export function ReguaScore({ valor }: { valor: number }) {
  const esq = Math.min(100, Math.max(0, valor / 10));
  return (
    <div className="space-y-1 pt-1" role="img" aria-label={`Score ${valor} em uma régua de 0 a 1000`}>
      <div className="relative h-2">
        <div className="flex h-2 overflow-hidden rounded-full">
          <div className="w-[40%] bg-red-600" />
          <div className="w-[20%] bg-amber-500" />
          <div className="w-[40%] bg-green-600" />
        </div>
        <span className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 bg-slate-900" style={{ left: `${esq}%` }} />
      </div>
      <div className="relative h-3 text-[10px] leading-none text-slate-500">
        <span className="absolute left-0">0</span>
        <span className="absolute left-[40%] -translate-x-1/2">400</span>
        <span className="absolute left-[60%] -translate-x-1/2">600</span>
        <span className="absolute right-0">1000</span>
      </div>
    </div>
  );
}

function Cartao({ s }: { s: ScoreDaFonte }) {
  const calculado = s.calculado && s.valor !== null;
  return (
    <li className={`min-w-0 space-y-1.5 rounded-lg border p-3 ${calculado ? 'border-brand-100 bg-brand-50/60' : 'border-slate-200 bg-slate-50'}`}>
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.produtoNome}</p>
      <p className="truncate text-xs font-semibold text-slate-800">{s.rotulo ?? 'Score (0 a 1000)'}</p>
      {calculado ? (
        <>
          <p className="text-3xl font-bold tabular-nums text-brand-700">{s.valor}</p>
          <p className="text-xs text-slate-700">Inadimplência <strong className="tabular-nums">{pct(s.probabilidadeInadimplencia)}</strong></p>
          {s.faixa && <p className="break-words text-xs text-slate-700">Faixa: {s.faixa}</p>}
          <ReguaScore valor={s.valor as number} />
          {s.texto && <p className="line-clamp-2 text-[11px] text-slate-500" title={frasePelaFonte(s.texto)}>{frasePelaFonte(s.texto)}</p>}
        </>
      ) : (
        <>
          <p className="text-lg font-bold text-slate-500">não calculado</p>
          <p className="text-xs text-slate-500">A fonte não calculou este score.</p>
        </>
      )}
    </li>
  );
}

/** Um cartão por score de cada fonte, lado a lado: nunca somados nem em média; divergências em âmbar. */
export function ScoresDasFontes({ consolidado }: { consolidado: RelatorioConsolidado }) {
  const n = consolidado.scores.length;
  const grade = n >= 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : n === 2 ? 'sm:grid-cols-2' : '';
  return (
    <div className="space-y-2">
      <ul className={`grid gap-2 ${grade}`}>
        {consolidado.scores.map((s, i) => <Cartao key={`${s.produto}-${i}`} s={s} />)}
      </ul>
      <p className="text-xs text-slate-500">Scores informados pelas fontes; não calculados pela Sal Vita. Cada fonte usa um modelo diferente: não são somados nem combinados.</p>
      {consolidado.divergenciaScore && (
        <p role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">Divergência: {consolidado.divergenciaScore.replace(/^S/, 's')}</p>
      )}
      {consolidado.scoreAltoComRestricao && (
        <p role="note" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          Atenção: algum score é alto, mas há restrições registradas. Para decidir, prevalecem as restrições, não o score.
        </p>
      )}
    </div>
  );
}
