/**
 * Quais textos da tarefa o formulário de edição deve enviar no tasks.update.
 * Só envia `notes`/`description` quando o usuário alterou o campo em relação ao que foi carregado; se o apagou
 * de propósito (havia texto e agora está vazio), manda também o sinal `limparNotas`/`limparDescricao`.
 */
export interface TextosTarefa { notes: string; description: string }

export function textosParaEnviar(carregado: TextosTarefa, atual: TextosTarefa) {
  const out: { notes?: string; description?: string; limparNotas?: true; limparDescricao?: true } = {};
  if (atual.notes !== carregado.notes) {
    out.notes = atual.notes;
    if (atual.notes === '' && carregado.notes !== '') out.limparNotas = true;
  }
  if (atual.description !== carregado.description) {
    out.description = atual.description;
    if (atual.description === '' && carregado.description !== '') out.limparDescricao = true;
  }
  return out;
}
