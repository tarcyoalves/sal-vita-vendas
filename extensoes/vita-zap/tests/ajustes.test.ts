// Ajustes (0.4.0): padrões = comportamento da 0.3.x, limites absolutos, perfis, validação,
// política/executor lendo da configuração, importação/exportação e migração.

import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AJUSTES_PADRAO,
  ajustesDeLegado,
  aplicarPerfil,
  avaliarRisco,
  configEfetiva,
  copiarAjustes,
  definir,
  detectarPerfil,
  diaDeUso,
  ehPadrao,
  LIMITES,
  limitarAjustes,
  normalizarAjustes,
  obter,
  PERFIS,
  restaurarCampo,
  restaurarGrupo,
  restaurarTudo,
  validarAjustes,
  type Ajustes,
} from '../src/shared/ajustes';
import { configAuto, ESTADO_AUTOMATICO_PADRAO, sortearEspera } from '../src/shared/automatico';
import {
  abrirBanco,
  exportarTudo,
  importarTudo,
  lerAjustes,
  lerAutomatico,
  lerConfig,
  salvarAjustes,
  salvarConfig,
  salvarNumeroAntigo,
} from '../src/shared/banco';
import { AUTO, DIAS_SEM_REPETIR, HORARIO_PERMITIDO, INTERVALO_MAX_SEG, INTERVALO_MIN_SEG, PROBLEMAS_SEGUIDOS_PARA_PAUSAR, TETO_DIARIO_MAXIMO } from '../src/shared/constantes';
import { lerBackup } from '../src/shared/exportar';
import { CONFIG_PADRAO, dentroDoHorario, normalizarConfig, PISO_AJUSTES, podeAbrirProximo, sortearIntervaloSeg, type EstadoPolitica } from '../src/shared/politica';
import { montarMensagem, saudacaoDoHorario, validarModelo, validarModelos } from '../src/shared/texto';
import { abertos, esperarFila, montar } from './_executor-helpers';

let n = 0;
const novoBanco = () => abrirBanco(`ajustes-${Date.now()}-${(n += 1)}`);
const fortaleza = (dataHora: string): Date => new Date(`${dataHora}:00-03:00`);
const LIVRE: EstadoPolitica = { enviosHoje: 0, ultimoEnvioEm: null, intervaloAtualSeg: null, problemasSeguidos: 0 };
const seg10h = fortaleza('2026-10-19T10:00'); // segunda
const CFG = { ...CONFIG_PADRAO, numeroComMaisDe30Dias: true };

function com(caminho: string, valor: unknown, base: Ajustes = AJUSTES_PADRAO): Ajustes {
  return definir(base, caminho, valor);
}

describe('padrões = comportamento atual (0.3.x)', () => {
  it('os valores preenchidos são os das constantes', () => {
    const a = AJUSTES_PADRAO;
    expect(a.ritmo.manual).toEqual({ minSeg: INTERVALO_MIN_SEG, maxSeg: INTERVALO_MAX_SEG });
    expect(a.ritmo.auto).toEqual({ minSeg: 90, maxSeg: 180 });
    expect(a.ritmo.pausaLonga).toEqual({ ligada: true, aCadaEnvios: 10, minMin: 10, maxMin: 20 });
    expect(a.ritmo.contagemSeg).toBe(8);
    expect(a.limites.tetoManual).toBe(30);
    expect(a.limites.tetoAuto).toBe(30);
    expect(a.limites.rampa.ligada).toBe(false);
    expect(a.freio).toEqual({ problemasManual: 3, problemasAuto: 2, pausarEmAviso: true, esperaDigitandoSeg: 15 });
    expect(a.filtros).toEqual({ termo: 'CLIENTE', naoContem: '', excluirContatadosHaDias: DIAS_SEM_REPETIR });
    expect(a.texto.tamanhoMax).toBe(500);
    expect(a.horarios.map((j) => (j.ligado ? { inicio: j.inicio, fim: j.fim } : null))).toEqual(HORARIO_PERMITIDO);
  });

  it('os padrões são válidos e não mudam ao passar pelo limite/normalização', () => {
    expect(validarAjustes(AJUSTES_PADRAO)).toEqual([]);
    expect(limitarAjustes(AJUSTES_PADRAO)).toEqual(AJUSTES_PADRAO);
    expect(normalizarAjustes(AJUSTES_PADRAO)).toEqual(AJUSTES_PADRAO);
    expect(normalizarAjustes(null)).toEqual(AJUSTES_PADRAO);
    expect(normalizarAjustes('lixo')).toEqual(AJUSTES_PADRAO);
  });

  it('modelos salvos de fábrica passam nas regras de texto', () => {
    for (const m of AJUSTES_PADRAO.texto.modelos) {
      expect(validarModelos(m.texto, m.variacoes).erros).toEqual([]);
    }
  });

  it('com os padrões, política e espera dão o mesmo resultado de antes', () => {
    expect(configEfetiva(AJUSTES_PADRAO, true, false, [], seg10h)).toEqual({ ...CFG, tetoDiario: 30 });
    // automático: o mesmo que configAuto(manual) fazia
    expect(configEfetiva(AJUSTES_PADRAO, true, true, [], seg10h)).toEqual(configAuto(CFG));
    expect(sortearEspera(0, () => 0, AJUSTES_PADRAO)).toEqual(sortearEspera(0, () => 0));
    expect(sortearEspera(9, () => 0, AJUSTES_PADRAO)).toEqual({ segundos: 600, pausaLonga: true, enviosSeguidos: 0 });
    expect(sortearEspera(9, () => 0.9999, AJUSTES_PADRAO).segundos).toBe(1200);
    expect(sortearEspera(8, () => 0, AJUSTES_PADRAO)).toMatchObject({ pausaLonga: false, enviosSeguidos: 9 });
  });
});

