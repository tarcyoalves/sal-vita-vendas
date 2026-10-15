import { describe, it, expect } from 'vitest';
import { getClientIp, sanitizeIp } from '../server/lib/clientIp';
import { safeErrorMessage, GENERIC_ERROR } from '../server/lib/safeError';
import { createEmergencyThrottle } from '../server/lib/emergencyThrottle';

const req = (headers: Record<string, string | string[]> = {}, ip?: string, remote?: string) =>
  ({ headers, ip, socket: { remoteAddress: remote } });

describe('getClientIp', () => {
  it('usa o ultimo hop de x-forwarded-for, nunca o primeiro forjado', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.1.1.1, 200.50.10.5' }))).toBe('200.50.10.5');
    expect(getClientIp(req({ 'x-forwarded-for': '9.9.9.9, 1.1.1.1, 200.50.10.5' }))).toBe('200.50.10.5');
  });
  it('x-vercel-forwarded-for tem prioridade sobre tudo', () => {
    expect(getClientIp(req({ 'x-vercel-forwarded-for': '177.1.2.3', 'x-real-ip': '5.5.5.5', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }, '3.3.3.3'))).toBe('177.1.2.3');
  });
  it('x-real-ip vem antes do x-forwarded-for', () => {
    expect(getClientIp(req({ 'x-real-ip': '5.5.5.5', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('5.5.5.5');
  });
  it('rejeita lixo e injecao no cabecalho', () => {
    expect(getClientIp(req({ 'x-forwarded-for': "1.1.1.1, '; DROP TABLE users;--" }, '8.8.8.8'))).toBe('8.8.8.8');
    expect(getClientIp(req({ 'x-vercel-forwarded-for': '<script>alert(1)</script>' }, '8.8.8.8'))).toBe('8.8.8.8');
    expect(getClientIp(req({ 'x-forwarded-for': '999.999.1.1' }, undefined, '4.4.4.4'))).toBe('4.4.4.4');
    expect(getClientIp(req({ 'x-real-ip': '1.1.1.1\r\nX-Evil: 1' }, '8.8.8.8'))).toBe('8.8.8.8');
  });
  it('aceita IPv6 e normaliza ::ffff:', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.1.1.1, 2001:DB8::1' }))).toBe('2001:db8::1');
    expect(getClientIp(req({}, '::ffff:10.0.0.7'))).toBe('10.0.0.7');
    expect(sanitizeIp('[::1]:443')).toBe('::1');
    expect(sanitizeIp('1.2.3.4:5678')).toBe('1.2.3.4');
  });
  it('sem cabecalhos usa req.ip, socket e por fim desconhecido', () => {
    expect(getClientIp(req({}, '7.7.7.7'))).toBe('7.7.7.7');
    expect(getClientIp(req({}, undefined, '6.6.6.6'))).toBe('6.6.6.6');
    expect(getClientIp(req({}))).toBe('desconhecido');
  });
});

describe('safeErrorMessage', () => {
  it('generica em producao', () => {
    expect(safeErrorMessage(new Error('password authentication failed for user x'), 'production')).toBe(GENERIC_ERROR);
    expect(safeErrorMessage('boom', 'production')).toBe('Erro interno no servidor');
  });
  it('detalhada fora de producao', () => {
    expect(safeErrorMessage(new Error('x'), 'development')).toBe('x');
    expect(safeErrorMessage('y', undefined)).toBe('y');
  });
});

describe('emergencyThrottle', () => {
  it('girar IP nao zera o limite do mesmo e-mail', () => {
    let t = 0;
    const th = createEmergencyThrottle(() => t);
    th.fail('1.1.1.1', 'A@x.com');
    expect(th.isBlocked('2.2.2.2', 'a@x.com')).toBe(true);
    expect(th.isBlocked('2.2.2.2', 'b@x.com')).toBe(false);
    t += 31_000;
    expect(th.isBlocked('2.2.2.2', 'a@x.com')).toBe(false);
  });
  it('sem e-mail usa chave global', () => {
    const th = createEmergencyThrottle(() => 0);
    th.fail('1.1.1.1', '');
    expect(th.isBlocked('9.9.9.9', '')).toBe(true);
  });
});
