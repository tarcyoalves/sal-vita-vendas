import { useState, useRef, useEffect, type ReactNode } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';

/**
 * Botão "Filtros" + painel recolhível.
 *
 * Por que existe: a barra de tarefas acumulou 9 controles de filtro lado a lado,
 * e o usuário batia em ~16 elementos clicáveis antes de ver a primeira tarefa.
 * Só a busca e as abas de período são usadas todo dia; o resto é ocasional
 * (montar um recorte, caçar um conjunto específico). Divulgação progressiva:
 * o uso diário fica à vista, o resto entra aqui.
 *
 * A descoberta é preservada por dois sinais SEMPRE visíveis fora do painel:
 * o contador no próprio botão e a barra de chips de filtros ativos.
 */
export function FilterPanel({
  activeCount,
  onClearAll,
  children,
}: {
  activeCount: number;
  onClearAll: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = activeCount > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`px-3 py-2 rounded-lg text-sm border font-medium transition flex items-center gap-2 ${
          active
            ? 'bg-blue-900 text-white border-blue-900'
            : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        <SlidersHorizontal size={15} />
        Filtros
        {active && (
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white/25 px-1.5 text-[11px] font-bold">
            {activeCount}
          </span>
        )}
        <ChevronDown size={14} className={`opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Ancorado à DIREITA em todos os tamanhos: a busca ao lado é flex-1 e
          empurra este botão para perto da borda direita, então um painel
          left-0 abria ~336px fora da tela e era recortado pelo overflow-y-auto
          do main do AppShell (o painel aparecia como uma tira estreita).
          A largura acompanha a viewport e só então é limitada a 560px, para
          nunca ultrapassar a tela em telas pequenas.
          Sem overflow no corpo: os multi-selects internos abrem dropdowns
          próprios, que um contêiner de rolagem aqui recortaria. */}
      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-[calc(100vw-1.5rem)] max-w-[560px] rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-700">Filtrar tarefas</span>
            {active && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs font-medium text-slate-500 hover:text-red-600 transition"
              >
                Limpar tudo
              </button>
            )}
          </div>
          <div className="space-y-4 p-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

/** Uma seção rotulada dentro do painel (ex: "Localização"). */
export function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