describe('limites absolutos', () => {
  it('constantes de segurança', () => {
    expect(LIMITES.intervaloMinSeg).toBe(30);
    expect(LIMITES.contagemMinSeg).toBe(5);
    expect(LIMITES.tetoManual).toBe(60);
    expect(LIMITES.tetoAuto).toBe(60);
    expect(LIMITES.diasSemRepetirMin).toBe(14);
    expect(TETO_DIARIO_MAXIMO).toBe(60);
  });

  it.each([
    ['ritmo.manual.minSeg', 29],
    ['ritmo.auto.minSeg', 10],
    ['ritmo.contagemSeg', 4],
    ['limites.tetoManual', 61],
    ['limites.tetoAuto', 61],
    ['limites.tetoManual', 0],
    ['freio.problemasManual', 0],
    ['freio.problemasAuto', 11],
    ['freio.esperaDigitandoSeg', 1],
    ['ritmo.pausaLonga.aCadaEnvios', 1],
    ['ritmo.pausaLonga.minMin', 0],
    ['filtros.excluirContatadosHaDias', 13],
    ['texto.tamanhoMax', 501],
    ['texto.tamanhoMax', 10],
    ['horarios.1.inicio', 5],
    ['horarios.1.fim', 23],
  ])('a tela recusa %s = %s', (campo, valor) => {
    const erros = validarAjustes(com(campo, valor));
    expect(erros.some((e) => e.campo === campo)).toBe(true);
  });

  it('valores no limite são aceitos', () => {
    let a = com('ritmo.manual.minSeg', 30);
    a = com('ritmo.manual.maxSeg', 30, a);
    a = com('ritmo.auto.minSeg', 30, a);
    a = com('ritmo.auto.maxSeg', 31, a);
    a = com('ritmo.contagemSeg', 5, a);
    a = com('limites.tetoManual', 60, a);
    a = com('limites.tetoAuto', 60, a);
    expect(validarAjustes(a)).toEqual([]);
  });

  it('min > max, número não inteiro, vazio (NaN) e horário invertido dão mensagem clara', () => {
    expect(validarAjustes(com('ritmo.manual.minSeg', 200))[0].mensagem).toMatch(/mínimo \(200 s\) não pode passar do máximo/);
    expect(validarAjustes(com('limites.tetoManual', 12.5))[0].mensagem).toMatch(/inteiro/);
    expect(validarAjustes(com('limites.tetoManual', Number.NaN))[0].mensagem).toMatch(/inteiro/);
    const invertido = com('horarios.1.inicio', 15);
    expect(validarAjustes(com('horarios.1.fim', 10, invertido)).map((e) => e.mensagem).join(' ')).toMatch(/início \(15h\) precisa ser antes do fim \(10h\)/);
    expect(validarAjustes(com('ritmo.pausaLonga.minMin', 30)).map((e) => e.mensagem).join(' ')).toMatch(/Pausa longa/);
  });

  it('rampa só é validada quando ligada', () => {
    expect(validarAjustes(com('limites.rampa.dia1a7', 999))).toEqual([]);
    const ligada = com('limites.rampa.ligada', true, com('limites.rampa.dia1a7', 999));
    expect(validarAjustes(ligada).some((e) => e.campo === 'limites.rampa.dia1a7')).toBe(true);
  });

  it('texto: link e quebra de linha seguem proibidos nos modelos; marcador desconhecido também', () => {
    const base = AJUSTES_PADRAO.texto.modelos;
    const falha = (texto: string) => validarAjustes(com('texto.modelos', [{ ...base[0], texto }])).map((e) => e.mensagem).join(' | ');
    expect(falha('Veja www.salvita.com.br')).toMatch(/link/);
    expect(falha('linha 1\nlinha 2')).toMatch(/quebra de linha/);
    expect(falha('Oi {nome}')).toMatch(/marcador desconhecido/);
    expect(falha('x'.repeat(501))).toMatch(/longo demais/);
    expect(validarAjustes(com('texto.tamanhoMax', 60, com('texto.modelos', [{ ...base[0], texto: 'y'.repeat(61) }]))).length).toBeGreaterThan(0);
  });

  it('modelos: nome obrigatório, sem nomes repetidos, padrão precisa existir', () => {
    const m = AJUSTES_PADRAO.texto.modelos[0];
    expect(validarAjustes(com('texto.modelos', [{ ...m, nome: '  ' }])).some((e) => /dê um nome/.test(e.mensagem))).toBe(true);
    expect(validarAjustes(com('texto.modelos', [m, { ...m, id: 'outro' }])).some((e) => /Já existe/.test(e.mensagem))).toBe(true);
    expect(validarAjustes(com('texto.modeloPadraoId', 'fantasma')).length).toBe(1);
  });

  it('limitarAjustes corta tudo nos limites absolutos e mantém min ≤ max', () => {
    let a = com('ritmo.manual.minSeg', 1);
    a = com('ritmo.manual.maxSeg', 2, a);
    a = com('ritmo.auto.minSeg', 5, a);
    a = com('ritmo.contagemSeg', 0, a);
    a = com('limites.tetoManual', 1000, a);
    a = com('limites.tetoAuto', 1000, a);
    a = com('filtros.excluirContatadosHaDias', 1, a);
    a = com('horarios.1.inicio', 0, a);
    a = com('horarios.1.fim', 30, a);
    const l = limitarAjustes(a);
    expect(l.ritmo.manual).toEqual({ minSeg: 30, maxSeg: 30 });
    expect(l.ritmo.auto.minSeg).toBe(30);
    expect(l.ritmo.contagemSeg).toBe(5);
    expect(l.limites.tetoManual).toBe(60);
    expect(l.limites.tetoAuto).toBe(60);
    expect(l.filtros.excluirContatadosHaDias).toBe(14);
    expect(l.horarios[1]).toMatchObject({ inicio: 6, fim: 22 });
    expect(validarAjustes(l)).toEqual([]);
  });

  it('normalizarAjustes: seção inválida volta ao padrão, o resto é aproveitado', () => {
    const lido = normalizarAjustes({ ritmo: 'quebrado', limites: { tetoManual: 20 }, freio: { problemasManual: 5 } });
    expect(lido.ritmo).toEqual(AJUSTES_PADRAO.ritmo);
    expect(lido.limites.tetoManual).toBe(20);
    expect(lido.limites.tetoAuto).toBe(30);
    expect(lido.freio.problemasManual).toBe(5);
    expect(lido.freio.problemasAuto).toBe(2);
  });
});

