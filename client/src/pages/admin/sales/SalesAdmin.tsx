// Seção "Vendas B2B" do admin da loja Premium (Sal Vita Sales AI). Abas carregadas sob demanda.
import { lazy, Suspense, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { FOCUS } from '../../../components/premium/admin/adminUi';

const PainelTab = lazy(() => import('./PainelTab'));
const LoteTab = lazy(() => import('./LoteTab'));
const PrecisaTab = lazy(() => import('./PrecisaTab'));
const JornadasTab = lazy(() => import('./JornadasTab'));
const VendedorTab = lazy(() => import('./VendedorTab'));
const ConfigTab = lazy(() => import('./ConfigTab'));
const RelatoriosTab = lazy(() => import('./RelatoriosTab'));

const ABAS = [
  { key: 'painel', label: 'Painel', Comp: PainelTab },
  { key: 'lote', label: 'Lote do dia', Comp: LoteTab },
  { key: 'precisa', label: 'Precisa de você', Comp: PrecisaTab },
  { key: 'jornadas', label: 'Jornadas', Comp: JornadasTab },
  { key: 'vendedor', label: 'Vendedor virtual', Comp: VendedorTab },
  { key: 'config', label: 'Configurações', Comp: ConfigTab },
  { key: 'relatorios', label: 'Relatórios', Comp: RelatoriosTab },
] as const;

type Aba = (typeof ABAS)[number]['key'];

export default function SalesAdmin() {
  const [aba, setAba] = useState<Aba>('painel');
  const atual = ABAS.find((a) => a.key === aba) ?? ABAS[0];
  const Comp = atual.Comp;

  return (
    <div className="space-y-5 min-w-0">
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Vendas B2B</h2>
        <p className="text-xs text-slate-500">Prospecção e vendedor virtual da caixa de 10 kg do Sal Vita Premium.</p>
      </div>

      <nav aria-label="Abas de Vendas B2B" className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <div role="tablist" className="flex gap-1.5 w-max">
          {ABAS.map((a) => (
            <button
              key={a.key}
              type="button"
              role="tab"
              aria-selected={aba === a.key}
              onClick={() => setAba(a.key)}
              className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold whitespace-nowrap border cursor-pointer transition ${FOCUS} ${
                aba === a.key ? 'bg-[#0b1d3a] text-white border-[#0b1d3a]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel" className="min-w-0">
        <Suspense fallback={<div className="flex justify-center py-12" role="status"><RefreshCw className="w-5 h-5 animate-spin text-slate-400" aria-label="Carregando" /></div>}>
          <Comp />
        </Suspense>
      </div>
    </div>
  );
}
