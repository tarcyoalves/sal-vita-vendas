import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mpSignatureManifest, parseMpSignatureHeader } from '../server/lib/mpSignature';

const api = readFileSync('api/index.ts', 'utf8');
const shipping = readFileSync('server/routers/shipping.ts', 'utf8');

describe('mpSignatureManifest', () => {
  it('uses the documented template with trailing semicolon', () => {
    expect(mpSignatureManifest('184145304878', 'req-1', '1700000000'))
      .toBe('id:184145304878;request-id:req-1;ts:1700000000;');
  });
  it('lowercases alphanumeric ids', () => {
    expect(mpSignatureManifest('ABC123def', 'r', '1')).toBe('id:abc123def;request-id:r;ts:1;');
  });
});

describe('parseMpSignatureHeader', () => {
  it('parses ts and v1', () => {
    expect(parseMpSignatureHeader('ts=1700000000,v1=abcdef')).toEqual({ ts: '1700000000', v1: 'abcdef' });
    expect(parseMpSignatureHeader(' ts=1 , v1=a=b ')).toEqual({ ts: '1', v1: 'a=b' });
  });
  it('handles missing header', () => {
    expect(parseMpSignatureHeader(undefined)).toEqual({});
  });
});

describe('webhook handler source guards', () => {
  const handler = api.slice(api.indexOf("app.post('/api/mp-webhook'"), api.indexOf("const { type, data } = body;"));
  it('does not reject on signature mismatch', () => {
    expect(handler).not.toMatch(/status\(401\)/);
    expect(handler).not.toContain("'Invalid signature'");
  });
  it('uses query data.id and the shared manifest helper', () => {
    expect(handler).toContain("req.query['data.id']");
    expect(handler).toContain('mpSignatureManifest(');
    expect(handler).toContain('timingSafeEqual');
  });
});

describe('listOrders', () => {
  it('only hides orders with no payment attempt at all', () => {
    const fn = shipping.slice(shipping.indexOf('listOrders: protectedProcedure'), shipping.indexOf('analyzeOrders'));
    expect(fn).toContain("mpPreferenceId} IS NULL AND ${siteOrders.mpPaymentId} IS NULL");
  });
});
