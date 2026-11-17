// Uma coisa de cada vez no WhatsApp Web: a campanha comum (aba 3) e o follow-up usam a MESMA aba e o mesmo
// content script. O content script já recusa pedidos simultâneos ('ocupado'), mas aqui o painel evita nem tentar:
// quem está rodando segura a trava; o outro mostra o motivo em vez de disputar a conversa aberta.

export type DonoDaTrava = 'campanha' | 'followup' | 'reativacao' | 'manual';

let dono: DonoDaTrava | null = null;
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const fn of ouvintes) fn();
}

export function donoDaTrava(): DonoDaTrava | null {
  return dono;
}

/** Pega a trava se estiver livre (ou já for sua). */
export function tentarTravar(quem: DonoDaTrava): boolean {
  if (dono !== null && dono !== quem) return false;
  if (dono !== quem) {
    dono = quem;
    avisar();
  }
  return true;
}

export function liberar(quem: DonoDaTrava): void {
  if (dono !== quem) return;
  dono = null;
  avisar();
}

export function assinarTrava(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export const ROTULO_DONO: Record<DonoDaTrava, string> = {
  campanha: 'uma campanha está enviando (aba 3. Envio)',
  followup: 'o follow-up está trabalhando',
  reativacao: 'a reativação está trabalhando',
  manual: 'uma resposta está sendo colada na conversa',
};
