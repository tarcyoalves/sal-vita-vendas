// Mensagem de erro do servidor nas telas do atendente.
import { describe, expect, it } from 'vitest';
import { mensagemDoServidor } from '../client/src/lib/erroMensagem';

describe('mensagemDoServidor', () => {
  it('usa a mensagem do servidor, o padrão quando vazia', () => {
    expect(mensagemDoServidor(new Error('Título não pode ficar vazio'), 'Erro ao salvar tarefa')).toBe('Título não pode ficar vazio');
    expect(mensagemDoServidor(new Error(''), 'Erro ao salvar tarefa')).toBe('Erro ao salvar tarefa');
    expect(mensagemDoServidor(undefined, 'Erro ao salvar tarefa')).toBe('Erro ao salvar tarefa');
    expect(mensagemDoServidor({ message: 'Sem permissão' }, 'x')).toBe('Sem permissão');
  });
  it('erro de rede vira frase em português; validação zod mostra só a primeira frase', () => {
    expect(mensagemDoServidor(new TypeError('Failed to fetch'), 'x')).toMatch(/Sem conexão/);
    expect(mensagemDoServidor(new Error('[{"code":"too_big","message":"Anotações grandes demais"}]'), 'x')).toBe('Anotações grandes demais');
    expect(mensagemDoServidor(new Error('[quebrado'), 'padrão')).toBe('padrão');
  });
});
