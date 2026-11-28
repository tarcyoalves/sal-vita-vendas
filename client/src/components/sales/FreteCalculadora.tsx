import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import { COPY, brl } from './atacadoCopy';

// shipping.calculate recebe a quantidade em KG e aceita até 100: o limite de caixas sai daí.
const MAX_KG_COTACAO = 100;

export function FreteCalculadora({ kgPorCaixa }: { kgPorCaixa: number }) {
  const maxCaixas = Math.max(1, Math.floor(MAX_KG_COTACAO / kgPorCaixa));
  const [cep, setCep] = useState('');
  const [caixas, setCaixas] = useState('1');
  const calcular = trpc.shipping.calculate.useMutation();

  const cepDigitos = cep.replace(/\D/g, '');
  const n = Math.floor(Number(caixas));
  const valido = cepDigitos.length === 8 && Number.isFinite(n) && n >= 1 && n <= maxCaixas;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!valido || calcular.isPending) return;
    calcular.mutate({ cep: cepDigitos, quantity: n * kgPorCaixa, productId: 'caixa' });
  }

  const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900';
  return (
    <section className="rounded-2xl bg-white p-6 shadow-lg text-slate-900" aria-labelledby="frete-titulo">
      <h2 id="frete-titulo" className="text-lg font-bold text-[#0C3680]">{COPY.freteTitulo}</h2>
      <form onSubmit={enviar} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end">
        <label className="block text-sm font-medium text-slate-700">
          {COPY.freteCep}
          <input className={input} inputMode="numeric" autoComplete="postal-code" maxLength={9} placeholder="00000-000"
            value={cep} onChange={(e) => setCep(e.target.value)} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          {COPY.freteCaixas}
          <input className={input} type="number" inputMode="numeric" min={1} max={maxCaixas}
            value={caixas} onChange={(e) => setCaixas(e.target.value)} />
        </label>
        <button type="submit" disabled={!valido || calcular.isPending}
          className="min-h-12 rounded-xl bg-[#0C3680] px-5 py-3 text-base font-bold text-white disabled:opacity-50">
          {calcular.isPending ? COPY.freteCalculando : COPY.freteBotao}
        </button>
      </form>

      {calcular.isError && <p role="alert" className="mt-3 text-sm text-red-700">{COPY.freteErro}</p>}

      {calcular.data && (
        <ul className="mt-4 space-y-2">
          {calcular.data.options.map((o) => (
            <li key={`${o.serviceId}-${o.name}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
              <span className="min-w-0 text-sm">
                <strong className="block truncate">{o.name}</strong>
                <span className="text-slate-500">{o.company ? `${o.company} · ` : ''}{o.days}</span>
              </span>
              <span className="shrink-0 text-base font-bold text-[#0C3680]">{brl(Math.round(o.price * 100))}</span>
            </li>
          ))}
        </ul>
      )}
      {calcular.data?.source === 'static' && <p className="mt-2 text-xs text-slate-500">{COPY.freteTabelaEstimada}</p>}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">{COPY.freteNotaValidade} {COPY.freteNotaMl}</p>
    </section>
  );
}
