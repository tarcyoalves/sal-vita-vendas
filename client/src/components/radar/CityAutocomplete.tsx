import { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { trpc } from '../../lib/trpc';
import type { RadarMunicipality } from '../../../../shared/radar';

/**
 * Autocomplete de município para o Radar de Cargas.
 *
 * Sempre resolve para o código IBGE — nunca só o nome — porque existem nomes
 * repetidos entre estados (ex.: Barracão existe no PR e no RS). Por isso a
 * lista sempre mostra "Nome - UF" e o valor selecionado guarda o município
 * inteiro, não uma string solta.
 */
export function CityAutocomplete({
  value,
  onChange,
  disabled,
}: {
  value: RadarMunicipality | null;
  onChange: (m: RadarMunicipality | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value ? `${value.nome} - ${value.uf}` : '');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Debounce ~250ms — evita bater no servidor a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = debouncedQuery.length >= 2 && !value;
  const { data: options, isFetching } = trpc.prospectingRadar.municipalities.useQuery(
    { q: debouncedQuery },
    { enabled },
  );

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

  const list = options ?? [];

  const select = (m: RadarMunicipality) => {
    onChange(m);
    setQuery(`${m.nome} - ${m.uf}`);
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
    setDebouncedQuery('');
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (value) onChange(null);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => { if (query.trim().length >= 2) setOpen(true); }}
          onKeyDown={(e) => {
            if (!open || list.length === 0) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, list.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); const m = list[highlight]; if (m) select(m); }
          }}
          placeholder="Digite a cidade (ex.: Barracão)"
          className="w-full h-9 max-md:h-10 pl-9 pr-16 rounded-md border border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400 outline-none focus-visible:border-brand-500 focus-visible:ring-[3px] focus-visible:ring-brand-500/30 disabled:opacity-45 disabled:cursor-not-allowed"
        />
        {isFetching && (
          <Loader2 size={14} className="absolute right-10 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
        )}
        {(query || value) && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpar cidade"
            className="absolute right-0.5 top-1/2 flex size-8 max-md:size-10 -translate-y-1/2 items-center justify-center text-slate-500 hover:text-slate-700"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {open && !value && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {debouncedQuery.length < 2 ? (
            <p className="px-3 py-3 text-xs text-slate-500 text-center">Digite ao menos 2 letras</p>
          ) : list.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-500 text-center">
              {isFetching ? 'Buscando...' : 'Nenhum município encontrado'}
            </p>
          ) : (
            list.map((m, i) => (
              <button
                key={m.ibge}
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => select(m)}
                className={`w-full text-left px-3 py-2 max-md:py-3 text-sm transition-colors ${
                  i === highlight ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {m.nome} <span className="text-slate-500">- {m.uf}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