describe('restaurar padrão', () => {
  it('por campo, por grupo e tudo', () => {
    const alterado = com('limites.tetoManual', 10, com('ritmo.contagemSeg', 20, com('freio.problemasManual', 7)));
    expect(ehPadrao(alterado, 'limites.tetoManual')).toBe(false);
    expect(restaurarCampo(alterado, 'limites.tetoManual').limites.tetoManual).toBe(30);
    expect(restaurarCampo(alterado, 'limites.tetoManual').ritmo.contagemSeg).toBe(20);
    expect(restaurarGrupo(alterado, 'ritmo').ritmo).toEqual(AJUSTES_PADRAO.ritmo);
    expect(restaurarGrupo(alterado, 'ritmo').freio.problemasManual).toBe(7);
    expect(restaurarTudo()).toEqual(AJUSTES_PADRAO);
    expect(restaurarCampo(com('horarios.2.fim', 12), 'horarios.2').horarios[2]).toEqual(AJUSTES_PADRAO.horarios[2]);
  });

  it('o padrão original não é alterado por cópias', () => {
    const c = copiarAjustes(AJUSTES_PADRAO);
    c.limites.tetoManual = 1;
    expect(AJUSTES_PADRAO.limites.tetoManual).toBe(30);
    expect(obter(AJUSTES_PADRAO, 'ritmo.auto.minSeg')).toBe(90);
  });
});

