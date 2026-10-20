// Definição ÚNICA de "tarefa atrasada" e de dono da tarefa, compartilhada por Dashboard (cliente) e TV (servidor).
// Funções puras: sem React, sem banco.

export interface TarefaAtrasavel {
  status?: string | null;
  assignedTo?: string | null;
  userId?: number | null;
  reminderDate?: Date | string | null;
  /** nulo/indefinido conta como LIGADO; só `=== false` desliga (igual a Tasks.tsx). */
  reminderEnabled?: boolean | null;
}
export interface AtendenteRef {
  id: number;
  name: string;
  userId?: number | null;
  status?: string | null;
}

const DAY_MS = 86_400_000;
/** Atrasada há mais que isto entra no contador "antigas". */
export const DIAS_ATRASO_ANTIGO = 30;

/** Dono da tarefa comparável: o servidor usa lower(), então maiúsculas/espaços não separam atendentes. */
export function normalizeOwner(name?: string | null): string {
  return (name ?? '').trim().toLowerCase();
}

/**
 * Atrasada = pendente, com data, lembrete não desativado (`=== false` desliga; nulo conta como ligado)
 * e data já passada.
 */
export function isTaskOverdue(t: TarefaAtrasavel, nowMs: number): boolean {
  if (t.status !== 'pending' || !t.reminderDate || t.reminderEnabled === false) return false;
  return new Date(t.reminderDate).getTime() < nowMs;
}

/** Tarefas de cada atendente: pelo nome (normalizado) OU pelo userId. Uma passada nas tarefas. */
export function indexTasksBySeller<T extends TarefaAtrasavel>(tasks: T[], sellers: AtendenteRef[]): Map<number, T[]> {
  const byName = new Map<string, T[]>();
  const byUser = new Map<number, T[]>();
  for (const t of tasks) {
    const key = normalizeOwner(t.assignedTo);
    if (key) {
      const a = byName.get(key);
      if (a) a.push(t); else byName.set(key, [t]);
    }
    if (t.userId != null) {
      const a = byUser.get(t.userId);
      if (a) a.push(t); else byUser.set(t.userId, [t]);
    }
  }
  const result = new Map<number, T[]>();
  for (const s of sellers) {
    const named = byName.get(normalizeOwner(s.name)) ?? [];
    const owned = s.userId != null ? byUser.get(s.userId) ?? [] : [];
    if (owned.length === 0) { result.set(s.id, named); continue; }
    if (named.length === 0) { result.set(s.id, owned); continue; }
    const seen = new Set<T>(named);
    result.set(s.id, [...named, ...owned.filter((t) => !seen.has(t))]);
  }
  return result;
}

export interface DetalheAtrasadas {
  total: number;
  /** Dono (pelo nome) é um atendente cadastrado e ativo. */
  comAtendenteAtivo: number;
  /** `assignedTo` vazio. */
  semAtendente: number;
  /** Dono é atendente inativo ou nome que não existe no cadastro. */
  atendenteInativo: number;
  /** Atrasadas há mais de DIAS_ATRASO_ANTIGO dias (subconjunto do total). */
  maisDe30Dias: number;
}

/** Detalha as tarefas JÁ filtradas como atrasadas. A soma dos três grupos é sempre o total. */
export function detalharAtrasadas(overdue: TarefaAtrasavel[], sellers: AtendenteRef[], nowMs: number): DetalheAtrasadas {
  const statusPorNome = new Map<string, string | null | undefined>();
  for (const s of sellers) statusPorNome.set(normalizeOwner(s.name), s.status);
  const d: DetalheAtrasadas = { total: overdue.length, comAtendenteAtivo: 0, semAtendente: 0, atendenteInativo: 0, maisDe30Dias: 0 };
  const limite = nowMs - DIAS_ATRASO_ANTIGO * DAY_MS;
  for (const t of overdue) {
    const dono = normalizeOwner(t.assignedTo);
    if (!dono) d.semAtendente++;
    else if (statusPorNome.has(dono) && (statusPorNome.get(dono) ?? 'active') === 'active') d.comAtendenteAtivo++;
    else d.atendenteInativo++;
    if (t.reminderDate && new Date(t.reminderDate).getTime() < limite) d.maisDe30Dias++;
  }
  return d;
}

/** Texto curto para a tela; só cita os grupos que têm tarefa. Ex.: "12 com atendente ativo · 3 sem atendente · 5 há mais de 30 dias". */
export function resumoAtrasadas(d: DetalheAtrasadas): string {
  const partes: string[] = [];
  if (d.comAtendenteAtivo) partes.push(`${d.comAtendenteAtivo} com atendente ativo`);
  if (d.semAtendente) partes.push(`${d.semAtendente} sem atendente`);
  if (d.atendenteInativo) partes.push(`${d.atendenteInativo} com atendente inativo`);
  if (d.maisDe30Dias) partes.push(`${d.maisDe30Dias} há mais de ${DIAS_ATRASO_ANTIGO} dias`);
  return partes.join(' · ');
}
