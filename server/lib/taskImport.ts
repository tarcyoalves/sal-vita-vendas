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