describe('perfis e indicador de risco', () => {
  it('Cauteloso = valores atuais; Equilibrado e Rápido como pedido', () => {
    const [cauteloso, equilibrado, rapido] = PERFIS.map((p) => aplicarPerfil(AJUSTES_PADRAO, p.id));
    expect(cauteloso).toEqual(AJUSTES_PADRAO);
    expect(equilibrado.ritmo.manual).toEqual({ minSeg: 60, maxSeg: 120 });
    expect(equilibrado.ritmo.auto).toEqual({ minSeg: 60, maxSeg: 120 });
    expect(equilibrado.ritmo.pausaLonga).toEqual({ ligada: true, aCadaEnvios: 15, minMin: 5, maxMin: 10 });
    expect(rapido.ritmo.manual).toEqual({ minSeg: 45, maxSeg: 90 });
    expect(rapido.ritmo.auto).toEqual({ minSeg: 45, maxSeg: 90 });
    expect(rapido.ritmo.pausaLonga.ligada).toBe(false);
    expect(rapido.limites.tetoManual).toBe(30);
    expect(rapido.limites.tetoAuto).toBe(30);
    for (const p of [cauteloso, equilibrado, rapido]) expect(validarAjustes(p)).toEqual([]);
  });

  it('aplicar perfil não mexe em horários, freio, filtros e textos; depois dá para ajustar campo a campo', () => {
    const base = com('freio.problemasManual', 5, com('horarios.0.ligado', true));
    const r = aplicarPerfil(base, 'rapido');
    expect(r.horarios).toEqual(base.horarios);
    expect(r.freio).toEqual(base.freio);
    expect(r.texto).toEqual(base.texto);
    expect(detectarPerfil(r)).toBe('rapido');
    expect(detectarPerfil(com('ritmo.manual.minSeg', 50, r))).toBe('personalizado');
    expect(detectarPerfil(AJUSTES_PADRAO)).toBe('cauteloso');
    expect(detectarPerfil(aplicarPerfil(AJUSTES_PADRAO, 'equilibrado'))).toBe('equilibrado');
    expect(detectarPerfil(com('limites.rampa.ligada', true, AJUSTES_PADRAO))).toBe('personalizado');
  });

  it('o ritmo do perfil Rápido é aceito pela política (45 s) e pelo sorteio', () => {
    const rapido = aplicarPerfil(AJUSTES_PADRAO, 'rapido');
    const cfg = configEfetiva(rapido, true, true, [], seg10h);
    expect(sortearIntervaloSeg(cfg, () => 0, PISO_AJUSTES)).toBe(45);
    expect(sortearIntervaloSeg(cfg, () => 0.9999, PISO_AJUSTES)).toBe(90);
    // sem o piso do painel, a política de fábrica continuaria cortando em 60 s
    expect(normalizarConfig(cfg).intervaloMinSeg).toBe(60);
  });

  it('risco: Cauteloso baixo, Equilibrado médio, Rápido alto, e sobe com ritmo e volume', () => {
    const nivel = (a: Ajustes) => avaliarRisco(a, 'auto').nivel;
    expect(nivel(aplicarPerfil(AJUSTES_PADRAO, 'cauteloso'))).toBe('baixo');
    expect(nivel(aplicarPerfil(AJUSTES_PADRAO, 'equilibrado'))).toBe('medio');
    expect(nivel(aplicarPerfil(AJUSTES_PADRAO, 'rapido'))).toBe('alto');
    const manual = avaliarRisco(AJUSTES_PADRAO, 'manual');
    expect(manual.nivel).toBe('baixo');
    expect(avaliarRisco(com('limites.tetoManual', 60, AJUSTES_PADRAO), 'manual').pontos).toBeGreaterThan(manual.pontos);
    expect(avaliarRisco(com('ritmo.manual.minSeg', 30, com('ritmo.manual.maxSeg', 40)), 'manual').pontos).toBeGreaterThan(manual.pontos);
    expect(avaliarRisco(com('freio.pausarEmAviso', false), 'manual').pontos).toBe(manual.pontos + 1);
    expect(avaliarRisco(AJUSTES_PADRAO, 'auto').motivos.length).toBeGreaterThanOrEqual(3);
  });
});

