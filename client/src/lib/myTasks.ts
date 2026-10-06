// "Minhas tarefas" para quem é admin E também atende: a conta admin e o atendente
// com o mesmo nome/e-mail/usuário são a MESMA pessoa — nada de duas opções
// separadas no filtro de responsável.

export const FILTER_ME = '__me__';
export const FILTER_NONE = '__none__';
export const FILTER_ALL = 'all';

export interface MyIdentity {
  userId: number | null;
  /** nomes (minúsculos) que identificam a pessoa: conta de login + atendente(s) dela. */
  names: Set<string>;
}

interface UserLike { id: number; name?: string | null; email?: string | null }
interface AttendantLike { name?: string | null; userId?: number | null; email?: string | null }
interface TaskLike { userId?: number | null; assignedTo?: string | null }

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function buildMyIdentity(user: UserLike | null | undefined, attendants: AttendantLike[]): MyIdentity {
  const names = new Set<string>();
  if (!user) return { userId: null, names };
  if (norm(user.name)) names.add(norm(user.name));
  for (const a of attendants) {
    const mesmoUsuario = a.userId != null && a.userId === user.id;
    const mesmoEmail = !!norm(a.email) && norm(a.email) === norm(user.email);
    if ((mesmoUsuario || mesmoEmail) && norm(a.name)) names.add(norm(a.name));
  }
  return { userId: user.id, names };
}

/** Tarefa atribuída a mim, ou criada por mim e ainda sem responsável. */
export function isMine(task: TaskLike, me: MyIdentity): boolean {
  const responsavel = norm(task.assignedTo);
  if (responsavel) return me.names.has(responsavel);
  return me.userId != null && task.userId === me.userId;
}

/** Atendentes para o filtro, sem a(s) linha(s) que são eu (já cobertas por "Minhas tarefas"). */
export function otherAttendantNames(attendants: AttendantLike[], me: MyIdentity): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const a of attendants) {
    const n = a.name?.trim();
    if (!n || me.names.has(norm(n)) || vistos.has(norm(n))) continue;
    vistos.add(norm(n));
    out.push(n);
  }
  return out;
}

export function applyAssigneeFilter<T extends TaskLike>(tasks: T[], filter: string, me: MyIdentity): T[] {
  if (filter === FILTER_ALL) return tasks;
  if (filter === FILTER_ME) return tasks.filter((t) => isMine(t, me));
  if (filter === FILTER_NONE) return tasks.filter((t) => !t.assignedTo || t.assignedTo.trim() === '');
  return tasks.filter((t) => norm(t.assignedTo) === norm(filter));
}
