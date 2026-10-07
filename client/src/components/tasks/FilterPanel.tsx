import { useState, useRef, useEffect, type ReactNode } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';

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
      <Button
        type="button"
        variant={active ? 'default' : 'outline'}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal size={15} aria-hidden />
        Filtros
        {active && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-white px-1.5 text-xs font-semibold text-brand-700">
            {activeCount}
          </span>
        )}
        <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {/* Posicionamento (o painel já abriu fora da tela uma vez):
          - abaixo de lg: folha fixa com 12px de margem lateral, rolagem própria e
            fundo escurecido (no celular não há Esc; "Concluir" e o toque no fundo
            são a saída). Nunca ultrapassa a viewport, inclusive em 390px;
          - de lg para cima: ancorado à DIREITA do botão (a busca ao lado é flex-1 e
            empurra o botão para a direita; ancorar à esquerda abria fora da tela),
            com largura máxima de 560px limitada à viewport.
          Sem overflow no corpo em lg+: os multi-selects abrem dropdowns próprios,
          que um contêiner de rolagem recortaria. */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Filtrar tarefas"
            className="fixed inset-x-3 top-20 z-50 max-h-[75dvh] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg lg:absolute lg:inset-x-auto lg:right-0 lg:top-auto lg:mt-1.5 lg:max-h-none lg:w-[min(560px,calc(100vw-3rem))] lg:overflow-visible"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-lg border-b border-slate-200 bg-white px-4 py-2.5">
              <span className="text-sm font-semibold text-slate-900">
                Filtrar tarefas
                {active && <span className="ml-2 text-xs font-normal text-slate-500">{activeCount} {activeCount === 1 ? 'filtro' : 'filtros'}</span>}
              </span>
              <div className="flex items-center gap-2">
                {active && (
                  <Button type="button" variant="ghost" size="sm" onClick={onClearAll} className="text-slate-600 hover:text-red-700">
                    Limpar tudo
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => setOpen(false)} className="lg:hidden">
                  Concluir
                </Button>
              </div>
            </div>
            <div className="space-y-4 p-4">
              {children}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Uma seção rotulada dentro do painel (ex: "Localização"). */
export function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
