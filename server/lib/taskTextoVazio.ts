/**
 * Defesa contra perda de anotações em tasks.update.
 *
 * tasks.list não devolve `notes`/`description`; um cliente que abre o formulário sem ter carregado a tarefa
 * completa reenvia "" e apagava o texto. Regra: "" só apaga um texto existente quando vier o sinal explícito
 * (`limparNotas` / `limparDescricao`); sem o sinal, o campo é ignorado. Texto não vazio sempre grava.
 */
export type CampoTexto = 'notes' | 'description';

export function camposVaziosParaIgnorar(
  entrada: { notes?: string; description?: string; limparNotas?: boolean; limparDescricao?: boolean },
  atual: { notes?: string | null; description?: string | null } | undefined,
): CampoTexto[] {
  const ignorar: CampoTexto[] = [];
  if (entrada.notes === '' && !entrada.limparNotas && (atual?.notes ?? '') !== '') ignorar.push('notes');
  if (entrada.description === '' && !entrada.limparDescricao && (atual?.description ?? '') !== '') ignorar.push('description');
  return ignorar;
}
