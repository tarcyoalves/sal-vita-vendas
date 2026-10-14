import { describe, it, expect } from 'vitest';
import { shouldTrackCart, isSavedCustomerFresh, SAVED_CUSTOMER_TTL_MS, validateCheckoutFields, cleanAddressNumber, isValidEmail } from '../client/src/components/premium/checkoutLogic';
import { claimPurchase } from '../client/src/components/premium/purchaseLock';
import { parseApiError, RATE_LIMIT_MSG, GENERIC_VALIDATION_MSG } from '../client/src/components/premium/apiError';
import { getConsent, saveConsent, trackPixel, loadMetaPixel, CONSENT_KEY } from '../client/src/components/premium/pixelConsent';

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, v), raw: m };
}

describe('F-01: carrinho abandonado só depois de interação nesta visita', () => {
  const base = { alreadyTracked: false, checkoutOpen: true, touchedThisVisit: true, customerName: 'Maria Souza', customerPhone: '(84) 99999-9999' };
  it('dados restaurados do aparelho (sem edição) nunca disparam', () => {
    expect(shouldTrackCart({ ...base, touchedThisVisit: false })).toBe(false);
  });
  it('sem abrir o passo de dados não dispara, mesmo com interação', () => {
    expect(shouldTrackCart({ ...base, checkoutOpen: false })).toBe(false);
  });
  it('dispara uma vez: passo 2 aberto + edição + nome e telefone completos', () => {
    expect(shouldTrackCart(base)).toBe(true);
    expect(shouldTrackCart({ ...base, alreadyTracked: true })).toBe(false);
  });
  it('exige nome (3+) e telefone com 11 dígitos', () => {
    expect(shouldTrackCart({ ...base, customerName: 'Jo' })).toBe(false);
    expect(shouldTrackCart({ ...base, customerPhone: '(84) 9999-999' })).toBe(false);
  });
});

describe('F-09: dados salvos expiram em 30 dias', () => {
  const now = 1_800_000_000_000;
  it('aceita dentro do prazo, recusa vencido, futuro ou sem data', () => {
    expect(isSavedCustomerFresh(now - 1000, now)).toBe(true);
    expect(isSavedCustomerFresh(now - SAVED_CUSTOMER_TTL_MS, now)).toBe(true);
    expect(isSavedCustomerFresh(now - SAVED_CUSTOMER_TTL_MS - 1, now)).toBe(false);
    expect(isSavedCustomerFresh(now + 5000, now)).toBe(false);
    expect(isSavedCustomerFresh(undefined, now)).toBe(false);
    expect(isSavedCustomerFresh('123', now)).toBe(false);
  });
});

describe('trava do Purchase: uma vez por pedido', () => {
  it('só a primeira chamada por pedido devolve true, também entre "páginas" (mesmo storage)', () => {
    const st = fakeStorage();
    expect(claimPurchase(77, st)).toBe(true);
    expect(claimPurchase(77, st)).toBe(false);
    expect(claimPurchase('77', st)).toBe(false);
    expect(claimPurchase(78, st)).toBe(true);
  });
  it('storage quebrado ou ausente não impede o evento (a Meta deduplica pelo eventID)', () => {
    const quebrado = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
    expect(claimPurchase(1, quebrado)).toBe(true);
    expect(claimPurchase(1, null)).toBe(true);
  });
  it('storage com lixo é tratado como vazio', () => {
    expect(claimPurchase(5, fakeStorage({ sv_purchase_sent: '{nao-json' }))).toBe(true);
  });
});

