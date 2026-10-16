import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analisarSinais, calcularVeredito } from '../shared/credito';
import {
  dataPtBr, mapeadorBoaVista, mapeadorDefineRisco, mapeadorSerasaPremium, numeroPtBr, periodoMes,
} from '../server/lib/credito/provedores/mapeadores';

const fx = (n: string): unknown => JSON.parse(readFileSync(`tests/fixtures/credito/${n}.json`, 'utf8'));
const AGORA = new Date('2026-10-16T12:00:00Z');

describe('parse PT-BR', () => {
  it('números, percentuais, datas e períodos', () => {
    expect(numeroPtBr('9451,05')).toBe(9451.05);
    expect(numeroPtBr('1.234,56')).toBe(1234.56);
    expect(numeroPtBr('3,0%')).toBe(3);
    expect(numeroPtBr('150.000,00')).toBe(150000);
    expect(numeroPtBr('')).toBeNull();
    expect(numeroPtBr('NAO CALCULADO')).toBeNull();
    expect(dataPtBr('16/10/2026')).toBe('2026-10-16');
    expect(dataPtBr('')).toBeNull();
    expect(periodoMes('SET/2026')).toBe('2026-09-01');
    expect(periodoMes('X')).toBeNull();
  });
});

describe('mapeador Boa Vista (fixture sintética)', () => {
  const m = mapeadorBoaVista(fx('apifull-boavista'));
  it('cadastro e score', () => {
    expect(m.cadastro).toMatchObject({
      razaoSocial: 'COMERCIAL EXEMPLO FICTICIA LTDA', fundacao: '2005-11-03', situacao: 'ATIVA', capitalSocial: 150000,
      municipio: 'CUIABA', uf: 'MT', inscricaoEstadual: '123456789',
    });
    expect(m.score).toMatchObject({ valor: 745, probabilidadeInadimplencia: 3, faixa: 'B' });
  });
  it('pendência da PGE-MT, protestos 0 consultado, ações e falência não consultadas', () => {
    expect(m.anotacoes.pendenciasFinanceiras).toMatchObject({ consultado: true, quantidade: 1, valorTotal: 9451.05 });
    expect(m.anotacoes.pendenciasFinanceiras.itens[0]).toMatchObject({ data: '2021-03-10', descricao: 'Contrato CDA 2021/0042', valor: 9451.05, local: 'DIVIDA ATIVA' });
    expect(m.anotacoes.protestos).toMatchObject({ consultado: true, quantidade: 0 });
    expect(m.anotacoes.chequesSemFundo).toMatchObject({ consultado: true, quantidade: 0 });
    expect(m.anotacoes.acoesJudiciais.consultado).toBe(false);
    expect(m.anotacoes.falenciaRecuperacao.consultado).toBe(false);
  });
  it('consultas, comportamento e complementos; sem sócios', () => {
    expect(m.consultasRecentes).toEqual([
      { data: '2026-10-05', consultante: 'FORNECEDOR FICTICIO A LTDA', quantidade: 1 },
      { data: '2026-09-20', consultante: 'FORNECEDOR FICTICIO B SA', quantidade: 1 },
    ]);
    expect(m.comportamento).toEqual({ ultimaCompraEm: '2026-09-01', relacionamentoMaisAntigoEm: null, fontesConsultadas: null, pagamentoPontualPct: 100 });
    expect(m.complementos?.consultas12Meses).toBe(7);
    expect(m.socios).toEqual([]);
  });
  it('pendência atenuada (órgão público, 2021) => COM_RESTRICAO, nunca REPROVADO', () => {
    const v = calcularVeredito({ ...m }, AGORA);
    expect(v.veredito).toBe('COM_RESTRICAO');
    expect(v.motivos.join(' ')).toContain('pendência');
    expect(analisarSinais(m, AGORA).some((s) => s.codigo === 'RESTRICAO_ATENUADA')).toBe(true);
  });
  it('bloco ausente não vira "Nada consta"', () => {
    const j = fx('apifull-boavista') as { dados: { CREDCADASTRAL: Record<string, unknown> } };
    delete j.dados.CREDCADASTRAL.PROTESTOS;
    delete j.dados.CREDCADASTRAL.CH_SEM_FUNDOS_BACEN;
    delete j.dados.CREDCADASTRAL.CH_SEM_FUNDOS_VAREJO;
    const x = mapeadorBoaVista(j);
    expect(x.anotacoes.protestos.consultado).toBe(false);
    expect(x.anotacoes.chequesSemFundo.consultado).toBe(false);
  });
  it('cheques somam BACEN + varejo', () => {
    const j = fx('apifull-boavista') as { dados: { CREDCADASTRAL: Record<string, unknown> } };
    j.dados.CREDCADASTRAL.CH_SEM_FUNDOS_BACEN = { QUANTIDADE_OCORRENCIA: '1', OCORRENCIAS: [{ VALOR: '500,00' }] };
    j.dados.CREDCADASTRAL.CH_SEM_FUNDOS_VAREJO = { QUANTIDADE_OCORRENCIA: '2', OCORRENCIAS: [{ VALOR: '100,00' }, { VALOR: '50,50' }] };
    expect(mapeadorBoaVista(j).anotacoes.chequesSemFundo).toMatchObject({ consultado: true, quantidade: 3, valorTotal: 650.5 });
  });
  it('estrutura desconhecida cai no defensivo (sem inventar)', () => {
    const x = mapeadorBoaVista({ dados: { score: 640 } });
    expect(x.score.valor).toBe(640);
    expect(x.anotacoes.protestos.consultado).toBe(false);
  });
});

