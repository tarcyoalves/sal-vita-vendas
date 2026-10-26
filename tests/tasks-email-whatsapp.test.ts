// tasks.setEmailFromWhatsapp (extensão Vita Zap): digitar/salvar o e-mail no WhatsApp confirma o lead.
// Banco simulado: o teste olha QUAL filtro de dono foi usado (SQL renderizado) e o que foi gravado.
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'segredo-so-para-teste';
  const chamadas: { selects: unknown[]; updates: { set: Record<string, unknown>; where: unknown }[] } = { selects: [], updates: [] };
  const estado: { tarefa: Record<string, unknown> | null; sellerNome: string | null } = { tarefa: null, sellerNome: 'Ana Vendedora' };
  function selecao() {
    const q = {
      from: () => q,
      where: (w: unknown) => { chamadas.selects.push(w); return q; },
      limit: async () => (estado.tarefa ? [estado.tarefa] : []),
      // sellers (meusLeadsFilter) é aguardado sem .limit()
      then: (ok: (v: unknown) => unknown) => Promise.resolve(estado.sellerNome ? [{ name: estado.sellerNome }] : []).then(ok),
    };
    return q;
  }
  const db = {
    select: () => selecao(),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: unknown) => {
          chamadas.updates.push({ set, where });
          return { returning: async () => (estado.tarefa ? [{ ...estado.tarefa, ...set }] : []) };
        },
      }),
    }),
  };
  return { chamadas, estado, db, cancelAllEnrollments: vi.fn(async () => undefined), runTriggerNow: vi.fn(async () => undefined) };
});
const { chamadas, cancelAllEnrollments, runTriggerNow } = h;
vi.mock('../server/db', () => ({ db: h.db }));
vi.mock('../server/email/automations', () => ({ cancelAllEnrollments: h.cancelAllEnrollments, runTriggerNow: h.runTriggerNow, enrollInSequence: vi.fn() }));

import { tasksRouter } from '../server/routers/tasks';
import { emailDoWhatsappInput, notaEmailInformado, planejarEmail, anexarLinhaNota, TAG_EMAIL_CONFIRMADO } from '../server/lib/emailDoWhatsapp';

const sql = (w: unknown): string => new PgDialect().sqlToQuery(w as never).sql;
const chamar = (role: string, entrada: unknown) =>
  tasksRouter.createCaller({ user: { id: 7, name: 'Ana', email: 'ana@x.com', role, mustChangePassword: false } } as never).setEmailFromWhatsapp(entrada as never);

const base = () => ({ id: 5, title: 'Padaria', email: null, emailConfirmed: false, tags: ['quente'], notes: 'Pediu tabela.', assignedTo: 'Ana', contactCount: 2, lastContactedAt: null });

beforeEach(() => {
  chamadas.selects.length = 0;
  chamadas.updates.length = 0;
  cancelAllEnrollments.mockClear();
  runTriggerNow.mockClear();
  h.estado.tarefa = base();
  h.estado.sellerNome = 'Ana Vendedora';
});

