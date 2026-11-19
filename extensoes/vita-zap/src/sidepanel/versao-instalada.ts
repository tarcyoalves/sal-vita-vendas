// Versão instalada da extensão (a do manifest). Fora do Chrome (testes) devolve 'dev'.

export function versaoInstalada(): string {
  try {
    return chrome.runtime.getManifest().version || 'dev';
  } catch {
    return 'dev';
  }
}
