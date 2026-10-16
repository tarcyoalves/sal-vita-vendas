// Depois de um deploy, o navegador pode abrir um index.html (ou service worker) antigo que aponta para arquivos
// com hash que não existem mais ("Failed to fetch dynamically imported module"). Em vez de mostrar erro,
// limpa o service worker e os caches e recarrega UMA vez.

const PADROES_CHUNK = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /ChunkLoadError/i,
  /loading (css )?chunk [\w-]+ failed/i,
];

export function ehErroDeChunk(erro: unknown): boolean {
  const msg = erro instanceof Error ? `${erro.name}: ${erro.message}` : typeof erro === 'string' ? erro : '';
  return PADROES_CHUNK.some((p) => p.test(msg));
}

const CHAVE = 'versao-nova-reload';
const JANELA_MS = 60_000;

/** true = pode tentar recuperar agora (não houve tentativa nos últimos 60 s). Registra a tentativa. */
export function podeRecuperar(agora = Date.now(), storage: Pick<Storage, 'getItem' | 'setItem'> | null = guardaSegura()): boolean {
  try {
    const ultima = Number(storage?.getItem(CHAVE) ?? 0);
    if (Number.isFinite(ultima) && agora - ultima < JANELA_MS) return false;
    storage?.setItem(CHAVE, String(agora));
  } catch { /* sem storage: tenta mesmo assim (uma vez por carregamento) */ }
  return true;
}

function guardaSegura(): Storage | null {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage; } catch { return null; }
}

/** Remove service workers e caches do app e recarrega. Devolve false se não deu para tentar (já tentou há pouco). */
export async function recuperarDeVersaoAntiga(): Promise<boolean> {
  if (typeof window === 'undefined' || !podeRecuperar()) return false;
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if (typeof caches !== 'undefined') {
      const nomes = await caches.keys();
      await Promise.all(nomes.map((n) => caches.delete(n)));
    }
  } catch { /* melhor esforço */ }
  window.location.reload();
  return true;
}
