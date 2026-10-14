import { AlertCircle, RefreshCw } from 'lucide-react';
import { btn } from './adminUi';

/** Falha de carregamento: nunca deve parecer "lista vazia". */
export function ErrorState({ title, message, onRetry, retrying }: { title: string; message: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="bg-white rounded-2xl border border-rose-200 p-8 text-center">
      <AlertCircle className="w-10 h-10 text-rose-600 mx-auto mb-3" aria-hidden="true" />
      <p className="font-bold text-slate-900 text-sm">{title}</p>
      <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">{message}</p>
      <button type="button" onClick={onRetry} disabled={retrying} className={`${btn.primary} mt-4`}>
        <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} aria-hidden="true" />
        {retrying ? 'Tentando...' : 'Tentar de novo'}
      </button>
    </div>
  );
}
