// Saúde do painel para a tela "Hoje" (v0.7.60): o que está falhando AGORA e não fica gravado em lugar nenhum (a IA do CRM
// não respondeu na última rodada). Em memória, uma por janela; a tela Hoje lê daqui. Nada vai ao servidor nem ao disco.

let falha: { motivo: string; em: number } | null = null;
const ouvintes = new Set<() => void>();
const avisar = (): void => {
  for (const fn of [...ouvintes]) fn();
};

/** A IA não respondeu na última rodada (fora do ar, limite diário, sem login). */
export function falhaDaIa(motivo: string, agora: number = Date.now()): void {
  falha = { motivo, em: agora };
  avisar();
}

/** Uma chamada à IA deu certo: a falha anterior não vale mais. */
export function iaFuncionou(): void {
  if (falha === null) return;
  falha = null;
  avisar();
}

export const falhaAtualDaIa = (): { motivo: string; em: number } | null => falha;

export function aoMudarSaude(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => void ouvintes.delete(fn);
}
