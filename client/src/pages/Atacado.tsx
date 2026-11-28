import { trpc } from '../lib/trpc';
import { COPY } from '../components/sales/atacadoCopy';
import { OfertaCard } from '../components/sales/OfertaCard';
import { FreteCalculadora } from '../components/sales/FreteCalculadora';
import { SimuladorRevenda } from '../components/sales/SimuladorRevenda';
import { FormularioInbound } from '../components/sales/FormularioInbound';
import SalesAgentWidget from '../components/sales/SalesAgentWidget';

// Página pública /atacado (host premium): landing B2B da caixa de 10 kg. Todo número vem do
// servidor (salesPublic.oferta, shipping.calculate). Textos em components/sales/atacadoCopy.ts,
// conferidos por tests/sales-atacado.test.ts. O formulário de inbound grava o lead no CRM
// (POST /api/b2b/inbound) e não mudou.

export default function Atacado() {
  const oferta = trpc.salesPublic.oferta.useQuery(undefined, { retry: 1, staleTime: 60_000 });
  const o = oferta.data;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900" style={{ fontFamily: "'Outfit', 'Inter', sans-serif" }}>
      <header className="flex items-center justify-between bg-[#0C3680] px-4 py-3">
        <a href="/" aria-label="Sal Vita" className="no-underline">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 378" style={{ height: 40, width: 'auto' }}>
            <defs><clipPath id="oval-atacado"><ellipse cx="250" cy="187" rx="228" ry="164" /></clipPath></defs>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="rgba(255,255,255,0.08)" />
            <path d="M 22 252 Q 95 182 178 222 Q 214 242 250 210 Q 286 178 338 208 Q 398 240 478 222 L 478 352 H 22 Z" fill="#4a9eff" clipPath="url(#oval-atacado)" />
            <text x="250" y="196" textAnchor="middle" fontFamily="Pacifico, cursive" fontSize="90" fill="white">Sal Vita</text>
            <ellipse cx="250" cy="187" rx="228" ry="164" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="15" />
          </svg>
        </a>
        <span className="text-right text-sm text-white/80">Atacado &amp; Revenda</span>
      </header>

      <section className="bg-[#0C3680] px-4 pb-10 pt-8 text-white">
        <div className="mx-auto max-w-3xl">
          <span className="inline-block rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-sky-200">
            {COPY.heroSelo}
          </span>
          <h1 className="mt-4 text-3xl font-extrabold leading-tight sm:text-4xl">{COPY.heroTitulo}</h1>
          <p className="mt-3 max-w-xl text-base leading-relaxed text-white/80">{COPY.heroTexto}</p>
          {o && <p className="mt-3 text-sm font-semibold text-sky-200">{o.produto}</p>}
        </div>
      </section>

      <main className="mx-auto -mt-4 max-w-3xl space-y-5 px-4 pb-16">
        <OfertaCard oferta={o} carregando={oferta.isLoading} erro={oferta.isError} />
        {o && <FreteCalculadora kgPorCaixa={o.kgPorCaixa} />}
        {o?.simuladorAtivo && <SimuladorRevenda precoCaixaCentavos={o.precoSiteCentavos} />}

        <section className="rounded-2xl bg-white p-6 shadow-lg" aria-labelledby="porque-titulo">
          <h2 id="porque-titulo" className="text-lg font-bold text-[#0C3680]">{COPY.porqueTitulo}</h2>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {COPY.porque.map((p) => (
              <li key={p.titulo}>
                <h3 className="text-base font-bold text-slate-900">{p.titulo}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{p.texto}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Vendedor virtual: desligado no painel (agente.ativo = false), vira formulário de contato. */}
        <SalesAgentWidget />

        <div className="rounded-3xl p-3 sm:p-4" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0d2347 50%, #0a1628 100%)', color: '#e2e8f0' }}>
          <FormularioInbound />
        </div>

        <p className="text-center text-xs text-slate-500">{COPY.rodape}</p>
      </main>
    </div>
  );
}
