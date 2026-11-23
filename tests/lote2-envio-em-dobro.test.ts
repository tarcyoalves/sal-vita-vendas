import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

// ── Lote 2 / A: mensagens em dobro (loja Premium) ─────────────────────────────
type Call = { text: string; params: unknown[] };
function flatten(q: any): Call {
  let text = '';
  const params: unknown[] = [];
  for (const c of q.queryChunks ?? []) {
    if (c && Array.isArray(c.value)) text += c.value.join('');
    else if (c && Array.isArray(c.queryChunks)) {
      const inner = flatten(c);
      text += inner.text;
      params.push(...inner.params);
    } else { text += '?'; params.push(c); }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), params };
}

const calls: Call[] = [];
const updates: Array<{ t: unknown; v: Record<string, unknown> }> = [];
let claimedRows: Array<Record<string, unknown>> = [];
const tableRows = new Map<unknown, unknown[]>();

function chain(rows: unknown[]) {
  const c: any = { where: () => c, orderBy: () => c, limit: () => c, then: (res: any, rej: any) => Promise.resolve(rows).then(res, rej) };
  return c;
}

vi.mock('../server/db/ordersDb', () => ({
  ordersDb: {
    execute: vi.fn(async (q: any) => {
      const c = flatten(q);
      calls.push(c);
      if (/SET status = 'sending'/.test(c.text) && /SKIP LOCKED/.test(c.text)) return { rows: claimedRows };
      return { rows: [] };
    }),
    select: () => ({ from: (t: unknown) => chain(tableRows.get(t) ?? []) }),
    update: (t: unknown) => ({ set: (v: Record<string, unknown>) => ({ where: () => { updates.push({ t, v }); return Promise.resolve([]); } }) }),
  },
}));

import { processAutomationRuns } from '../server/lib/recoveryRuns';
import { abandonedCarts, automationRuns, msgTemplates } from '../server/db/schema';
import { inserirCarrinhoSeAusente, agendarCadenciaSeAusente, linhasDoResultado } from '../server/lib/recoveryTrack';

const read = (f: string) => readFileSync(f, 'utf8');
const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ success: true }) }));

beforeEach(() => {
  calls.length = 0; updates.length = 0; claimedRows = []; tableRows.clear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  process.env.WA_API_KEY = 'k';
  process.env.WA_FORCE_SEND = '1';
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); delete process.env.WA_API_KEY; delete process.env.WA_FORCE_SEND; });

const BUSINESS = new Date('2026-11-24T15:00:00Z'); // 12h BRT
const NIGHT = new Date('2026-11-24T01:00:00Z');    // 22h BRT

