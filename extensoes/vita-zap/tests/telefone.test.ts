// Telefone: só dígitos, com DDI 55; comparação tolerante ao 9 extra do celular brasileiro.

import { describe, expect, it } from 'vitest';
import { chaveDoTelefone, mesmoTelefone, normalizarTelefone, telefoneDoJid, telefoneDoNomeExibido } from '../src/shared/telefone';

describe('normalizarTelefone', () => {
  it('assume Brasil (DDI 55) quando vem só DDD + número', () => {
    expect(normalizarTelefone('(84) 99999-0000')).toBe('5584999990000');
    expect(normalizarTelefone('84 9999-0000')).toBe('558499990000');
    expect(normalizarTelefone('84999990000')).toBe('5584999990000');
  });

  it('mantém o que já tem DDI 55, com ou sem +, espaços e traços', () => {
    expect(normalizarTelefone('+55 84 99999-0000')).toBe('5584999990000');
    expect(normalizarTelefone('5584999990000')).toBe('5584999990000');
    expect(normalizarTelefone('55 (84) 9999-0000')).toBe('558499990000');
  });

  it('número de outro país com + mantém os dígitos (sem pôr 55)', () => {
    expect(normalizarTelefone('+1 415 555 0100')).toBe('14155550100');
    expect(normalizarTelefone('+351 912 345 678')).toBe('351912345678');
  });

  it('CNPJ de 14 dígitos não é interpretado como telefone', () => {
    expect(normalizarTelefone('10400015000109')).toBeNull();
    expect(normalizarTelefone('10.400.015/0001-09')).toBeNull();
  });

  it('descarta o que não dá para identificar', () => {
    expect(normalizarTelefone('')).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone(undefined)).toBeNull();
    expect(normalizarTelefone('99999-0000')).toBeNull(); // sem DDD
    expect(normalizarTelefone('123')).toBeNull();
    expect(normalizarTelefone('1'.repeat(16))).toBeNull();
    expect(normalizarTelefone('sem número')).toBeNull();
  });

  it('ignora as marcas de direção que o WhatsApp põe no texto', () => {
    expect(normalizarTelefone('‪+55 84 99999-0000‬')).toBe('5584999990000');
  });
});

describe('comparar telefones', () => {
  it('o celular com e sem o 9 extra é a mesma linha', () => {
    expect(chaveDoTelefone('5584999990000')).toBe(chaveDoTelefone('558499990000'));
    expect(mesmoTelefone('+55 84 99999-0000', '84 9999-0000')).toBe(true);
  });

  it('números diferentes não se confundem', () => {
    expect(mesmoTelefone('84 99999-0000', '84 99999-0001')).toBe(false);
    expect(mesmoTelefone('84 99999-0000', '85 99999-0000')).toBe(false);
    expect(mesmoTelefone('', '84 99999-0000')).toBe(false);
  });
});

describe('telefone a partir do que o WhatsApp mostra', () => {
  it('nome exibido que é só um número (contato não salvo)', () => {
    expect(telefoneDoNomeExibido('+55 84 99999-0000')).toBe('5584999990000');
    expect(telefoneDoNomeExibido('(84) 99999-0000')).toBe('5584999990000');
    expect(telefoneDoNomeExibido('Ana Souza')).toBeNull();
    expect(telefoneDoNomeExibido('Loja 24')).toBeNull();
  });

  it('id do WhatsApp (@c.us traz o DDI; @lid não é telefone)', () => {
    expect(telefoneDoJid('5584999990000@c.us')).toBe('5584999990000');
    expect(telefoneDoJid('true_5584999990000@c.us_3EB0ABC')).toBe('5584999990000');
    expect(telefoneDoJid('14155550100@c.us')).toBe('14155550100'); // não presume Brasil
    expect(telefoneDoJid('123456789012345@lid')).toBeNull();
    expect(telefoneDoJid('120363@g.us')).toBeNull();
  });
});
