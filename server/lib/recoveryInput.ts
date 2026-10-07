// Entrada pública de recovery.trackCart (sem login): validação e saneamento puros.

/** Nome de pessoa: letras (com acento), espaço, apóstrofo, ponto e hífen; 2–60 caracteres após o trim. */
export function nomeClienteValido(raw: string): boolean {
  const s = raw.trim();
  return s.length >= 2 && s.length <= 60 && /^\p{L}[\p{L} '’.-]*$/u.test(s);
}

/** Normaliza espaços do nome já validado. */
export function normalizarNomeCliente(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Nome de cliente como DADO dentro de um prompt de IA: sem quebras de linha/controles,
 * limitado e entre aspas (JSON.stringify escapa aspas e barras), para não virar instrução.
 */
export function nomeComoDadoNoPrompt(name: string | null | undefined): string {
  const limpo = (name ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return JSON.stringify(limpo);
}

export const CADENCIA_JANELA_DIAS = 30;

/** Pode agendar nova cadência? Só se o telefone não teve nenhuma (qualquer status) na janela. */
export function podeAgendarCadencia(runsRecentesDoTelefone: number): boolean {
  return runsRecentesDoTelefone === 0;
}
