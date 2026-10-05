/** Helpers puros do cartão do Buscador (idade, porte, "há N dias") e escolha de telefone. */
import { describe, expect, it } from 'vitest';
import { companyAgeLabel, companyAgeYears, daysAgoLabel, porteLabel } from '../client/src/components/radar/leadCardInfo';
import { buildPhoneOptions, defaultPhoneDigits, sharedPhoneLabel } from '../client/src/components/radar/phoneOptions';
import type { RadarLead, RadarEnrichment } from '../shared/radar';

const NOW = new Date(2026, 9, 5, 12, 0, 0);

describe('porteLabel', () => {
  it('traduz os códigos da Receita', () => {
    expect(porteLabel('01')).toBe('ME');
    expect(porteLabel('03')).toBe('EPP');
    expect(porteLabel('05')).toBe('Demais');
  });
  it('devolve null para 00, nulo e desconhecido', () => {
    expect(porteLabel('00')).toBeNull();
    expect(porteLabel(null)).toBeNull();
    expect(porteLabel('99')).toBeNull();
  });
});

describe('idade da empresa', () => {
  it('conta anos completos', () => {
    expect(companyAgeYears('2019-10-05', NOW)).toBe(7);
    expect(companyAgeYears('2019-10-06', NOW)).toBe(6);
  });
  it('rótulos em português', () => {
    expect(companyAgeLabel('2019-01-01', NOW)).toBe('aberta há 7 anos');
    expect(companyAgeLabel('2025-10-05', NOW)).toBe('aberta há 1 ano');
    expect(companyAgeLabel('2026-03-01', NOW)).toBe('aberta há menos de 1 ano');
  });
  it('null para data ausente, inválida ou futura', () => {
    expect(companyAgeLabel(null, NOW)).toBeNull();
    expect(companyAgeLabel('lixo', NOW)).toBeNull();
    expect(companyAgeLabel('2030-01-01', NOW)).toBeNull();
  });
});

describe('daysAgoLabel', () => {
  it('hoje, 1 dia e N dias', () => {
    expect(daysAgoLabel(new Date(2026, 9, 5, 8).toISOString(), NOW)).toBe('hoje');
    expect(daysAgoLabel(new Date(2026, 9, 4, 8).toISOString(), NOW)).toBe('há 1 dia');
    expect(daysAgoLabel(new Date(2026, 9, 1, 8).toISOString(), NOW)).toBe('há 4 dias');
  });
  it('null para ISO inválido', () => {
    expect(daysAgoLabel('x', NOW)).toBeNull();
  });
});

function lead(phones: RadarLead['phones']): RadarLead {
  return { phones } as unknown as RadarLead;
}
const ph = (digits: string, likelyMobile: boolean, compartilhadoPor?: number) => ({
  digits, formatted: digits, likelyMobile, compartilhadoPor,
});

describe('phoneOptions com telefones compartilhados', () => {
  it('celular não compartilhado vence celular compartilhado', () => {
    const opts = buildPhoneOptions(lead([ph('84999990001', true, 12), ph('84999990002', true, 1)]), null);
    expect(defaultPhoneDigits(opts)).toBe('84999990002');
    expect(opts[opts.length - 1].digits).toBe('84999990001');
  });
  it('fixo não compartilhado vence celular compartilhado', () => {
    const opts = buildPhoneOptions(lead([ph('84999990001', true, 5), ph('8435441234', false, 1)]), null);
    expect(defaultPhoneDigits(opts)).toBe('8435441234');
  });
  it('só compartilhados: cai no celular, depois no primeiro', () => {
    const opts = buildPhoneOptions(lead([ph('8435441234', false, 9), ph('84999990001', true, 9)]), null);
    expect(defaultPhoneDigits(opts)).toBe('84999990001');
  });
  it('campo ausente (desconhecido) não marca nada', () => {
    const opts = buildPhoneOptions(lead([ph('8435441234', false), ph('84999990001', true)]), null);
    expect(opts.every((o) => !o.compartilhado)).toBe(true);
    expect(defaultPhoneDigits(opts)).toBe('84999990001');
  });
  it('limite: 3 não marca, 4 marca', () => {
    const opts = buildPhoneOptions(lead([ph('8435441234', false, 3), ph('8435441235', false, 4)]), null);
    expect(opts.map((o) => o.compartilhado)).toEqual([false, true]);
  });
  it('WhatsApp achado na web vence tudo', () => {
    const enr = {
      status: 'pronto',
      data: { whatsapps: [{ value: '5584988887777', source: 'site', url: null }] },
    } as unknown as RadarEnrichment;
    const opts = buildPhoneOptions(lead([ph('84999990002', true, 1)]), enr);
    expect(defaultPhoneDigits(opts)).toBe('84988887777');
  });
  it('rótulo âmbar só para compartilhados', () => {
    const [a, b] = buildPhoneOptions(lead([ph('8435441234', false, 1), ph('8435441235', false, 7)]), null);
    expect(sharedPhoneLabel(a)).toBeNull();
    expect(sharedPhoneLabel(b)).toBe('provável contabilidade · usado por 7 empresas');
  });
  it('lista vazia', () => {
    expect(defaultPhoneDigits([])).toBeNull();
  });
});
