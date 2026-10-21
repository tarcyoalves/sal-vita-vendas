// Respostas rápidas: variáveis, busca por atalho, validação e CRUD (lógica pura).

import { describe, expect, it } from 'vitest';
import {
  atalhoValido,
  buscarRespostas,
  consultaDeAtalho,
  excluirResposta,
  normalizarAtalho,
  renderizarModelo,
  salvarResposta,
  validarResposta,
  variaveisDesconhecidas,
} from '../src/shared/crm-modelos';
import { dadosVazios } from '../src/shared/crm-store';
import type { RespostaRapida } from '../src/shared/crm-tipos';

const R = (id: string, titulo: string, atalho: string, texto: string): RespostaRapida => ({ id, titulo, atalho, texto });

describe('render de variáveis', () => {
  it('{nome} é o nome inteiro e {primeiro_nome} o primeiro', () => {
    expect(renderizarModelo('Olá, {primeiro_nome}! Pedido de {nome}.', 'Maria Souza')).toBe('Olá, Maria! Pedido de Maria Souza.');
  });

  it('o primeiro nome ignora tratamento e capitaliza', () => {
    expect(renderizarModelo('Oi {primeiro_nome}', 'dona JOÃO silva')).toBe('Oi João');
    expect(renderizarModelo('Oi {primeiro_nome}', 'Sr. Pedro Alves')).toBe('Oi Pedro');
  });

  it('repete a variável quantas vezes aparecer', () => {
    expect(renderizarModelo('{primeiro_nome}, {primeiro_nome}!', 'Ana Lima')).toBe('Ana, Ana!');
  });

  it('contato sem nome salvo (só número): as variáveis somem e a pontuação é arrumada', () => {
    expect(renderizarModelo('Olá, {primeiro_nome}! Tudo bem?', '+55 84 99999-0000')).toBe('Olá! Tudo bem?');
    expect(renderizarModelo('Oi {nome}, tudo certo?', '+55 84 99999-0000')).toBe('Oi, tudo certo?');
  });

  it('variável desconhecida fica como o usuário escreveu', () => {
    expect(renderizarModelo('Oi {primeiro_nome}, empresa {empresa}', 'Ana')).toBe('Oi Ana, empresa {empresa}');
    expect(variaveisDesconhecidas('Oi {nome} {empresa} {primeiro_nome} {x}')).toEqual(['{empresa}', '{x}']);
  });

  it('mantém quebras de linha e apara as pontas', () => {
    expect(renderizarModelo('  Oi {primeiro_nome}\n\nSegue o orçamento.  ', 'Ana')).toBe('Oi Ana\n\nSegue o orçamento.');
  });
});

describe('atalho e busca', () => {
  const lista = [
    R('1', 'Orçamento', 'orc', 'Segue o orçamento solicitado.'),
    R('2', 'Saudação', 'oi', 'Olá, {primeiro_nome}!'),
    R('3', 'Prazo de entrega', 'prazo', 'Entregamos em até 3 dias úteis. Qualquer orçamento fecha em 24h.'),
  ];

  it('consulta digitada na caixa: só "/" + letras', () => {
    expect(consultaDeAtalho('/orc')).toBe('orc');
    expect(consultaDeAtalho('/')).toBe('');
    expect(consultaDeAtalho('  /oi ')).toBe('oi');
    expect(consultaDeAtalho('oi /orc')).toBeNull();
    expect(consultaDeAtalho('/orc proposta')).toBeNull();
    expect(consultaDeAtalho('')).toBeNull();
  });

  it('atalho igual vem primeiro, depois prefixo, título e texto', () => {
    expect(buscarRespostas(lista, 'orc').map((r) => r.id)).toEqual(['1', '3']); // atalho "orc"; "orçamento" no texto do 3
    expect(buscarRespostas(lista, '/oi').map((r) => r.id)).toEqual(['2']);
    expect(buscarRespostas(lista, 'PRAZO').map((r) => r.id)).toEqual(['3']);
    expect(buscarRespostas(lista, 'saudacao').map((r) => r.id)).toEqual(['2']); // sem acento
    expect(buscarRespostas(lista, 'zzz')).toEqual([]);
  });

  it('consulta vazia lista todos em ordem de título', () => {
    expect(buscarRespostas(lista, '').map((r) => r.titulo)).toEqual(['Orçamento', 'Prazo de entrega', 'Saudação']);
  });

  it('normaliza e valida o atalho', () => {
    expect(normalizarAtalho('/ORÇ')).toBe('orc');
    expect(atalhoValido('orc-1')).toBe(true);
    expect(atalhoValido('com espaço')).toBe(false);
    expect(atalhoValido('a'.repeat(25))).toBe(false);
  });
});

describe('criar, editar e excluir modelos', () => {
  it('validação: título, texto e atalho (único)', () => {
    const existentes = [R('1', 'Orçamento', 'orc', 'x')];
    expect(validarResposta({ titulo: ' ', atalho: '', texto: 'x' }, existentes)).toMatch(/título/);
    expect(validarResposta({ titulo: 'A', atalho: '', texto: ' ' }, existentes)).toMatch(/texto/);
    expect(validarResposta({ titulo: 'A', atalho: 'com espaço', texto: 'x' }, existentes)).toMatch(/atalho/);
    expect(validarResposta({ titulo: 'A', atalho: '/ORC', texto: 'x' }, existentes)).toMatch(/já existe/);
    expect(validarResposta({ titulo: 'A', atalho: 'orc', texto: 'x' }, existentes, '1')).toBeNull(); // o próprio modelo
    expect(validarResposta({ titulo: 'A', atalho: '', texto: 'x' }, existentes)).toBeNull(); // atalho é opcional
  });

  it('salvar cria e depois edita pelo id; excluir remove', () => {
    const d = dadosVazios();
    expect(salvarResposta(d, { titulo: 'Orçamento', atalho: '/orc', texto: ' Segue o orçamento. ' })).toBeNull();
    expect(d.respostas).toHaveLength(1);
    expect(d.respostas[0]).toMatchObject({ titulo: 'Orçamento', atalho: 'orc', texto: 'Segue o orçamento.' });
    const id = d.respostas[0].id;
    expect(salvarResposta(d, { id, titulo: 'Orçamento 2', atalho: 'orc', texto: 'Novo texto' })).toBeNull();
    expect(d.respostas).toEqual([{ id, titulo: 'Orçamento 2', atalho: 'orc', texto: 'Novo texto' }]);
    expect(salvarResposta(d, { titulo: 'Outro', atalho: 'orc', texto: 'x' })).toMatch(/já existe/);
    excluirResposta(d, id);
    expect(d.respostas).toEqual([]);
  });
});
