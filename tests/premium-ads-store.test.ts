import { describe, it, expect, vi } from 'vitest';

vi.mock('../server/db/ordersDb', () => ({ ordersDb: {} }));
import crypto from 'crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { STORE_URL } from '../server/lib/storeUrl';
import { orderTrackLink, buildCapiPurchasePayload } from '../server/lib/orderConfirmation';
import { filterAllowedCarriersSorted, isAllowedCarrier } from '../server/lib/shippingFilter';

const sha = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('STORE_URL (domínio sem www não tem TLS)', () => {
  it('é a URL com www', () => expect(STORE_URL).toBe('https://www.premium.salvitarn.com.br'));
  it('nenhum link https://premium.salvitarn... resta em server/ e api/index.ts, exceto CORS', () => {
    const hits: string[] = [];
    for (const f of [...walk('server'), 'api/index.ts']) {
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (/https:\/\/premium\.salvitarn/.test(l)) hits.push(`${f}:${i + 1}:${l.trim()}`);
      });
    }
    expect(hits).toEqual([`api/index.ts:${hits[0]?.split(':')[1]}:'https://premium.salvitarn.com.br',`]);
    expect(hits[0]).toContain('api/index.ts');
  });
  it('orderTrackLink usa www', () => {
    expect(orderTrackLink({ id: 7, trackToken: 'abc' })).toBe(`${STORE_URL}/meu-pedido?pedido=7&t=abc`);
    expect(orderTrackLink({ id: 7 })).toMatch(/^https:\/\/www\.premium\.salvitarn\.com\.br\//);
  });
});

describe('filtro de transportadoras', () => {
  const o = (company: string, name: string, price: number) => ({ serviceId: name, name, company, price, days: '' });
  it('mantém Correios, Jadlog, Azul Cargo e J&T/JeT; descarta LATAM e Loggi; ordena por preço', () => {
    const out = filterAllowedCarriersSorted([
      o('LATAM Cargo', 'Éxito', 10), o('Loggi', 'Express', 11),
      o('Correios', 'SEDEX', 40), o('Jadlog', '.Package', 25), o('Azul Cargo Express', 'Expresso', 30),
      o('JeT', 'Standard', 20), o('Correios', 'PAC', 22),
    ]);
    expect(out.map((x) => x.company + '/' + x.name)).toEqual(['JeT/Standard', 'Correios/PAC', 'Jadlog/.Package', 'Azul Cargo Express/Expresso', 'Correios/SEDEX']);
  });
  it('tolera variações de nome', () => {
    for (const c of ['correios', 'J&T Express', 'J&T', 'jet', 'Azul Cargo', 'JADLOG']) expect(isAllowedCarrier(c)).toBe(true);
    for (const c of ['LATAM Cargo', 'Loggi', '', undefined]) expect(isAllowedCarrier(c)).toBe(false);
  });
  it('nada permitido → vazio (quoteShipping usa a tabela estática PAC/SEDEX)', () => {
    expect(filterAllowedCarriersSorted([o('Loggi', 'Express', 9)])).toEqual([]);
  });
  it('createOrder nunca grava serviço fora das opções cotadas', () => {
    const src = readFileSync('server/routers/shipping.ts', 'utf8');
    expect(src).toContain('shippingServiceId: chosen ? chosen.serviceId');
    expect(src).not.toContain('shippingServiceId: input.shippingServiceId');
  });
});

describe('buildCapiPurchasePayload', () => {
  const created = new Date('2026-10-10T12:00:00Z');
  const base = {
    id: 42, customerName: 'Maria da Silva', customerPhone: '(84) 99999-1234', customerEmail: 'Maria@Ex.com',
    postalCode: '59600-000', city: 'Mossoró Grande', state: 'RN', totalPrice: '59.90',
    fbclid: null, fbp: null, fbc: null, clientIp: null, clientUa: null, createdAt: created,
  } as unknown as Parameters<typeof buildCapiPurchasePayload>[0];

  it('hasheia PII, normaliza ct/st e envia ph com 55', () => {
    const ev = buildCapiPurchasePayload({ ...base, clientIp: '177.1.2.3', clientUa: 'Mozilla/5.0 X', fbp: 'fb.1.1.2' }, 1_760_000_000_999);
    const u = ev.user_data as Record<string, any>;
    expect(u.ph).toEqual([sha('5584999991234')]);
    expect(u.external_id).toEqual([sha('84999991234')]);
    expect(u.em).toEqual([sha('maria@ex.com')]);
    expect(u.fn).toEqual([sha('maria')]);
    expect(u.ln).toEqual([sha('silva')]);
    expect(u.ct).toEqual([sha('mossorogrande')]);
    expect(u.st).toEqual([sha('rn')]);
    expect(u.zp).toEqual([sha('59600000')]);
    expect(u.country).toEqual([sha('br')]);
    expect(u.client_ip_address).toBe('177.1.2.3');
    expect(u.client_user_agent).toBe('Mozilla/5.0 X');
    expect(u.fbp).toBe('fb.1.1.2');
    expect(ev.event_time).toBe(1_760_000_000);
    expect(ev.event_source_url).toBe(STORE_URL);
  });
  it('fbc armazenado vence; senão sintetiza do fbclid com createdAt', () => {
    expect((buildCapiPurchasePayload({ ...base, fbc: 'fb.1.5.XYZ', fbclid: 'abc' }).user_data as any).fbc).toBe('fb.1.5.XYZ');
    expect((buildCapiPurchasePayload({ ...base, fbclid: 'abc' }).user_data as any).fbc).toBe(`fb.1.${created.getTime()}.abc`);
    expect((buildCapiPurchasePayload(base).user_data as any).fbc).toBeUndefined();
  });
  it('acentos em cidade são removidos', () => {
    const u = buildCapiPurchasePayload({ ...base, city: 'São José' }).user_data as any;
    expect(u.ct).toEqual([sha('saojose')]);
  });
});
