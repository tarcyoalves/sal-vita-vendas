import { describe, it, expect } from 'vitest';
import { ordenarTarefas, pontosCliente } from '../client/src/lib/taskOrder';

const AGORA = Date.parse('2026-10-10T12:00:00Z');
const t = (id: number, dia: string | null, extra: object = {}) => ({ id, reminderDate: dia ? `2026-${dia}T09:00:00Z` : null, ...extra });
const ids = (l: { id: number }[]) => l.map((x) => x.id);

describe('ordem das tarefas', () => {
  const lista = [t(1, '10-19'), t(2, '07-13'), t(3, null), t(4, '10-08'), t(5, '06-26')];
  it('mais atrasadas primeiro: da mais antiga para a mais nova, sem lembrete por último', () => {
    expect(ids(ordenarTarefas(lista, 'atrasadas', AGORA, false))).toEqual([5, 2, 4, 1, 3]);
  });
  it('mais novas primeiro', () => {
    expect(ids(ordenarTarefas(lista, 'recentes', AGORA, false))).toEqual([1, 4, 2, 5, 3]);
  });
  it('próximas primeiro (agendadas, depois atrasadas da mais recente)', () => {
    expect(ids(ordenarTarefas(lista, 'proximas', AGORA, false))).toEqual([1, 4, 2, 5, 3]);
  });
  it('melhores clientes antes; lead quente antes de todos', () => {
    const l = [t(1, '06-01'), t(2, '10-05', { tags: ['Cliente compra muito'] }), t(3, '09-01', { tags: ['ativo'] }), t(4, '10-09', { hotLead: true })];
    expect(ids(ordenarTarefas(l, 'atrasadas', AGORA, true))).toEqual([4, 2, 3, 1]);
    expect(ids(ordenarTarefas(l, 'atrasadas', AGORA, false))).toEqual([4, 1, 3, 2]);
  });
  it('pontos', () => {
    expect(pontosCliente({ tags: ['Cliente compra muito'] })).toBe(2);
    expect(pontosCliente({ tags: ['Cliente ativo'] })).toBe(1);
    expect(pontosCliente({ tags: ['Sal moído'] })).toBe(0);
    expect(pontosCliente({ tags: [], convertedAt: new Date() })).toBe(1);
  });
});
