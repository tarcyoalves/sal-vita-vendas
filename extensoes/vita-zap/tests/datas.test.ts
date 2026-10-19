import { describe, expect, it } from 'vitest';
import {
  diferencaDias,
  hojeNoFuso,
  interpretarRotuloData,
  lerDataIso,
  pareceRotuloData,
  partesNoFuso,
  somarDias,
} from '../src/shared/datas';

// Fortaleza = UTC-3 o ano todo (sem horário de verão).
// 2026-10-19 é segunda-feira.
const SEG_MEIO_DIA = new Date('2026-10-19T15:00:00Z'); // 12:00 em Fortaleza

function ok(rotulo: string, agora: Date = SEG_MEIO_DIA): string {
  const r = interpretarRotuloData(rotulo, agora);
  if (r.tipo !== 'ok') throw new Error(`esperava ok para "${rotulo}", veio revisar: ${r.motivo}`);
  return r.data;
}

function revisar(rotulo: string | null, agora: Date = SEG_MEIO_DIA): string {
  const r = interpretarRotuloData(rotulo, agora);
  if (r.tipo !== 'revisar') throw new Error(`esperava revisar para "${rotulo}", veio ${r.data}`);
  return r.motivo;
}

describe('fuso de Fortaleza', () => {
  it('"hoje" segue Fortaleza, não UTC', () => {
    // 01:30 UTC do dia 20 = 22:30 do dia 19 em Fortaleza.
    expect(hojeNoFuso(new Date('2026-10-20T01:30:00Z'))).toBe('2026-10-19');
    // 03:00 UTC do dia 20 = 00:00 do dia 20 em Fortaleza.
    expect(hojeNoFuso(new Date('2026-10-20T03:00:00Z'))).toBe('2026-10-20');
  });

  it('partes no fuso', () => {
    const p = partesNoFuso(new Date('2026-10-20T02:59:00Z'));
    expect(p).toMatchObject({ ano: 2026, mes: 10, dia: 19, hora: 23, minuto: 59, diaSemana: 1 });
  });

  it('meia-noite é hora 0 (não 24)', () => {
    expect(partesNoFuso(new Date('2026-10-20T03:00:00Z')).hora).toBe(0);
  });
});

