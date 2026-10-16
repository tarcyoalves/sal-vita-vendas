// Defeitos vistos no PDF individual de um Serasa Premium real (16/10/2026), reproduzidos com fixture SINTÉTICA:
// rótulo da fonte, "Alerta da fonte" repetido, faixa "NULO", frase "entre 501 é 600", "desde", CNAEs, endereço, consultas e anexo.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calcularVeredito, consolidarRelatorios, type RelatorioCredito } from '../shared/credito';
import { chaveDoProdutoGravado, nomeDoProduto, rotuloDataSituacao } from '../shared/creditoCatalogo';
import { cnaesCompactos, dividirCnaes, faixaExibivel, formatarCnae, frasePelaFonte, funcionariosTexto, segmentoLegivel } from '../shared/creditoRotulos';
import { mapeadorBoaVista, mapeadorSerasaPremium } from '../server/lib/credito/provedores/mapeadores';
import { gerarPdfCredito, gerarPdfCreditoConsolidado } from '../server/lib/credito/pdf';
import { montarAnexo } from '../server/lib/credito/pdfAnexo';
import { relatorioBoaVistaCompleto, brutoBoaVistaCompleto } from './fixtures/credito/consolidado-completo';
import { extrairTextoPdf } from './fixtures/credito/pdfTexto';

const bruto = (): unknown => JSON.parse(readFileSync('tests/fixtures/credito/apifull-serasa-alertas.json', 'utf8'));
const relatorio = (produto = 'Serasa Premium'): RelatorioCredito => ({
  documento: '12345678000195', tipo: 'CNPJ', consultadoEm: '2026-10-16T18:03:00.000Z',
  fonte: { provedor: 'boavista_apifull', produto, custoReais: 6.72 }, ...mapeadorSerasaPremium(bruto()),
});
beforeAll(() => { process.env.CREDITO_PDF_SEM_COMPRESSAO = '1'; });
afterAll(() => { delete process.env.CREDITO_PDF_SEM_COMPRESSAO; });
const compacto = (t: string) => t.replace(/\s+/g, ' ');

describe('1. rótulo da fonte: o NOME do catálogo é reconhecido', () => {
  it('chaveDoProdutoGravado/nomeDoProduto aceitam chave, nome (sem acento/caixa) e legado', () => {
    expect(chaveDoProdutoGravado('Serasa Premium', 'boavista_apifull')).toBe('serasa_premium');
    expect(chaveDoProdutoGravado('SERASA  premium', 'boavista_apifull')).toBe('serasa_premium');
    expect(chaveDoProdutoGravado('Consulta simples', 'boavista_apifull')).toBe('boavista');
    expect(chaveDoProdutoGravado('Define Risco Positivo', 'boavista_apifull')).toBe('define_risco');
    expect(chaveDoProdutoGravado('Boa Vista SCPC (API Full)', 'boavista_apifull')).toBe('boavista'); // legado
    expect(nomeDoProduto('Serasa Premium', 'boavista_apifull')).toBe('Serasa Premium');
    expect(nomeDoProduto('serasa_premium', 'boavista_apifull')).toBe('Serasa Premium');
    expect(rotuloDataSituacao('Serasa Premium', 'boavista_apifull')).toBe('informada em');
    expect(rotuloDataSituacao('Consulta simples', 'boavista_apifull')).toBe('em');
  });

  it('PDF individual: "Fonte: API Full/Serasa Premium" (pelo nome gravado e pela coluna produto)', async () => {
    const meta = { veredito: 'COM_RESTRICAO' as const, motivos: [], consultadoPor: 'Teste' };
    const a = extrairTextoPdf(await gerarPdfCredito(relatorio('Serasa Premium'), meta, bruto()));
    expect(a).toContain('Fonte: API Full/Serasa Premium');
    expect(a).not.toContain('Consulta simples');
    // a coluna do registro tem prioridade sobre o texto gravado no relatório
    const b = extrairTextoPdf(await gerarPdfCredito(relatorio('Boa Vista SCPC (API Full)'), { ...meta, produto: 'serasa_premium' }, bruto()));
    expect(b).toContain('Fonte: API Full/Serasa Premium');
  });
});

