// @vitest-environment jsdom
//
// Filtro da lista virtualizada: esconde sem reordenar, encosta as linhas que ficam (sem buraco),
// restaura tudo e convive com o WhatsApp reescrevendo o translateY.

import { beforeEach, describe, expect, it } from 'vitest';
import { aplicarFiltroNaLista } from '../src/content/crm/filtro-lista';

let linhas: HTMLElement[];

function lista(posicoes: Array<number | null>): HTMLElement[] {
  document.body.innerHTML = '';
  return posicoes.map((y, i) => {
    const el = document.createElement('div');
    el.setAttribute('role', 'listitem');
    el.dataset.nome = `L${i}`;
    if (y != null) el.style.transform = `translateY(${y}px)`;
    document.body.append(el);
    return el;
  });
}

const itens = (mostrar: boolean[]) => linhas.map((el, i) => ({ el, mostrar: mostrar[i] }));
const y = (i: number) => linhas[i].style.transform;
const oculta = (i: number) => linhas[i].style.display === 'none';

beforeEach(() => {
  linhas = lista([0, 72, 144, 216]);
});

describe('aplicarFiltroNaLista', () => {
  it('esconde as que não batem e encosta as outras no topo', () => {
    aplicarFiltroNaLista(itens([true, false, false, true]), true);
    expect([oculta(0), oculta(1), oculta(2), oculta(3)]).toEqual([false, true, true, false]);
    expect(y(0)).toBe('translateY(0px)');
    expect(y(3)).toBe('translateY(72px)');
  });

  it('com a lista rolada, encosta no início da janela renderizada (não no topo da lista)', () => {
    linhas = lista([720, 792, 864, 936]);
    aplicarFiltroNaLista(itens([false, true, false, true]), true);
    expect(y(1)).toBe('translateY(720px)');
    expect(y(3)).toBe('translateY(792px)');
  });

  it('não depende da ordem do DOM: usa a posição das linhas', () => {
    linhas = lista([144, 0, 72]); // DOM fora de ordem
    aplicarFiltroNaLista(itens([true, true, false]), true); // L2 (y=72) escondida
    expect(y(1)).toBe('translateY(0px)');
    expect(y(0)).toBe('translateY(72px)');
    expect(linhas.map((e) => e.dataset.nome)).toEqual(['L0', 'L1', 'L2']); // DOM intocado
  });

  it('reaplicar com o mesmo filtro não muda nada (idempotente)', () => {
    aplicarFiltroNaLista(itens([true, false, true, false]), true);
    const antes = linhas.map((e) => `${e.style.display}|${e.style.transform}`);
    aplicarFiltroNaLista(itens([true, false, true, false]), true);
    expect(linhas.map((e) => `${e.style.display}|${e.style.transform}`)).toEqual(antes);
  });

  it('desligar o filtro devolve cada linha ao transform original e mostra todas', () => {
    aplicarFiltroNaLista(itens([false, false, true, true]), true);
    aplicarFiltroNaLista(itens([true, true, true, true]), false);
    expect(linhas.map((e) => e.style.transform)).toEqual(['translateY(0px)', 'translateY(72px)', 'translateY(144px)', 'translateY(216px)']);
    expect(linhas.every((e) => e.style.display !== 'none')).toBe(true);
  });

  it('trocar de filtro sem desligar também restaura o que voltou a aparecer', () => {
    aplicarFiltroNaLista(itens([true, false, false, false]), true);
    aplicarFiltroNaLista(itens([false, true, true, false]), true);
    expect([oculta(0), oculta(1), oculta(2), oculta(3)]).toEqual([true, false, false, true]);
    expect(y(1)).toBe('translateY(0px)');
    expect(y(2)).toBe('translateY(72px)');
  });

  it('se o WhatsApp reescreve o translateY (rolagem/reciclagem), o novo valor vira o original', () => {
    aplicarFiltroNaLista(itens([false, true, true, false]), true);
    linhas[2].style.transform = 'translateY(1440px)'; // o WhatsApp moveu a linha
    aplicarFiltroNaLista(itens([false, true, true, false]), true);
    expect(y(2)).toBe('translateY(72px)'); // recompactada
    aplicarFiltroNaLista(itens([true, true, true, true]), false);
    expect(y(2)).toBe('translateY(1440px)'); // restaura o valor MAIS NOVO do WhatsApp, não o antigo
  });

  it('lista sem transform (não virtualizada): só esconde e mostra', () => {
    linhas = lista([null, null, null]);
    aplicarFiltroNaLista(itens([true, false, true]), true);
    expect([oculta(0), oculta(1), oculta(2)]).toEqual([false, true, false]);
    expect(linhas.every((e) => e.style.transform === '')).toBe(true);
    aplicarFiltroNaLista(itens([true, true, true]), false);
    expect(linhas.some((_, i) => oculta(i))).toBe(false);
  });
});
