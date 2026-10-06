// Decisões puras de "vale a pena buscar de novo?" — separadas dos componentes para
// poder testar sem DOM. Usadas pelo store de faturamento e pelo main.tsx.

/** Intervalo mínimo entre buscas ao voltar o foco da aba (poupa a cota de rede do Neon). */
export const FOCUS_REFETCH_MS = 5 * 60_000;
/** Idem, para o espelho do faturamento (carga única mais leve). */
export const FAT_FOCUS_REFETCH_MS = 2 * 60_000;

/**
 * true quando já passou mais de `maxAgeMs` desde `lastFetchAt` (epoch ms).
 * Sem busca anterior (0/undefined/NaN) conta como velho.
 */
export function isStale(lastFetchAt: number | undefined | null, now: number, maxAgeMs: number): boolean {
  if (!lastFetchAt || !Number.isFinite(lastFetchAt)) return true;
  return now - lastFetchAt > maxAgeMs;
}

/** Queries que podem refazer a busca ao voltar o foco (as demais ficam como estão). */
const FOCUS_REFETCH_KEYS = new Set(['tasks.list', 'workSessions']);

/** queryKey do tRPC é [['tasks','list'], {...}]; devolve 'tasks.list'. */
export function trpcPathOf(queryKey: readonly unknown[]): string {
  const first = queryKey[0];
  return Array.isArray(first) ? first.join('.') : '';
}

/** Só tasks.list e qualquer workSessions.* — e só se os dados têm mais de 5 min. */
export function shouldRefetchOnFocus(
  queryKey: readonly unknown[],
  dataUpdatedAt: number,
  now: number = Date.now(),
): boolean {
  const path = trpcPathOf(queryKey);
  const root = path.split('.')[0];
  if (!FOCUS_REFETCH_KEYS.has(path) && !FOCUS_REFETCH_KEYS.has(root)) return false;
  return isStale(dataUpdatedAt, now, FOCUS_REFETCH_MS);
}

/** Um toast por janela: true se já passou `windowMs` desde o último aviso. */
export function shouldNotify(lastAt: number, now: number, windowMs = 10_000): boolean {
  return now - lastAt >= windowMs;
}
