import { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown, X, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { foldText } from '../../../../shared/searchText';

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
  /** Cor opcional (hex) — usada pelo seletor de tags para espelhar a cor do catálogo */
  color?: string | null;
}

interface MultiSelectFilterProps {
  /** Texto exibido quando nada está selecionado (ex: "Todas as tags") */
  placeholder: string;
  /** Substantivo usado no resumo quando há seleção (ex: "tags" → "2 tags") */
  noun: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** Classe Tailwind aplicada ao botão quando há filtro ativo */
  activeClass?: string;
  /** Mostra campo de busca dentro do menu — ligar quando a lista for longa (cidades) */
  searchable?: boolean;
  /** Quando definido, exibe o alternador E/OU (usado nas tags) */
  matchMode?: 'any' | 'all';
  onMatchModeChange?: (mode: 'any' | 'all') => void;
  /** Mensagem exibida quando não há opções (ex: depende de outro filtro) */
  emptyHint?: string;
  disabled?: boolean;
}

export function MultiSelectFilter({
  placeholder,
  noun,
  options,
  selected,
  onChange,
  activeClass = 'border-brand-600 bg-brand-50 text-brand-800 hover:bg-brand-50',
  searchable = false,
  matchMode,
  onMatchModeChange,
  emptyHint,
  disabled = false,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = useMemo(() => {
    if (!query.trim()) return options;
    const q = foldText(query);
    return options.filter((o) => foldText(o.label).includes(q));
  }, [options, query]);

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const active = selected.length > 0;
  const summary = !active
    ? placeholder
    : selected.length === 1
      ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
      : `${selected.length} ${noun}`;

  return (
    <div className="relative max-md:w-full" ref={ref}>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`max-w-[220px] justify-between max-md:w-full max-md:max-w-none ${active ? activeClass : ''}`}
        title={active ? selected.join(', ') : placeholder}
      >
        <span className="truncate">{summary}</span>
        {active && matchMode === 'all' && (
          <span className="shrink-0 text-xs font-semibold">E</span>
        )}
        <ChevronDown size={14} aria-hidden className="shrink-0 text-slate-500" />
      </Button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 flex max-h-80 w-64 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {matchMode && onMatchModeChange && (
            <div className="flex items-center gap-1 border-b border-slate-200 p-2">
              <span className="mr-1 text-xs text-slate-500">Combinar:</span>
              <button
                type="button"
                onClick={() => onMatchModeChange('any')}
                className={`rounded-md px-2 py-1 text-xs font-medium transition max-md:min-h-10 ${
                  matchMode === 'any'
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title="Mostra quem tem QUALQUER uma das tags marcadas"
              >
                Qualquer
              </button>
              <button
                type="button"
                onClick={() => onMatchModeChange('all')}
                className={`rounded-md px-2 py-1 text-xs font-medium transition max-md:min-h-10 ${
                  matchMode === 'all'
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                title="Mostra só quem tem TODAS as tags marcadas ao mesmo tempo"
              >
                Todas
              </button>
            </div>
          )}

          {searchable && (
            <div className="flex items-center gap-2 border-b border-slate-200 px-2.5 py-2">
              <Search size={13} aria-hidden className="shrink-0 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                aria-label="Buscar nas opções"
                className="w-full text-sm outline-none placeholder:text-slate-500"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Limpar busca" className="text-slate-500 hover:text-slate-700">
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-slate-500">
                {options.length === 0 ? (emptyHint ?? 'Nenhuma opção') : 'Nada encontrado'}
              </p>
            ) : (
              visible.map((o) => {
                const on = selected.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm transition hover:bg-slate-50 max-md:min-h-10"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition ${
                        on ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    {o.color && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: o.color }}
                      />
                    )}
                    <span className="flex-1 truncate text-slate-700">{o.label}</span>
                    {o.count != null && (
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">{o.count}</span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {active && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="border-t border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-red-700 max-md:min-h-10"
            >
              Limpar seleção ({selected.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