describe('4. faixa NULO e a frase da fonte', () => {
  it('faixa "NULO"/"NULL"/"NAO CALCULADO" não é faixa', () => {
    for (const f of ['NULO', 'null', ' Nulo ', 'NAO CALCULADO', '-', '']) expect(faixaExibivel(f)).toBeNull();
    expect(faixaExibivel('601 A 700')).toBe('601 A 700');
    expect(mapeadorSerasaPremium(bruto()).score.faixa).toBeNull();
  });
  it('faixa válida é aproveitada mesmo quando outra chave vier "NULO"', () => {
    const j = bruto() as { dados: { CREDCADASTRAL: { SCORES: { OCORRENCIAS: Array<Record<string, string>> } } } };
    j.dados.CREDCADASTRAL.SCORES.OCORRENCIAS[0].FAIXA_SCORE = '501 A 600';
    expect(mapeadorSerasaPremium(j).score.faixa).toBe('501 A 600');
  });
  it('"entre 501 E 600" continua "e"; "E DE"/"E PROVAVEL" viram "é"', () => {
    expect(frasePelaFonte('A CHANCE DE UMA EMPRESA, COM SCORE ENTRE 501 E 600, PAGAR SEUS COMPROMISSOS FINANCEIROS EM 06 MESES E DE 59,25%'))
      .toBe('A chance de uma empresa, com score entre 501 e 600, pagar seus compromissos financeiros em 06 meses é de 59,25%');
    expect(frasePelaFonte('DE CADA 100 EMPRESAS, E PROVAVEL QUE 13APRESENTEM DEBITOS NOS PROXIMOS 12 MESES.'))
      .toBe('De cada 100 empresas, é provável que 13 apresentem débitos nos próximos 12 meses.');
  });
});

describe('5. dados da empresa: textos e CNAEs', () => {
  it('funcionários sem repetir a palavra; segmento humanizado', () => {
    expect(funcionariosTexto('20 A 99 COLABORADORES')).toBe('20 a 99 colaboradores');
    expect(funcionariosTexto('20 A 49')).toBe('20 a 49 funcionários');
    expect(segmentoLegivel('ATIVIDADES DE CONSULTORIA EM G')).toBe('Atividades de Consultoria em...');
    expect(segmentoLegivel('BANCOS MULTIPLOS')).toBe('Bancos Multiplos');
  });
  it('CNAEs separados por "/" (sem quebrar "4637-1/99"); principal não se repete; até 6 e +N', () => {
    expect(dividirCnaes('4639701-A B /4711302-C /5229099-D')).toEqual(['4639701-A B', '4711302-C', '5229099-D']);
    expect(dividirCnaes('4637-1/99 - X')).toEqual(['4637-1/99 - X']);
    expect(formatarCnae('4639701-COMERCIO')).toBe('4639701 — COMERCIO');
    expect(formatarCnae('4637-1/99 - COMERCIO')).toBe('4637-1/99 — COMERCIO');
    const oito = Array.from({ length: 8 }, (_, i) => `46397${String(i).padStart(2, '0')}-ATIVIDADE ${i}`);
    const r = cnaesCompactos(oito, '4639700 - ATIVIDADE 0');
    expect(r.itens).toHaveLength(6);
    expect(r.restantes).toBe(1);
  });
  it('mapeador: endereço do bloco SOMENTE_ENDERECO, CNAEs, matriz, atuação e representante vindos dos alertas', () => {
    const m = mapeadorSerasaPremium(bruto());
    expect(m.cadastro).toMatchObject({ endereco: 'RUA DOS TESTES, 321 SALA 4, CENTRO, 59600-000', municipio: 'CIDADE EXEMPLO', uf: 'RN' });
    expect(m.complementos?.cnaesSecundarios).toHaveLength(4);
    expect(m.complementos).toMatchObject({
      matrizFilial: 'MATRIZ', tempoAtuacao: '11 A 20 ANOS', funcionariosFaixa: '20 A 99 COLABORADORES',
      representante: { nome: 'REPRESENTANTE SINTETICO', documento: '11144477735' },
      consultasJanelas: { ate30: 0, de31a60: 0, de61a90: 0, mais90: 12 },
    });
    expect(m.complementos?.consultasPorSegmento).toHaveLength(3);
  });
});

describe('2/6. anexo: nada de ruído; alerta só de verdade', () => {
  it('alertas: só o alerta real, uma linha, sem nível; sem o lixo de informação', () => {
    const a = montarAnexo(bruto(), { pessoaFisica: false });
    expect(a?.alertas).toEqual(['Socio com restricao — socio sintetico consta em cadastro de inadimplentes']);
    expect(a?.blocos).toEqual([]); // endereço/flags não viram "Outras informações"
  });
  it('sem alerta de verdade: nenhum alerta e "Alertas" entra em "sem ocorrências"', () => {
    const j = bruto() as { dados: { CREDCADASTRAL: { INFORMACOES_ALERTAS_RESTRICOES: { OCORRENCIAS: unknown[] } } } };
    j.dados.CREDCADASTRAL.INFORMACOES_ALERTAS_RESTRICOES.OCORRENCIAS.pop();
    const a = montarAnexo(j, { pessoaFisica: false });
    expect(a?.alertas).toEqual([]);
    expect(a?.semOcorrencias).toContain('Alertas');
  });
  it('alerta repetido idêntico aparece uma vez', () => {
    const al = { TITULO: 'PENDENCIA EM ANALISE', OBSERVACOES: 'DETALHE SINTETICO', TIPO: 'alerta' };
    const a = montarAnexo({ dados: { CREDCADASTRAL: { INFORMACOES_ALERTAS_RESTRICOES: { OCORRENCIAS: [al, al, al] } } } }, { pessoaFisica: false });
    expect(a?.alertas).toEqual(['Pendencia em analise — detalhe sintetico']);
  });
  it('bloco de endereço e flags internas em bloco desconhecido não são impressos', () => {
    const a = montarAnexo({ dados: { CREDCADASTRAL: {
      SOMENTE_ENDERECO: { DADOS: [{ ENDERECO: 'RUA X', REGISTRO_LOCALIZADO: 'S' }] },
      OUTRO_BLOCO: { REGISTRO_LOCALIZADO: 'S', COD_IDENTIFICACAO_ENDERECO: '1', TIPO_PESSOA: 'J' },
    } } }, { pessoaFisica: false });
    expect(a?.blocos).toEqual([]);
  });
});

