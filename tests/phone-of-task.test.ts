import { describe, it, expect } from 'vitest';
import { extractPhoneDigits, normalizeBrPhone, phoneOfTask } from '../shared/phone';

describe('normalizeBrPhone', () => {
  it('tira máscara e DDI 55', () => {
    expect(normalizeBrPhone('(84) 99999-1234')).toBe('84999991234');
    expect(normalizeBrPhone('+55 84 3315-1234')).toBe('8433151234');
    expect(normalizeBrPhone('5584999991234')).toBe('84999991234');
  });
  it('recusa o que não é telefone', () => {
    expect(normalizeBrPhone('')).toBeNull();
    expect(normalizeBrPhone(null)).toBeNull();
    expect(normalizeBrPhone('12345')).toBeNull();
    expect(normalizeBrPhone('12345678000195')).toBeNull(); // CNPJ
  });
});

describe('extractPhoneDigits', () => {
  it('acha telefone em formatos comuns', () => {
    expect(extractPhoneDigits('Mercado Sol (84) 99999-1234')).toBe('84999991234');
    expect(extractPhoneDigits('ligar 84 99999 1234 amanhã')).toBe('84999991234');
    expect(extractPhoneDigits('fixo 8433151234')).toBe('8433151234');
  });
  it('não tira "telefone" de CNPJ nem de CEP', () => {
    expect(extractPhoneDigits('CNPJ 12345678000195')).toBeNull();
    expect(extractPhoneDigits('CNPJ 12.345.678/0001-95')).toBeNull();
    expect(extractPhoneDigits('CEP 59600-000')).toBeNull();
  });
});

describe('phoneOfTask', () => {
  it('usa a coluna phone quando ela é válida', () => {
    expect(phoneOfTask({ phone: '84999991234', title: 'X', notes: 'ligar (11) 98888-7777' })).toBe('84999991234');
  });
  it('cai para o título e as anotações quando a coluna está vazia', () => {
    expect(phoneOfTask({ phone: null, title: 'Cliente', notes: 'WhatsApp (84) 99999-1234' })).toBe('84999991234');
    expect(phoneOfTask({ phone: '', title: 'Cliente (84) 3315-1234 - Mossoró - RN', notes: null })).toBe('8433151234');
  });
  it('cai também quando a coluna tem lixo', () => {
    expect(phoneOfTask({ phone: '123', title: 'Cliente', notes: 'tel 84 99999-1234' })).toBe('84999991234');
  });
  it('devolve null quando não há telefone em lugar nenhum', () => {
    expect(phoneOfTask({ phone: null, title: 'Cliente', notes: 'sem contato' })).toBeNull();
  });
});
