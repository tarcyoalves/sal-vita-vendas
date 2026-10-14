// Consentimento do Meta Pixel (loja Premium). O Pixel NAO carrega ate o visitante aceitar.
// A escolha fica em localStorage; toda leitura/escrita tem try/catch (modo privado, bloqueio).

export const PIXEL_ID = '2209017296169541';
export const CONSENT_KEY = 'sv_pixel_consent';
export const CONSENT_OPEN_EVENT = 'sv:consent-open';
export const CONSENT_CHANGE_EVENT = 'sv:consent-change';

export type ConsentChoice = 'accepted' | 'declined';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

// Se o storage estiver bloqueado, a escolha vale ao menos até recarregar a página.
let memoryChoice: ConsentChoice | null = null;

export function getConsent(storage?: StorageLike | null): ConsentChoice | null {
  const useDefault = storage === undefined;
  try {
    const v = (useDefault ? defaultStorage() : storage)?.getItem(CONSENT_KEY);
    if (v === 'accepted' || v === 'declined') return v;
  } catch { /* cai na memória */ }
  return useDefault ? memoryChoice : null;
}

export function saveConsent(choice: ConsentChoice, storage?: StorageLike | null): boolean {
  const useDefault = storage === undefined;
  if (useDefault) memoryChoice = choice;
  try {
    const s = useDefault ? defaultStorage() : storage;
    if (!s) return false;
    s.setItem(CONSENT_KEY, choice);
    return true;
  } catch { return false; }
}

type FbqFn = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[] };
type PixelWindow = { fbq?: FbqFn; _fbq?: FbqFn };

/** Chamada segura ao Pixel: no-op se ele nao foi carregado (sem consentimento, bloqueador, erro). */
export function trackPixel(...args: unknown[]): void {
  try {
    const w = (typeof window === 'undefined' ? undefined : window) as unknown as PixelWindow | undefined;
    if (typeof w?.fbq === 'function') w.fbq(...args);
  } catch { /* nunca quebra o checkout */ }
}

/** Carrega o Pixel. So faz algo se o visitante ACEITOU; chamar de novo nao duplica. */
export function loadMetaPixel(opts: { pageView?: boolean } = {}): boolean {
  try {
    if (typeof window === 'undefined' || getConsent() !== 'accepted') return false;
    const w = window as unknown as PixelWindow;
    if (w.fbq) return true;
    const n: FbqFn = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args); else (n.queue as unknown[]).push(args);
    };
    if (!w._fbq) w._fbq = n;
    (n as unknown as Record<string, unknown>).push = n;
    (n as unknown as Record<string, unknown>).loaded = true;
    (n as unknown as Record<string, unknown>).version = '2.0';
    n.queue = [];
    w.fbq = n;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    n('init', PIXEL_ID);
    if (opts.pageView !== false) n('track', 'PageView');
    return true;
  } catch { return false; }
}

/** Quem recusa depois de ter aceitado: revoga o Pixel desta pagina e apaga os cookies do Meta. */
export function stopPixel(): void {
  try {
    trackPixel('consent', 'revoke');
    for (const name of ['_fbp', '_fbc']) {
      document.cookie = `${name}=; Max-Age=0; path=/`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${location.hostname}`;
    }
  } catch { /* ignora */ }
}

export function openConsentPreferences(): void {
  try { window.dispatchEvent(new Event(CONSENT_OPEN_EVENT)); } catch { /* ignora */ }
}