describe('PDF individual do Serasa Premium (visão completa)', () => {
  it('sem lixo; com CNAEs, endereço, consultas por janela e por mês/segmento', async () => {
    const r = relatorio();
    const { veredito, motivos } = calcularVeredito(r);
    const texto = extrairTextoPdf(await gerarPdfCredito(r, { veredito, motivos, consultadoPor: 'Teste', produto: 'serasa_premium' }, bruto()));
    const c = compacto(texto);
    for (const proibido of ['Alerta da fonte: Ultimas consultas', 'informacao', 'Faixa: NULO', 'NULO', 'desde', 'Registro localizado', 'Cod identificação',
      'Outras informações da fonte', 'Endereços', 'Tipo pessoa', 'Matriz/filial — matriz', 'Aeronaves', 'Imoveis', 'COLABORADORES funcionários', 'entre 501 é 600']) {
      expect(c, proibido).not.toContain(proibido);
    }
    expect(c).toContain('Fonte: API Full/Serasa Premium');
    expect((c.match(/Alerta da fonte/g) ?? [])).toHaveLength(1);
    expect(c).toContain('Alerta da fonte: Socio com restricao');
    expect(c).toContain('entre 501 e 600');
    expect(c).toContain('meses é de 59,25%');
    // dados da empresa
    expect(c).toContain('ATIVA (informada em 08/08/2026)');
    expect(c).toContain('20 a 99 colaboradores');
    for (const cnae of ['4639701', '4711302', '5229099', '4930201']) expect(c).toContain(cnae);
    expect(c).toContain('RUA DOS TESTES, 321 SALA 4, CENTRO, 59600-000');
    expect(c).toContain('CIDADE EXEMPLO/RN');
    // consultas
    expect(c).toContain('Consultas por janela');
    expect(c).toMatch(/até 30 dias: 0 \| 31 a 60 dias: 0 \| 61 a 90 dias: 0 \| mais de 90 dias: 12/);
    expect(c).toContain('Consultas por mês e segmento');
    expect(c).toContain('09/2026');
    expect(c).toContain('Atividades de Consultoria em...');
    expect(c).toContain('CONSULTANTE SINTETICO A LTDA'); // vem de PASSAGENS_COMERCIAIS, uma vez só
    expect(c.match(/CONSULTANTE SINTETICO A LTDA/g)).toHaveLength(1);
  });

  it('Boa Vista: data da situação nunca é "desde"', async () => {
    const r = relatorioBoaVistaCompleto();
    const { veredito, motivos } = calcularVeredito(r);
    const texto = extrairTextoPdf(await gerarPdfCredito(r, { veredito, motivos, consultadoPor: 'Teste' }, brutoBoaVistaCompleto()));
    expect(texto).not.toContain('desde');
  });

  it('consolidado (Consulta simples + Serasa): rótulos, sem faixa NULO, sem "desde", endereço, janela e segmento', async () => {
    const sera = relatorio();
    const c = consolidarRelatorios([
      { relatorio: relatorioBoaVistaCompleto(), produto: 'boavista', produtoNome: 'Consulta simples', consultadoEm: '2026-10-16T18:02:00.000Z' },
      { relatorio: sera, produto: 'serasa_premium', produtoNome: 'Serasa Premium', consultadoEm: sera.consultadoEm },
    ], new Date('2026-10-16T19:00:00.000Z'));
    const texto = compacto(extrairTextoPdf(await gerarPdfCreditoConsolidado(c, { consultadoPor: 'Teste' }, [{ produto: 'serasa_premium', bruto: bruto() }])));
    expect(texto).toContain('Serasa Premium');
    expect(texto).not.toMatch(/Faixa: NULO|desde|informacao|Registro localizado/);
    expect(texto).toContain('Consultas por janela');
    expect(texto).toContain('Consultas por mês e segmento');
    expect(texto).toContain('Atividades de Consultoria em...');
  });
});

describe('mapeador Boa Vista continua igual', () => {
  it('endereço do bloco ENDERECO da empresa', () => {
    const m = mapeadorBoaVista(brutoBoaVistaCompleto());
    expect(m.cadastro.endereco).toContain('AVENIDA DAS PALMEIRAS');
  });
});
