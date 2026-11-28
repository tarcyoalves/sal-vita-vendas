import type { OfertaPublica } from '../../../../shared/salesOferta';
import { COPY, brl, formatarData } from './atacadoCopy';

// Só abre link externo http(s): o endereço vem de configuração, não de código.
function linkSeguro(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

export function OfertaCard({ oferta, carregando, erro }: { oferta: OfertaPublica | undefined; carregando: boolean; erro: boolean }) {
  if (carregando) {
    return <div className="rounded-2xl bg-white p-6 shadow-lg text-slate-500" role="status">{COPY.ofertaCarregando}</div>;
  }
  if (erro || !oferta) {
    return <div className="rounded-2xl bg-white p-6 shadow-lg text-slate-700" role="alert">{COPY.ofertaErro}</div>;
  }
  const ml = oferta.referenciaML;
  const mlUrl = ml ? linkSeguro(ml.url) : null;
  const disp = oferta.disponibilidade;
  return (
    <div className="rounded-2xl bg-white p-6 shadow-lg text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-[#0C3680]">{COPY.ofertaTitulo}</h2>
        {disp.status !== 'nao_informado' && (
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${disp.status === 'disponivel' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {disp.status === 'disponivel' ? COPY.dispDisponivel : COPY.dispEmFalta}
            {disp.atualizadoEm ? ` · ${formatarData(disp.atualizadoEm)}` : ''}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600">{oferta.produto}</p>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-1">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{COPY.ofertaPrecoSite}</p>
          <p className="text-3xl font-extrabold text-[#0C3680]">{brl(oferta.precoSiteCentavos)}</p>
        </div>
        <p className="pb-1 text-sm text-slate-600">
          {brl(Math.round(oferta.precoSiteCentavos / oferta.kgPorCaixa))} {COPY.ofertaPorKg}
        </p>
      </div>

      {ml && (
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
          <p>
            {COPY.ofertaMl}: <strong>{brl(ml.precoCentavos)}</strong>{' '}
            <span className="text-slate-500">(conferido em {formatarData(ml.conferidoEm)})</span>
          </p>
          {mlUrl && (
            <a href={mlUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block font-semibold text-[#0C3680] underline">
              {COPY.ofertaMlLink}
            </a>
          )}
        </div>
      )}

      <a href={oferta.linkCompra} className="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-[#0C3680] px-5 py-3 text-base font-bold text-white no-underline hover:bg-[#0a2d6b]">
        {COPY.ofertaComprar}
      </a>
    </div>
  );
}
