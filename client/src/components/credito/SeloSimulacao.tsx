import { FlaskConical } from 'lucide-react';
import { cn } from '../../lib/utils';

/** Selo GRANDE: relatório do provedor simulado nunca pode ser confundido com consulta real. */
export function SeloSimulacao({ className }: { className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2 rounded-md border-2 border-dashed border-red-600 bg-red-50 px-3 py-2 text-sm font-bold uppercase tracking-wide text-red-700',
        className,
      )}
    >
      <FlaskConical className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">Simulação — dados fictícios</span>
    </div>
  );
}
