import { describe, expect, it } from 'vitest';
import { marcarItem, type Campanha } from '../src/shared/campanha';
import {
  HORARIO_PERMITIDO,
  INTERVALO_MAX_SEG,
  INTERVALO_MIN_SEG,
  PROBLEMAS_SEGUIDOS_PARA_PAUSAR,
  TETO_DIARIO_MAXIMO,
  TETO_DIARIO_PADRAO,
} from '../src/shared/constantes';
import { FILTROS_PADRAO } from '../src/shared/filtros';
import {
  CONFIG_PADRAO,
  contarEnviosHoje,
  dentroDoHorario,
  normalizarConfig,
  podeAbrirProximo,
  registrarProblema,
  sortearIntervaloSeg,
  type EstadoPolitica,
} from '../src/shared/politica';

/** Hora local de Fortaleza (UTC-3) → Date. */
function fortaleza(dataHora: string): Date {
  return new Date(`${dataHora}:00-03:00`);
}

const CFG = { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true };
const LIVRE: EstadoPolitica = { enviosHoje: 0, ultimoEnvioEm: null, intervaloAtualSeg: null, problemasSeguidos: 0 };

describe('constantes da política', () => {
  it('valores decididos pelo dono', () => {
    expect(TETO_DIARIO_PADRAO).toBe(30);
    expect(TETO_DIARIO_MAXIMO).toBeGreaterThanOrEqual(TETO_DIARIO_PADRAO);
    expect(INTERVALO_MIN_SEG).toBe(60);
    expect(INTERVALO_MAX_SEG).toBe(120);
    expect(PROBLEMAS_SEGUIDOS_PARA_PAUSAR).toBe(3);
    expect(HORARIO_PERMITIDO[0]).toBeNull();
    expect(HORARIO_PERMITIDO[6]).toEqual({ inicio: 8, fim: 12 });
  });
});

describe('horário (Fortaleza)', () => {
  // 2026-10-19 = segunda; 2026-10-24 = sábado; 2026-10-25 = domingo.
  it.each([
    ['2026-10-19T08:00', true],
    ['2026-10-19T07:59', false],
    ['2026-10-19T17:59', true],
    ['2026-10-19T18:00', false],
    ['2026-10-23T12:30', true], // sexta
    ['2026-10-24T08:00', true], // sábado
    ['2026-10-24T11:59', true],
    ['2026-10-24T12:00', false],
    ['2026-10-25T10:00', false], // domingo
  ])('%s → %s', (quando, esperado) => {
    expect(dentroDoHorario(fortaleza(quando)).ok).toBe(esperado);
  });

  it('usa Fortaleza mesmo que o computador esteja em outro fuso (UTC 21:30 = 18:30 local)', () => {
    expect(dentroDoHorario(new Date('2026-10-19T21:30:00Z')).ok).toBe(false);
    expect(dentroDoHorario(new Date('2026-10-19T20:30:00Z')).ok).toBe(true);
  });
});

describe('configuração nunca afrouxa a política', () => {
  it('teto entre 1 e o máximo', () => {
    expect(normalizarConfig({ tetoDiario: 500 }).tetoDiario).toBe(TETO_DIARIO_MAXIMO);
    expect(normalizarConfig({ tetoDiario: 0 }).tetoDiario).toBe(1);
    expect(normalizarConfig({ tetoDiario: Number.NaN }).tetoDiario).toBe(TETO_DIARIO_PADRAO);
    expect(normalizarConfig({}).tetoDiario).toBe(30);
  });

  it('intervalo nunca abaixo de 60–120 s', () => {
    const c = normalizarConfig({ intervaloMinSeg: 5, intervaloMaxSeg: 10 });
    expect(c.intervaloMinSeg).toBe(INTERVALO_MIN_SEG);
    expect(c.intervaloMaxSeg).toBe(INTERVALO_MAX_SEG);
    const maior = normalizarConfig({ intervaloMinSeg: 200, intervaloMaxSeg: 150 });
    expect(maior.intervaloMinSeg).toBe(200);
    expect(maior.intervaloMaxSeg).toBe(200);
  });

  it('confirmação de número antigo só com true explícito', () => {
    expect(normalizarConfig(null).numeroComMaisDe30Dias).toBe(false);
  });
});

describe('intervalo sorteado', () => {
  it('fica entre 60 e 120 s, inclusive', () => {
    expect(sortearIntervaloSeg(CFG, () => 0)).toBe(60);
    expect(sortearIntervaloSeg(CFG, () => 0.999999)).toBe(120);
    for (let i = 0; i < 200; i += 1) {
      const v = sortearIntervaloSeg(CFG);
      expect(v).toBeGreaterThanOrEqual(60);
      expect(v).toBeLessThanOrEqual(120);
    }
  });
});

describe('teto diário', () => {
  it('conta só envios de hoje em Fortaleza', () => {
    const agora = fortaleza('2026-10-19T10:00');
    const envios = [
      { enviadoEm: '2026-10-19T11:00:00Z' }, // 08:00 local, hoje
      { enviadoEm: '2026-10-19T02:00:00Z' }, // 23:00 local de ontem
      { enviadoEm: '2026-10-18T15:00:00Z' },
    ];
    expect(contarEnviosHoje(envios, agora)).toBe(1);
  });
});

