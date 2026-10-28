import React, { useState } from 'react';
import { useAppVersionCheck } from '../_core/hooks/useAppVersionCheck';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from './ui/button';

export const AppUpdateBanner: React.FC = () => {
  const { hasUpdate, latestVersion, reloadApp, snoozeUpdate } = useAppVersionCheck();
  const [isReloading, setIsReloading] = useState(false);

  if (!hasUpdate) return null;

  const handleReload = () => {
    setIsReloading(true);
    reloadApp();
  };

  return (
    <aside
      aria-label="Atualização do sistema disponível"
      className="fixed bottom-5 right-5 z-[9999] max-w-sm w-[calc(100vw-2.5rem)] animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-auto"
    >
      <div className="bg-slate-900/95 text-white border border-blue-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-md ring-1 ring-white/10 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 animate-pulse text-blue-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white tracking-tight flex items-center gap-1.5">
                Atualização Disponível
                {latestVersion && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    {latestVersion}
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed mt-0.5">
                Uma nova versão do sistema foi publicada com melhorias. Atualize para carregar as novidades.
              </p>
            </div>
          </div>

          <button
            onClick={() => snoozeUpdate(60)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            title="Lembrar mais tarde (1 hora)"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            onClick={handleReload}
            disabled={isReloading}
            size="sm"
            className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs h-8 rounded-xl shadow-md transition-all active:scale-[0.98]"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isReloading ? 'animate-spin' : ''}`} />
            {isReloading ? 'Atualizando...' : 'Atualizar Agora'}
          </Button>

          <Button
            onClick={() => snoozeUpdate(60)}
            variant="ghost"
            size="sm"
            className="text-xs text-slate-400 hover:text-white hover:bg-slate-800 h-8 rounded-xl px-2.5 font-medium"
          >
            Depois
          </Button>
        </div>
      </div>
    </aside>
  );
};
