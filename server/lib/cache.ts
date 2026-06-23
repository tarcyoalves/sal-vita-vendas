interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(keyPrefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) store.delete(key);
  }
}

export function cacheStats(): { entries: number; keys: string[] } {
  let entries = 0;
  const keys: string[] = [];
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now <= entry.expiresAt) {
      entries++;
      keys.push(key);
    }
  }
  return { entries, keys };
}

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const existing = cacheGet<T>(key);
  if (existing !== undefined) return existing;
  const result = await fn();
  cacheSet(key, result, ttlMs);
  return result;
}
