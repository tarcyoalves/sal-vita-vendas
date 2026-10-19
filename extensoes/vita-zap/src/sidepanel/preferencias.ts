// Preferências de interface (último termo, rascunho de texto). Só conveniência: se o
// localStorage falhar, o painel funciona igual. Dados de campanha ficam no IndexedDB.

const PREFIXO = 'vitaZap:';

export function lerPreferencia(chave: string, padrao: string): string {
  try {
    return localStorage.getItem(PREFIXO + chave) ?? padrao;
  } catch {
    return padrao;
  }
}

export function salvarPreferencia(chave: string, valor: string): void {
  try {
    localStorage.setItem(PREFIXO + chave, valor);
  } catch {
    /* sem armazenamento: ignora */
  }
}
