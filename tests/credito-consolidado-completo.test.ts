// Relatório consolidado COMPLETO: Consulta simples (Boa Vista) + Serasa Premium do MESMO CNPJ fictício, passando pelo caminho real
// (JSON da API Full -> mapeadores -> consolidarRelatorios -> PDF). Fixtures sintéticas: tests/fixtures/credito/*-completo.json.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analisarSinais, textoCelulaMatriz } from '../shared/credito';
import { CONSULTA_COMPLETA, custoConsultaCompleta, fontesFaltantes } from '../shared/creditoCatalogo';
import { gerarPdfCreditoConsolidado, mascararDocumento } from '../server/lib/credito/pdf';
import {
  AGORA_COMPLETO, brutosCompletos, consolidadoCompleto, itensCompletos, relatorioBoaVistaCompleto, relatorioSerasaCompleto,
} from './fixtures/credito/consolidado-completo';
import { extrairTextoPdf, paginasDoPdf } from './fixtures/credito/pdfTexto';

const c = consolidadoCompleto();

describe('consolidado completo: scores lado a lado e divergência visível', () => {
  it('um cartão por score de cada fonte, na ordem (Consulta simples, Serasa Score 1, Serasa Score 2); nenhum é somado ou promediado', () => {
    expect(c.scores.map((s) => [s.produtoNome, s.rotulo, s.valor])).toEqual([
      ['Consulta simples', null, 640], ['Serasa Premium', 'Score 1', 688], ['Serasa Premium', 'Score 2', 281],
    ]);
    expect(c.scores[1]).toMatchObject({ probabilidadeInadimplencia: 21.3, faixa: '601 A 700', calculado: true });
    expect(c.scores[2]).toMatchObject({ probabilidadeInadimplencia: 96.8, faixa: '201 A 300', calculado: true });
    // nenhum valor derivado (média de 640/688/281 = 536; média das fontes = 588)
    expect(c.scores.some((s) => s.valor === 536 || s.valor === 588)).toBe(false);
  });

  it('scores muito distantes (também dentro da MESMA fonte) viram aviso com o nome de cada score', () => {
    expect(c.divergenciaScore).toContain('Consulta simples: 640');
    expect(c.divergenciaScore).toContain('Serasa Premium (Score 1): 688');
    expect(c.divergenciaScore).toContain('Serasa Premium (Score 2): 281');
    expect(c.scoreAltoComRestricao).toBe(true);
  });

  it('veredito conservador: o pior score vale, e o motivo diz de qual fonte/score', () => {
    expect(c.veredito).toBe('REPROVADO_A_PRAZO');
    expect(c.motivos).toContain('Score 281 (Serasa Premium, Score 2) abaixo de 400');
  });

  it('matriz de comparação: protestos e pendências DIVERGEM; ações só no Serasa; falência ninguém consulta', () => {
    const l = Object.fromEntries(c.matriz.map((x) => [x.chave, x]));
    expect(l.protestos).toMatchObject({ leitura: 'divergem', textoLeitura: 'Divergem (1 × 2)' });
    expect(l.pendenciasFinanceiras).toMatchObject({ leitura: 'divergem', textoLeitura: 'Divergem (0 × 2)' });
    expect(l.chequesSemFundo).toMatchObject({ leitura: 'nada_consta' });
    expect(l.acoesJudiciais).toMatchObject({ leitura: 'so_uma', textoLeitura: 'Só Serasa Premium cobre' });
    expect(l.falenciaRecuperacao).toMatchObject({ leitura: 'nao_consultado' });
    expect(l.acoesJudiciais.celulas.map(textoCelulaMatriz)).toEqual(['não consultado', '1 ocorrência · R$ 42.350,90']);
    expect(l.pendenciasFinanceiras.celulas.map(textoCelulaMatriz)).toEqual(['nada consta', '2 ocorrências · R$ 7.300,00']);
    expect(c.matriz.map((x) => x.celulas.map((y) => y.produtoNome))[0]).toEqual(['Consulta simples', 'Serasa Premium']);
  });

  it('dados que só uma fonte traz entram no fundido: janelas e segmentos (Serasa), matriz mensal (Boa Vista), CNAEs, representante', () => {
    const comp = c.fundido.complementos;
    expect(comp?.consultasJanelas).toEqual({ ate30: 7, de31a60: 2, de61a90: 3, mais90: 11 });
    expect(comp?.consultasPorSegmento).toHaveLength(3);
    expect(comp?.consultasPorMes?.[0].ano).toBe(2026);
    expect(comp?.consultas12Meses).toBe(17);
    expect(comp?.cnaesSecundarios).toHaveLength(2);
    expect(c.fundido.cadastro.capitalSocial).toBe(850000);
    expect(c.consultasPorFonte.map((f) => [f.produtoNome, f.c30?.origem, f.c30?.n, f.total12])).toEqual([
      ['Consulta simples', 'mes', 3, 17], ['Serasa Premium', 'janela', 7, null],
    ]);
  });
});

