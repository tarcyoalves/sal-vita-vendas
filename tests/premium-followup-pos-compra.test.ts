import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// ── Banco e motor simulados (sem rede) ────────────────────────────────────────
type Call = { text: string; params: unknown[] };
const calls: Call[] = [];
const claimed = new Set<number>();
let candidates: Array<Record<string, unknown>> = [];
let sequenceActive = true;

function flatten(q: any): Call {
  let text = '';
  const params: unknown[] = [];
  for (const c of q.queryChunks ?? []) {
    if (c && Array.isArray(c.value)) text += c.value.join('');
    else if (c && Array.isArray(c.queryChunks)) {
      const inner = flatten(c);
      text += inner.text;
      params.push(...inner.params);
    } else {
      text += '?';
      params.push(c);
    }
  }
  return { text: text.replace(/\s+/g, ' ').trim(), params };
}

vi.mock('../server/db/ordersDb', () => ({
  ordersDb: {
    execute: vi.fn(async (q: any) => {
      const c = flatten(q);
      calls.push(c);
      if (/FROM email_sequences WHERE name = \? ORDER BY id/.test(c.text)) {
        return { rows: [{ id: 7, active: sequenceActive }] };
      }
      if (/SELECT DISTINCT ON/.test(c.text)) return { rows: candidates };
      if (/INSERT INTO shipping_events/.test(c.text)) {
        const id = Number(c.params[0]);
        if (claimed.has(id)) return { rows: [] };
        claimed.add(id);
        return { rows: [{ order_id: id }] };
      }
      return { rows: [] };
    }),
  },
}));

const enrollInSequence = vi.fn(async () => ({ ok: true, enrollmentId: 1 }));
vi.mock('../server/email/sequenceEngine', () => ({
  enrollInSequence: (...a: unknown[]) => (enrollInSequence as any)(...a),
  processSequenceEnrollments: vi.fn(async () => ({ processed: 0, sent: 0 })),
}));

import {
  enrollNewBuyers,
  cancelFollowupOnRepurchase,
  firstName,
} from '../server/email/postPurchaseFollowup';
import {
  FOLLOWUP_ENROLL_SINCE,
  FOLLOWUP_SEQUENCES,
  POS_COMPRA,
  RELACIONAMENTO,
  buildStoreLink,
  followupDailyCap,
  reorderWhatsappEnabled,
} from '../server/email/followupSequences';

const read = (f: string) => readFileSync(f, 'utf8');

beforeEach(() => {
  calls.length = 0;
  claimed.clear();
  candidates = [{ id: 101, name: 'MARIA SILVA', email: 'maria@example.com' }];
  sequenceActive = true;
  enrollInSequence.mockClear();
});