describe('A1 — botão e cron usam a mesma rotina', () => {
  it('runAutomationJob delega para processAutomationRuns com orçamento de 45 s e não faz SELECT próprio de runs', () => {
    const r = read('server/routers/recovery.ts');
    const i = r.indexOf('runAutomationJob:');
    const corpo = r.slice(i, r.indexOf('listAutomationRuns:'));
    expect(corpo).toMatch(/processAutomationRuns\(\{ deadlineAt: Date\.now\(\) \+ 45_000 \}\)/);
    expect(corpo).not.toMatch(/db\.select\(\)\.from\(automationRuns\)/);
  });

  it('o cron também chama a rotina compartilhada (sem duplicar o laço)', () => {
    const api = read('api/index.ts');
    expect(api).toMatch(/processAutomationRuns\(\{ deadlineAt: cronDeadline, jaVerificouWhatsApp: true \}\)/);
    expect(api).not.toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it('claim atômico em SQL raw FOR UPDATE SKIP LOCKED na rotina compartilhada', () => {
    expect(read('server/lib/recoveryRuns.ts')).toMatch(/SET status = 'sending'[\s\S]{0,400}FOR UPDATE SKIP LOCKED/);
  });

  it('fora do horário comercial não toca no banco nem envia', async () => {
    vi.useFakeTimers(); vi.setSystemTime(NIGHT);
    const r = await processAutomationRuns({ deadlineAt: Date.now() + 45_000 });
    expect(r.skipped).toMatch(/business hours/);
    expect(calls).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('WhatsApp desconectado: não reivindica nenhum run', async () => {
    vi.useFakeTimers(); vi.setSystemTime(BUSINESS);
    delete process.env.WA_FORCE_SEND;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ connected: false, status: 'close' }) } as any);
    const r = await processAutomationRuns({ deadlineAt: Date.now() + 45_000 });
    expect(r.skipped).toBe('whatsapp disconnected');
    expect(calls.some(c => /SKIP LOCKED/.test(c.text))).toBe(false);
  });

  it('um toque por telefone: o segundo run do mesmo telefone volta para scheduled e só 1 envio sai', async () => {
    vi.useFakeTimers(); vi.setSystemTime(BUSINESS);
    claimedRows = [
      { id: 1, cartId: 10, customerPhone: '84999990000', ruleName: 'abandoned_t1', attempts: 0, aiBody: 'Oi, volte!' },
      { id: 2, cartId: 10, customerPhone: '84999990000', ruleName: 'abandoned_t2', attempts: 0, aiBody: 'Oi de novo!' },
    ];
    tableRows.set(abandonedCarts, [{ id: 10, customerName: 'Maria', status: 'checkout_started', recovered: false, optedOut: false, createdAt: new Date() }]);
    const r = await processAutomationRuns({ deadlineAt: Date.now() + 45_000 });
    expect(r.sent).toBe(1);
    const sentBodies = fetchMock.mock.calls.map(c => JSON.parse((c as any)[1].body).message);
    expect(new Set(sentBodies)).toEqual(new Set(['Oi, volte!']));
    // o run 2 foi devolvido à fila (não cancelado)
    expect(updates.some(u => u.t === automationRuns && u.v.status === 'scheduled')).toBe(true);
    expect(updates.some(u => u.v.status === 'cancelled')).toBe(false);
  });

  it('orçamento de tempo estourado: nada é enviado e o reivindicado volta para scheduled', async () => {
    vi.useFakeTimers(); vi.setSystemTime(BUSINESS);
    claimedRows = [{ id: 5, cartId: 11, customerPhone: '84988887777', ruleName: 'abandoned_t1', attempts: 0, aiBody: 'x' }];
    const r = await processAutomationRuns({ deadlineAt: Date.now() - 1 });
    expect(r.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(updates.some(u => u.v.status === 'scheduled')).toBe(true);
  });

  it('falha de envio vai para requeueOrFail (re-agenda, não perde o toque)', async () => {
    vi.useFakeTimers(); vi.setSystemTime(BUSINESS);
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as any);
    claimedRows = [{ id: 7, cartId: 12, customerPhone: '84977776666', ruleName: 'abandoned_t1', attempts: 0, aiBody: 'x' }];
    tableRows.set(abandonedCarts, [{ id: 12, customerName: 'Ana', status: 'checkout_started', recovered: false, optedOut: false, createdAt: new Date() }]);
    tableRows.set(msgTemplates, []);
    const r = await processAutomationRuns({ deadlineAt: Date.now() + 45_000 });
    expect(r.failed).toBe(1);
    const up = updates.find(u => u.v.attempts === 1);
    expect(up?.v.status).toBe('scheduled');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) } as any);
  });
});

describe('A2 — crons de pedido não pago e recompra: claim antes de enviar', () => {
  const api = read('api/index.ts');
  it('não pago: UPDATE condicional (IS NULL) com RETURNING antes do envio e desfaz se nada foi entregue', () => {
    const i = api.indexOf('async function processUnpaidFollowups');
    const corpo = api.slice(i, api.indexOf('async function reconcileAwaitingOrders'));
    expect(corpo).toMatch(/Date\.now\(\) > deadlineAt/);
    const iClaim = corpo.indexOf('isNull(siteOrders.unpaidFollowupSentAt)))');
    expect(iClaim).toBeGreaterThan(corpo.indexOf('for (const o of orders)'));
    expect(corpo).toMatch(/\.returning\(\{ id: siteOrders\.id \}\)/);
    expect(corpo.indexOf('.returning')).toBeLessThan(corpo.indexOf('await sendWhatsApp'));
    expect(corpo).toMatch(/if \(claimedRows\.length === 0\) continue/);
    expect(corpo).toMatch(/if \(!entregue\)[\s\S]{0,200}unpaidFollowupSentAt: null/);
  });
  it('recompra: UPDATE condicional (IS NULL) com RETURNING antes do envio e desfaz se o envio falhar', () => {
    const i = api.indexOf('async function processReorderReminders');
    const corpo = api.slice(i, api.indexOf('// Cron endpoint'));
    expect(corpo).toMatch(/Date\.now\(\) > deadlineAt/);
    expect(corpo).toMatch(/isNull\(siteOrders\.reorderRemindedAt\)\)\)\s*\.returning/);
    expect(corpo.indexOf('.returning')).toBeLessThan(corpo.indexOf('await sendWhatsApp'));
    expect(corpo).toMatch(/reorderRemindedAt: null/);
  });
  it('o cron repassa o cronDeadline aos dois laços', () => {
    expect(api).toMatch(/processUnpaidFollowups\(cronDeadline\)/);
    expect(api).toMatch(/processReorderReminders\(cronDeadline\)/);
  });
});

