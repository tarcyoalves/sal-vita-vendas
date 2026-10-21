// Notas, etiquetas com cor e fase do funil (lógica pura sobre os dados em memória).

import { describe, expect, it } from 'vitest';
import {
  adicionarNota,
  alternarEtiqueta,
  criarEtiqueta,
  definirFase,
  dispensarConversa,
  editarNota,
  excluirEtiqueta,
  excluirNota,
  opcoesDeFiltro,
  reativarConversa,
  renomearEtiqueta,
} from '../src/shared/crm-contatos';
import { dadosVazios } from '../src/shared/crm-store';
import type { Conversa } from '../src/shared/crm-tipos';

const T = 1_700_000_000_000;

describe('notas', () => {
  it('adiciona (a mais nova primeiro), edita e exclui', () => {
    const d = dadosVazios();
    expect(adicionarNota(d, 'ana', 'Ana', '   ', T)).toMatch(/Escreva/);
    expect(adicionarNota(d, 'ana', 'Ana', 'Preço: R$ 38 o saco', T, 'n1')).toBeNull();
    expect(adicionarNota(d, 'ana', 'Ana', 'Quer entrega na sexta', T + 1000, 'n2')).toBeNull();
    expect(d.contatos.ana.notas.map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(editarNota(d, 'ana', 'n1', 'Preço: R$ 40 o saco', T + 2000)).toBeNull();
    expect(d.contatos.ana.notas[1]).toMatchObject({ texto: 'Preço: R$ 40 o saco', editadaEm: T + 2000 });
    expect(editarNota(d, 'ana', 'n1', '', T)).toMatch(/vazia/);
    expect(editarNota(d, 'ana', 'nada', 'x', T)).toMatch(/não encontrada/);
    excluirNota(d, 'ana', 'n2', T + 3000);
    expect(d.contatos.ana.notas.map((n) => n.id)).toEqual(['n1']);
  });

  it('limita o tamanho da nota', () => {
    expect(adicionarNota(dadosVazios(), 'ana', 'Ana', 'x'.repeat(2001), T)).toMatch(/2000/);
  });
});

describe('etiquetas com cor', () => {
  it('cria, recusa nome vazio e repetido (sem diferenciar maiúscula/acento)', () => {
    const d = dadosVazios();
    expect('erro' in criarEtiqueta(d, '  ', '#00a884')).toBe(true);
    const r = criarEtiqueta(d, 'Cliente fiel', '#8e24aa', 'e1');
    expect(r).toEqual({ etiqueta: { id: 'e1', nome: 'Cliente fiel', cor: '#8e24aa' } });
    expect(criarEtiqueta(d, 'CLIENTE FIEL', '#00a884')).toEqual({ erro: 'Já existe uma etiqueta com esse nome.' });
    expect(criarEtiqueta(d, 'Orçamento enviado', 'cor-invalida', 'e2')).toMatchObject({ etiqueta: { cor: '#00a884' } });
    expect(d.etiquetas).toHaveLength(2);
  });

  it('liga e desliga no contato (cria o contato se preciso)', () => {
    const d = dadosVazios();
    criarEtiqueta(d, 'Quente', '#c62828', 'e1');
    expect(alternarEtiqueta(d, 'ana', 'Ana', 'e1', T)).toBe(true);
    expect(d.contatos.ana.etiquetas).toEqual(['e1']);
    expect(alternarEtiqueta(d, 'ana', 'Ana', 'e1', T)).toBe(false);
    expect(d.contatos.ana.etiquetas).toEqual([]);
  });

  it('excluir a etiqueta tira de todos os contatos e do filtro salvo', () => {
    const d = dadosVazios();
    criarEtiqueta(d, 'Quente', '#c62828', 'e1');
    alternarEtiqueta(d, 'ana', 'Ana', 'e1', T);
    d.config.filtroEtiquetas = ['e1', 'fase:novo'];
    excluirEtiqueta(d, 'e1');
    expect(d.etiquetas).toEqual([]);
    expect(d.contatos.ana.etiquetas).toEqual([]);
    expect(d.config.filtroEtiquetas).toEqual(['fase:novo']);
  });

  it('renomear mantém o nome único', () => {
    const d = dadosVazios();
    criarEtiqueta(d, 'Quente', '#c62828', 'e1');
    criarEtiqueta(d, 'Frio', '#0288d1', 'e2');
    expect(renomearEtiqueta(d, 'e2', 'quente', '#0288d1')).toMatch(/Já existe/);
    expect(renomearEtiqueta(d, 'e2', 'Gelado', '#455a64')).toBeNull();
    expect(d.etiquetas[1]).toMatchObject({ nome: 'Gelado', cor: '#455a64' });
  });
});

describe('fase do funil', () => {
  it('define e tira a fase', () => {
    const d = dadosVazios();
    definirFase(d, 'ana', 'Ana', 'negociando', T);
    expect(d.contatos.ana.fase).toBe('negociando');
    definirFase(d, 'ana', 'Ana', null, T);
    expect(d.contatos.ana.fase).toBeUndefined();
  });

  it('as opções do filtro trazem as 5 fases e as etiquetas, com busca por texto', () => {
    const d = dadosVazios();
    criarEtiqueta(d, 'Cliente fiel', '#8e24aa', 'e1');
    expect(opcoesDeFiltro(d, '').map((o) => o.rotulo)).toEqual(['Novo', 'Orçamento', 'Negociando', 'Fechado', 'Perdido', 'Cliente fiel']);
    expect(opcoesDeFiltro(d, 'orcam').map((o) => o.id)).toEqual(['fase:orcamento']);
    expect(opcoesDeFiltro(d, 'fiel').map((o) => o.id)).toEqual(['e1']);
    expect(opcoesDeFiltro(d, 'zzz')).toEqual([]);
  });
});

describe('dispensar / reativar', () => {
  it('guarda a assinatura da conversa e permite voltar', () => {
    const d = dadosVazios();
    expect(dispensarConversa(d, 'ana', T)).toBe(false); // conversa que nunca vimos
    d.conversas.ana = { chave: 'ana', nome: 'Ana', ass: 'obrigado|0' } as Conversa;
    expect(dispensarConversa(d, 'ana', T)).toBe(true);
    expect(d.contatos.ana.dispensadaAss).toBe('obrigado|0');
    reativarConversa(d, 'ana', T + 1);
    expect(d.contatos.ana.dispensadaAss).toBeUndefined();
  });
});
