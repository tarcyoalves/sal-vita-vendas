import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bancos simulados: cada execute() registra o SQL; `failOn` faz o passo falhar.
const calls: { db: string; text: string }[] = [];
let failOn: string | null = null;

function makeDb(name: string) {
  return {
    execute: vi.fn(async (q: { queryChunks?: unknown[] }) => {
      const text = JSON.stringify(q.queryChunks ?? q);
      calls.push({ db: name, text });
      if (failOn && name === failOn && /INSERT INTO email_suppressions/.test(text)) throw new Error('boom');
      if (/SELECT email FROM/.test(text) && name === 'main') return { rows: [{ email: 'Pessoa@Exemplo.com' }] };
      return { rows: [] };
    }),
  };
}

vi.mock('../server/db/ordersDb', () => ({ ordersDb: makeDb('orders') }));
vi.mock('../server/db', () => ({ db: makeDb('main') }));

import { handleUnsubscribe } from '../server/routers/unsubscribe';

function fakeRes() {
  const res = { statusCode: 0, body: '' } as { statusCode: number; body: string; status: (c: number) => typeof res; send: (b: string) => typeof res };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.send = (b: string) => { res.body = b; return res; };
  return res;
}
const req = (method: string, query: Record<string, string>, body: Record<string, string> = {}) =>
  ({ method, query, body }) as never;
const suppressionWrites = () => calls.filter(c => /INSERT INTO email_suppressions/.test(c.text));

beforeEach(() => { calls.length = 0; failOn = null; });

describe('handleUnsubscribe', () => {
  it('GET mostra confirmação com formulário POST e NÃO suprime', async () => {
    const res = fakeRes();
    await handleUnsubscribe(req('GET', { t: 'abc' }), res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('method="POST"');
    expect(res.body).toContain('Confirmar descadastro');
    expect(suppressionWrites()).toHaveLength(0);
  });

  it('GET escapa o token e o e-mail na página', async () => {
    const res = fakeRes();
    await handleUnsubscribe(req('GET', { t: '"><script>x</script>' }), res as never);
    expect(res.body).not.toContain('<script>x</script>');
  });

  it('POST one-click suprime nos dois bancos e responde 200 OK', async () => {
    const res = fakeRes();
    await handleUnsubscribe(req('POST', { t: 'abc' }, { 'List-Unsubscribe': 'One-Click' }), res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('OK');
    expect(suppressionWrites().map(c => c.db).sort()).toEqual(['main', 'orders']);
    // cancelamento de sequências/contatos também no banco do CRM
    expect(calls.some(c => c.db === 'main' && /email_sequence_enrollments/.test(c.text) && /cancelled/.test(c.text))).toBe(true);
    expect(calls.some(c => c.db === 'main' && /marketing_contacts/.test(c.text))).toBe(true);
  });

  it('POST do formulário devolve a página de sucesso', async () => {
    const res = fakeRes();
    await handleUnsubscribe(req('POST', { t: 'abc' }, { confirm: '1' }), res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Descadastro Confirmado');
    expect(res.body).toContain('pessoa@exemplo.com');
  });

  it('falha na supressão principal responde 500 e não diz Confirmado', async () => {
    failOn = 'orders';
    const res = fakeRes();
    await handleUnsubscribe(req('POST', { t: 'abc' }, { confirm: '1' }), res as never);
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('Descadastro Confirmado');

    const res2 = fakeRes();
    await handleUnsubscribe(req('POST', { t: 'abc' }), res2 as never);
    expect(res2.statusCode).toBe(500);
  });
});
