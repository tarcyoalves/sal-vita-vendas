import { describe, it, expect } from 'vitest';
import {
  normalizeOwner, isTaskOverdue, indexTasksBySeller, computeDashboardAgg, type DashTask,
} from '../client/src/lib/dashboardAgg';

const NOW = new Date('2026-10-06T15:00:00').getTime();
const past = new Date('2026-10-05T10:00:00');
const future = new Date('2026-10-07T10:00:00');

describe('normalizeOwner', () => {
  it('ignora maiúsculas e espaços nas pontas (servidor usa lower())', () => {
    expect(normalizeOwner('  Maria Silva ')).toBe('maria silva');
    expect(normalizeOwner(null)).toBe('');
  });
});

describe('isTaskOverdue', () => {
  it('pendente + data passada + lembrete não desativado', () => {
    expect(isTaskOverdue({ status: 'pending', reminderDate: past }, NOW)).toBe(true);
    // reminderEnabled indefinido conta como ligado (mesma regra de Tasks.tsx)
    expect(isTaskOverdue({ status: 'pending', reminderDate: past, reminderEnabled: undefined }, NOW)).toBe(true);
  });
  it('não conta desativada, futura, sem data ou concluída', () => {
    expect(isTaskOverdue({ status: 'pending', reminderDate: past, reminderEnabled: false }, NOW)).toBe(false);
    expect(isTaskOverdue({ status: 'pending', reminderDate: future }, NOW)).toBe(false);
    expect(isTaskOverdue({ status: 'pending' }, NOW)).toBe(false);
    expect(isTaskOverdue({ status: 'completed', reminderDate: past }, NOW)).toBe(false);
  });
});

describe('indexTasksBySeller', () => {
  const sellers = [
    { id: 1, name: 'Maria Silva', userId: 10 },
    { id: 2, name: 'João', userId: null },
  ];
  it('casa o dono sem diferenciar maiúsculas e sem duplicar tarefa que casa por nome e userId', () => {
    const tasks: DashTask[] = [
      { id: 1, assignedTo: 'maria silva', userId: 10 },   // nome + userId: conta uma vez
      { id: 2, assignedTo: ' MARIA SILVA ', userId: 99 }, // só nome
      { id: 3, assignedTo: null, userId: 10 },            // só userId
      { id: 4, assignedTo: 'João', userId: undefined },
      { id: 5, assignedTo: 'Outro', userId: 77 },
    ];
    const idx = indexTasksBySeller(tasks, sellers);
    expect(idx.get(1)!.map((t) => t.id).sort()).toEqual([1, 2, 3]);
    expect(idx.get(2)!.map((t) => t.id)).toEqual([4]);
  });
  it('userId nulo do atendente não casa com tarefas sem userId', () => {
    const idx = indexTasksBySeller([{ id: 9, assignedTo: 'x', userId: undefined }], sellers);
    expect(idx.get(2)).toEqual([]);
  });
});

describe('computeDashboardAgg', () => {
  const sellers = [{ id: 1, name: 'Ana', userId: 1 }];
  const tasks: DashTask[] = [
    { id: 1, status: 'pending', assignedTo: 'ANA', reminderDate: past, reminderEnabled: true, createdAt: new Date('2026-10-01T10:00:00') },
    { id: 2, status: 'pending', assignedTo: 'ana', reminderDate: past, reminderEnabled: false },
    { id: 3, status: 'completed', assignedTo: 'Ana', convertedAt: new Date('2026-10-02T10:00:00'), createdAt: new Date('2026-10-01T10:00:00'), contactCount: 3, lastContactedAt: new Date('2026-10-06T09:00:00') },
    { id: 4, status: 'cancelled', assignedTo: 'Ana' },
  ];
  const agg = computeDashboardAgg(tasks, sellers, NOW);
  it('atrasadas ignoram lembrete desativado, no total e por atendente', () => {
    expect(agg.overdue.map((t) => t.id)).toEqual([1]);
    expect(agg.sellerStats.get(1)!.overdue).toBe(1);
  });
  it('agrega por atendente com dono normalizado', () => {
    expect(agg.sellerStats.get(1)!.tasks).toHaveLength(4);
    expect(agg.sellerStats.get(1)!.contactsToday).toBe(1);
    expect(agg.contactsToday).toBe(1);
    expect(agg.conversionRanking[0]).toMatchObject({ name: 'Ana', total: 4, converted: 1, cancelled: 1, lostRate: 50 });
  });
  it('totais e taxas', () => {
    expect(agg.pending).toHaveLength(2);
    expect(agg.completionRate).toBe(25);
    expect(agg.conversionRate).toBe(25);
    expect(agg.lostRateGlobal).toBe(50);
    expect(agg.weeklyTrend).toHaveLength(8);
  });
  it('lista vazia não gera NaN', () => {
    const e = computeDashboardAgg([], [], NOW);
    expect(e.completionRate).toBe(0);
    expect(e.avgFirstContactDays).toBe(0);
    expect(e.hotLeads).toEqual([]);
  });
});
