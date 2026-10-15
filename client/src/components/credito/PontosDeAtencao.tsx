import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { ordenarSinais } from '../../../../shared/creditoSinais';
import type { NivelSinal, SinalCredito } from '../../../../shared/credito';

const ESTILO: Record<NivelSinal, { cls: string; Icone: typeof AlertTriangle; rotulo: string }> = {
  ALERTA: { cls: 'border-red-200 bg-red-50 text-red-800', Icone: AlertTriangle, rotulo: 'Alerta' },
  ATENCAO: { cls: 'border-amber-200 bg-amber-50 text-amber-900', Icone: AlertCircle, rotulo: 'Atenção' },
  POSITIVO: { cls: 'border-green-200 bg-green-50 text-green-800', Icone: CheckCircle2, rotulo: 'Positivo' },
};

/** Bloco "Pontos de atenção": ALERTA, ATENÇÃO, POSITIVO, cada um com ícone, cor, título e detalhe. */
export function PontosDeAtencao({ sinais }: { sinais: readonly SinalCredito[] | undefined }) {
  const lista = ordenarSinais(sinais ?? []);
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Pontos de atenção</h4>
      {lista.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum ponto de atenção identificado.</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map((s) => {
            const { cls, Icone, rotulo } = ESTILO[s.nivel];
            return (
              <li key={`${s.codigo}-${s.titulo}`} className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-sm ${cls}`}>
                <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div className="min-w-0">
                  <p className="break-words font-medium"><span className="sr-only">{rotulo}: </span>{s.titulo}</p>
                  {s.detalhe && <p className="break-words text-xs opacity-90">{s.detalhe}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