describe('podeAbrirProximo', () => {
  const seg10h = fortaleza('2026-10-19T10:00');

  it('livre dentro do horário', () => {
    expect(podeAbrirProximo(LIVRE, CFG, seg10h)).toEqual({ pode: true });
  });

  it('número sem confirmação de 30 dias não roda', () => {
    expect(podeAbrirProximo(LIVRE, CONFIG_PADRAO, seg10h)).toMatchObject({ pode: false, tipo: 'numero_novo' });
  });

  it('fora do horário', () => {
    expect(podeAbrirProximo(LIVRE, CFG, fortaleza('2026-10-19T19:00'))).toMatchObject({ pode: false, tipo: 'horario' });
  });

  it('teto atingido', () => {
    expect(podeAbrirProximo({ ...LIVRE, enviosHoje: 30 }, CFG, seg10h)).toMatchObject({ pode: false, tipo: 'teto' });
    expect(podeAbrirProximo({ ...LIVRE, enviosHoje: 29 }, CFG, seg10h)).toEqual({ pode: true });
  });

  it('teto acima do máximo é cortado no máximo', () => {
    const cfg = { ...CFG, tetoDiario: 10_000 };
    expect(podeAbrirProximo({ ...LIVRE, enviosHoje: TETO_DIARIO_MAXIMO }, cfg, seg10h)).toMatchObject({ pode: false, tipo: 'teto' });
  });

  it('respeita o intervalo sorteado depois de um envio', () => {
    const estado = { ...LIVRE, ultimoEnvioEm: new Date(seg10h.getTime() - 50_000).toISOString(), intervaloAtualSeg: 90 };
    const v = podeAbrirProximo(estado, CFG, seg10h);
    expect(v).toMatchObject({ pode: false, tipo: 'intervalo', esperarMs: 40_000 });
    expect(podeAbrirProximo(estado, CFG, new Date(seg10h.getTime() + 40_000))).toEqual({ pode: true });
  });

  it('intervalo gravado menor que o piso é ignorado (vale 60 s)', () => {
    const estado = { ...LIVRE, ultimoEnvioEm: new Date(seg10h.getTime() - 30_000).toISOString(), intervaloAtualSeg: 5 };
    expect(podeAbrirProximo(estado, CFG, seg10h)).toMatchObject({ pode: false, tipo: 'intervalo', esperarMs: 30_000 });
  });

  it('freio: 3 problemas seguidos', () => {
    expect(podeAbrirProximo({ ...LIVRE, problemasSeguidos: 3 }, CFG, seg10h)).toMatchObject({ pode: false, tipo: 'freio' });
    expect(registrarProblema(0)).toEqual({ problemasSeguidos: 1, pausar: false });
    expect(registrarProblema(2)).toEqual({ problemasSeguidos: 3, pausar: true });
  });
});

describe('freio e uma mensagem por contato na campanha', () => {
  function campanha(): Campanha {
    const item = (n: string) => ({ chave: n, nome: n, primeiroNome: n, modelo: 'Oi {primeiroNome}', status: 'pendente' as const, motivo: null, atualizadoEm: null });
    return {
      id: 'c1',
      nome: 'teste',
      criadaEm: '2026-10-19T12:00:00Z',
      aprovadaEm: '2026-10-19T12:00:00Z',
      termoBusca: 'CLIENTE',
      filtros: FILTROS_PADRAO,
      modelos: ['Oi {primeiroNome}'],
      status: 'em_execucao',
      motivoPausa: null,
      itens: ['a', 'b', 'c', 'd', 'e'].map(item),
      problemasSeguidos: 0,
      ultimoEnvioEm: null,
      intervaloAtualSeg: null,
    };
  }
  const agora = new Date('2026-10-19T13:00:00Z');

  it('3 problemas seguidos pausam a campanha', () => {
    let c = campanha();
    c = marcarItem(c, 'a', 'problema', agora);
    c = marcarItem(c, 'b', 'problema', agora);
    expect(c.status).toBe('em_execucao');
    c = marcarItem(c, 'c', 'problema', agora);
    expect(c.status).toBe('pausada');
    expect(c.problemasSeguidos).toBe(3);
  });

  it('um envio no meio zera a contagem', () => {
    let c = campanha();
    c = marcarItem(c, 'a', 'problema', agora);
    c = marcarItem(c, 'b', 'problema', agora);
    c = marcarItem(c, 'c', 'enviado', agora);
    c = marcarItem(c, 'd', 'problema', agora);
    expect(c.status).toBe('em_execucao');
    expect(c.problemasSeguidos).toBe(1);
  });

  it('item já enviado não muda mais (nada de segunda mensagem)', () => {
    let c = campanha();
    c = marcarItem(c, 'a', 'enviado', agora);
    const d = marcarItem(c, 'a', 'enviado', agora);
    expect(d).toBe(c);
    expect(marcarItem(c, 'a', 'pulado', agora).itens[0].status).toBe('enviado');
  });

  it('último item marcado conclui a campanha', () => {
    let c = campanha();
    for (const k of ['a', 'b', 'c', 'd', 'e']) c = marcarItem(c, k, 'pulado', agora);
    expect(c.status).toBe('concluida');
  });
});