describe('a política lê a configuração (cada parâmetro reflete)', () => {
  it('horários por dia: domingo ligado, sábado até 14h, quarta desligada', () => {
    let a = com('horarios.0', { dia: 0, ligado: true, inicio: 9, fim: 11 });
    a = com('horarios.6.fim', 14, a);
    a = com('horarios.3.ligado', false, a);
    expect(dentroDoHorario(fortaleza('2026-10-25T10:00'), a.horarios).ok).toBe(true); // domingo
    expect(dentroDoHorario(fortaleza('2026-10-25T11:00'), a.horarios).ok).toBe(false);
    expect(dentroDoHorario(fortaleza('2026-10-24T13:00'), a.horarios).ok).toBe(true); // sábado
    expect(dentroDoHorario(fortaleza('2026-10-21T10:00'), a.horarios)).toMatchObject({ ok: false, motivo: 'quarta: sem campanha' });
    // padrão sem argumento = de fábrica
    expect(dentroDoHorario(fortaleza('2026-10-25T10:00')).ok).toBe(false);
    expect(dentroDoHorario(fortaleza('2026-10-19T19:00')).motivo).toMatch(/segunda a sexta: 8h às 18h/);
  });

  it('podeAbrirProximo usa horário, freio e piso do painel', () => {
    const a = com('freio.problemasManual', 5, com('horarios.1.fim', 20));
    expect(podeAbrirProximo(LIVRE, CFG, fortaleza('2026-10-19T19:00'), a)).toEqual({ pode: true });
    expect(podeAbrirProximo(LIVRE, CFG, fortaleza('2026-10-19T19:00'))).toMatchObject({ tipo: 'horario' });
    expect(podeAbrirProximo({ ...LIVRE, problemasSeguidos: 3 }, CFG, seg10h, a)).toEqual({ pode: true });
    expect(podeAbrirProximo({ ...LIVRE, problemasSeguidos: 5 }, CFG, seg10h, a)).toMatchObject({ tipo: 'freio' });
    expect(podeAbrirProximo({ ...LIVRE, problemasSeguidos: 3 }, CFG, seg10h)).toMatchObject({ tipo: 'freio' });
    // intervalo de 45 s vale com os Ajustes (piso 30 s) e 60 s sem eles
    const cfg45 = { ...CFG, intervaloMinSeg: 45, intervaloMaxSeg: 90 };
    const estado = { ...LIVRE, ultimoEnvioEm: new Date(seg10h.getTime() - 50_000).toISOString(), intervaloAtualSeg: 45 };
    expect(podeAbrirProximo(estado, cfg45, seg10h, AJUSTES_PADRAO)).toEqual({ pode: true });
    expect(podeAbrirProximo(estado, cfg45, seg10h)).toMatchObject({ tipo: 'intervalo' });
  });

  it('o piso de 30 s não deixa passar de intervalos menores mesmo se o valor vier adulterado', () => {
    const c = normalizarConfig({ ...CFG, intervaloMinSeg: 5, intervaloMaxSeg: 6 }, PISO_AJUSTES);
    expect(c.intervaloMinSeg).toBe(30);
    expect(c.intervaloMaxSeg).toBe(30);
  });

  it('teto por modo e rampa por dia de uso (e nunca acima do absoluto)', () => {
    const a = com('limites.tetoManual', 40, com('limites.tetoAuto', 25));
    expect(configEfetiva(a, true, false, [], seg10h).tetoDiario).toBe(40);
    expect(configEfetiva(a, true, true, [], seg10h).tetoDiario).toBe(25);
    const r = com('limites.rampa', { ligada: true, dia1a7: 5, dia8a14: 12, depois: 50 }, a);
    const primeiro = (dia: string) => [{ enviadoEm: `${dia}T15:00:00Z` }];
    expect(diaDeUso([], seg10h)).toBe(1);
    expect(diaDeUso(primeiro('2026-10-19'), seg10h)).toBe(1);
    expect(configEfetiva(r, true, false, [], seg10h).tetoDiario).toBe(5);
    expect(configEfetiva(r, true, false, primeiro('2026-10-13'), seg10h).tetoDiario).toBe(5); // dia 7
    expect(configEfetiva(r, true, false, primeiro('2026-10-12'), seg10h).tetoDiario).toBe(12); // dia 8
    expect(configEfetiva(r, true, false, primeiro('2026-10-05'), seg10h).tetoDiario).toBe(40); // dia 15: min(40, 50)
    expect(configEfetiva(r, true, true, primeiro('2026-10-05'), seg10h).tetoDiario).toBe(25);
    // adulterado acima do absoluto
    const forjado = copiarAjustes(AJUSTES_PADRAO);
    forjado.limites.tetoManual = 500;
    expect(configEfetiva(forjado, true, false, [], seg10h).tetoDiario).toBe(60);
  });

  it('espera do automático: intervalo, pausa longa desligada e "a cada N"', () => {
    const a = com('ritmo.auto', { minSeg: 45, maxSeg: 50 }, com('ritmo.pausaLonga', { ligada: true, aCadaEnvios: 3, minMin: 2, maxMin: 3 }));
    expect(sortearEspera(0, () => 0, a)).toEqual({ segundos: 45, pausaLonga: false, enviosSeguidos: 1 });
    expect(sortearEspera(1, () => 0, a)).toEqual({ segundos: 45, pausaLonga: false, enviosSeguidos: 2 });
    expect(sortearEspera(2, () => 0, a)).toEqual({ segundos: 120, pausaLonga: true, enviosSeguidos: 0 });
    expect(sortearEspera(2, () => 0.9999, a).segundos).toBe(180);
    const sem = com('ritmo.pausaLonga.ligada', false, a);
    for (let i = 0; i < 30; i += 1) expect(sortearEspera(i, () => 0, sem).pausaLonga).toBe(false);
  });
});

