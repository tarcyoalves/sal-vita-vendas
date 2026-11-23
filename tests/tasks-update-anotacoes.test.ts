// Perda de anotações: tasks.update não pode gravar notes/description vazios sobre texto existente sem o sinal explícito.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { textosParaEnviar } from '../client/src/lib/tasks/textoEditado';
import { camposVaziosParaIgnorar } from '../server/lib/taskTextoVazio';

const h = vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'segredo-so-para-teste';
  const updates: Record<string, unknown>[] = [];
  const estado: { tarefa: Record<string, unknown> } = { tarefa: {} };
  const q: Record<string, unknown> = {};
  Object.assign(q, { from: () => q, where: () => q, limit: async () => [estado.tarefa] });
  const db = {
    select: () => q,
    update: () => ({ set: (set: Record<string, unknown>) => ({ where: () => { updates.push(set); return { returning: async () => [{ ...estado.tarefa, ...set }] }; } }) }),
  };
  return { updates, estado, db };
});
vi.mock('../server/db', () => ({ db: h.db }));
vi.mock('../server/email/automations', () => ({ cancelAllEnrollments: vi.fn(), runTriggerNow: vi.fn(), enrollInSequence: vi.fn() }));

import { tasksRouter } from '../server/routers/tasks';
const chamar = (entrada: Record<string, unknown>) =>
  tasksRouter.createCaller({ user: { id: 1, name: 'Admin', email: 'a@x.com', role: 'admin', mustChangePassword: false } } as never).update({ id: 5, ...entrada } as never);

beforeEach(() => {
  h.updates.length = 0;
  h.estado.tarefa = { id: 5, title: 'Padaria', notes: 'Ligar terça. Pediu tabela.', description: 'Cliente antigo', phone: '84999990000', email: null, tags: [] };
});

describe('tasks.update: texto vazio', () => {
  it('não apaga notes/description existentes quando chegam vazios sem sinal', async () => {
    await chamar({ title: 'Padaria', notes: '', description: '' });
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).not.toHaveProperty('notes');
    expect(h.updates[0]).not.toHaveProperty('description');
    expect(h.updates[0]).toHaveProperty('title', 'Padaria');
  });

  it('apaga quando vem o sinal explícito', async () => {
    await chamar({ notes: '', limparNotas: true, description: '', limparDescricao: true });
    expect(h.updates[0]).toHaveProperty('notes', '');
    expect(h.updates[0]).toHaveProperty('description', '');
    expect(h.updates[0]).not.toHaveProperty('limparNotas');
  });

  it('o sinal vale por campo', async () => {
    await chamar({ notes: '', limparNotas: true, description: '' });
    expect(h.updates[0]).toHaveProperty('notes', '');
    expect(h.updates[0]).not.toHaveProperty('description');
  });

  it('texto não vazio é gravado normalmente', async () => {
    await chamar({ notes: 'Nova anotação', description: 'Nova descrição' });
    expect(h.updates[0]).toMatchObject({ notes: 'Nova anotação', description: 'Nova descrição' });
  });

  it('chamadores antigos (extensão Vita Zap) que não mandam notes continuam funcionando', async () => {
    await chamar({ reminderEnabled: true, tags: ['a'] });
    expect(h.updates[0]).not.toHaveProperty('notes');
    expect(h.updates[0]).toHaveProperty('tags');
  });

  it('vazio sobre campo já vazio no banco é inofensivo (grava)', async () => {
    h.estado.tarefa = { ...h.estado.tarefa, notes: '', description: null };
    await chamar({ notes: '', description: '' });
    expect(h.updates[0]).toHaveProperty('notes', '');
  });
});

describe('camposVaziosParaIgnorar', () => {
  it('ignora só o que é vazio, sem sinal e com texto no banco', () => {
    expect(camposVaziosParaIgnorar({ notes: '', description: 'x' }, { notes: 'a', description: 'b' })).toEqual(['notes']);
    expect(camposVaziosParaIgnorar({ notes: '', limparNotas: true }, { notes: 'a' })).toEqual([]);
    expect(camposVaziosParaIgnorar({ notes: '' }, undefined)).toEqual([]);
  });
});

describe('textosParaEnviar (cliente: só envia se mudou)', () => {
  const carregado = { notes: 'abc', description: 'def' };
  it('nada mudou: não envia nada', () => {
    expect(textosParaEnviar(carregado, { ...carregado })).toEqual({});
  });
  it('mudou uma: envia só ela', () => {
    expect(textosParaEnviar(carregado, { notes: 'abc!', description: 'def' })).toEqual({ notes: 'abc!' });
  });
  it('apagou de propósito: envia vazio com o sinal', () => {
    expect(textosParaEnviar(carregado, { notes: '', description: 'def' })).toEqual({ notes: '', limparNotas: true });
  });
  it('estava vazio e continua vazio: nada', () => {
    expect(textosParaEnviar({ notes: '', description: '' }, { notes: '', description: '' })).toEqual({});
  });
  it('estava vazio e foi preenchido: sem sinal', () => {
    expect(textosParaEnviar({ notes: '', description: '' }, { notes: 'x', description: '' })).toEqual({ notes: 'x' });
  });
});
