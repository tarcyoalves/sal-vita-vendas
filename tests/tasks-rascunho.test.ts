// Rascunho do formulário de tarefa: localStorage por usuário/tarefa, sem fazer campo parecer "apagado de propósito".
import { describe, expect, it } from 'vitest';
import {
  aplicarRascunho, chaveRascunho, formularioAlterado, lerRascunho, limparRascunho, restaurarTexto, salvarRascunho,
  VALIDADE_RASCUNHO_MS, type Armazenamento, type CamposTarefa,
} from '../client/src/lib/tasks/rascunho';
import { textosParaEnviar } from '../client/src/lib/tasks/textoEditado';

const VAZIO: CamposTarefa = {
  clientId: 0, title: '', description: '', notes: '', email: '', tags: [], reminderDate: '', reminderTime: '09:00',
  reminderEnabled: true, priority: 'medium', assignedTo: '',
};
function memoria(): Armazenamento & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return { dados, getItem: (k) => dados.get(k) ?? null, setItem: (k, v) => void dados.set(k, v), removeItem: (k) => void dados.delete(k) };
}
const T0 = Date.UTC(2026, 10, 23, 15);

describe('chave e alteração', () => {
  it('chave separa usuário e tarefa/nova', () => {
    expect(chaveRascunho(7, null)).not.toBe(chaveRascunho(8, null));
    expect(chaveRascunho(7, null)).not.toBe(chaveRascunho(7, 12));
    expect(chaveRascunho(7, 12)).toBe(chaveRascunho(7, 12));
  });
  it('formularioAlterado vê qualquer campo, inclusive tags', () => {
    expect(formularioAlterado(VAZIO, { ...VAZIO })).toBe(false);
    expect(formularioAlterado(VAZIO, { ...VAZIO, notes: 'x' })).toBe(true);
    expect(formularioAlterado(VAZIO, { ...VAZIO, tags: ['a'] })).toBe(true);
    expect(formularioAlterado({ ...VAZIO, tags: ['a'] }, { ...VAZIO, tags: ['a'] })).toBe(false);
    expect(formularioAlterado(VAZIO, { ...VAZIO, reminderEnabled: false })).toBe(true);
  });
});

describe('salvar / ler / limpar', () => {
  it('ida e volta e limpeza', () => {
    const m = memoria();
    const k = chaveRascunho(1, null);
    expect(salvarRascunho(m, k, { ...VAZIO, title: 'Padaria' }, { notes: '', description: '' }, T0)).toBe(true);
    expect(lerRascunho(m, k, T0 + 1000)?.campos.title).toBe('Padaria');
    limparRascunho(m, k);
    expect(lerRascunho(m, k, T0 + 1000)).toBeNull();
  });
  it('rascunho vencido ou corrompido é descartado e apagado', () => {
    const m = memoria();
    const k = chaveRascunho(1, 5);
    salvarRascunho(m, k, VAZIO, { notes: '', description: '' }, T0);
    expect(lerRascunho(m, k, T0 + VALIDADE_RASCUNHO_MS + 1)).toBeNull();
    expect(m.dados.has(k)).toBe(false);
    m.dados.set(k, '{nao é json');
    expect(lerRascunho(m, k, T0)).toBeNull();
    expect(m.dados.has(k)).toBe(false);
    m.dados.set(k, JSON.stringify({ v: 1, salvoEm: T0, campos: { title: 1 }, base: {} }));
    expect(lerRascunho(m, k, T0)).toBeNull();
  });
  it('acesso ao armazenamento que lança nunca quebra', () => {
    const ruim: Armazenamento = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('cheio'); }, removeItem: () => { throw new Error('x'); } };
    expect(salvarRascunho(ruim, 'k', VAZIO, { notes: '', description: '' }, T0)).toBe(false);
    expect(lerRascunho(ruim, 'k', T0)).toBeNull();
    expect(() => limparRascunho(ruim, 'k')).not.toThrow();
    expect(salvarRascunho(null, 'k', VAZIO, { notes: '', description: '' }, T0)).toBe(false);
    expect(lerRascunho(null, 'k', T0)).toBeNull();
  });
});

describe('restaurarTexto: o rascunho não faz campo parecer apagado de propósito', () => {
  it('campo que o usuário não mexeu fica com o texto atual do servidor', () => {
    expect(restaurarTexto('antigo', 'antigo', 'novo no servidor')).toBe('novo no servidor');
  });
  it('rascunho vazio sobre texto do servidor não restaura o vazio', () => {
    expect(restaurarTexto('', 'tinha texto', 'tinha texto')).toBe('tinha texto');
  });
  it('texto digitado é restaurado quando o servidor não mudou', () => {
    expect(restaurarTexto('antigo + novo', 'antigo', 'antigo')).toBe('antigo + novo');
  });
  it('servidor e usuário mudaram: mantém o servidor e acrescenta só o que foi digitado', () => {
    expect(restaurarTexto('antigo\nfalei com Ana', 'antigo', 'antigo\n[23/11] ligou')).toBe('antigo\n[23/11] ligou\nfalei com Ana');
  });
  it('tarefa nova: texto digitado volta', () => {
    expect(restaurarTexto('oi', '', '')).toBe('oi');
  });
});

describe('aplicarRascunho + textosParaEnviar (lote 1)', () => {
  it('rascunho com anotação vazia não gera limparNotas se o servidor tem texto', () => {
    const servidor = { notes: 'Ligar terça', description: 'Cliente' };
    const r = { v: 1 as const, salvoEm: T0, base: servidor, campos: { ...VAZIO, title: 'Padaria', notes: '', description: 'Cliente' } };
    const form = aplicarRascunho(r, servidor);
    expect(form.notes).toBe('Ligar terça');
    expect(textosParaEnviar(servidor, { notes: form.notes, description: form.description })).toEqual({});
  });
  it('apagar de propósito DEPOIS de restaurar continua enviando o sinal', () => {
    const servidor = { notes: 'Ligar terça', description: '' };
    expect(textosParaEnviar(servidor, { notes: '', description: '' })).toMatchObject({ notes: '', limparNotas: true });
  });
  it('rascunho com texto novo envia só o campo alterado', () => {
    const servidor = { notes: 'A', description: 'D' };
    const r = { v: 1 as const, salvoEm: T0, base: servidor, campos: { ...VAZIO, notes: 'A mais', description: 'D' } };
    const form = aplicarRascunho(r, servidor);
    expect(textosParaEnviar(servidor, { notes: form.notes, description: form.description })).toEqual({ notes: 'A mais' });
  });
});
