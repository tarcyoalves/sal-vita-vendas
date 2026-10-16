import { describe, expect, it } from 'vitest';
import {
  alternarProduto, dataCurta, estadoDaConsulta, limiteDeSelecaoAtingido, planoDaSelecao, selecaoInicial, textoReaproveita,
} from '../client/src/lib/credito/selecao';
import { saldoEstaBaixo } from '../client/src/lib/credito/regras';
import { SALDO_BAIXO_REAIS } from '../shared/credito';

const recente = { consultadoEm: '2026-10-10T15:00:00Z', valido: true, provedor: 'boavista_apifull' };
const plano = (sel: string[], extra: Partial<Parameters<typeof planoDaSelecao>[0]> = {}) =>
  planoDaSelecao({ selecionados: sel, ultimoPorProduto: null, forcarNova: false, simulado: false, provedorAtual: 'boavista_apifull', ...extra });

describe('seleção', () => {
  it('padrão: só o Boa Vista marcado', () => expect(selecaoInicial()).toEqual(['boavista']));
  it('marca e desmarca mantendo a ordem do catálogo', () => {
    expect(alternarProduto(['boavista'], 'serasa_premium')).toEqual(['boavista', 'serasa_premium']);
    expect(alternarProduto(['serasa_premium'], 'boavista')).toEqual(['boavista', 'serasa_premium']);
    expect(alternarProduto(['boavista', 'serasa_premium'], 'boavista')).toEqual(['serasa_premium']);
  });
  it('item sem custo medido ou desconhecido nunca entra', () => {
    for (const c of ['serasa_basica', 'protesto_nacional', 'cenprot', 'cnpj_cadastro', 'cndt', 'inexistente']) {
      expect(alternarProduto(['boavista'], c)).toEqual(['boavista']);
    }
  });
  it('máximo de 3 (só há 3 medidos, mas o limite é respeitado)', () => {
    expect(limiteDeSelecaoAtingido(['a', 'b', 'c'])).toBe(true);
    expect(limiteDeSelecaoAtingido(['a'])).toBe(false);
    const cheio = ['boavista', 'serasa_premium', 'define_risco'];
    expect(alternarProduto(cheio, 'boavista')).toEqual(['serasa_premium', 'define_risco']);
  });
});

describe('plano (total, reaproveitado)', () => {
  it('total soma os marcados', () => {
    expect(plano(['boavista']).totalReais).toBe(2.75);
    expect(plano(['boavista', 'serasa_premium']).totalReais).toBe(9.47);
    expect(plano(['boavista', 'serasa_premium', 'define_risco']).totalReais).toBe(24.56);
  });
  it('já consultado há menos de 30 dias não soma e conta como reaproveitado', () => {
    const p = plano(['boavista', 'serasa_premium'], { ultimoPorProduto: { boavista: recente } });
    expect(p.totalReais).toBe(6.72);
    expect(p.chamadas).toBe(1);
    expect(p.linhas.find((l) => l.chave === 'boavista')).toMatchObject({ reaproveitado: true, custoCobrado: 0 });
  });
  it('vencido, outro provedor ou "forçar nova" cobram de novo', () => {
    expect(plano(['boavista'], { ultimoPorProduto: { boavista: { ...recente, valido: false } } }).totalReais).toBe(2.75);
    expect(plano(['boavista'], { ultimoPorProduto: { boavista: { ...recente, provedor: 'simulado' } } }).totalReais).toBe(2.75);
    expect(plano(['boavista'], { ultimoPorProduto: { boavista: recente }, forcarNova: true }).totalReais).toBe(2.75);
  });
  it('simulado: total R$ 0', () => {
    const p = plano(['boavista', 'define_risco'], { simulado: true, provedorAtual: 'simulado' });
    expect(p.totalReais).toBe(0);
    expect(p.linhas.map((l) => l.custoCobrado)).toEqual([0, 0]);
    expect(p.linhas.map((l) => l.custoCatalogo)).toEqual([2.75, 15.09]); // o preço real segue visível (riscado na tela)
  });
  it('ignora item não medido que chegue na seleção', () => expect(plano(['cndt']).linhas).toEqual([]));
});

describe('estado do botão e bloqueios', () => {
  const ctx = { tetoPorConsultaReais: 30, usadasNoMes: 0, limiteMensal: 50, motivo: 'pedido a prazo' };
  it('habilita com seleção, motivo e tudo cabendo', () => {
    const e = estadoDaConsulta({ ...ctx, plano: plano(['boavista']), saldo: 25.44 });
    expect(e).toMatchObject({ podeConsultar: true, saldoApos: 22.69, saldoNegativo: false, bloqueios: [] });
  });
  it('sem seleção ou motivo curto: desabilitado', () => {
    expect(estadoDaConsulta({ ...ctx, plano: plano([]), saldo: 25 }).podeConsultar).toBe(false);
    expect(estadoDaConsulta({ ...ctx, plano: plano(['boavista']), saldo: 25, motivo: 'abc' }).podeConsultar).toBe(false);
  });
  it('saldo após negativo: vermelho e desabilitado', () => {
    const e = estadoDaConsulta({ ...ctx, plano: plano(['boavista', 'serasa_premium']), saldo: 9 });
    expect(e.saldoApos).toBe(-0.47);
    expect(e).toMatchObject({ saldoNegativo: true, podeConsultar: false });
    expect(e.bloqueios[0]).toContain('Saldo insuficiente');
  });
  it('saldo desconhecido não bloqueia', () => {
    const e = estadoDaConsulta({ ...ctx, plano: plano(['boavista']), saldo: null });
    expect(e).toMatchObject({ podeConsultar: true, saldoApos: null, saldoNegativo: false });
  });
  it('teto por consulta e limite mensal bloqueiam', () => {
    const tudo = plano(['boavista', 'serasa_premium', 'define_risco']);
    expect(estadoDaConsulta({ ...ctx, plano: tudo, saldo: 100, tetoPorConsultaReais: 20 }).podeConsultar).toBe(false);
    expect(estadoDaConsulta({ ...ctx, plano: tudo, saldo: 100, usadasNoMes: 48 }).podeConsultar).toBe(false);
  });
  it('tudo reaproveitado não é bloqueado nem por saldo zero', () => {
    const p = plano(['boavista'], { ultimoPorProduto: { boavista: recente } });
    expect(estadoDaConsulta({ ...ctx, plano: p, saldo: 0, usadasNoMes: 50 }).podeConsultar).toBe(true);
  });
  it('ocupado ou não carregado: desabilitado', () => {
    expect(estadoDaConsulta({ ...ctx, plano: plano(['boavista']), saldo: 25, ocupado: true }).podeConsultar).toBe(false);
    expect(estadoDaConsulta({ ...ctx, plano: plano(['boavista']), saldo: 25, carregado: false }).podeConsultar).toBe(false);
  });
});

describe('textos e saldo baixo', () => {
  it('data curta no fuso de São Paulo e texto de reaproveitamento', () => {
    expect(dataCurta('2026-10-10T15:00:00Z')).toBe('10/10');
    expect(textoReaproveita('2026-10-10T15:00:00Z')).toBe('Já consultado em 10/10 — sem custo (reaproveita)');
    expect(dataCurta(null)).toBe('--');
  });
  it('saldo baixo abaixo de R$ 15 (desconhecido não avisa)', () => {
    expect(SALDO_BAIXO_REAIS).toBe(15);
    expect(saldoEstaBaixo(14.99)).toBe(true);
    expect(saldoEstaBaixo(15)).toBe(false);
    expect(saldoEstaBaixo(null)).toBe(false);
  });
});