describe('setEmailFromWhatsapp: autorização', () => {
  it('atendente: filtra pelos leads PRÓPRIOS (meusLeadsFilter) na leitura e na gravação', async () => {
    await chamar('user', { taskId: 5, email: 'dono@padaria.com' });
    expect(sql(chamadas.selects.at(-1))).toContain('lower(trim(');
    expect(sql(chamadas.updates[0].where)).toContain('lower(trim(');
  });

  it('atendente sem a tarefa: NOT_FOUND e nada é gravado', async () => {
    h.estado.tarefa = null;
    await expect(chamar('user', { taskId: 5, email: 'dono@padaria.com' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(chamadas.updates).toHaveLength(0);
    expect(runTriggerNow).not.toHaveBeenCalled();
  });

  it('admin: só o id, em qualquer tarefa', async () => {
    await chamar('admin', { taskId: 5, email: 'dono@padaria.com' });
    expect(sql(chamadas.selects.at(-1))).not.toContain('lower(trim(');
    expect(chamadas.updates).toHaveLength(1);
  });

  it('sem login: recusa', async () => {
    const c = tasksRouter.createCaller({ user: null } as never);
    await expect(c.setEmailFromWhatsapp({ taskId: 5, email: 'a@b.com' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('setEmailFromWhatsapp: validação', () => {
  it.each(['sem-arroba', 'a@', '', 'a b@c.com'])('recusa e-mail inválido %j', async (email) => {
    await expect(chamar('user', { taskId: 5, email })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(chamadas.updates).toHaveLength(0);
  });

  it('recusa domínio bloqueado pelo dono e taskId inválido', async () => {
    await expect(chamar('user', { taskId: 5, email: 'x@salina.com.br' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(chamar('user', { taskId: 0, email: 'a@b.com' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(chamadas.updates).toHaveLength(0);
  });

  it('normaliza: espaços e maiúsculas', () => {
    expect(emailDoWhatsappInput.parse({ taskId: 1, email: '  Dono@Padaria.COM ' }).email).toBe('dono@padaria.com');
  });
});

describe('setEmailFromWhatsapp: efeito', () => {
  it('grava e-mail, confirma, sincroniza a tag e anexa a nota datada; não conta como contato', async () => {
    const r = await chamar('user', { taskId: 5, email: 'Dono@Padaria.com' });
    const set = chamadas.updates[0].set;
    expect(set).toMatchObject({ email: 'dono@padaria.com', emailConfirmed: true, emailConfirmedBy: 'Ana' });
    expect(set.emailConfirmedAt).toBeInstanceOf(Date);
    expect(set.tags).toEqual(['quente', TAG_EMAIL_CONFIRMADO]);
    expect(String(set.notes)).toMatch(/^Pediu tabela\.\nE-mail informado pelo atendente via WhatsApp em \d{2}\/\d{2}\/\d{4}$/);
    expect(set).not.toHaveProperty('contactCount');
    expect(set).not.toHaveProperty('lastContactedAt');
    expect(r.emailConfirmed).toBe(true);
    expect(runTriggerNow.mock.calls.map((c) => c[0])).toEqual(['lead_created', 'email_confirmed']);
    expect(cancelAllEnrollments).not.toHaveBeenCalled();
  });

  it('trocar o e-mail cancela as sequências do antigo', async () => {
    h.estado.tarefa = { ...base(), email: 'antigo@padaria.com', emailConfirmed: true, tags: [TAG_EMAIL_CONFIRMADO] };
    await chamar('user', { taskId: 5, email: 'novo@padaria.com' });
    expect(cancelAllEnrollments).toHaveBeenCalledWith('antigo@padaria.com');
    expect(chamadas.updates[0].set.tags).toEqual([TAG_EMAIL_CONFIRMADO]); // sem duplicar a tag
  });

  it('mesmo e-mail já confirmado: idempotente, não grava nem dispara automação', async () => {
    h.estado.tarefa = { ...base(), email: 'dono@padaria.com', emailConfirmed: true };
    await chamar('user', { taskId: 5, email: 'dono@padaria.com' });
    expect(chamadas.updates).toHaveLength(0);
    expect(runTriggerNow).not.toHaveBeenCalled();
  });

  it('mesmo e-mail ainda NÃO confirmado (importado): confirma', async () => {
    h.estado.tarefa = { ...base(), email: 'dono@padaria.com', emailConfirmed: false };
    await chamar('user', { taskId: 5, email: 'dono@padaria.com' });
    expect(chamadas.updates[0].set.emailConfirmed).toBe(true);
    expect(cancelAllEnrollments).not.toHaveBeenCalled();
  });
});

describe('regras puras', () => {
  it('nota usa a data de Fortaleza (noite de 26/10 em UTC ainda é 26/10 lá)', () => {
    expect(notaEmailInformado(new Date('2026-10-27T01:30:00Z'))).toBe('E-mail informado pelo atendente via WhatsApp em 26/10/2026');
  });

  it('notas no limite: descarta linhas inteiras do início e mantém a nova', () => {
    const velha = 'x'.repeat(4990);
    const r = anexarLinhaNota(`${velha}\nlinha 2`, 'NOVA LINHA', 5000);
    expect(r).toBe('linha 2\nNOVA LINHA');
    expect(anexarLinhaNota(null, 'a')).toBe('a');
  });

  it('planejarEmail compara sem diferenciar maiúsculas do e-mail guardado', () => {
    const p = planejarEmail({ email: 'Dono@Padaria.com', emailConfirmed: true, tags: null, notes: null }, 'dono@padaria.com', new Date(), 'Ana');
    expect(p.mudou).toBe(false);
  });
});
