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
    // a entrada ignorada não some: fica em `outros` como "não calculado" (valor null), com o rótulo da posição na fonte
    // (nesta fixture os dois TIPO_SCORE são diferentes e preenchidos: "PJ" e "PJ PREMIUM" viram os rótulos)
    expect(m.score.rotulo).toBe('PJ PREMIUM');
    expect(m.score.outros).toEqual([{ valor: null, probabilidadeInadimplencia: null, faixa: null, texto: 'SCORE NAO CALCULADO', rotulo: 'PJ' }]);
  });
  it('sem nenhuma entrada com probabilidade: score null', () => {
    const j = fx('apifull-serasa-premium') as { dados: { CREDCADASTRAL: { SCORES: { OCORRENCIAS: unknown[] } } } };
    j.dados.CREDCADASTRAL.SCORES.OCORRENCIAS = [j.dados.CREDCADASTRAL.SCORES.OCORRENCIAS[0]];
    expect(mapeadorSerasaPremium(j).score).toEqual({ valor: null, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null });
  });
  it('sócios com entrada null, veículos, faturamento, ações e passagens', () => {
    expect(m.socios).toHaveLength(2);
    expect(m.socios[0]).toMatchObject({ nome: 'SOCIO FICTICIO UM', cargo: 'SOCIO-ADMINISTRADOR', participacao: 60, entrada: null });
    expect(m.complementos).toEqual({
      faturamentoPresumidoFaixa: '180.001 A 360 MIL', veiculos: [{ marcaModelo: 'VW/DELIVERY 11.180', placa: 'AAA0A00' }],
      consultasJanelas: { ate30: 0, de31a60: null, de61a90: null, mais90: null }, funcionariosFaixa: '10 A 19',
    });
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

import { readFileSync } from 'node:fs';
import { mapeadorBoaVista as mapBV } from '../server/lib/credito/provedores/mapeadores';
describe('reprocessar relatório antigo a partir do bruto', () => {
  it('o mesmo bruto que o leitor antigo deixava vazio agora rende dados', () => {
    const bruto = JSON.parse(readFileSync('tests/fixtures/credito/apifull-boavista.json', 'utf8'));
    const c = mapBV(bruto);
    expect(c.score.valor).not.toBeNull();
    expect(c.cadastro.fundacao).not.toBeNull();
  });
});

// ── Serasa Premium completo (fixture SINTÉTICA com a estrutura descrita: dois scores, janelas de consulta, ação cível) ──
describe('mapeador Serasa Premium: scores, consultas por janela, ações e dados da empresa', () => {
  const m = mapeadorSerasaPremium(fx('apifull-serasa-completo'));
  it('traz OS DOIS scores, cada um com probabilidade, faixa e texto da fonte; nada é somado nem misturado', () => {
    expect(m.score).toMatchObject({ valor: 688, probabilidadeInadimplencia: 21.3, faixa: '601 A 700', rotulo: 'Score 1' });
    expect(m.score.outros).toHaveLength(1);
    expect(m.score.outros?.[0]).toMatchObject({ valor: 281, probabilidadeInadimplencia: 96.8, faixa: '201 A 300', rotulo: 'Score 2' });
    expect(m.score.outros?.[0].texto).toContain('96,80%');
  });
  it('o veredito usa o PIOR score (281 < 400) e diz qual', () => {
    const v = calcularVeredito({ ...m }, AGORA);
    expect(v.veredito).toBe('REPROVADO_A_PRAZO');
    expect(v.motivos[0]).toBe('Score 281 (Score 2) abaixo de 400');
  });
  it('rótulos pelo descritor da fonte quando vêm preenchidos e diferentes', () => {
    const j = fx('apifull-serasa-completo') as { dados: { CREDCADASTRAL: { SCORES: { OCORRENCIAS: Array<Record<string, string>> } } } };
    j.dados.CREDCADASTRAL.SCORES.OCORRENCIAS[0].TIPO_SCORE = 'PJ';
    j.dados.CREDCADASTRAL.SCORES.OCORRENCIAS[1].TIPO_SCORE = 'PJ PREMIUM';
    const x = mapeadorSerasaPremium(j);
    expect([x.score.rotulo, x.score.outros?.[0].rotulo]).toEqual(['PJ', 'PJ PREMIUM']);
  });
  it('contagens OFICIAIS de consultas por janela e últimas consultas por mês + segmento (sem consultante)', () => {
    expect(m.complementos?.consultasJanelas).toEqual({ ate30: 7, de31a60: 2, de61a90: 3, mais90: 11 });
    expect(m.complementos?.consultasPorSegmento).toEqual([
      { mes: '2026-10', quantidade: 4, segmento: 'COMERCIO ATACADISTA DE ALIMENTOS' },
      { mes: '2026-09', quantidade: 3, segmento: 'INTERMEDIACAO FINANCEIRA EM G' },
      { mes: '2026-08', quantidade: 1, segmento: 'TRANSPORTE RODOVIARIO DE CARGA' },
    ]);
  });
  it('várias consultas numa observação só (mês/ano sem dia, separadas por espaço ou ponto e vírgula)', () => {
    const j = fx('apifull-serasa-completo') as { dados: { CREDCADASTRAL: { INFORMACOES_ALERTAS_RESTRICOES: { OCORRENCIAS: Array<Record<string, string>> } } } };
    j.dados.CREDCADASTRAL.INFORMACOES_ALERTAS_RESTRICOES.OCORRENCIAS = [
      { TITULO: 'ULTIMAS CONSULTAS', OBSERVACOES: 'DATA:/10/2025/QUANTIDADE:2/SEGMENTO:ATIVIDADES DE CONSULTORIA EM G; DATA:/09/2025/QUANTIDADE:1/SEGMENTO:BANCOS' },
    ];
    expect(mapeadorSerasaPremium(j).complementos?.consultasPorSegmento).toEqual([
      { mes: '2025-10', quantidade: 2, segmento: 'ATIVIDADES DE CONSULTORIA EM G' },
      { mes: '2025-09', quantidade: 1, segmento: 'BANCOS' },
    ]);
  });
  it('ação cível com todos os campos úteis', () => {
    const g = m.anotacoes.acoesJudiciais;
    expect(g).toMatchObject({ consultado: true, quantidade: 1, valorTotal: 42350.9 });
    expect(g.itens[0]).toMatchObject({
      data: '2026-05-14', descricao: 'EXECUCAO DE TITULO EXTRAJUDICIAL', local: 'FORTALEZA/CE — 3A VARA CIVEL',
      processo: '0000000-00.2026.8.06.0001', valor: 42350.9,
    });
    expect(g.itens[0].extras).toMatchObject({ Requerido: 'DISTRIBUIDORA ALFA BETA EXEMPLO LTDA' });
  });
  it('capital, funcionários, CNAEs secundários, atuação, matriz/filial, representante e faturamento', () => {
    expect(m.cadastro.capitalSocial).toBe(850000);
    expect(m.complementos).toMatchObject({
      faturamentoPresumidoFaixa: 'ATE 180 MIL', funcionariosFaixa: '20 A 49', tempoAtuacao: '21 A 30 ANOS', matrizFilial: 'MATRIZ',
      representante: { nome: 'REPRESENTANTE FICTICIO DA SILVA', documento: '11144477735' },
    });
    expect(m.complementos?.cnaesSecundarios).toHaveLength(2);
    expect(m.socios.map((s) => s.documento)).toEqual(['11144477735', '***.222.333-**']);
  });
  it('não mapeia contatos', () => {
    expect(JSON.stringify(m)).not.toMatch(/8400000000|contato@exemplo/);
  });
});

describe('mapeador Boa Vista completo: matriz mensal de consultas', () => {
  const m = mapeadorBoaVista(fx('apifull-boavista-completo'));
  it('score único (sem rótulo), total de 12 meses e matriz Jan..Dez por ano', () => {
    expect(m.score).toEqual({ valor: 640, probabilidadeInadimplencia: 13, faixa: 'B', textoInterpretacao: 'Probabilidade moderada de inadimplencia' });
    expect(m.complementos?.consultas12Meses).toBe(17);
    expect(m.complementos?.consultasPorMes?.[0]).toEqual({ ano: 2026, meses: [1, 0, 2, 1, 1, 2, 1, 2, 2, 3, null, null] });
    expect(m.anotacoes.pendenciasFinanceiras).toMatchObject({ consultado: true, quantidade: 0 });
  });
});
