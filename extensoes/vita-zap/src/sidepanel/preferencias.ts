// Preferências de interface (último termo, rascunho de texto, rotinas). Só conveniência: se o
// localStorage falhar, o painel funciona igual. Dados de campanha ficam no IndexedDB.

import { mesclarComPadrao, ROTINAS_PADRAO, type Rotina } from '../shared/rotinas';

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

export function carregarRotinasSalvas(): Rotina[] {
  const raw = lerPreferencia('rotinas', '');
  if (!raw) return [...ROTINAS_PADRAO];
  try {
    const parsed = JSON.parse(raw) as Rotina[];
    return mesclarComPadrao(parsed);
  } catch {
    return [...ROTINAS_PADRAO];
  }
}

export function salvarRotinas(rotinas: Rotina[]): void {
  salvarPreferencia('rotinas', JSON.stringify(rotinas));
}