describe('sinal "muitas consultas": primeiro a contagem OFICIAL da fonte', () => {
  const sinalConsultas = (r: Parameters<typeof analisarSinais>[0]) => analisarSinais(r, AGORA_COMPLETO).find((s) => s.codigo === 'MUITAS_CONSULTAS' || s.codigo === 'CONSULTAS_ACIMA');

  it('Serasa: 7 em 30 dias (janela oficial) dispara ALERTA mesmo com poucas consultas listadas', () => {
    const r = relatorioSerasaCompleto();
    r.consultasRecentes = [{ data: '2026-10-10', consultante: 'X', quantidade: 1 }, { data: '2026-10-11', consultante: 'Y', quantidade: 1 }];
    const s = sinalConsultas(r);
    expect(s?.nivel).toBe('ALERTA');
    expect(s?.detalhe).toContain('7 em 30 dias');
    expect(s?.detalhe).not.toContain('lista parcial');
  });

  it('Boa Vista: a linha do MÊS CORRENTE da matriz (3) vale mais que a lista parcial (4 nos últimos 30 dias)', () => {
    const r = relatorioBoaVistaCompleto();
    expect(r.consultasRecentes.length).toBe(5);
    const s = sinalConsultas(r);
    expect(s?.codigo).toBe('CONSULTAS_ACIMA');
    expect(s?.detalhe).toContain('3 em out/2026 (mês corrente)');
  });

  it('a contagem oficial ZERO vence a lista (a fonte disse que não houve consulta)', () => {
    const r = relatorioSerasaCompleto();
    r.complementos = { ...r.complementos, consultasJanelas: { ate30: 0, de31a60: 0, de61a90: 0, mais90: 5 } };
    r.consultasRecentes = Array.from({ length: 6 }, (_, i) => ({ data: `2026-10-0${i + 1}`, consultante: `C${i}`, quantidade: 1 }));
    expect(sinalConsultas(r)).toBeUndefined();
  });

  it('último recurso: sem contagem oficial usa a lista e avisa que é parcial', () => {
    const r = relatorioBoaVistaCompleto();
    r.complementos = { consultas12Meses: 17 }; // sem matriz mensal
    r.consultasRecentes = Array.from({ length: 5 }, (_, i) => ({ data: `2026-10-0${i + 1}`, consultante: `C${i}`, quantidade: 1 }));
    const s = sinalConsultas(r);
    expect(s?.nivel).toBe('ALERTA');
    expect(s?.detalhe.toLowerCase()).toContain('lista parcial');
    expect(s?.detalhe).toContain('pode haver mais');
  });

  it('no consolidado cita a origem de cada fonte e usa o maior número oficial', () => {
    const s = c.sinais.find((x) => x.codigo === 'MUITAS_CONSULTAS');
    expect(s?.nivel).toBe('ALERTA');
    expect(s?.detalhe).toContain('Serasa Premium: 7 em 30 dias');
    expect(s?.detalhe).toContain('Consulta simples: 3 em out/2026');
  });
});

