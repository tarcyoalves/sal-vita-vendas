import { describe, it, expect, vi } from 'vitest';
import {
  dentroDaJanelaDoRobo, proximaAberturaDaJanela, pollingBarradoPelaJanela, interpretarJanela, SMBI_JANELA_PADRAO,
} from '../shared/smbiJanela';

// Fortaleza = UTC-3 o ano todo (sem horário de verão).
const fz = (hhmm: string, dia = '2026-10-19') => new Date(`${dia}T${hhmm}:00-03:00`);

describe('dentroDaJanelaDoRobo (padrão 08:00-11:00 e 14:00-17:00)', () => {
  it.each([
    ['00:00', false], ['07:59', false], ['08:00', true], ['10:59', true], ['11:00', false],
    ['13:59', false], ['14:00', true], ['16:59', true], ['17:00', false], ['23:59', false],
  ])('%s => %s', (h, esperado) => {
    expect(dentroDaJanelaDoRobo(fz(h))).toBe(esperado);
  });

  it('vale todos os dias da semana (sábado e domingo)', () => {
    expect(dentroDaJanelaDoRobo(fz('09:00', '2026-10-17'))).toBe(true);
    expect(dentroDaJanelaDoRobo(fz('09:00', '2026-10-18'))).toBe(true);
  });

  it('usa o fuso de Fortaleza, não o UTC', () => {
    // 11:00Z = 08:00 em Fortaleza (dentro); 08:00Z = 05:00 em Fortaleza (fora, embora 08:00 em UTC).
    expect(dentroDaJanelaDoRobo(new Date('2026-10-19T11:00:00Z'))).toBe(true);
    expect(dentroDaJanelaDoRobo(new Date('2026-10-19T08:00:00Z'))).toBe(false);
    // 02:30Z do dia 20 ainda é 23:30 do dia 19 em Fortaleza.
    expect(dentroDaJanelaDoRobo(new Date('2026-10-20T02:30:00Z'))).toBe(false);
    // 14:00Z = 11:00 local (fim exclusivo); 17:00Z = 14:00 local (abre).
    expect(dentroDaJanelaDoRobo(new Date('2026-10-19T14:00:00Z'))).toBe(false);
    expect(dentroDaJanelaDoRobo(new Date('2026-10-19T17:00:00Z'))).toBe(true);
  });

  it('config customizada e "sempre"', () => {
    expect(dentroDaJanelaDoRobo(fz('12:00'), '12:00-13:00')).toBe(true);
    expect(dentroDaJanelaDoRobo(fz('03:00'), 'sempre')).toBe(true);
    expect(dentroDaJanelaDoRobo(fz('03:00'), 'SEMPRE')).toBe(true);
  });

  it('config vazia usa o padrão', () => {
    expect(dentroDaJanelaDoRobo(fz('12:00'), '')).toBe(false);
    expect(dentroDaJanelaDoRobo(fz('12:00'), undefined)).toBe(false);
  });

  it('config inválida: fail open e avisa uma única vez', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const ruim of ['abc', '08:00-07:00', '25:00-26:00', '08:00-11:00,xx']) {
      expect(interpretarJanela(ruim)).toBeNull();
    }
    expect(dentroDaJanelaDoRobo(fz('03:00'), 'lixo-unico')).toBe(true);
    expect(dentroDaJanelaDoRobo(fz('04:00'), 'lixo-unico')).toBe(true);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('lixo-unico'))).toHaveLength(1);
    warn.mockRestore();
  });
});

describe('proximaAberturaDaJanela', () => {
  it.each([
    ['07:00', '08:00'], ['11:00', '14:00'], ['13:59', '14:00'], ['17:00', '08:00 de amanhã'], ['23:00', '08:00 de amanhã'],
  ])('%s => %s', (h, esperado) => {
    expect(proximaAberturaDaJanela(fz(h))).toBe(esperado);
  });
  it('dentro da janela ou portão desligado => null', () => {
    expect(proximaAberturaDaJanela(fz('09:00'))).toBeNull();
    expect(proximaAberturaDaJanela(fz('03:00'), 'sempre')).toBeNull();
  });
});

describe('pollingBarradoPelaJanela (decisão da rota GET /api/smbi/pedidos)', () => {
  const fora = fz('12:00');
  const dentro = fz('09:00');
  it('fora da janela, polling comum é barrado', () => {
    expect(pollingBarradoPelaJanela({ agora: fora, config: SMBI_JANELA_PADRAO })).toBe(true);
  });
  it('?id= e ?simular=1 nunca são barrados', () => {
    expect(pollingBarradoPelaJanela({ id: '123', agora: fora })).toBe(false);
    expect(pollingBarradoPelaJanela({ simular: true, agora: fora })).toBe(false);
  });
  it('dentro da janela ou com "sempre", nada é barrado', () => {
    expect(pollingBarradoPelaJanela({ agora: dentro })).toBe(false);
    expect(pollingBarradoPelaJanela({ agora: fora, config: 'sempre' })).toBe(false);
  });
});