describe('texto: saudação e tamanho', () => {
  it('saudação por horário de Fortaleza', () => {
    expect(saudacaoDoHorario(fortaleza('2026-10-19T08:00'))).toBe('Bom dia');
    expect(saudacaoDoHorario(fortaleza('2026-10-19T11:59'))).toBe('Bom dia');
    expect(saudacaoDoHorario(fortaleza('2026-10-19T12:00'))).toBe('Boa tarde');
    expect(saudacaoDoHorario(fortaleza('2026-10-19T17:59'))).toBe('Boa tarde');
    expect(saudacaoDoHorario(fortaleza('2026-10-19T18:00'))).toBe('Boa noite');
    // 20h UTC = 17h em Fortaleza, mesmo com o computador em outro fuso
    expect(saudacaoDoHorario(new Date('2026-10-19T20:00:00Z'))).toBe('Boa tarde');
  });

  it('{saudacao} e {primeiroNome} viram texto; link e quebra de linha continuam proibidos', () => {
    expect(montarMensagem('{saudacao}, {primeiroNome}!', ' Ana ', fortaleza('2026-10-19T09:00'))).toBe('Bom dia, Ana!');
    expect(validarModelo('{saudacao}, {primeiroNome}, tudo bem?')).toEqual([]);
    expect(validarModelo('{outra}').join()).toMatch(/marcador desconhecido/);
    expect(validarModelo('Oi\nAna').join()).toMatch(/quebra de linha/);
    expect(validarModelo('veja salvita.com.br').join()).toMatch(/link/);
  });

  it('tamanho máximo configurável, mas nunca acima de 500', () => {
    expect(validarModelo('x'.repeat(100), { tamanhoMax: 80 }).join()).toMatch(/100\/80/);
    expect(validarModelo('x'.repeat(100), { tamanhoMax: 100 })).toEqual([]);
    expect(validarModelo('x'.repeat(501), { tamanhoMax: 9999 }).join()).toMatch(/501\/500/);
    expect(validarModelos('x'.repeat(100), [], { tamanhoMax: 80 }).erros.length).toBe(1);
  });
});

