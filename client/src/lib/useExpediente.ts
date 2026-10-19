import { useEffect, useState } from 'react';
import { expedienteAberto } from '../../../shared/expediente';

/**
 * Config do expediente embutida no build do cliente (VITE_EXPEDIENTE). Mudar exige novo deploy.
 * Vazio = padrão 07:00-19:00; "sempre" = nunca pausa.
 */
// Literal `import.meta.env.VITE_*`: é o único formato que o Vite substitui no build.
// O tsconfig usa module CommonJS (TS1343/TS2339 aqui); o Vite/esbuild entende import.meta.
// @ts-expect-error import.meta não tipado sob module CommonJS
const BRUTO: unknown = import.meta.env.VITE_EXPEDIENTE;
export const EXPEDIENTE_CONFIG: string = typeof BRUTO === 'string' ? BRUTO.trim() : '';

export const expedienteAbertoAgora = (agora: Date = new Date()): boolean =>
  expedienteAberto(agora, EXPEDIENTE_CONFIG);

/**
 * true enquanto o expediente está aberto. Reavalia a cada minuto e quando a aba volta ao foco,
 * só com relógio local (não toca no servidor/banco). Uso: `refetchInterval: aberto ? N : false`.
 */
export function useExpediente(): boolean {
  const [aberto, setAberto] = useState<boolean>(() => expedienteAbertoAgora());
  useEffect(() => {
    const check = () => setAberto(expedienteAbertoAgora());
    check();
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, []);
  return aberto;
}