describe('PDF consolidado completo (estrutura de decisão)', () => {
  beforeAll(() => { process.env.CREDITO_PDF_SEM_COMPRESSAO = '1'; });
  afterAll(() => { delete process.env.CREDITO_PDF_SEM_COMPRESSAO; });

  const gerar = async (cons = c, brutos = brutosCompletos()) => {
    const pdf = await gerarPdfCreditoConsolidado(cons, { consultadoPor: 'Usuário de Teste' }, brutos);
    return { pdf, texto: extrairTextoPdf(pdf), plano: extrairTextoPdf(pdf).replace(/\s+/g, ' ') };
  };

  it('as duas fontes, os três scores, a matriz com "Divergem" e a ordem das seções', async () => {
    const { pdf, texto, plano } = await gerar();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(plano).toContain('Fontes: Consulta simples (16/10 15:02) · Serasa Premium (16/10 15:03)');
    for (const v of ['640', '688', '281']) expect(texto).toContain(v);
    expect(plano).toContain('Score 1');
    expect(plano).toContain('Score 2');
    expect(plano).toContain('Inadimplência: 21,3%');
    expect(plano).toContain('Inadimplência: 96,8%');
    expect(plano).toContain('Faixa: 601 A 700');
    expect(plano).toContain('Faixa: 201 A 300');
    expect(plano).toContain('não são somados nem combinados');
    expect(plano).toContain('Divergem (1 × 2)');
    expect(plano).toContain('Divergem (0 × 2)');
    expect(plano).toContain('Só Serasa Premium cobre');
    // ordem: topo > veredito > scores > comparação > pontos > detalhamento > empresa > sócios > consultas > comportamento > final
    const ordem = ['VEREDITO DE CRÉDITO', 'SCORES INFORMADOS PELAS FONTES', 'COMPARAÇÃO ENTRE AS FONTES', 'PONTOS DE ATENÇÃO (REGRAS DA SAL VITA)',
      'DETALHAMENTO DAS OCORRÊNCIAS', 'DADOS DA EMPRESA', 'SÓCIOS E ADMINISTRADORES', 'CONSULTAS AO DOCUMENTO', 'COMPORTAMENTO COMERCIAL (CONSULTA SIMPLES)', 'Consultado por'];
    const posicoes = ordem.map((t) => plano.indexOf(t));
    expect(posicoes.every((x) => x >= 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });

  it('3 a 4 páginas, rodapé só com "Página X de Y" e sem cabeçalho por página', async () => {
    const { pdf, plano } = await gerar();
    const n = paginasDoPdf(pdf);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(n).toBeLessThanOrEqual(4);
    expect(plano).toContain(`Página 1 de ${n}`);
    expect(plano).not.toContain('Confidencial — uso interno'); // a confidencialidade sai uma vez, no texto final
    expect(plano.match(/Documento confidencial de uso interno/g)).toHaveLength(1);
    expect(plano.match(/Relatório de Análise de Crédito — Sal Vita/g)).toHaveLength(1);
  });

  it('razão social e CNPJ UMA vez; nada de DADOS_RETORNADOS, telefone ou e-mail; CPF sempre mascarado', async () => {
    const { texto, plano } = await gerar();
    expect(plano.match(/DISTRIBUIDORA ALFA BETA EXEMPLO LTDA/g)).toHaveLength(1);
    expect(plano.match(/12\.345\.678\/0001-95/g)).toHaveLength(1);
    expect(texto).not.toContain('DADOS_RETORNADOS');
    expect(texto).not.toMatch(/8400000000|contato@exemplo|financeiro@exemplo|exemplo\.invalid/);
    expect(plano).toContain('***.444.777-**'); // CPF completo da fonte, mascarado
    expect(plano).toContain('***.222.333-**'); // a fonte já mascarou: impresso como veio
    expect(plano).not.toMatch(/11144477735|111\.444\.777-35/);
    expect(plano).toContain('REPRESENTANTE FICTICIO DA SILVA — ***.444.777-**');
  });

  it('dados novos do Serasa aparecem uma vez: ação cível, janelas, segmentos, CNAEs, capital, faturamento, atuação, matriz', async () => {
    const { plano } = await gerar();
    expect(plano).toContain('EXECUCAO DE TITULO EXTRAJUDICIAL');
    expect(plano).toContain('FORTALEZA/CE — 3A VARA CIVEL');
    expect(plano).toContain('0000000-00.2026.8.06.0001');
    expect(plano).toContain('14/05/2026');
    expect(plano).toContain('R$ 42.350,90');
    expect(plano).toContain('Contagem oficial por janela (Serasa Premium)');
    expect(plano).toMatch(/Até 30 dias.*31 a 60 dias.*61 a 90 dias.*Mais de 90 dias/);
    expect(plano).toContain('COMERCIO ATACADISTA DE ALIMENTOS');
    expect(plano).toContain('CNAEs secundários');
    expect(plano).toContain('R$ 850.000,00');
    expect(plano).toContain('ATE 180 MIL');
    expect(plano).toContain('21 A 30 ANOS');
    expect(plano).toContain('MATRIZ');
    expect(plano).toContain('20 A 49 funcionários');
    expect(plano).toContain('Consultas por mês'); // matriz Jan-Dez da Consulta simples
  });

  it('o Boa Vista não cobre ações: a matriz diz "não consultado" e o PDF não inventa nada', async () => {
    const { plano } = await gerar();
    expect(plano).toContain('Não consultado');
    expect(plano).toContain('Nenhuma fonte consulta'); // falência/recuperação
  });

  it('só uma fonte: avisa que faltam os dados da outra e mostra os dois scores do Serasa', async () => {
    const so = consolidadoCompleto([itensCompletos()[1]]);
    const { plano } = await gerar(so, [brutosCompletos()[1]]);
    expect(plano).toContain('Só uma fonte consultada: faltam os dados da outra (Consulta simples)');
    expect(plano).toContain('Score 1');
    expect(plano).toContain('Score 2');
    expect(plano).not.toContain('COMPORTAMENTO COMERCIAL');
  });
});

describe('máscara de documento e consulta completa', () => {
  it('CPF mascarado; já mascarado pela fonte passa como veio; CNPJ de sócio PJ formatado', () => {
    expect(mascararDocumento('11144477735')).toBe('***.444.777-**');
    expect(mascararDocumento('***.222.333-**')).toBe('***.222.333-**');
    expect(mascararDocumento('12345678000195')).toBe('12.345.678/0001-95');
    expect(mascararDocumento(null)).toBe('—');
  });

  it('preset "Consulta completa": as duas fontes, R$ 9,47; faltantes calculados por chave', () => {
    expect([...CONSULTA_COMPLETA]).toEqual(['boavista', 'serasa_premium']);
    expect(custoConsultaCompleta()).toBe(9.47);
    expect(fontesFaltantes(['boavista'])).toEqual(['serasa_premium']);
    expect(fontesFaltantes(['serasa_premium'])).toEqual(['boavista']);
    expect(fontesFaltantes(['boavista', 'serasa_premium'])).toEqual([]);
  });
});
