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
          className="w-full pl-9 pr-9 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {isFetching && (
          <Loader2 size={14} className="absolute right-9 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
        )}
        {(query || value) && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label="Limpar cidade"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && !value && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {debouncedQuery.length < 2 ? (
            <p className="px-3 py-3 text-xs text-slate-400 text-center">Digite ao menos 2 letras</p>
          ) : list.length === 0 ? (
            <p className="px-3 py-3 text-xs text-slate-400 text-center">
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
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  i === highlight ? 'bg-blue-50 text-blue-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {m.nome} <span className="text-slate-400">- {m.uf}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
