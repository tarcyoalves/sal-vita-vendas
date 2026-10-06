// Contato real: anotação nova (>15 caracteres) que MUDOU em relação ao que está gravado.
// A tela envia as notas em todo save; sem comparar, qualquer edição (tag, prioridade) contaria contato.
const normalizar = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function isNewContact(prevNotes: string | null | undefined, newNotes: string | null | undefined): boolean {
  const novo = normalizar(newNotes);
  return novo.length > 15 && novo !== normalizar(prevNotes);
}
