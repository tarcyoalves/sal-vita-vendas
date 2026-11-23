import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../server/db', () => ({ db: {}, sql: () => ({}) }));
vi.mock('../server/db/index', () => ({ db: {}, sql: () => ({}) }));

import { renderTemplate, renderTemplateHtml, escapeHtml, layout } from '../server/email/marketing';

const read = (f: string) => readFileSync(f, 'utf8');
const ATAQUES = [
  '<script>alert(1)</script>',
  '<a href="javascript:alert(1)">clique</a>',
  '"><img src=x onerror=alert(1)>',
  "' onmouseover='alert(1)",
  'Johnson & Sons',
  '<p>fake</p>',
];

describe('B4 — renderTemplateHtml: nome/empresa nunca viram HTML', () => {
  const tplHtml = '<p>Olá {nome}, da {empresa}</p><p><a href="{unsubscribe}">sair</a></p>';

  it.each(ATAQUES)('template HTML escapa %s', (v) => {
    const out = renderTemplateHtml(tplHtml, { nome: v, empresa: v, unsubscribe: 'https://x.test/u?t=abc' });
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<a href="javascript/i);
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/<[^>]*\son(error|mouseover)=/i);
    expect(out).not.toContain('<p>fake</p>');
    // o link de descadastro (HTML de propósito) continua intacto
    expect(out).toContain('<a href="https://x.test/u?t=abc">sair</a>');
  });

  it('escapa & < > aspas uma vez só (sem &amp;amp;)', () => {
    const out = renderTemplateHtml('<p>{nome}</p>', { nome: 'A&B <"x">' });
    expect(out).toBe('<p>A&amp;B &lt;&quot;x&quot;&gt;</p>');
  });

  it.each(ATAQUES)('template texto puro (via layout) não deixa passar %s', (v) => {
    const html = layout(renderTemplateHtml('Olá {nome}\n\nSua empresa: {empresa}\n\nSair: {unsubscribe}', { nome: v, empresa: v, unsubscribe: 'https://x.test/u?t=abc' }), 'https://x.test/u?t=abc');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<a href="javascript/i);
    expect(html).not.toMatch(/<img src=x/i);
    expect(html).not.toContain('<p>fake</p>');
  });

  it('texto puro: "&" aparece escapado uma única vez', () => {
    const out = renderTemplateHtml('Olá {nome}', { nome: 'Johnson & Sons' });
    expect(out).toContain('Johnson &amp; Sons');
    expect(out).not.toContain('&amp;amp;');
  });

  it('texto puro: um nome com <p> não reclassifica o corpo como HTML', () => {
    const out = renderTemplateHtml('Olá {nome}', { nome: '<p>x</p><script>alert(1)</script>' });
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain('&lt;script&gt;');
  });

  it('texto puro: o link de descadastro continua clicável', () => {
    const out = renderTemplateHtml('Sair: {unsubscribe}', { unsubscribe: 'https://x.test/u?t=abc' });
    expect(out).toContain('<a href="https://x.test/u?t=abc"');
  });

  it('"$&" no nome não é interpretado como padrão de substituição', () => {
    expect(renderTemplate('Oi {nome}', { nome: "$& $1 $'" })).toBe("Oi $& $1 $'");
  });

  it('escapeHtml cobre aspas simples e duplas', () => {
    expect(escapeHtml(`<a href="x" b='y'>&`)).toBe('&lt;a href=&quot;x&quot; b=&#39;y&#39;&gt;&amp;');
  });

  it('assunto (texto puro) continua sem escape', () => {
    expect(renderTemplate('Oi {nome}', { nome: 'A & B' })).toBe('Oi A & B');
  });
});

describe('B4 — fiação', () => {
  it('todos os corpos HTML do CRM usam renderTemplateHtml; assuntos continuam em renderTemplate', () => {
    const campaigns = read('server/email/campaigns.ts');
    expect(campaigns).toMatch(/layout\(renderTemplateHtml\(campaign\.htmlBody/);
    expect(campaigns).toMatch(/subject: renderTemplate\(subjectTemplate/);
    expect(read('server/email/automations.ts')).toMatch(/layout\(renderMktTemplateHtml\(step\.htmlBody/);
    expect(read('server/routers/emailMarketing.ts')).toMatch(/layout\(renderTemplateHtml\(cleanBody/);
  });
  it('Disparo Rápido limita o nome a 100 caracteres', () => {
    const r = read('server/routers/emailMarketing.ts');
    const i = r.indexOf('isBroadcast: true', r.indexOf('recipients: z.array(z.object({\n        email: z.string().email(),\n        name: z.string().max(100)'));
    expect(r).toMatch(/email: z\.string\(\)\.email\(\),\n\s+name: z\.string\(\)\.max\(100\)\.optional\(\),\n\s+\}\)\)\.min\(1\)\.max\(50\)/);
    expect(i).toBeGreaterThan(0);
  });
});

describe('B5 — e-mail confirmado pelo próprio atendente no mesmo dia: só log', () => {
  it('registra log estruturado sem dados pessoais e não muda a regra', () => {
    const r = read('server/routers/emailMarketing.ts');
    expect(r).toMatch(/evt: 'broadcast_self_confirmed_same_day', userId: ctx\.user\.id, count: n/);
    // a regra de elegibilidade continua a mesma: só e-mails confirmados das próprias tarefas
    expect(r).toMatch(/eq\(tasks\.emailConfirmed, true\), isNotNull\(tasks\.email\)/);
    expect(r).toMatch(/if \(allowedOwn && !allowedOwn\.has\(email\)\) continue;/);
  });
});
