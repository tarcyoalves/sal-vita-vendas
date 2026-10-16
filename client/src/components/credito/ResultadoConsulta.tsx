import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { linhasDoResultado, type ResultadoDoProduto, type TomResultado } from '../../lib/credito/resultado';

const ESTILO: Record<TomResultado, { cls: string; Icone: typeof CheckCircle2 }> = {
  ok: { cls: 'border-green-200 bg-green-50 text-green-900', Icone: CheckCircle2 },
  reaproveitado: { cls: 'border-slate-200 bg-slate-50 text-slate-800', Icone: RotateCcw },
  erro: { cls: 'border-red-300 bg-red-50 text-red-900', Icone: AlertTriangle },
};

/** Resultado por produto de uma consulta: sucesso, reaproveitado ou ERRO em vermelho (com a mensagem e se foi cobrado). */
export function ResultadoConsulta({ resultados }: { resultados: readonly ResultadoDoProduto[] }) {
  return (
    <ul className="grid gap-2" aria-label="Resultado por consulta">
      {linhasDoResultado(resultados).map((l) => {
        const { cls, Icone } = ESTILO[l.tom];
        return (
          <li key={l.chave} role={l.tom === 'erro' ? 'alert' : undefined} className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm', cls)}>
            <Icone className="mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="break-words font-semibold">{l.titulo}</p>
              <p className="break-words text-xs">{l.detalhe}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
