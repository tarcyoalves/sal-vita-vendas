import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTACT_TEMPLATE,
  defaultContactMessage,
  renderContactMessage,
  saudacao,
  titleCaseName,
} from '../client/src/components/radar/contactMessage';
import { sortByContactedDesc } from '../client/src/components/radar/buscadorLogic';
import type { RadarLead } from '../shared/radar';

const at = (h: number) => new Date(2026, 9, 6, h, 30);

describe('mensagem padrão do Buscador', () => {
  it('saudação pela hora', () => {
    expect(saudacao(at(7))).toBe('bom dia');
    expect(saudacao(at(11))).toBe('bom dia');
    expect(saudacao(at(12))).toBe('boa tarde');
    expect(saudacao(at(17))).toBe('boa tarde');
    expect(saudacao(at(18))).toBe('boa noite');
    expect(saudacao(at(2))).toBe('bom dia');
  });
  it('nome em maiúsculas vira nome próprio', () => {
    expect(titleCaseName('ANALICE')).toBe('Analice');
    expect(titleCaseName('MATHEUS PIRES')).toBe('Matheus Pires');
    expect(titleCaseName('maria da silva')).toBe('Maria da Silva');
  });
  it('texto pedido pela Analice', () => {
    expect(
      defaultContactMessage({ attendantName: 'ANALICE', cityLabel: 'Lima Duarte - MG', bags: 480, now: at(9) }),
    ).toBe(
      'Olá, bom dia! Aqui é Analice da empresa Sal Vita de Mossoró-RN, tudo bem? ' +
        'Temos uma carreta indo para a região de Lima Duarte - MG com espaço para 480 sacos de 25 kg. Posso te passar um orçamento?',
    );
  });
  it('sem cidade não deixa buraco', () => {
    const m = defaultContactMessage({ attendantName: 'Ana', cityLabel: '', bags: 100, now: at(15) });
    expect(m).toContain('indo para a sua região com espaço');
    expect(m).not.toContain('  ');
  });
  it('modelo próprio do atendente vence o padrão; vazio volta ao padrão', () => {
    const vars = { attendantName: 'ANA', cityLabel: 'Sorocaba - SP', bags: 300, now: at(16) };
    expect(defaultContactMessage({ ...vars, template: '{saudacao}, {nome}! Carga de {sacos} sacos {regiao}.' })).toBe(
      'boa tarde, Ana! Carga de 300 sacos para a região de Sorocaba - SP.',
    );
    expect(defaultContactMessage({ ...vars, template: '   ' })).toBe(renderContactMessage(DEFAULT_CONTACT_TEMPLATE, vars, vars.now));
    expect(defaultContactMessage({ ...vars, template: null })).toBe(renderContactMessage(DEFAULT_CONTACT_TEMPLATE, vars, vars.now));
  });
  it('campos desconhecidos ficam como o atendente escreveu', () => {
    expect(renderContactMessage('Oi {nome} {outra}', { attendantName: 'Ana', cityLabel: '', bags: 1 })).toBe('Oi Ana {outra}');
  });
});

describe('contatados em ordem cronológica', () => {
  const lead = (cnpj: string) => ({ cnpj }) as unknown as RadarLead;
  it('mais recente primeiro; sem data no fim; empate mantém a ordem', () => {
    const quando: Record<string, string | null> = {
      a: '2026-10-05T10:00:00Z',
      b: '2026-10-06T09:00:00Z',
      c: null,
      d: '2026-10-06T09:00:00Z',
      e: '2026-10-04T10:00:00Z',
    };
    const out = sortByContactedDesc(['a', 'b', 'c', 'd', 'e'].map(lead), (c) => quando[c]);
    expect(out.map((l) => l.cnpj)).toEqual(['b', 'd', 'a', 'e', 'c']);
  });
});
