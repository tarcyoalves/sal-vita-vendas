// getMetrics do e-mail marketing Premium: resultado guardado por 60 s; refreshMetrics limpa o cache.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'segredo-so-para-teste';
  return { execute: vi.fn(async () => ({ rows: [{ cnt: 3, total: 9, orders30: 0, revenue30: 0, orders90: 0, revenue90: 0 }] })) };
});
vi.mock('../server/db/ordersDb', () => ({ ordersDb: { execute: h.execute } }));
vi.mock('../server/db', () => ({ db: {} }));
vi.mock('../server/email/marketingQuota', () => ({ getAccounts: () => [], getAccountLimits: () => ({ daily: 1, monthly: 1 }), getMonthlyCounter: async () => 0, todayBrt: () => '2026-11-23' }));
vi.mock('../server/email/marketingEngine', () => ({ buildAudience: vi.fn(), processCampaignBatch: vi.fn() }));
vi.mock('../server/email/sequenceEngine', () => ({ processSequenceEnrollments: vi.fn() }));
vi.mock('../server/routers/unsubscribe', () => ({ suppressEmailGlobal: vi.fn() }));

import { premiumEmailMarketingRouter } from '../server/routers/premiumEmailMarketing';
import { cacheInvalidate } from '../server/lib/cache';

const caller = () => premiumEmailMarketingRouter.createCaller({ user: { id: 1, name: 'A', email: 'a@x.com', role: 'admin', mustChangePassword: false } } as never);

beforeEach(() => { cacheInvalidate('premiumEmail:'); h.execute.mockClear(); });

describe('premiumEmailMarketing.getMetrics', () => {
  it('a segunda chamada em 60 s não vai ao banco', async () => {
    await caller().getMetrics();
    const idas = h.execute.mock.calls.length;
    expect(idas).toBeGreaterThan(0);
    await caller().getMetrics();
    expect(h.execute.mock.calls.length).toBe(idas);
  });

  it('refreshMetrics limpa o cache e a próxima chamada consulta de novo', async () => {
    await caller().getMetrics();
    const idas = h.execute.mock.calls.length;
    await caller().refreshMetrics();
    await caller().getMetrics();
    expect(h.execute.mock.calls.length).toBe(idas * 2);
  });
});
