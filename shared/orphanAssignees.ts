// Responsáveis "sem cadastro": valores de tasks.assigned_to (ex.: importados por CSV, ou com erro de
// digitação) que não casam com nenhum atendente nem com conta admin/gerente. Lógica pura, usada pelo
// servidor (tasks.orphanAssignees) e pela tela (rótulo do filtro e aviso).

export interface AssigneeCount { name: string; count: number }

export const ORPHAN_LIMIT = 200;

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/** Mantém só os nomes sem cadastro (trim + sem diferenciar maiúsculas), por contagem desc., até `limit`. */
export function pickOrphans(rows: AssigneeCount[], registered: Array<string | null | undefined>, limit = ORPHAN_LIMIT): AssigneeCount[] {
  const known = new Set(registered.map(norm).filter(Boolean));
  const merged = new Map<string, AssigneeCount>();
  for (const r of rows) {
    const key = norm(r.name);
    if (!key || known.has(key)) continue;
    const cur = merged.get(key);
    if (cur) cur.count += r.count;
    else merged.set(key, { name: r.name.trim(), count: r.count });
  }
  return [...merged.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

export function orphanLabel(o: AssigneeCount): string {
  return `${o.name} (sem cadastro · ${o.count})`;
}

export function orphanWarning(orphans: AssigneeCount[]): string | null {
  if (orphans.length === 0) return null;
  const top = orphans[0];
  return `Há tarefas com responsável sem cadastro (ex.: ${top.name} – ${top.count}). Em Tarefas › Filtros › Responsável, escolha o nome, selecione tudo e use Designar.`;
}
