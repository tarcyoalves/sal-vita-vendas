import { useState, useRef, useEffect, useMemo } from 'react';
import { Check, ChevronDown, X, Search } from 'lucide-react';

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
  activeClass = 'bg-indigo-500 text-white border-indigo-500',
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
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
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
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-2 border rounded-lg text-sm font-medium flex items-center gap-1.5 max-w-[220px] transition disabled:opacity-50 disabled:cursor-not-allowed ${
          active ? activeClass : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
        title={active ? selected.join(', ') : placeholder}
      >
        <span className="truncate">{summary}</span>
        {active && matchMode === 'all' && (
          <span className="text-[10px] font-bold opacity-80 shrink-0">E</span>
        )}
        <ChevronDown size={14} className="shrink-0 opacity-70" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 max-h-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg flex flex-col">
          {matchMode && onMatchModeChange && (
            <div className="flex items-center gap-1 border-b border-slate-100 p-2">
              <span className="text-[11px] text-slate-500 mr-1">Combinar:</span>
              <button
                type="button"
                onClick={() => onMatchModeChange('any')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${
                  matchMode === 'any'
                    ? 'bg-blue-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title="Mostra quem tem QUALQUER uma das tags marcadas"
              >
                QUALQUER
              </button>
              <button
                type="button"
                onClick={() => onMatchModeChange('all')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold transition ${
                  matchMode === 'all'
                    ? 'bg-blue-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title="Mostra só quem tem TODAS as tags marcadas ao mesmo tempo"
              >
                TODAS
              </button>
            </div>
          )}

          {searchable && (
            <div className="flex items-center gap-2 border-b border-slate-100 px-2.5 py-2">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar..."
                className="w-full text-sm outline-none placeholder:text-slate-400"
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          <div className="overflow-y-auto flex-1">
            {visible.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-400 text-center">
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
                    className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-sm hover:bg-slate-50 transition"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                        on ? 'bg-blue-900 border-blue-900 text-white' : 'border-slate-300 bg-white'
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
                      <span className="shrink-0 text-[11px] text-slate-400">{o.count}</span>
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
              className="border-t border-slate-100 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-red-600 transition"
            >
              Limpar seleção ({selected.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
