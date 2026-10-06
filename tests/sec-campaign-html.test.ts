import { describe, it, expect } from 'vitest';
import { sanitizeCampaignHtml, sanitizeUntrustedHtml, isAllowedAttachmentName } from '../server/lib/emailSanitize';

const bad = (html: string) => sanitizeUntrustedHtml(html).toLowerCase();

describe('sanitizeUntrustedHtml (atendente) — payloads', () => {
  it('remove <img onerror>', () => {
    const out = bad('<img src=x onerror=alert(1)>');
    expect(out).not.toContain('onerror');
  });
  it('remove <scr<script>ipt>', () => {
    const out = bad('<scr<script>ipt>alert(1)</scr</script>ipt>');
    expect(out).not.toMatch(/<\s*script/);
    expect(out).not.toMatch(/<scr/);
  });
  it('remove javascript: em href (inclusive ofuscado)', () => {
    expect(bad('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript');
    expect(bad('<a href="  JaVa\tScRiPt:alert(1)">x</a>')).not.toContain('script:');
    expect(bad('<a href="&#106;avascript:alert(1)">x</a>')).not.toContain('javascript');
  });
  it('remove data: em href e src', () => {
    expect(bad('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>')).not.toContain('data:');
    expect(bad('<img src="data:image/svg+xml;base64,AAAA">')).not.toContain('data:');
  });
  it('remove iframe, form, svg, object, embed', () => {
    const out = bad('<iframe src="https://x.com"></iframe><form action="https://x.com"><input name=a></form><svg onload=alert(1)></svg><object data=x></object><embed src=x>');
    for (const t of ['<iframe', '<form', '<input', '<svg', 'onload', '<object', '<embed']) expect(out).not.toContain(t);
  });
  it('remove estilos perigosos mas mantém os normais', () => {
    expect(bad('<div style="width:expression(alert(1))">a</div>')).not.toContain('expression');
    expect(bad('<div style="background:url(javascript:alert(1))">a</div>')).not.toContain('javascript');
    expect(bad('<div style="background:url(data:text/html,x)">a</div>')).not.toContain('data:');
    expect(bad('<style>@import url(https://x.com/a.css); p{width:expression(alert(1))}</style>x')).toBe('x');
    expect(sanitizeUntrustedHtml('<p style="color:#0C3680;font-size:15px">a</p>')).toContain('color:#0C3680');
  });
  it('remove script e eventos', () => {
    const out = bad('<script>alert(1)</script><p onclick="x()">a</p><body onload=x()>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onload');
  });
});

describe('sanitizeUntrustedHtml (atendente) — preservação', () => {
  it('mantém tabela com estilos inline', () => {
    const html = '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff"><tbody><tr><td colspan="2" align="center" style="padding:8px">Oi</td></tr></tbody></table>';
    const out = sanitizeUntrustedHtml(html);
    expect(out).toContain('<table');
    expect(out).toContain('colspan="2"');
    expect(out).toContain('padding:8px');
  });
  it('mantém links http/https/mailto e botão-link', () => {
    const out = sanitizeUntrustedHtml('<a href="https://salvitarn.com.br/x?a=1&b=2" style="background:#0C3680;color:#fff;padding:10px">Comprar</a><a href="mailto:a@b.com">m</a>');
    expect(out).toContain('href="https://salvitarn.com.br/x?a=1&amp;b=2"');
    expect(out).toContain('mailto:a@b.com');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('background:#0C3680');
  });
  it('mantém imagens https e placeholders', () => {
    const out = sanitizeUntrustedHtml('<img src="https://x.com/a.png" alt="a" width="100"><a href="{unsubscribe}">sair</a><p>Olá {nome}</p>');
    expect(out).toContain('src="https://x.com/a.png"');
    expect(out).toContain('href="{unsubscribe}"');
    expect(out).toContain('{nome}');
  });
});

describe('isAllowedAttachmentName', () => {
  it('aceita só extensões permitidas', () => {
    for (const n of ['a.pdf', 'A.PNG', 'x.jpg', 'x.jpeg', 'x.webp', 'x.gif', 'x.doc', 'x.docx', 'x.xls', 'x.xlsx', 'x.csv', 'x.txt']) expect(isAllowedAttachmentName(n)).toBe(true);
    for (const n of ['a.exe', 'a.html', 'a.svg', 'a.js', 'a.pdf.exe', 'a', 'a.zip', '.pdf.']) expect(isAllowedAttachmentName(n)).toBe(false);
  });
});


describe('sanitizeCampaignHtml (equipe) — preserva o template, remove o que executa', () => {
  it('mantém <style>, media query e documento completo', () => {
    const html = '<html><head><style>@media (max-width:600px){.c{width:100%}}</style></head><body><table class="c"><tr><td>Oi</td></tr></table></body></html>';
    expect(sanitizeCampaignHtml(html)).toBe(html);
  });
  it('remove script, eventos, javascript:, iframe e form', () => {
    expect(sanitizeCampaignHtml('<p>a</p><script>alert(1)</script>')).toBe('<p>a</p>');
    expect(sanitizeCampaignHtml('<scr<script></script>ipt>alert(1)</scr<script></script>ipt>')).not.toMatch(/<script/i);
    expect(sanitizeCampaignHtml('<img src=x onerror=alert(1)>')).not.toMatch(/onerror/i);
    expect(sanitizeCampaignHtml('<img/src=x/onerror=alert(1)>')).not.toMatch(/onerror/i);
    expect(sanitizeCampaignHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript/i);
    expect(sanitizeCampaignHtml('<a href="data:text/html;base64,AAA">x</a>')).not.toMatch(/data:text\/html/i);
    expect(sanitizeCampaignHtml('a<iframe src="https://x"></iframe>b')).toBe('ab');
    expect(sanitizeCampaignHtml('<form action="x"><input></form>')).not.toMatch(/<form/i);
  });
  it('mantém links https, botão estilizado e placeholders', () => {
    const html = '<a href="https://salvita.com.br" style="background:#0C3680;padding:12px">Ver</a> {nome} <a href="{unsubscribe}">sair</a>';
    expect(sanitizeCampaignHtml(html)).toBe(html);
  });
});
