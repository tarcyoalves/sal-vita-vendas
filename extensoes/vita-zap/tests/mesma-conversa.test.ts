// Envio duplicado (atendente, 10/11/2026): a campanha reaproveitou a conversa aberta de "Agropecuária X" para o
// contato seguinte "Agropecuária Y" porque `mesmoNome` (frouxo, feito para títulos do CRM) dizia que eram iguais.
// Na campanha a identidade da conversa é `mesmaConversa` (estrita).
import { describe, expect, it } from 'vitest';
import { mesmaConversa, mesmoNome } from '../src/shared/abrir-por-telefone';

describe('mesmaConversa (campanha)', () => {
  it('o caso real: nomes parecidos NÃO são a mesma conversa (o frouxo dizia que sim)', () => {
    const a = 'Agropecuária São José Cliente PR';
    const b = 'Agropecuária Boa Vista Cliente PR';
    expect(mesmoNome(a, b)).toBe(true); // por isso duplicava
    expect(mesmaConversa(a, b)).toBe(false);
    expect(mesmaConversa('Ana Cliente', 'Ana Cliente Goiás')).toBe(false);
    expect(mesmaConversa('Agro', 'Agropecuária Boa Vista')).toBe(false);
  });

  it('caso real 2 (v0.7.51): conversa "Claudimar…" aberta, próximo era "Cliente Caratinga Mg Frical"', () => {
    for (const t of ['Claudimara Cliente Caratinga Mg', 'Claudimar Cliente Caratinga MG', 'Claudimar…']) {
      expect(mesmaConversa(t, 'Cliente Caratinga Mg Frical'), t).toBe(false);
    }
    expect(mesmoNome('Claudimara Cliente Caratinga Mg', 'Cliente Caratinga Mg Frical')).toBe(true); // o frouxo reaproveitava
  });

  it('igual depois de normalizar (maiúsculas, acentos, espaços)', () => {
    expect(mesmaConversa('AGROPECUÁRIA  Boa Vista', 'agropecuaria boa vista')).toBe(true);
  });

  it('um lado cortado com "…": aceita só com 8+ letras de começo igual', () => {
    expect(mesmaConversa('Agropecuária Boa Vi…', 'Agropecuária Boa Vista Cliente PR')).toBe(true);
    expect(mesmaConversa('Agro…', 'Agropecuária Boa Vista')).toBe(false);
    expect(mesmaConversa('Agropecuária São…', 'Agropecuária Boa Vista')).toBe(false);
  });

  it('vazio nunca bate', () => {
    expect(mesmaConversa(null, 'Ana')).toBe(false);
    expect(mesmaConversa('', 'Ana')).toBe(false);
    expect(mesmaConversa('Ana', '')).toBe(false);
  });
});
