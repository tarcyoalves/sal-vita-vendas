// GET /api/sales/modo responde de um cache curto por instância; troca de modo para DRY_RUN/PAUSED
// revoga as reservas. Banco e configurações simulados.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SALES_SETTINGS_DEFAULTS, type SalesSettings } from '../shared/sales';

const estado = vi.hoisted(() => ({ leituras: 0, geracao: 0, modo: 'REVIEW' as string, liberadas: [] as number[][], execs: 0 }));

vi.mock('../server/db/ordersDb', () => ({
  ordersDb: {
    execute: vi.fn(async () => { estado.execs += 1; return { rows: [{ n: 0 }] }; }),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  },
}));
vi.mock('../server/db', () => ({ db: { execute: vi.fn(async () => ({ rows: [] })) } }));
vi.mock('../server/routers/unsubscribe', () => ({ suppressEmailGlobal: vi.fn() }));
vi.mock('../server/lib/sales/settings', () => ({
  geracaoSettingsLocal: () => estado.geracao,
  getSalesSettings: vi.fn(async () => {
    estado.leituras += 1;
    return { ...SALES_SETTINGS_DEFAULTS, modo: estado.modo } as SalesSettings;
  }),
  getSalesSetting: vi.fn(async () => estado.modo),
  setSalesSetting: vi.fn(async (_k: string, v: string) => { estado.modo = v; estado.geracao += 1; return v; }),
}));
vi.mock('../server/lib/sales/consultas', async (orig) => {
  const real = await orig<typeof import('../server/lib/sales/consultas')>();
  return {
    ...real,
    liberarReservas: vi.fn(async () => { estado.liberadas.push([1, 2]); return [1, 2]; }),
    registrarAuditoria: vi.fn(async () => undefined),
  };
});

import { limparCacheModo, obterModo, MODO_CACHE_MS } from '../server/lib/sales/hermes';
import { definirModoInterno, modoFechaEnvio, revogarReservas } from '../server/lib/sales/acoes';

beforeEach(() => {
  limparCacheModo();
  estado.leituras = 0;
  estado.liberadas = [];
  estado.modo = 'REVIEW';
});

describe('GET /api/sales/modo em cache curto', () => {
  it('chamadas seguidas na mesma janela fazem UMA leitura das configurações', async () => {
    const t0 = 1_000_000;
    const a = await obterModo(t0);
    const b = await obterModo(t0 + 5_000);
    const [c, d] = await Promise.all([obterModo(t0 + 6_000), obterModo(t0 + 6_000)]);
    expect(estado.leituras).toBe(1);
    expect(a).toEqual(b);
    expect(c).toEqual(d);
    expect(a.http).toBe(200);
    expect(a.corpo).toMatchObject({ modo: 'REVIEW' });
  });
  it('vence em MODO_CACHE_MS (gravação em outra instância aparece até lá)', async () => {
    const t0 = 2_000_000;
    await obterModo(t0);
    estado.modo = 'PAUSED'; // gravado "em outra instância": a geração local não muda
    expect((await obterModo(t0 + MODO_CACHE_MS - 1)).corpo).toMatchObject({ modo: 'REVIEW' });
    expect((await obterModo(t0 + MODO_CACHE_MS)).corpo).toMatchObject({ modo: 'PAUSED' });
    expect(MODO_CACHE_MS).toBeLessThanOrEqual(60_000);
  });
  it('gravação nesta instância descarta o cache na hora', async () => {
    const t0 = 3_000_000;
    await obterModo(t0);
    await definirModoInterno('PAUSED', 'admin', 'teste');
    expect((await obterModo(t0 + 1)).corpo).toMatchObject({ modo: 'PAUSED' });
  });
});

describe('troca de modo revoga reservas', () => {
  it('DRY_RUN e PAUSED revogam; os modos que enviam não', async () => {
    expect(modoFechaEnvio('DRY_RUN')).toBe(true);
    expect(modoFechaEnvio('PAUSED')).toBe(true);
    expect(modoFechaEnvio('REVIEW')).toBe(false);
    expect(await definirModoInterno('DRY_RUN', 'admin')).toEqual({ modo: 'DRY_RUN', reservasRevogadas: 2 });
    expect(await definirModoInterno('PAUSED', 'admin')).toEqual({ modo: 'PAUSED', reservasRevogadas: 2 });
    expect(await definirModoInterno('AUTONOMOUS', 'admin')).toEqual({ modo: 'AUTONOMOUS', reservasRevogadas: 0 });
    expect(estado.liberadas).toHaveLength(2);
  });
  it('revogarReservas (para o canal desligado) libera todas e conta as em voo', async () => {
    expect(await revogarReservas('canal desligado', 'admin')).toEqual({ reservasRevogadas: 2, despachando: 0 });
  });
});
