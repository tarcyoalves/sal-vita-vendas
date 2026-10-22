// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { barraDoBotao, deslocamento } from '../src/content/barra-formatacao';

const r = (top: number, bottom: number) => ({ top, bottom } as DOMRect);

describe('barra de formatação nativa', () => {
  it('sobe a barra para acima da caixa quando ela cobre o texto', () => {
    expect(deslocamento(r(600, 640), r(620, 680))).toBe(26);
  });
  it('não mexe quando a barra já está acima da caixa', () => {
    expect(deslocamento(r(560, 600), r(620, 680))).toBe(0);
  });
  it('acha o contêiner posicionado a partir do botão Itálico', () => {
    document.body.innerHTML = '<div id="b" style="position:absolute"><div><button aria-label="Itálico"></button></div></div>';
    expect(barraDoBotao(document.querySelector('button')!)?.id).toBe('b');
  });
});
