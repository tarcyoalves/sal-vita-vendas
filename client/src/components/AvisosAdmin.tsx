import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { Button } from './ui/button';
import { dataBR } from '../lib/credito/regras';
import { AVISOS_ADMIN, avisosVisiveis, hojeFortaleza, urgenciaAviso, type Urgencia } from '../lib/avisosAdmin';

// "Entendi" esconde o aviso só pelo resto do dia: amanhã ele volta (até a data + 7 dias).
// Chave nova de propósito: o formato antigo escondia para sempre.
const CHAVE = 'avisosAdmin:ocultosNoDia';

type Ocultos = Record<string, string>; // id → dia (YYYY-MM-DD, Fortaleza) em que foi escondido

function lerOcultos(): Ocultos {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, d]) => typeof d === 'string')) as Ocultos;
  } catch {
    return {};
  }
}

function gravarOcultos(o: Ocultos): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(o));
  } catch {
    /* sem storage: o aviso some só até recarregar */
  }
}

const SELO: Record<Urgencia, string> = {
  ambar: 'bg-amber-100 text-amber-800 border-amber-200',
  neutro: 'bg-slate-100 text-slate-600 border-slate-200',
  vencido: 'bg-red-50 text-red-700 border-red-200',
};

/** Avisos informativos fixos (admin). Puro cliente: sem servidor, sem timers. */
export default function AvisosAdmin() {
  const [ocultos, setOcultos] = useState<Ocultos>(lerOcultos);
  const hoje = hojeFortaleza();
  const todos = avisosVisiveis(AVISOS_ADMIN, hoje);
  const lista = todos.filter((a) => ocultos[a.id] !== hoje);
  const escondidosHoje = todos.length - lista.length;
  if (todos.length === 0) return null;

  const ocultar = (id: string) => {
    const novo = { ...ocultos, [id]: hoje };
    setOcultos(novo);
    gravarOcultos(novo);
  };
  const mostrarTodos = () => {
    setOcultos({});
    gravarOcultos({});
  };

  return (
    <section aria-label="Avisos informativos" className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {lista.length === 0 && (
        <p className="text-xs text-slate-500 md:col-span-2">
          {escondidosHoje} aviso(s) escondido(s) por hoje.{' '}
          <button type="button" className="underline" onClick={mostrarTodos}>Mostrar</button>
        </p>
      )}
      {lista.map((a) => {
        const u = urgenciaAviso(a.data, hoje);
        return (
          <article key={a.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-800" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">{a.titulo}</h3>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${SELO[u.urgencia]}`}>
                  {dataBR(a.data)} · {u.rotulo}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{a.texto}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => ocultar(a.id)}>
                <X className="mr-1 h-3.5 w-3.5" aria-hidden /> Entendi (some por hoje)
              </Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
