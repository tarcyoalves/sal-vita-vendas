import { useMemo, useState } from 'react';
import { SIMULADOR_AVISO, SIMULADOR_MAX_CAIXAS, reaisParaCentavos, simularRevenda } from '../../../../shared/salesSimulador';
import { COPY, brl } from './atacadoCopy';

export function SimuladorRevenda({ precoCaixaCentavos }: { precoCaixaCentavos: number }) {
  const [caixas, setCaixas] = useState('1');
  const [preco, setPreco] = useState('');
  const [frete, setFrete] = useState('');
  const [despesas, setDespesas] = useState('');

  const r = useMemo(() => {
    const n = Math.floor(Number(caixas));
    const venda = reaisParaCentavos(preco);
    if (!Number.isFinite(n) || n < 1 || n > SIMULADOR_MAX_CAIXAS || venda === null) return null;
    return simularRevenda({
      quantidadeCaixas: n,
      precoRevendaPorPacoteCentavos: venda,
      freteCentavos: reaisParaCentavos(frete) ?? 0,
      despesasCentavos: reaisParaCentavos(despesas) ?? 0,
    }, precoCaixaCentavos);
  }, [caixas, preco, frete, despesas, precoCaixaCentavos]);

  const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900';
  const linha = (rotulo: string, valor: string, destaque = false) => (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-sm text-slate-600">{rotulo}</dt>
      <dd className={destaque ? 'text-lg font-extrabold text-[#0C3680]' : 'text-base font-semibold text-slate-900'}>{valor}</dd>
    </div>
  );

  return (
    <section className="rounded-2xl bg-white p-6 shadow-lg text-slate-900" aria-labelledby="sim-titulo">
      <h2 id="sim-titulo" className="text-lg font-bold text-[#0C3680]">{COPY.simTitulo}</h2>
      <p className="mt-1 text-sm text-slate-600">{COPY.simIntro}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">{COPY.simCaixas}
          <input className={input} type="number" inputMode="numeric" min={1} max={SIMULADOR_MAX_CAIXAS} value={caixas} onChange={(e) => setCaixas(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">{COPY.simPrecoRevenda}
          <input className={input} inputMode="decimal" placeholder="0,00" value={preco} onChange={(e) => setPreco(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">{COPY.simFrete}
          <input className={input} inputMode="decimal" placeholder="0,00" value={frete} onChange={(e) => setFrete(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">{COPY.simDespesas}
          <input className={input} inputMode="decimal" placeholder="0,00" value={despesas} onChange={(e) => setDespesas(e.target.value)} />
        </label>
      </div>

      {r ? (
        <dl className="mt-4" aria-live="polite">
          {linha(COPY.simCustoTotal, brl(r.custoTotalCentavos))}
          {linha(COPY.simCustoPacote, brl(r.custoPorPacoteCentavos))}
          {linha(COPY.simReceita, brl(r.receitaPotencialCentavos))}
          {linha(COPY.simResultado, brl(r.resultadoCentavos), true)}
          {linha(COPY.simMargem, r.margemPercentual === null ? '—' : `${r.margemPercentual.toLocaleString('pt-BR')}%`)}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-slate-500">{COPY.simPreencha}</p>
      )}

      <p className="mt-4 rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">{SIMULADOR_AVISO}</p>
    </section>
  );
}
