import { describe, it, expect } from 'vitest';
import { condicaoPorTexto, normalizarPrazo, SMBI_CONDICOES_PAGAMENTO } from '../shared/smbiCondicoes';
import { mapOrderToSmbiPayload } from '../server/lib/smbi';
import type { FatOrder } from '../server/db/schema';

describe('condicaoPorTexto — prazos digitados à mão', () => {
  it('30/60/90 (sem "DIAS") é a condição 46', () => {
    expect(condicaoPorTexto('30/60/90')?.cod).toBe('46');
    expect(condicaoPorTexto('30/60/90')?.descricao).toBe('30/60/90 DIAS');
  });

  it.each([
    ['30/60/90 dias', '46'],
    ['30 / 60 / 90 DIAS', '46'],
    ['30-60-90', '46'],
    ['30,60,90', '46'],
    ['30/45/60', '10'],
    ['30 dias', '2'],
    ['30', '2'],
    ['15 dias', '11'],
    ['20 DIAS', '5'],
    ['45', '4'],
    ['60 d', '6'],
    ['à vista', '1'],
    ['A VISTA', '1'],
    ['avista', '1'],
    ['  À  Vista ', '1'],
  ])('%s → código %s', (texto, cod) => {
    expect(condicaoPorTexto(texto)?.cod).toBe(cod);
  });

  it('mapa informado pelo dono: 20/40/60 → 100, 40/60 → 150 e 15/25 → 104', () => {
    expect(condicaoPorTexto('20/40/60')?.cod).toBe('100');
    expect(condicaoPorTexto('20/40/60 DIAS')?.cod).toBe('100');
    expect(condicaoPorTexto('40/60')?.cod).toBe('150');
    expect(condicaoPorTexto('15/25')?.cod).toBe('104');
    expect(condicaoPorTexto('15/25 DIAS')?.cod).toBe('104');
    expect(condicaoPorTexto('15/25 dias')?.cod).toBe('104');
  });

  it('prazo fora do catálogo continua sem código (nunca inventa)', () => {
    expect(condicaoPorTexto('20/50/80')).toBeNull();
    expect(condicaoPorTexto('90')).toBeNull();
  });

  it('texto com mais informação não casa por engano', () => {
    expect(condicaoPorTexto('30 dias após emissão da NF')).toBeNull();
    expect(condicaoPorTexto('30/60/90 + entrada')).toBeNull();
    expect(condicaoPorTexto('boleto')).toBeNull();
    expect(condicaoPorTexto('')).toBeNull();
    expect(condicaoPorTexto(null)).toBeNull();
    expect(condicaoPorTexto(undefined)).toBeNull();
  });

  it('a ordem dos prazos importa (60/30 não é 30/60)', () => {
    expect(condicaoPorTexto('60/30')).toBeNull();
  });

  it('toda descrição do catálogo casa consigo mesma e com o próprio código', () => {
    for (const c of SMBI_CONDICOES_PAGAMENTO) {
      expect(condicaoPorTexto(c.descricao)?.cod).toBe(c.cod);
    }
    expect(new Set(SMBI_CONDICOES_PAGAMENTO.map((c) => c.cod)).size).toBe(SMBI_CONDICOES_PAGAMENTO.length);
    expect(new Set(SMBI_CONDICOES_PAGAMENTO.map((c) => normalizarPrazo(c.descricao))).size).toBe(SMBI_CONDICOES_PAGAMENTO.length);
  });
});

describe('payload do robô: código derivado quando a coluna está vazia', () => {
  const base = {
    id: 'p1', sellerName: 'Fulano', cnpj: '1', razaoSocial: 'X', clienteNome: 'X', cidade: 'A', uf: 'RN',
    status: 'estimado', itens: [], valorFretePorUnidade: 0, observacoes: '',
    previsaoFaturamentoEm: null, aprovadoEm: '2026-09-28T12:00:00.000Z', aprovadoPor: 'Admin',
  } as unknown as FatOrder;

  it('pedido do print: sal 30/60/90 ganha 46; frete 20/40/60 ganha 100', () => {
    const p = mapOrderToSmbiPayload({
      ...base, prazoPagamentoSal: '30/60/90', prazoPagamentoFrete: '20/40/60',
      smbiCondpagSalCod: null, smbiCondpagFreteCod: null,
    } as FatOrder);
    expect(p.smbiCondpagSalCod).toBe('46');
    expect(p.smbiCondpagFreteCod).toBe('100');
  });

  it('código já gravado nunca é sobrescrito pelo derivado', () => {
    const p = mapOrderToSmbiPayload({
      ...base, prazoPagamentoSal: '30/60/90', prazoPagamentoFrete: '30 dias',
      smbiCondpagSalCod: '99', smbiCondpagFreteCod: '77',
    } as FatOrder);
    expect(p.smbiCondpagSalCod).toBe('99');
    expect(p.smbiCondpagFreteCod).toBe('77');
  });
});

describe('payload do robô: prova do clique', () => {
  it('leva a hora e o autor do clique', () => {
    const p = mapOrderToSmbiPayload({
      id: 'p1', sellerName: 'F', cnpj: '1', razaoSocial: 'X', clienteNome: 'X', cidade: 'A', uf: 'RN',
      status: 'estimado', itens: [], valorFretePorUnidade: 0, observacoes: '', prazoPagamentoSal: '', prazoPagamentoFrete: '',
      previsaoFaturamentoEm: null, aprovadoEm: '2026-09-29T12:00:00.000Z', aprovadoPor: 'Admin',
      smbiCondpagSalCod: null, smbiCondpagFreteCod: null,
      smbiSolicitadoEm: '2026-09-29T14:00:00.000Z', smbiSolicitadoPor: 'Tarcyo',
    } as unknown as FatOrder);
    expect(p.smbiSolicitadoEm).toBe('2026-09-29T14:00:00.000Z');
    expect(p.smbiSolicitadoPor).toBe('Tarcyo');
  });
});

import { codigoCondicaoDaEmpresa } from '../shared/smbiCondicoes';
describe('códigos por empresa', () => {
  const AS = '51422900000168', CA = '49748258000160';
  it('A S e sem empresa mantêm o código de sempre', () => {
    expect(codigoCondicaoDaEmpresa('2', '30 DIAS', AS)).toBe('2');
    expect(codigoCondicaoDaEmpresa(null, '30/60', null)).toBe('3');
  });
  it('C Alves traduz pelo prazo, não pelo número', () => {
    expect(codigoCondicaoDaEmpresa('2', '30 DIAS', CA)).toBe('187');
    expect(codigoCondicaoDaEmpresa(null, '30/45/60 dias', CA)).toBe('203');
    expect(codigoCondicaoDaEmpresa('1', 'A VISTA', CA)).toBe('182');
    expect(codigoCondicaoDaEmpresa('11', '15 DIAS', CA)).toBe('191');
  });
  it('prazo sem código limpo na C Alves vira null', () => {
    expect(codigoCondicaoDaEmpresa('100', '20/40/60', CA)).toBeNull();
    expect(codigoCondicaoDaEmpresa('150', '40/60', CA)).toBeNull();
    expect(codigoCondicaoDaEmpresa('46', '30/60/90', CA)).toBeNull();
  });
});
