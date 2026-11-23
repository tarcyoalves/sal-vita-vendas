// Lista de tarefas em pedaços de 50 ("Mostrar mais").
import { describe, expect, it } from 'vitest';
import { PASSO_LISTA, chaveCriterios, fatiarLista, proximoLimite, rotuloMostrarMais, textoContador } from '../client/src/lib/tasks/paginacao';

const lista = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('fatiarLista', () => {
  it('mostra o primeiro pedaço e o que sobra', () => {
    const p = fatiarLista(lista(3120), PASSO_LISTA);
    expect(p.mostrando).toBe(50);
    expect(p.total).toBe(3120);
    expect(p.restante).toBe(3070);
    expect(p.temMais).toBe(true);
    expect(p.visiveis[0]).toBe(1);
    expect(p.visiveis[49]).toBe(50);
  });
  it('lista curta não tem "mostrar mais"', () => {
    const p = fatiarLista(lista(12), PASSO_LISTA);
    expect(p).toMatchObject({ mostrando: 12, total: 12, restante: 0, temMais: false });
    expect(fatiarLista([], PASSO_LISTA)).toMatchObject({ mostrando: 0, total: 0, temMais: false });
  });
  it('exatamente 50 não oferece mais; 51 oferece 1', () => {
    expect(fatiarLista(lista(50), 50).temMais).toBe(false);
    const p = fatiarLista(lista(51), 50);
    expect(p.temMais).toBe(true);
    expect(rotuloMostrarMais(p.restante)).toBe('Mostrar mais 1');
  });
  it('limite inválido não quebra', () => {
    expect(fatiarLista(lista(80), Number.NaN).mostrando).toBe(50);
    expect(fatiarLista(lista(80), -5).mostrando).toBe(0);
  });
});

describe('Mostrar mais', () => {
  it('cada clique soma 50 e o rótulo mostra quantos vêm', () => {
    let l = PASSO_LISTA;
    l = proximoLimite(l);
    expect(l).toBe(100);
    expect(fatiarLista(lista(120), l).restante).toBe(20);
    expect(rotuloMostrarMais(20)).toBe('Mostrar mais 20');
    expect(rotuloMostrarMais(3070)).toBe('Mostrar mais 50');
  });
  it('contador em português', () => {
    expect(textoContador(50, 3120)).toBe('Mostrando 50 de 3.120');
  });
});

describe('chaveCriterios', () => {
  it('muda ao trocar busca/filtro/aba, igual quando nada mudou', () => {
    const base = ['all', 'all', ['a'], 'termo', true] as const;
    expect(chaveCriterios(base)).toBe(chaveCriterios(['all', 'all', ['a'], 'termo', true]));
    expect(chaveCriterios(base)).not.toBe(chaveCriterios(['all', 'all', ['a'], 'outro', true]));
    expect(chaveCriterios(base)).not.toBe(chaveCriterios(['overdue', 'all', ['a'], 'termo', true]));
    expect(chaveCriterios(base)).not.toBe(chaveCriterios(['all', 'all', ['a', 'b'], 'termo', true]));
  });
});