describe('A3 — trackCart sem corrida', () => {
  function fakeDb(resultados: unknown[]) {
    const executed: Call[] = [];
    let batches = 0;
    return {
      executed,
      get batches() { return batches; },
      execute: (q: any) => { executed.push(flatten(q)); return q; },
      batch: async (qs: any[]) => { batches++; return qs.map((_q, i) => (i === qs.length - 1 ? resultados.shift() : { rows: [] })); },
    };
  }

  it('carrinho: trava por telefone antes, INSERT ... WHERE NOT EXISTS ... ON CONFLICT DO NOTHING, devolve o id', async () => {
    const db = fakeDb([{ rows: [{ id: 42 }] }]);
    const id = await inserirCarrinhoSeAusente(db as any, { customerName: 'Maria', customerPhone: '84999990000', customerEmail: null, postalCode: null, quantity: 1, stepReached: 2 });
    expect(id).toBe(42);
    expect(db.batches).toBe(1);
    expect(db.executed[0].text).toMatch(/pg_advisory_xact_lock\(hashtext\(/);
    expect(db.executed[0].params).toEqual(['cart:84999990000']);
    expect(db.executed[1].text).toMatch(/INSERT INTO abandoned_carts[\s\S]*WHERE NOT EXISTS \(SELECT 1 FROM abandoned_carts WHERE customer_phone = \?\) ON CONFLICT DO NOTHING RETURNING id/);
  });

  it('carrinho: quem perde a corrida recebe null (e deve atualizar o existente)', async () => {
    const db = fakeDb([{ rows: [] }]);
    expect(await inserirCarrinhoSeAusente(db as any, { customerName: 'M', customerPhone: '84999990000', customerEmail: null, postalCode: null, quantity: 1, stepReached: 1 })).toBeNull();
  });

  it('cadência: uma única transação (trava + INSERT ... WHERE NOT EXISTS) e conta as linhas inseridas', async () => {
    const db = fakeDb([{ rows: [{ id: 1 }, { id: 2 }, { id: 3 }] }]);
    const n = await agendarCadenciaSeAusente(db as any, {
      cartId: 9, phone: '84999990000', desde: new Date('2026-10-01T00:00:00Z'), base: Date.parse('2026-11-24T12:00:00Z'),
      toques: [{ rule: 'abandoned_t1', delayMs: 1000 }, { rule: 'abandoned_t2', delayMs: 2000 }, { rule: 'abandoned_t3', delayMs: 3000 }],
    });
    expect(n).toBe(3);
    expect(db.batches).toBe(1);
    expect(db.executed[0].params).toEqual(['cadence:84999990000']);
    expect(db.executed[1].text).toMatch(/INSERT INTO automation_runs[\s\S]*FROM \(VALUES .* AS v\(rule_name, scheduled_for\) WHERE NOT EXISTS \( SELECT 1 FROM automation_runs WHERE customer_phone = \? AND created_at > \?::timestamp \)/);
  });

  it('cadência: telefone com cadência recente insere 0 linhas', async () => {
    const db = fakeDb([{ rows: [] }]);
    expect(await agendarCadenciaSeAusente(db as any, { cartId: 1, phone: '84', desde: new Date(), toques: [{ rule: 'abandoned_t1', delayMs: 1 }] })).toBe(0);
  });

  it('linhasDoResultado aceita array e {rows}', () => {
    expect(linhasDoResultado([{ a: 1 }])).toHaveLength(1);
    expect(linhasDoResultado({ rows: [{ a: 1 }, { a: 2 }] })).toHaveLength(2);
    expect(linhasDoResultado(undefined)).toEqual([]);
  });

  it('trackCart usa os helpers e não faz mais verificar-depois-inserir', () => {
    const r = read('server/routers/recovery.ts');
    const corpo = r.slice(r.indexOf('trackCart:'), r.indexOf('validateCoupon:'));
    expect(corpo).toMatch(/inserirCarrinhoSeAusente\(db,/);
    expect(corpo).toMatch(/agendarCadenciaSeAusente\(db,/);
    expect(corpo).not.toMatch(/db\.insert\(abandonedCarts\)/);
    expect(corpo).not.toMatch(/db\.insert\(automationRuns\)/);
  });
});