describe('mapeador Serasa Premium (fixture sintética)', () => {
  const m = mapeadorSerasaPremium(fx('apifull-serasa-premium'));
  it('ignora o score "NÃO CALCULADO" e usa a entrada com probabilidade', () => {
    expect(m.score).toMatchObject({ valor: 612, probabilidadeInadimplencia: 12.5, faixa: 'C' });
  });
  it('sem nenhuma entrada com probabilidade: score null', () => {
    const j = fx('apifull-serasa-premium') as { dados: { CREDCADASTRAL: { SCORES: { OCORRENCIAS: unknown[] } } } };
    j.dados.CREDCADASTRAL.SCORES.OCORRENCIAS = [j.dados.CREDCADASTRAL.SCORES.OCORRENCIAS[0]];
    expect(mapeadorSerasaPremium(j).score).toEqual({ valor: null, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null });
  });
  it('sócios com entrada null, veículos, faturamento, ações e passagens', () => {
    expect(m.socios).toHaveLength(2);
    expect(m.socios[0]).toMatchObject({ nome: 'SOCIO FICTICIO UM', cargo: 'SOCIO-ADMINISTRADOR', participacao: 60, entrada: null });
    expect(m.complementos).toEqual({ faturamentoPresumidoFaixa: '180.001 A 360 MIL', veiculos: [{ marcaModelo: 'VW/DELIVERY 11.180', placa: 'AAA0A00' }] });
    expect(m.anotacoes.acoesJudiciais).toMatchObject({ consultado: true, quantidade: 2, valorTotal: 18500 });
    expect(m.consultasRecentes).toEqual([{ data: '2026-10-12', consultante: 'FORNECEDOR FICTICIO A LTDA', quantidade: 1 }]);
    expect(m.comportamento).toBeUndefined();
  });
  it('não mapeia contatos', () => {
    expect(JSON.stringify(m)).not.toContain('6500000000');
  });
  it('sócio sem data de entrada não dispara SOCIO_RECENTE', () => {
    expect(analisarSinais(m, AGORA).some((s) => s.codigo === 'SOCIO_RECENTE')).toBe(false);
  });
});

describe('mapeador Define Risco (mínimo)', () => {
  const m = mapeadorDefineRisco(fx('apifull-define-risco'));
  it('só score, classe, probabilidade, decisão, faixa e consultas', () => {
    expect(m.score).toEqual({ valor: 740, probabilidadeInadimplencia: 4.2, faixa: 'B', textoInterpretacao: 'APROVAR COM LIMITE MODERADO' });
    expect(m.complementos).toEqual({ faturamentoPresumidoFaixa: '180.001 A 360 MIL', consultas12Meses: 3 });
    expect(m.socios).toEqual([]);
    expect(Object.values(m.anotacoes).every((g) => !g.consultado)).toBe(true);
  });
});
