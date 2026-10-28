import { useState, useEffect, useCallback } from 'react';

const SNOOZE_KEY = 'sv_update_snoozed_until';
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const DEBOUNCE_VISIBILITY_MS = 2 * 60 * 1000; // 2 minutos

interface VersionData {
  buildTime: string;
  version: string;
}

export function useAppVersionCheck() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isSnoozed, setIsSnoozed] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  const checkVersion = useCallback(async () => {
    // Em ambiente de desenvolvimento local, não checar atualização para não interromper HMR
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') return;

    try {
      // Checar se o usuário silenciou o lembrete recentemente
      const snoozedUntil = sessionStorage.getItem(SNOOZE_KEY);
      if (snoozedUntil && Date.now() < Number(snoozedUntil)) {
        setIsSnoozed(true);
      } else {
        setIsSnoozed(false);
      }

      // Buscar o arquivo version.json sem cache
      const response = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) return;

      const data: VersionData = await response.json();
      if (!data?.buildTime) return;

      // O buildTime atual injetado na compilação do Vite
      const currentBuildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : null;

      if (!currentBuildTime) return;

      // Se a data do servidor for diferente da compilada no cliente, há uma nova versão
      if (data.buildTime !== currentBuildTime) {
        setHasUpdate(true);
        setLatestVersion(data.version || 'Nova Versão');
      } else {
        setHasUpdate(false);
      }
    } catch {
      // Falha silenciosa de rede
    }
  }, []);

  const reloadApp = useCallback(() => {
    try {
      sessionStorage.removeItem(SNOOZE_KEY);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.update();
          }
        });
      }
    } catch {
      // Ignore
    }
    // Recarrega a aplicação forçando bypass de cache
    window.location.reload();
  }, []);

  const snoozeUpdate = useCallback((minutes = 60) => {
    try {
      const until = Date.now() + minutes * 60 * 1000;
      sessionStorage.setItem(SNOOZE_KEY, String(until));
      setIsSnoozed(true);
    } catch {
      setIsSnoozed(true);
    }
  }, []);

  useEffect(() => {
    // Primeira verificação após 5s de carga inicial para não concorrer com recursos da tela
    const initialTimer = setTimeout(checkVersion, 5000);

    // Intervalo de verificação a cada 5 minutos
    const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);

    // Verificação ao alternar de aba (quando o usuário volta para o app)
    let lastVisibilityCheck = Date.now();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        if (now - lastVisibilityCheck > DEBOUNCE_VISIBILITY_MS) {
          lastVisibilityCheck = now;
          checkVersion();
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkVersion]);

  return {
    hasUpdate: hasUpdate && !isSnoozed,
    latestVersion,
    reloadApp,
    snoozeUpdate,
  };
}
