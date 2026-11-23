// "Registrar contato" em um toque: nota com data no fim das anotações + novo lembrete (fuso de São Paulo).
import { describe, expect, it } from 'vitest';
import { anexarNotaContato, diaSP, linhaDeContato, proximoLembrete, rotuloLembrete, LIMITE_NOTAS } from '../client/src/lib/tasks/registrarContato';

// 23/11/2026 14:30 em São Paulo (UTC-3)
const AGORA = new Date('2026-11-23T17:30:00Z');

describe('linhaDeContato', () => {
  it('usa o formato das anotações da extensão: [dd/mm/aaaa hh:mm] texto', () => {
    expect(linhaDeContato('Pediu tabela', AGORA)).toBe('[23/11/2026 14:30] Pediu tabela');
  });
  it('junta quebras de linha e sem texto registra "Contato feito."', () => {
    expect(linhaDeContato('  pediu\n\ntabela  ', AGORA)).toBe('[23/11/2026 14:30] pediu tabela');
    expect(linhaDeContato('   ', AGORA)).toBe('[23/11/2026 14:30] Contato feito.');
  });
  it('a hora é de São Paulo, não a do aparelho (meia-noite UTC = 21h do dia anterior)', () => {
    expect(linhaDeContato('x', new Date('2026-11-24T00:05:00Z'))).toBe('[23/11/2026 21:05] x');
  });
});

describe('anexarNotaContato: nunca substitui', () => {
  it('acrescenta ao fim, em linha nova, mantendo o que existia', () => {
    const r = anexarNotaContato('Ligar terça.\nPediu tabela.', 'Falei com a Ana', AGORA);
    expect(r).toEqual({ ok: true, notes: 'Ligar terça.\nPediu tabela.\n[23/11/2026 14:30] Falei com a Ana', linha: '[23/11/2026 14:30] Falei com a Ana' });
  });
  it('sem anotações anteriores, a nota vira a primeira linha', () => {
    for (const vazio of [null, undefined, '', '  \n']) {
      expect(anexarNotaContato(vazio, 'oi', AGORA)).toMatchObject({ ok: true, notes: '[23/11/2026 14:30] oi' });
    }
  });
  it('não duplica quebra de linha quando as anotações já terminam em nova linha', () => {
    expect(anexarNotaContato('A\n', 'b', AGORA)).toMatchObject({ notes: 'A\n[23/11/2026 14:30] b' });
  });
  it('se não couber no limite do servidor, recusa em vez de cortar anotações antigas', () => {
    const cheia = 'x'.repeat(LIMITE_NOTAS - 10);
    expect(anexarNotaContato(cheia, 'nota', AGORA)).toEqual({ ok: false, motivo: 'cheia' });
    expect(anexarNotaContato('x'.repeat(100), 'nota', AGORA).ok).toBe(true);
  });
  it('o texto novo conta como contato real para o servidor (mais de 15 letras e diferente)', () => {
    const r = anexarNotaContato('A', '', AGORA);
    expect(r.ok && r.notes.length).toBeGreaterThan(15);
  });
});

describe('proximoLembrete', () => {
  it('+30 min', () => {
    expect(proximoLembrete('30min', AGORA).toISOString()).toBe('2026-11-23T18:00:00.000Z');
  });
  it('+3 e +7 dias mantêm a hora', () => {
    expect(proximoLembrete('3d', AGORA).toISOString()).toBe('2026-11-26T17:30:00.000Z');
    expect(proximoLembrete('7d', AGORA).toISOString()).toBe('2026-11-30T17:30:00.000Z');
  });
  it('Amanhã 9h = 9h de São Paulo do dia seguinte', () => {
    expect(proximoLembrete('amanha9h', AGORA).toISOString()).toBe('2026-11-24T12:00:00.000Z');
  });
  it('Amanhã 9h perto da meia-noite: o dia é o de São Paulo, não o do UTC', () => {
    // 23/11 23:30 em SP já é 24/11 02:30 em UTC; "amanhã" continua sendo 24/11.
    expect(proximoLembrete('amanha9h', new Date('2026-11-24T02:30:00Z')).toISOString()).toBe('2026-11-24T12:00:00.000Z');
    // 00:10 de SP em 24/11 (03:10Z): amanhã é 25/11.
    expect(proximoLembrete('amanha9h', new Date('2026-11-24T03:10:00Z')).toISOString()).toBe('2026-11-25T12:00:00.000Z');
  });
  it('virada de mês e de ano', () => {
    expect(proximoLembrete('amanha9h', new Date('2026-12-31T20:00:00Z')).toISOString()).toBe('2027-01-01T12:00:00.000Z');
  });
});

describe('rótulos', () => {
  it('diaSP e rotuloLembrete', () => {
    expect(diaSP(new Date('2026-11-24T02:30:00Z'))).toBe('2026-11-23');
    expect(rotuloLembrete(proximoLembrete('amanha9h', AGORA))).toBe('24/11 09:00');
  });
});
