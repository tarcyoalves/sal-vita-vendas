import { describe, it, expect } from 'vitest';
import { limparBloqueioDeScrollSeOrfao } from '../client/src/lib/credito/scrollTravado';

function docFalso(temDialogo: boolean) {
  const attrs = new Set<string>(['data-scroll-locked']);
  const body = {
    style: { pointerEvents: 'none', overflow: 'hidden', paddingRight: '15px', marginRight: '' },
    hasAttribute: (n: string) => attrs.has(n),
    removeAttribute: (n: string) => { attrs.delete(n); },
  };
  return { doc: { body, querySelector: () => (temDialogo ? {} : null) } as unknown as Document, body, attrs };
}

describe('bloqueio de rolagem órfão', () => {
  it('limpa o body quando não há diálogo aberto', () => {
    const { doc, body, attrs } = docFalso(false);
    expect(limparBloqueioDeScrollSeOrfao(doc)).toBe(true);
    expect(body.style.overflow).toBe(''); expect(body.style.pointerEvents === '').toBe(true); expect(body.style.paddingRight).toBe('');
    expect(attrs.has('data-scroll-locked')).toBe(false);
  });
  it('não mexe quando há diálogo aberto', () => {
    const { doc, body } = docFalso(true);
    expect(limparBloqueioDeScrollSeOrfao(doc)).toBe(false);
    expect(body.style.overflow).toBe('hidden');
  });
});