describe('persistência, migração, importação e exportação', () => {
  it('migração: quem veio da 0.3.x recebe os padrões; os valores antigos são preservados', async () => {
    const db = await novoBanco();
    expect(await lerAjustes(db)).toEqual(AJUSTES_PADRAO);
    expect(await lerConfig(db)).toEqual({ ...CONFIG_PADRAO });

    const db2 = await novoBanco();
    await salvarConfig(db2, { tetoDiario: 20, intervaloMinSeg: 200, intervaloMaxSeg: 300, numeroComMaisDe30Dias: true });
    const a = await lerAjustes(db2);
    expect(a.limites).toMatchObject({ tetoManual: 20, tetoAuto: 20 });
    expect(a.ritmo.manual).toEqual({ minSeg: 200, maxSeg: 300 });
    expect(a.ritmo.auto).toEqual({ minSeg: 200, maxSeg: 300 });
    expect(await lerConfig(db2)).toEqual({ tetoDiario: 20, intervaloMinSeg: 200, intervaloMaxSeg: 300, numeroComMaisDe30Dias: true });
    expect(a).toEqual(ajustesDeLegado({ tetoDiario: 20, intervaloMinSeg: 200, intervaloMaxSeg: 300 }));
    // o comportamento do automático é o do configAuto antigo
    expect(configEfetiva(a, true, true, [], seg10h)).toEqual(configAuto({ tetoDiario: 20, intervaloMinSeg: 200, intervaloMaxSeg: 300, numeroComMaisDe30Dias: true }));
    // legado com teto 60 e 60–120 s: automático continua em 30 / 90–180
    const frouxo = ajustesDeLegado({ tetoDiario: 60, intervaloMinSeg: 60, intervaloMaxSeg: 120 });
    expect(configEfetiva(frouxo, true, true, [], seg10h)).toEqual(configAuto({ ...CFG, tetoDiario: 60 }));
  });

  it('salvar só com tudo válido; salvo vale para a política (lerConfig) e o número antigo é independente', async () => {
    const db = await novoBanco();
    const ruim = await salvarAjustes(db, com('limites.tetoManual', 61));
    expect(ruim.ok).toBe(false);
    expect(await lerAjustes(db)).toEqual(AJUSTES_PADRAO);

    const bom = await salvarAjustes(db, com('limites.tetoManual', 12, com('ritmo.manual.minSeg', 45)));
    expect(bom.ok).toBe(true);
    const cfg = await lerConfig(db);
    expect(cfg).toMatchObject({ tetoDiario: 12, intervaloMinSeg: 45, numeroComMaisDe30Dias: false });
    await salvarNumeroAntigo(db, true);
    expect(await lerConfig(db)).toMatchObject({ tetoDiario: 12, intervaloMinSeg: 45, numeroComMaisDe30Dias: true });
    expect((await lerAjustes(db)).limites.tetoManual).toBe(12);
  });

  it('registro adulterado no banco é cortado nos limites ao ler', async () => {
    const db = await novoBanco();
    const forjado = copiarAjustes(AJUSTES_PADRAO);
    forjado.limites.tetoManual = 5000;
    forjado.ritmo.contagemSeg = 0;
    forjado.ritmo.manual.minSeg = 1;
    await db.put('config', { id: 'ajustes', valor: forjado });
    const lido = await lerAjustes(db);
    expect(lido.limites.tetoManual).toBe(60);
    expect(lido.ritmo.contagemSeg).toBe(5);
    expect(lido.ritmo.manual.minSeg).toBe(30);
  });

  it('exportar e importar (zod) levam os ajustes; backup antigo sem ajustes segue válido', async () => {
    const origem = await novoBanco();
    const editado = aplicarPerfil(com('freio.problemasAuto', 4, com('texto.tamanhoMax', 300)), 'equilibrado');
    await salvarAjustes(origem, editado);
    const backup = await exportarTudo(origem);
    expect(backup.ajustes).toEqual(editado);
    const lido = lerBackup(JSON.stringify(backup));
    expect(lido.ok).toBe(true);

    const destino = await novoBanco();
    if (!lido.ok) throw new Error('backup deveria ser válido');
    await importarTudo(destino, lido.backup, 'substituir');
    expect(await lerAjustes(destino)).toEqual(editado);

    // backup da 0.3.x (sem o campo)
    const { ajustes: _descartado, ...antigo } = backup;
    const antigoLido = lerBackup(JSON.stringify(antigo));
    expect(antigoLido.ok).toBe(true);
    const outro = await novoBanco();
    if (!antigoLido.ok) throw new Error('backup antigo deveria ser válido');
    await importarTudo(outro, antigoLido.backup, 'mesclar');
    expect((await lerAjustes(outro)).limites.tetoManual).toBe(editado.limites.tetoManual); // veio do config legado do backup
  });

  it('backup com ajustes forjados: schema recusa o que não tem forma e a importação corta os limites', async () => {
    const db = await novoBanco();
    const backup = { ...(await exportarTudo(db)), ajustes: com('limites.tetoManual', 9999) };
    const lido = lerBackup(JSON.stringify(backup));
    if (!lido.ok) throw new Error('forma válida');
    const destino = await novoBanco();
    await importarTudo(destino, lido.backup, 'mesclar');
    expect((await lerAjustes(destino)).limites.tetoManual).toBe(60);

    const semForma = lerBackup(JSON.stringify({ ...backup, ajustes: { versao: 1, ritmo: 'x' } }));
    expect(semForma.ok).toBe(false);
  });

  it('importar nunca liga o modo automático', async () => {
    const db = await novoBanco();
    const backup = await exportarTudo(db);
    const destino = await novoBanco();
    await importarTudo(destino, backup, 'substituir');
    expect(await lerAutomatico(destino)).toEqual(ESTADO_AUTOMATICO_PADRAO);
  });
});

