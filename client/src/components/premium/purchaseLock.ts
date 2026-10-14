// Trava do Purchase do Pixel: uma unica vez por pedido, tambem entre paginas e visitas
// (tela do PIX na loja e /meu-pedido usam a mesma chave). Se o storage estiver bloqueado,
// deixa disparar: o eventID `purchase-<id>` faz a Meta deduplicar.

export const PURCHASE_LOCK_KEY = 'sv_purchase_sent';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** true so na primeira chamada para o pedido; grava a trava antes de devolver. */
export function claimPurchase(orderId: number | string, storage: StorageLike | null = defaultStorage()): boolean {
  const id = String(orderId);
  try {
    if (!storage) return true;
    const raw = JSON.parse(storage.getItem(PURCHASE_LOCK_KEY) ?? '[]');
    const ids: string[] = Array.isArray(raw) ? raw.map(String) : [];
    if (ids.includes(id)) return false;
    storage.setItem(PURCHASE_LOCK_KEY, JSON.stringify([...ids, id].slice(-50)));
  } catch { /* storage indisponivel: deixa disparar */ }
  return true;
}