describe('F-02/F-03: parser de erro do servidor', () => {
  it('erro de validação do Zod vira mensagem humana por campo, nunca JSON', () => {
    const zod = JSON.stringify([
      { code: 'invalid_string', validation: 'email', message: 'Invalid email', path: ['customerEmail'] },
      { code: 'too_big', maximum: 20, type: 'string', message: 'String must contain at most 20 character(s)', path: ['number'] },
    ]);
    const r = parseApiError(400, { error: { json: { message: zod, code: -32600, data: { code: 'BAD_REQUEST', httpStatus: 400 } } } });
    expect(r.kind).toBe('validation');
    expect(r.fields.customerEmail).toBe('Informe um e-mail válido, como nome@exemplo.com.');
    expect(r.fields.number).toContain('número');
    expect(r.firstField).toBe('customerEmail');
    expect(r.message).not.toMatch(/[\[\]{}]|code|path|String must/);
  });
  it('JSON quebrado cai na mensagem genérica', () => {
    const r = parseApiError(400, { error: { json: { message: '[ { "code": "invalid_str' } } });
    expect(r.kind).toBe('validation');
    expect(r.message).toBe(GENERIC_VALIDATION_MSG);
  });
  it('429 do limitador ({error: "texto"}) vira aviso de espera', () => {
    const r = parseApiError(429, { error: 'Muitas tentativas de pedido. Aguarde alguns minutos.' });
    expect(r.kind).toBe('rate_limit');
    expect(r.message).toBe(RATE_LIMIT_MSG);
    // mesmo sem corpo legível
    expect(parseApiError(429, null).kind).toBe('rate_limit');
  });
  it('TOO_MANY_REQUESTS do tRPC também', () => {
    const r = parseApiError(200, { error: { json: { message: 'x', data: { code: 'TOO_MANY_REQUESTS' } } } });
    expect(r.kind).toBe('rate_limit');
  });
  it('mensagem em texto puro do servidor passa; ausência de mensagem é "unknown"', () => {
    expect(parseApiError(400, { error: { json: { message: 'Este pedido já foi pago.' } } })).toMatchObject({ kind: 'message', message: 'Este pedido já foi pago.' });
    expect(parseApiError(500, {}).kind).toBe('unknown');
    expect(parseApiError(500, { error: 'falha interna' }).kind).toBe('unknown');
  });
});

describe('validação do formulário antes de enviar e campo Número', () => {
  const ok = { customerName: 'Maria', customerEmail: 'maria@exemplo.com', number: 'S/N', address: 'Rua A', neighborhood: 'Centro', city: 'Mossoró', state: 'RN' };
  it('aceita S/N e 12A', () => {
    expect(validateCheckoutFields(ok)).toEqual({});
    expect(validateCheckoutFields({ ...ok, number: '12A' })).toEqual({});
    expect(cleanAddressNumber('12A')).toBe('12A');
    expect(cleanAddressNumber('s/n')).toBe('s/n');
    expect(cleanAddressNumber('Km 5')).toBe('Km 5');
  });
  it('recusa e-mail incompleto (o type=email do navegador aceita joao@gmail) e nome de 1 letra', () => {
    expect(isValidEmail('joao@gmail')).toBe(false);
    expect(isValidEmail('joao@gmail.com')).toBe(true);
    const e = validateCheckoutFields({ ...ok, customerEmail: 'joao@gmail', customerName: 'J' });
    expect(Object.keys(e).sort()).toEqual(['customerEmail', 'customerName']);
  });
  it('número com mais de 20 caracteres é cortado no campo e recusado se chegar assim', () => {
    expect(cleanAddressNumber('1'.repeat(30))).toHaveLength(20);
    expect(validateCheckoutFields({ ...ok, number: '1'.repeat(21) }).number).toBeTruthy();
  });
});

describe('consentimento do Pixel', () => {
  it('sem escolha gravada = nenhuma escolha (o Pixel não carrega)', () => {
    expect(getConsent(fakeStorage())).toBeNull();
    expect(getConsent(fakeStorage({ [CONSENT_KEY]: 'qualquer-coisa' }))).toBeNull();
  });
  it('grava e lê aceitar/recusar; storage quebrado não lança', () => {
    const st = fakeStorage();
    expect(saveConsent('declined', st)).toBe(true);
    expect(getConsent(st)).toBe('declined');
    expect(saveConsent('accepted', st)).toBe(true);
    expect(getConsent(st)).toBe('accepted');
    const quebrado = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(saveConsent('accepted', quebrado)).toBe(false);
    expect(getConsent(quebrado)).toBeNull();
  });
  it('trackPixel e loadMetaPixel são no-op seguros sem Pixel/janela', () => {
    expect(() => trackPixel('track', 'Purchase', { value: 1 })).not.toThrow();
    expect(loadMetaPixel()).toBe(false);
  });
});
