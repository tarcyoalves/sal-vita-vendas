// Decisões puras de "vale a pena buscar de novo?" — separadas dos componentes para
// poder testar sem DOM. Usadas pelo store de faturamento e pelo main.tsx.

/** Intervalo mínimo entre buscas ao voltar o foco da aba (poupa a cota de rede do Neon). */
export const FOCUS_REFETCH_MS = 5 * 60_000;
/** Idem, para o espelho do faturamento (carga única mais leve). */
export const FAT_FOCUS_REFETCH_MS = 2 * 60_000;
/** Idem, ao montar uma tela que usa o store de faturamento (várias montam por navegação). */
export const FAT_MOUNT_REFETCH_MS = 60_000;

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

/** Códigos tRPC que são resposta esperada (não é "falha de rede"): não merecem toast global. */
const EXPECTED_ERROR_CODES = new Set(['NOT_FOUND', 'FORBIDDEN', 'BAD_REQUEST', 'UNAUTHORIZED']);

/** Rotas públicas da loja: o visitante não deve ver aviso do sistema interno. */
export function isPublicStorePath(pathname: string, hostname: string): boolean {
  if (hostname === 'premium.salvitarn.com.br' || hostname === 'www.premium.salvitarn.com.br') return true;
  return pathname.startsWith('/sal-vita') || pathname.startsWith('/track');
}

/**
 * Decide se o QueryCache.onError mostra o toast global. Só avisa de falha "de verdade"
 * (rede/5xx) em query que ainda vai ser refeita; erros esperados, queries com retry
 * desligado (a tela já trata o erro) e páginas públicas ficam em silêncio.
 */
export function shouldToastQueryError(opts: {
  errorCode?: string | null;
  retry?: unknown;
  pathname: string;
  hostname: string;
}): boolean {
  if (opts.errorCode && EXPECTED_ERROR_CODES.has(opts.errorCode)) return false;
  if (opts.retry === false) return false;
  if (isPublicStorePath(opts.pathname, opts.hostname)) return false;
  return true;
}