describe('inscrição automática de compradores', () => {
  it('um pedido inscreve uma vez só (trava em shipping_events)', async () => {
    const a = await enrollNewBuyers();
    const b = await enrollNewBuyers(); // o mesmo pedido volta como candidato
    expect(a.enrolled).toBe(1);
    expect(b.enrolled).toBe(0);
    expect(b.skipped).toBe(1);
    expect(enrollInSequence).toHaveBeenCalledTimes(1);
    const claim = calls.find((c) => /INSERT INTO shipping_events/.test(c.text))!;
    expect(claim.text).toMatch(/ON CONFLICT DO NOTHING RETURNING order_id/);
    expect(claim.params).toContain('followup-enrolled');
  });

  it('usa o primeiro nome e o e-mail normalizado', async () => {
    await enrollNewBuyers();
    expect(enrollInSequence).toHaveBeenCalledWith('maria@example.com', 7, 'Maria');
    expect(firstName('  joao   da silva')).toBe('Joao');
  });

  it('só pedidos pagos, não cancelados, com e-mail, a partir do corte e entregues ou com 10+ dias', async () => {
    await enrollNewBuyers();
    const q = calls.find((c) => /SELECT DISTINCT ON/.test(c.text))!;
    expect(q.text).toMatch(/payment_status = 'confirmed'/);
    expect(q.text).toMatch(/status <> 'cancelled'/);
    expect(q.text).toMatch(/customer_email IS NOT NULL/);
    expect(q.text).toMatch(/o\.status = 'delivered' OR o\.created_at <= NOW\(\)/);
    expect(q.text).toMatch(/NOT EXISTS \( SELECT 1 FROM shipping_events/);
    expect(q.params).toContain(10);
  });

  it('corte da base antiga: só created_at >= data de publicação', async () => {
    await enrollNewBuyers();
    const q = calls.find((c) => /SELECT DISTINCT ON/.test(c.text))!;
    expect(q.text).toMatch(/o\.created_at >= \?/);
    expect(q.params).toContain(FOLLOWUP_ENROLL_SINCE);
    expect(FOLLOWUP_ENROLL_SINCE.getTime()).toBeGreaterThanOrEqual(new Date('2026-10-15T00:00:00-03:00').getTime());
  });

  it('com a sequência desligada não reivindica pedido nenhum', async () => {
    sequenceActive = false;
    const r = await enrollNewBuyers();
    expect(r.inactive).toBe(true);
    expect(calls.some((c) => /INSERT INTO shipping_events/.test(c.text))).toBe(false);
    expect(enrollInSequence).not.toHaveBeenCalled();
  });

  it('se a inscrição falhar por sequência inativa, devolve a trava', async () => {
    enrollInSequence.mockResolvedValueOnce({ ok: false, reason: 'sequence_inactive' } as any);
    const r = await enrollNewBuyers();
    expect(r.enrolled).toBe(0);
    expect(calls.some((c) => /DELETE FROM shipping_events/.test(c.text))).toBe(true);
  });
});

describe('recompra reinicia o ciclo', () => {
  it('cancela inscrições ativas de Pós-compra e Relacionamento se há pedido pago mais novo', async () => {
    await cancelFollowupOnRepurchase();
    const q = calls.find((c) => /UPDATE email_sequence_enrollments/.test(c.text))!;
    expect(q.text).toMatch(/SET status = 'cancelled'/);
    expect(q.text).toMatch(/e\.status = 'active'/);
    expect(q.text).toMatch(/o\.payment_status = 'confirmed' AND o\.status <> 'cancelled'/);
    expect(q.text).toMatch(/o\.created_at > e\.enrolled_at/);
    expect(q.params).toEqual(expect.arrayContaining(['Pós-compra', 'Relacionamento mensal']));
  });

  it('ao inscrever pedido novo, cancela antes as inscrições ativas do e-mail', async () => {
    await enrollNewBuyers();
    const cancelIdx = calls.findIndex((c) => /UPDATE email_sequence_enrollments SET status = 'cancelled'/.test(c.text));
    const claimIdx = calls.findIndex((c) => /INSERT INTO shipping_events/.test(c.text));
    expect(cancelIdx).toBeGreaterThan(claimIdx);
  });
});

describe('teto diário, UTM e WhatsApp', () => {
  it('FOLLOWUP_DAILY_CAP: padrão 40, aceita override, ignora lixo', () => {
    expect(followupDailyCap({})).toBe(40);
    expect(followupDailyCap({ FOLLOWUP_DAILY_CAP: '25' })).toBe(25);
    expect(followupDailyCap({ FOLLOWUP_DAILY_CAP: 'abc' })).toBe(40);
    expect(followupDailyCap({ FOLLOWUP_DAILY_CAP: '0' })).toBe(40);
  });

  it('o motor confere o teto (só sequências) antes de reservar a cota do provedor', () => {
    const e = read('server/email/sequenceEngine.ts');
    const cap = e.indexOf('followupDailyCap()');
    const reserve = e.indexOf('reserveSendQuota(1)');
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThan(reserve);
    // conta apenas email_sequence_sends: campanhas e transacionais ficam fora do teto
    expect(e).toMatch(/FROM email_sequence_sends\s+WHERE status IN \('sent', 'sending'\)/);
    expect(e).toMatch(/processSequenceEnrollments\(\s*limit = 100,\s*deadlineMs\?: number/);
  });

  it('{link_loja} leva utm_source=email, utm_medium=posvenda e campanha sequência-passo', () => {
    const url = new URL(buildStoreLink('Pós-compra', 3));
    expect(url.origin).toBe('https://www.premium.salvitarn.com.br');
    expect(url.searchParams.get('utm_source')).toBe('email');
    expect(url.searchParams.get('utm_medium')).toBe('posvenda');
    expect(url.searchParams.get('utm_campaign')).toBe('pos-compra-3');
    expect(new URL(buildStoreLink('Relacionamento mensal', 6)).searchParams.get('utm_campaign')).toBe('relacionamento-mensal-6');
    expect(read('server/email/sequenceEngine.ts')).toMatch(/link_loja: buildStoreLink\(/);
  });

  it('WhatsApp de recompra fica desligado por padrão', () => {
    expect(reorderWhatsappEnabled({})).toBe(false);
    expect(reorderWhatsappEnabled({ REORDER_WHATSAPP: 'off' })).toBe(false);
    expect(reorderWhatsappEnabled({ REORDER_WHATSAPP: 'on' })).toBe(true);
    const api = read('api/index.ts');
    expect(api).toMatch(/reorderWhatsappEnabled\(\)\s*\?\s*await runIsolated\('reorder-reminder'/);
  });

  it('o cron roda o follow-up isolado, antes dos retornos que dependem do WhatsApp', () => {
    const api = read('api/index.ts');
    const f = api.indexOf("runIsolated('post-purchase-followup'");
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThan(api.indexOf('const waUp = await isWhatsAppConnected()'));
  });
});

describe('sequências criadas desligadas, na migração', () => {
  const mig = read('server/db/ordersMigrate.ts');
  it('migração idempotente, active = FALSE, achada pelo nome', () => {
    expect(mig).toMatch(/SELECT \$\{def\.name\}, \$\{def\.description\}, FALSE,/);
    expect(mig).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM email_sequences WHERE name = \$\{def\.name\}\)/);
    expect(mig).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM email_sequence_steps WHERE sequence_id = \$\{seqId\} AND step_order = \$\{st\.stepOrder\}\)/);
    expect(mig).not.toMatch(/followup[^\n]*TRUE/i);
  });
  it('versão do schema foi subida (e o lock acompanha)', () => {
    expect(mig).toMatch(/ORDERS_SCHEMA_VERSION = 'orders-2026-10-15b'/);
    expect(read('tests/schema-version.lock.json')).toContain('orders-2026-10-15b');
  });
  it('Pós-compra: 4 passos, dias 0/+12/+10/+7, quarto só se não abriu; sem repetição', () => {
    expect(POS_COMPRA.steps.map((s) => s.delayDays)).toEqual([0, 12, 10, 7]);
    expect(POS_COMPRA.steps[3].sendCondition).toBe('if_not_opened');
    expect(POS_COMPRA.steps.slice(0, 3).every((s) => s.sendCondition === 'always')).toBe(true);
    expect(POS_COMPRA.repeat).toBe(false);
  });
  it('Relacionamento mensal: 6 passos a 30 dias, loop a cada 30, 6º com {unsubscribe} em destaque', () => {
    expect(RELACIONAMENTO.steps).toHaveLength(6);
    expect(RELACIONAMENTO.steps.every((s) => s.delayDays === 30)).toBe(true);
    expect(RELACIONAMENTO.repeat).toBe(true);
    expect(RELACIONAMENTO.repeatIntervalDays).toBe(30);
    expect(RELACIONAMENTO.steps[5].subject).toMatch(/quer continuar recebendo/);
    expect(RELACIONAMENTO.steps[5].htmlBody).toMatch(/<strong><a href="\{unsubscribe\}"/);
  });
  it('Pós-compra conclui e inscreve em Relacionamento mensal', () => {
    const e = read('server/email/sequenceEngine.ts');
    expect(e).toMatch(/sequence_name !== POS_COMPRA_NAME/);
    expect(e).toMatch(/enrollInSequence\(enr\.email, nextId/);
  });
});

describe('textos dos e-mails', () => {
  const all = FOLLOWUP_SEQUENCES.flatMap((s) => s.steps);
  const proibidos = [
    /mineral|minerais/i,
    /sa[úu]de|saud[áa]vel|doen[çc]a|cura\b|previn|emagrec|hipertens|press[ãa]o/i,
    /pureza|\bpuro\b|\bpura\b/i,
    /100\s*%/,
    /natural|naturais|naturalmente/i,
    /benef[íi]cio|eletr[óo]lit|reposi[çc][ãa]o mineral|energia|hidrata/i,
    /melhor do brasil/i,
    /cupom|desconto|\{cupom\}/i,
    /aditivo|qu[íi]mico/i,
  ];

  it('são 10 e-mails, todos com {unsubscribe} e no máximo um link principal {link_loja}', () => {
    expect(all).toHaveLength(10);
    for (const s of all) {
      expect(s.htmlBody).toContain('{unsubscribe}');
      expect((s.htmlBody.match(/\{link_loja\}/g) ?? []).length).toBeLessThanOrEqual(1);
    }
  });

  it('nenhum texto tem alegação de saúde, minerais, pureza, benefício, "100% natural" ou cupom', () => {
    for (const s of all) {
      for (const re of proibidos) {
        expect(`${s.subject}\n${s.htmlBody}`, `${re} em "${s.subject}"`).not.toMatch(re);
      }
    }
    // o cabeçalho do layout compartilhado também não pode dizer "100% natural"
    const layout = read('server/email/marketingEngine.ts');
    expect(layout).not.toMatch(/100% Natural/i);
  });

  it('preços citados são só os reais', () => {
    const precos = new Set(
      all.flatMap((s) => s.htmlBody.match(/R\$\s?[\d.]+,\d{2}/g) ?? []).map((p) => p.replace(/\s/g, ' '))
    );
    const permitidos = new Set(['R$ 29,90', 'R$ 74,90', 'R$ 24,97', 'R$ 149,90', 'R$ 14,99']);
    for (const p of precos) expect(permitidos.has(p), p).toBe(true);
    expect(all[3].subject).toBe('A caixa de 10 kg sai a R$ 14,99 o quilo');
  });
});

describe('painel e privacidade', () => {
  it('updateSequenceStep existe com assunto, corpo e atraso', () => {
    const r = read('server/routers/premiumEmailMarketing.ts');
    expect(r).toMatch(/updateSequenceStep: staffProcedure/);
    expect(r).toMatch(/subject: z\.string\(\)\.trim\(\)\.min\(1\)/);
    expect(r).toMatch(/delayDays: z\.number\(\)\.int\(\)\.min\(0\)/);
    expect(r).toMatch(/utm_medium = 'posvenda'/);
  });
  it('Privacidade fala dos e-mails pós-compra e de como sair', () => {
    const p = read('client/src/pages/Privacidade.tsx');
    expect(p).toMatch(/E-mails depois da compra/);
    expect(p).toMatch(/legítimo interesse/);
    expect(p).toMatch(/link para sair/);
  });
});
