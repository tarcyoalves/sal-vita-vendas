import { describe, it, expect } from 'vitest';
import { plainTextToEmailHtml, looksLikeHtml } from '../shared/emailText';

describe('texto simples → e-mail (editor do painel)', () => {
  it('parágrafos, quebra de linha, lista, link e negrito', () => {
    const html = plainTextToEmailHtml('Olá, Maria!\n\nLinha 1\nLinha 2\n\n- um\n- dois\n\n**Oi** [Comprar](https://x.com/?a=1&b=2)');
    expect(html).toContain('>Olá, Maria!</p>');
    expect(html).toContain('Linha 1<br/>Linha 2');
    expect(html).toMatch(/<ul[^>]*><li>um<\/li><li>dois<\/li><\/ul>/);
    expect(html).toContain('<strong>Oi</strong>');
    expect(html).toContain('<a href="https://x.com/?a=1&amp;b=2"');
    expect(html).toContain('>Comprar</a>');
  });
  it('escapa HTML digitado e recusa link perigoso', () => {
    const html = plainTextToEmailHtml('<script>x</script> [clique](javascript:alert(1))');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/href="javascript/i); // fica só como texto, sem virar link
  });
  it('aceita marcador ainda não trocado como link', () => {
    expect(plainTextToEmailHtml('[Loja]({link_loja})')).toContain('href="{link_loja}"');
  });
  it('reconhece corpo que já é HTML', () => {
    expect(looksLikeHtml('<p style="x">oi</p>')).toBe(true);
    expect(looksLikeHtml('oi **negrito**')).toBe(false);
  });
});