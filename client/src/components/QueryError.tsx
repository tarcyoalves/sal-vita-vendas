import { AlertTriangle } from 'lucide-react';

interface QueryErrorProps {
  onRetry: () => void;
  /** true enquanto a nova tentativa está em andamento (desabilita o botão). */
  retrying?: boolean;
  message?: string;
  className?: string;
}

// Banner de falha de carregamento: no lugar do estado vazio, para a falha não
// parecer perda de dados. O botão chama o refetch da query.
export function QueryError({
  onRetry,
  retrying = false,
  message = 'Falha ao carregar',
  className = '',
}: QueryErrorProps) {
  return (
    <div
      role="alert"
      className={`flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 ${className}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <AlertTriangle size={16} className="shrink-0 text-red-600" />
        <span>{message}</span>
      </span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="shrink-0 min-h-10 px-3 rounded-lg border border-red-300 bg-white font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
      >
        {retrying ? 'Tentando…' : 'Tentar de novo'}
      </button>
    </div>
  );
}