describe('o Executor lê os Ajustes', () => {
  async function comAjustes(a: Ajustes, nomes = ['Ana', 'Bia', 'Cris']) {
    const t = await montar(nomes);
    const r = await salvarAjustes(t.db, a);
    expect(r.ok).toBe(true);
    return t;
  }

  it('intervalo do manual sorteado no intervalo do painel (45–90 s, 0.5 → 68 s)', async () => {
    const t = await comAjustes(aplicarPerfil(AJUSTES_PADRAO, 'rapido'));
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true });
    expect(t.agendados.at(-1)?.ms).toBe(68_000);
  });

  it('teto diário do painel pausa a campanha', async () => {
    const t = await comAjustes(com('limites.tetoManual', 1));
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:envioDetectado', nome: 'Ana', texto: 'Oi Ana', textoConfere: true });
    t.avancarRelogio(120_000);
    t.agendados.at(-1)?.fn();
    await esperarFila();
    await t.ex.abrirProximo();
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(t.ex.atual.mensagem).toMatch(/teto diário atingido \(1\/1\)/);
    expect(abertos(t.pedidos)).toEqual(['Ana']);
  });

  it('freio do manual: 1 problema seguido já pausa', async () => {
    const t = await montar(['A', 'B', 'C'], (p) => (p.tipo === 'abrirEColar' ? { ok: false, codigo: 'nao_encontrado', erro: 'não achei' } : { ok: true }));
    await salvarAjustes(t.db, com('freio.problemasManual', 1));
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual(['A']);
    expect(t.ex.atual.campanha.status).toBe('pausada');
  });

  it('horário do painel: domingo ligado permite iniciar no domingo (e o padrão não)', async () => {
    const t = await montar(['Ana']);
    t.setAgora(new Date('2026-10-25T13:00:00Z')); // domingo 10h em Fortaleza
    await t.ex.iniciar();
    expect(t.ex.atual.campanha.status).toBe('pausada');
    expect(abertos(t.pedidos)).toEqual([]);

    const t2 = await montar(['Ana']);
    await salvarAjustes(t2.db, com('horarios.0', { dia: 0, ligado: true, inicio: 8, fim: 12 }));
    t2.setAgora(new Date('2026-10-25T13:00:00Z'));
    await t2.ex.iniciar();
    expect(abertos(t2.pedidos)).toEqual(['Ana']);
  });

  it('{saudacao} usa a hora do relógio do executor e o texto colado é o conferido', async () => {
    const t = await montar(['Ana'], () => ({ ok: true }), '{saudacao}, {primeiroNome}!');
    await t.ex.iniciar();
    expect(t.pedidos.find((p) => p.tipo === 'abrirEColar')).toMatchObject({ nome: 'Ana', texto: 'Bom dia, Ana!' }); // 10h
  });

  it('tamanho máximo do painel recusa texto longo no momento do envio', async () => {
    const t = await montar(['Ana'], () => ({ ok: true }), 'Oi {primeiroNome}, ' + 'a'.repeat(80));
    await salvarAjustes(t.db, com('texto.tamanhoMax', 60, com('texto.modelos', [])));
    await t.ex.iniciar();
    expect(abertos(t.pedidos)).toEqual([]);
    expect(t.ex.atual.campanha.itens[0]).toMatchObject({ status: 'problema', codigo: 'texto_invalido' });
  });

  it('aviso do WhatsApp na espera: pausa por padrão; com o ajuste desligado só mostra (as conferências seguem)', async () => {
    const t = await montar(['Ana']);
    await t.ex.iniciar();
    await t.ex.aoReceberEvento({ tipo: 'vitaZap:aviso', texto: 'aviso do WhatsApp' });
    expect(t.ex.atual.campanha.status).toBe('pausada');

    const t2 = await montar(['Ana']);
    await salvarAjustes(t2.db, com('freio.pausarEmAviso', false));
    await t2.ex.iniciar();
    await t2.ex.aoReceberEvento({ tipo: 'vitaZap:aviso', texto: 'aviso do WhatsApp' });
    expect(t2.ex.atual.campanha.status).toBe('em_execucao');
    expect(t2.ex.atual.mensagem).toBe('aviso do WhatsApp');
  });
});

describe('a tela de Ajustes não toca nas travas de envio', () => {
  const fonte = (c: string) => readFileSync(join(__dirname, '..', c), 'utf8');

  it('Ajustes.tsx e ajustes.ts não ligam o automático nem pedem envio', () => {
    for (const arquivo of ['src/sidepanel/Ajustes.tsx', 'src/shared/ajustes.ts']) {
      const codigo = fonte(arquivo).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(codigo, arquivo).not.toMatch(/salvarAutomatico|ligarAutomatico|lerAutomatico|enviarAutomatico|enviarSeAutorizado|emitirToken|\.click\s*\(|KeyboardEvent|dispatchEvent/);
    }
  });

  it('os valores antigos continuam existindo como padrões (nenhuma constante foi apagada)', () => {
    expect(AUTO.tetoDiario).toBe(30);
    expect(PROBLEMAS_SEGUIDOS_PARA_PAUSAR).toBe(3);
  });
});
