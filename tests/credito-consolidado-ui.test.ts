// Lógica PURA da tela do consolidado: matriz de comparação (tons e textos), preset "Consulta completa", relatório já pago refeito com
// o mapeador atual e comportamento comercial. A tela e o PDF usam os mesmos textos (shared/creditoMatriz.ts).
import { describe, expect, it } from 'vitest';
import { linhasDaMatriz } from '../shared/creditoMatriz';
import { consolidarRelatorios } from '../shared/credito';
import { mascararDocumentoSocio } from '../client/src/lib/credito/documento';
import { ehSelecaoCompleta, selecaoCompleta, selecaoInicial, textoPresetCompleto } from '../client/src/lib/credito/selecao';
import { comportamentoParaTela, relatorioAtualizado } from '../server/lib/credito/consolidadoTela';
import { CATALOGO_CREDITO } from '../shared/creditoCatalogo';
import { brutoSerasaCompleto, brutosCompletos, consolidadoCompleto, itensCompletos, relatorioSerasaCompleto } from './fixtures/credito/consolidado-completo';

describe('matriz de comparação (mesmos textos e cores na tela e no PDF)', () => {
  const l = Object.fromEntries(linhasDaMatriz(consolidadoCompleto()).map((x) => [x.rotulo, x]));

  it('protestos: vermelho nas duas fontes e leitura âmbar "Divergem (1 × 2)"', () => {
    expect(l['Protestos'].celulas.map((c) => [c.tom, c.principal, c.sub])).toEqual([
      ['vermelho', '1 ocorrência', 'Total R$ 1.200,00'], ['vermelho', '2 ocorrências', 'Total R$ 5.400,50'],
    ]);
    expect(l['Protestos'].leitura).toMatchObject({ tom: 'ambar', fundo: true, principal: 'Divergem', sub: '(1 × 2)' });
  });

  it('pendências: verde x vermelho; ações: cinza "Não consultado" x vermelho; falência: ninguém consulta', () => {
    expect(l['Pendências financeiras'].celulas.map((c) => [c.tom, c.principal])).toEqual([['verde', 'Nada consta'], ['vermelho', '2 ocorrências']]);
    expect(l['Ações judiciais'].celulas.map((c) => [c.tom, c.principal])).toEqual([['cinza', 'Não consultado'], ['vermelho', '1 ocorrência']]);
    expect(l['Ações judiciais'].leitura.principal).toBe('Só Serasa Premium cobre');
    expect(l['Falência / Recuperação judicial'].celulas.every((c) => c.tom === 'cinza')).toBe(true);
    expect(l['Cheques sem fundo'].leitura).toMatchObject({ tom: 'verde', principal: 'Nada consta', sub: 'em nenhuma fonte' });
  });

  it('consultas: 30 dias da fonte (origem explícita) e 12 meses; janelas diferentes não são comparadas', () => {
    const q = l['Consultas ao documento'];
    expect(q.celulas.map((c) => [c.principal, c.sub])).toEqual([
      ['out/2026 (mês corrente): 3', '12 meses: 17'], ['30 dias: 7', '12 meses: não informado'],
    ]);
    expect(q.leitura).toMatchObject({ principal: 'Janelas diferentes', sub: 'não comparável' });
  });

  it('com uma fonte só a leitura diz "Só uma fonte"', () => {
    const so = linhasDaMatriz(consolidadoCompleto([itensCompletos()[1]]));
    expect(so[0].celulas).toHaveLength(1);
    expect(so[0].leitura.principal).toBe('Só uma fonte');
  });
});

describe('preset "Consulta completa"', () => {
  it('marca as duas fontes, com texto e preço do catálogo (R$ 9,47)', () => {
    expect(selecaoCompleta()).toEqual(['boavista', 'serasa_premium']);
    expect(textoPresetCompleto()).toBe('Consulta completa (Consulta simples + Serasa Premium) — R$ 9,47');
    expect(ehSelecaoCompleta(['serasa_premium', 'boavista'])).toBe(true);
    expect(ehSelecaoCompleta(selecaoInicial())).toBe(false);
  });
  it('sem preço medido de uma das fontes o preset some (nunca cobra o que não tem preço)', () => {
    const sem = CATALOGO_CREDITO.map((i) => (i.chave === 'serasa_premium' ? { ...i, custoReais: null } : i));
    expect(selecaoCompleta(sem)).toBeNull();
    expect(textoPresetCompleto(sem)).toBeNull();
  });
});

describe('relatório já pago refeito com o mapeador atual (sem nova consulta)', () => {
  it('um Serasa gravado só com o 1º score passa a ter os dois, as janelas e a ação cível', () => {
    const antigo = relatorioSerasaCompleto();
    const { outros: _o, rotulo: _r, ...scoreAntigo } = antigo.score;
    const gravado = { ...antigo, score: scoreAntigo, complementos: { faturamentoPresumidoFaixa: 'ATE 180 MIL' } };
    expect(gravado.score).not.toHaveProperty('outros');
    const novo = relatorioAtualizado(gravado, 'serasa_premium', brutoSerasaCompleto());
    expect(novo.score.outros?.[0]).toMatchObject({ valor: 281, rotulo: 'Score 2' });
    expect(novo.complementos?.consultasJanelas?.ate30).toBe(7);
    expect(novo.anotacoes.acoesJudiciais.itens[0].processo).toBe('0000000-00.2026.8.06.0001');
    expect(novo.fonte).toEqual(gravado.fonte); // metadados da consulta preservados
  });
  it('sem a resposta crua vale o relatório gravado', () => {
    const g = relatorioSerasaCompleto();
    expect(relatorioAtualizado(g, 'serasa_premium', null)).toBe(g);
  });
  it('consolidar o relatório refeito dá os 3 cartões de score', () => {
    const itens = itensCompletos();
    expect(consolidarRelatorios(itens, new Date('2026-10-16T19:00:00Z')).scores).toHaveLength(3);
  });
});

describe('comportamento comercial na tela', () => {
  it('vem da resposta crua da Consulta simples: resumo, matriz de 12 meses e relacionamento', () => {
    const c = consolidadoCompleto();
    const bs = brutosCompletos().map((b) => ({ ...b, produtoNome: b.produto === 'boavista' ? 'Consulta simples' : 'Serasa Premium' }));
    const t = comportamentoParaTela(c.fundido, bs);
    expect(t?.fonte).toBe('Consulta simples');
    expect(t?.resumo.map(([k]) => k)).toEqual(expect.arrayContaining(['Última compra', 'Pagamentos em dia']));
    expect(t?.tabelas[0].colunas[0]).toBe('Indicador');
    expect(t?.tabelas[0].linhas.length).toBeGreaterThan(0);
    expect(t?.relacionamento).toContain('Acima de 5 anos');
  });
  it('sem resposta crua não inventa nada', () => {
    expect(comportamentoParaTela(consolidadoCompleto().fundido, [])).toBeNull();
  });
});

describe('CPF de sócio na tela', () => {
  it('mascara o completo e mantém o que a fonte já mascarou', () => {
    expect(mascararDocumentoSocio('11144477735')).toBe('***.444.777-**');
    expect(mascararDocumentoSocio('***.222.333-**')).toBe('***.222.333-**');
  });
});
