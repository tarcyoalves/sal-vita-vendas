import { describe, expect, it } from 'vitest';
import { extrairTermosLead } from '../src/shared/crm-termos';

describe('extrairTermosLead: limpa títulos de lead do CRM para busca no WhatsApp', () => {
  it('extrai termos limpos de empresa com CNPJ, LTDA e estado', () => {
    const termos = extrairTermosLead('10400015000109 - BRAFERTIL BRASIL FERTILIZANTES LTDA - ITABORAÍ - RJ');
    expect(termos).toContain('BRAFERTIL BRASIL');
    expect(termos).toContain('BRAFERTIL');
    expect(termos).toContain('ITABORAÍ');
    // CNPJ e siglas não devem ser termos isolados
    expect(termos).not.toContain('10400015000109');
    expect(termos).not.toContain('RJ');
    expect(termos).not.toContain('LTDA');
  });

  it('extrai nome de contato pessoa física dentro do título do lead', () => {
    const termos = extrairTermosLead('40465478000101 - J RICARDO ARAUJO FERREIRA LTDA - AGRO COITE - Alexsinaldo CONCEIÇÃO DO COITÉ - BA');
    expect(termos).toContain('AGRO COITE');
    expect(termos).toContain('Alexsinaldo CONCEIÇÃO COITÉ');
    expect(termos).toContain('Alexsinaldo');
  });

  it('trata título simples ou já limpo', () => {
    const termos = extrairTermosLead('Padaria Estrela');
    expect(termos).toEqual(['Padaria Estrela', 'Padaria']);
  });
});
