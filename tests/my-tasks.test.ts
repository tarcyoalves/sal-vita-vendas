import { describe, expect, it } from 'vitest';
import { FILTER_ALL, FILTER_ME, FILTER_NONE, applyAssigneeFilter, buildMyIdentity, isMine, otherAttendantNames } from '../client/src/lib/myTasks';

const user = { id: 1, name: 'Admin Sal Vita', email: 'tarcyo@exemplo.com' };
const attendants = [
  { id: 10, name: 'Tarcyo', userId: 1, email: 'tarcyo@exemplo.com' },
  { id: 11, name: 'Maria', userId: 2, email: 'maria@exemplo.com' },
  { id: 12, name: 'tarcyo alves', userId: null, email: 'TARCYO@exemplo.com' },
];
const me = buildMyIdentity(user, attendants);

describe('minhas tarefas (admin = atendente)', () => {
  it('une conta admin e atendente da mesma pessoa (id ou e-mail)', () => {
    expect([...me.names].sort()).toEqual(['admin sal vita', 'tarcyo', 'tarcyo alves']);
  });
  it('tarefa atribuída a qualquer nome meu é minha, sem diferenciar maiúsculas', () => {
    expect(isMine({ assignedTo: 'TARCYO', userId: 2 }, me)).toBe(true);
    expect(isMine({ assignedTo: 'Admin Sal Vita', userId: 2 }, me)).toBe(true);
    expect(isMine({ assignedTo: 'Maria', userId: 1 }, me)).toBe(false);
  });
  it('sem responsável: minha só se fui eu quem criou', () => {
    expect(isMine({ assignedTo: null, userId: 1 }, me)).toBe(true);
    expect(isMine({ assignedTo: '  ', userId: 2 }, me)).toBe(false);
  });
  it('a lista de outros atendentes não repete as linhas que são eu', () => {
    expect(otherAttendantNames(attendants, me)).toEqual(['Maria']);
  });
  it('filtros: minhas / todos / sem atendente / um atendente', () => {
    const tasks = [
      { id: 1, assignedTo: 'Tarcyo', userId: 1 },
      { id: 2, assignedTo: 'Maria', userId: 1 },
      { id: 3, assignedTo: null, userId: 1 },
      { id: 4, assignedTo: null, userId: 2 },
    ];
    expect(applyAssigneeFilter(tasks, FILTER_ME, me).map((t) => t.id)).toEqual([1, 3]);
    expect(applyAssigneeFilter(tasks, FILTER_ALL, me)).toHaveLength(4);
    expect(applyAssigneeFilter(tasks, FILTER_NONE, me).map((t) => t.id)).toEqual([3, 4]);
    expect(applyAssigneeFilter(tasks, 'maria', me).map((t) => t.id)).toEqual([2]);
  });
  it('sem usuário logado não há "minhas"', () => {
    const vazio = buildMyIdentity(null, attendants);
    expect(isMine({ assignedTo: 'Tarcyo', userId: 1 }, vazio)).toBe(false);
  });
});
