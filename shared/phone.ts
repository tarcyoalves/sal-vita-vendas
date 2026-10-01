// Telefone de uma tarefa. A coluna `tasks.phone` só é preenchida na criação e na importação;
// quem digita o número depois (título ou anotações) fica sem ela. Por isso o telefone de uma
// tarefa é: a coluna, se válida, senão o primeiro número achado no título/anotações.
// Sem lookbehind de propósito (Safari anterior ao 16.4 quebraria a página inteira).

const PHONE_RX = /(?:^|\D)(\(?\d{2}\)?[\s.]*\d{4,5}[-\s]?\d{4})(?!\d)/;

/** Só dígitos, sem DDI 55; devolve null se não parecer telefone brasileiro (10 ou 11 dígitos). */
export function normalizeBrPhone(value: string | null | undefined): string | null {
  let d = (value ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/** Primeiro telefone encontrado num texto livre (DDD + número), já normalizado. */
export function extractPhoneDigits(text: string | null | undefined): string | null {
  const m = (text ?? '').match(PHONE_RX);
  return m ? normalizeBrPhone(m[1]) : null;
}

export function phoneOfTask(t: { phone?: string | null; title?: string | null; notes?: string | null }): string | null {
  return normalizeBrPhone(t.phone) ?? extractPhoneDigits(`${t.title ?? ''} ${t.notes ?? ''}`);
}