describe('aritmética de datas', () => {
  it('soma dias atravessando mês, ano e bissexto', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(somarDias('2027-01-01', -1)).toBe('2026-12-31');
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('diferença em dias', () => {
    expect(diferencaDias('2026-10-19', '2026-09-17')).toBe(32);
    expect(diferencaDias('2027-01-02', '2026-12-30')).toBe(3);
  });

  it('lerDataIso valida', () => {
    expect(lerDataIso('2026-09-17')).toBe('2026-09-17');
    expect(lerDataIso('2026-02-30')).toBeNull();
    expect(lerDataIso('')).toBeNull();
    expect(lerDataIso('17/09/2026')).toBeNull();
  });
});

describe('interpretarRotuloData — hora = hoje', () => {
  it.each(['14:32', '9:05', '00:00', '23:59', '2:05 PM', '2:05 p. m.', '11:40 am'])('"%s" → hoje', (r) => {
    expect(ok(r)).toBe('2026-10-19');
  });

  it('hora usa o dia de Fortaleza (22:30 local ainda é dia 19)', () => {
    expect(ok('22:10', new Date('2026-10-20T01:30:00Z'))).toBe('2026-10-19');
  });

  it.each(['25:00', '12:61', '13:00 PM', '0:10 AM'])('hora inválida "%s" → revisar', (r) => {
    expect(revisar(r)).toMatch(/hora inválida/);
  });
});

describe('interpretarRotuloData — hoje/ontem', () => {
  it('hoje / ontem com qualquer caixa e acento', () => {
    expect(ok('Hoje')).toBe('2026-10-19');
    expect(ok('Ontem')).toBe('2026-10-18');
    expect(ok('ONTEM')).toBe('2026-10-18');
    expect(ok(' ontem ')).toBe('2026-10-18');
  });

  it('ontem na virada do ano', () => {
    expect(ok('Ontem', new Date('2027-01-01T15:00:00Z'))).toBe('2026-12-31');
  });

  it('ignora marcas invisíveis de direção do WhatsApp', () => {
    expect(ok('‎Ontem')).toBe('2026-10-18');
  });
});

describe('interpretarRotuloData — dia da semana', () => {
  // Hoje: segunda 19/10/2026.
  it.each([
    ['sábado', '2026-10-17'],
    ['Sábado', '2026-10-17'],
    ['sexta-feira', '2026-10-16'],
    ['quinta-feira', '2026-10-15'],
    ['quarta-feira', '2026-10-14'],
    ['terça-feira', '2026-10-13'],
    ['sáb.', '2026-10-17'],
    ['qui', '2026-10-15'],
  ])('"%s" → %s', (rotulo, data) => {
    expect(ok(rotulo)).toBe(data);
  });

  it('o próprio dia da semana de hoje é ambíguo (hoje? 7 dias atrás?) → revisar', () => {
    expect(revisar('segunda-feira')).toMatch(/ambíguo/);
  });

  it('o dia de ontem por extenso é ambíguo (o WhatsApp diria "Ontem") → revisar', () => {
    expect(revisar('domingo')).toMatch(/ambíguo/);
  });

  it('dia da semana na virada do ano', () => {
    // Sábado 02/01/2027: "quarta-feira" = 30/12/2026.
    expect(ok('quarta-feira', new Date('2027-01-02T15:00:00Z'))).toBe('2026-12-30');
    expect(ok('segunda-feira', new Date('2027-01-02T15:00:00Z'))).toBe('2026-12-28');
  });
});

describe('interpretarRotuloData — dd/mm/aaaa', () => {
  it('data completa', () => {
    expect(ok('17/09/2026')).toBe('2026-09-17');
    expect(ok('1/9/2026')).toBe('2026-09-01');
    expect(ok('17/09/26')).toBe('2026-09-17');
    expect(ok('31/12/2025')).toBe('2025-12-31');
  });

  it('bissexto válido e inválido', () => {
    expect(ok('29/02/2024')).toBe('2024-02-29');
    expect(revisar('29/02/2026')).toMatch(/inválida/);
  });

  it('data no futuro → revisar', () => {
    expect(revisar('20/10/2026')).toMatch(/futuro/);
  });

  it('formato mês/dia (WhatsApp em inglês) → revisar', () => {
    expect(revisar('09/17/2026')).toMatch(/dia\/mês/);
  });

  it('sem ano: mais recente não futura (virada de ano)', () => {
    // Em 02/01/2027, "28/12" é de 2026.
    expect(ok('28/12', new Date('2027-01-02T15:00:00Z'))).toBe('2026-12-28');
    expect(ok('01/01', new Date('2027-01-02T15:00:00Z'))).toBe('2027-01-01');
    expect(ok('17/09')).toBe('2026-09-17');
  });

  it('29/02 sem ano em ano não bissexto cai no último bissexto possível? não: revisar', () => {
    // 2027 e 2026 não são bissextos → não há data válida.
    expect(revisar('29/02', new Date('2027-03-10T15:00:00Z'))).toMatch(/inválida/);
  });

  it('data do próprio dia é aceita', () => {
    expect(ok('19/10/2026')).toBe('2026-10-19');
  });
});

describe('interpretarRotuloData — formatos desconhecidos', () => {
  it.each([null, '', '   ', 'há 3 dias', 'semana passada', '2026-09-17', 'Digitando…', '17.09.2026'])('"%s" → revisar', (r) => {
    expect(() => revisar(r)).not.toThrow();
  });
});

describe('pareceRotuloData', () => {
  it('reconhece rótulos e rejeita textos comuns', () => {
    for (const s of ['14:32', 'Ontem', 'sábado', '17/09/2026', '17/09']) expect(pareceRotuloData(s)).toBe(true);
    for (const s of ['Bom dia', 'João', '3', 'chego 14:30', '']) expect(pareceRotuloData(s)).toBe(false);
  });
});
