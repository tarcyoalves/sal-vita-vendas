// Lógica pura da importação de tarefas e da atribuição (sem banco, para teste).

/** Grafia do cadastro para o nome informado (lower/trim): atendente primeiro, depois conta admin/gerente. */
export function matchAssignee(nome: string, sellerNames: string[], staffNames: string[]): string | null {
  const alvo = nome.trim().toLowerCase();
  if (!alvo) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  return sellerNames.find(n => norm(n) === alvo) ?? staffNames.find(n => norm(n) === alvo) ?? null;
}

/** Marca como duplicada a linha cujo CNPJ ou telefone (já normalizados) existe em `jaExistem`. */
export function ehDuplicada(
  row: { cnpj?: string; phone?: string },
  jaExistem: { cnpjs: Set<string>; phones: Set<string> },
): boolean {
  return !!((row.cnpj && jaExistem.cnpjs.has(row.cnpj)) || (row.phone && jaExistem.phones.has(row.phone)));
}

/** Lembretes escalonados: o i-ésimo (0-based) em base + i * passo minutos. */
export function lembreteEscalonado(base: Date, indice: number, passoMin = 2): Date {
  return new Date(base.getTime() + indice * passoMin * 60_000);
}

/**
 * Roda `fn` nos itens: os `sequenciais` primeiros um a um, o resto em lotes concorrentes
 * (Promise.allSettled), parando de iniciar novos quando o orçamento de tempo acaba.
 * Quem sobra fica em `naoExecutados` (o chamador loga; a tarefa já foi criada).
 */
export async function executarComOrcamento<T>(
  itens: T[],
  fn: (item: T) => Promise<void>,
  opts: { sequenciais: number; concorrencia: number; orcamentoMs: number; agora?: () => number },
): Promise<{ executados: number; falhas: number; naoExecutados: T[] }> {
  const agora = opts.agora ?? Date.now;
  const limite = agora() + opts.orcamentoMs;
  let executados = 0;
  let falhas = 0;
  let i = 0;
  const rodar = async (item: T) => {
    try { await fn(item); executados++; } catch { falhas++; }
  };
  for (; i < Math.min(opts.sequenciais, itens.length); i++) {
    if (agora() >= limite) return { executados, falhas, naoExecutados: itens.slice(i) };
    await rodar(itens[i]);
  }
  while (i < itens.length) {
    if (agora() >= limite) return { executados, falhas, naoExecutados: itens.slice(i) };
    const lote = itens.slice(i, i + opts.concorrencia);
    await Promise.allSettled(lote.map(rodar));
    i += lote.length;
  }
  return { executados, falhas, naoExecutados: [] };
}

/**
 * Descarta linhas repetidas DENTRO do próprio arquivo (mesmo CNPJ ou telefone já normalizado) além das que já
 * existem no banco (`jaExistem`). A primeira ocorrência fica; `jaExistem` não é alterado.
 */
export function deduplicarNoArquivo<T extends { cnpj?: string; phone?: string }>(
  linhas: T[],
  jaExistem: { cnpjs: Set<string>; phones: Set<string> },
): T[] {
  const vistos = { cnpjs: new Set<string>(), phones: new Set<string>() };
  const mantidas: T[] = [];
  for (const l of linhas) {
    if (ehDuplicada(l, jaExistem) || ehDuplicada(l, vistos)) continue;
    if (l.cnpj) vistos.cnpjs.add(l.cnpj);
    if (l.phone) vistos.phones.add(l.phone);
    mantidas.push(l);
  }
  return mantidas;
}

/** Janela de `tasks.reminders`: de 24 h atrás até 7 dias à frente. */
export function janelaLembretes(agora: Date): { de: Date; ate: Date } {
  return { de: new Date(agora.getTime() - 24 * 3_600_000), ate: new Date(agora.getTime() + 7 * 24 * 3_600_000) };
}
