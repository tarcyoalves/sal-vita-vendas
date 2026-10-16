import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calcularVeredito } from '../shared/credito';
import type { RelatorioCredito } from '../shared/credito';
import { humanizarChave, mascararTelefone, rotuloBloco, valorSeguro } from '../shared/creditoRotulos';
import { mapeadorBoaVista } from '../server/lib/credito/provedores/mapeadores';
import { gerarPdfCredito } from '../server/lib/credito/pdf';
import { consultasPorMes, montarAnexo } from '../server/lib/credito/pdfAnexo';
import { exemploLimpo } from './fixtures/credito/exemplo-limpo';

/** Texto do PDF gerado SEM compressão (mesmo extrator de credito-pdf.test.ts). */
function extrairTexto(pdf: Buffer): string {
  const bruto = pdf.toString('latin1');
  const linhas: string[] = [];
  const re = /\[([^\]]*)\]\s*TJ|<([0-9a-fA-F]+)>\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bruto))) {
    const trecho = m[1] ?? `<${m[2]}>`;
    let linha = '';
    for (const h of trecho.matchAll(/<([0-9a-fA-F]+)>/g)) {
      for (let i = 0; i < h[1].length; i += 2) {
        const c = parseInt(h[1].slice(i, i + 2), 16);
        linha += c === 0x97 ? '—' : c === 0x95 ? '•' : String.fromCharCode(c);
      }
    }
    linhas.push(linha);
  }
  return linhas.join('\n');
}

const fx = (n: string): Record<string, unknown> => JSON.parse(readFileSync(`tests/fixtures/credito/${n}.json`, 'utf8')) as Record<string, unknown>;
const paginas = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;

function relatorioDe(bruto: unknown): RelatorioCredito {
  const m = mapeadorBoaVista(bruto);
  return { ...exemploLimpo, ...m, socios: exemploLimpo.socios, fonte: { provedor: 'boavista_apifull', produto: 'boavista', custoReais: 2.75 } };
}
async function gerar(bruto: unknown) {
  const r = relatorioDe(bruto);
  const { veredito, motivos } = calcularVeredito(r);
  const pdf = await gerarPdfCredito(r, { veredito, motivos, consultadoPor: 'Teste' }, bruto);
  return { pdf, texto: extrairTexto(pdf), r };
}
const compacto = (t: string) => t.replace(/\s+/g, '');
const contar = (texto: string, re: RegExp) => (texto.match(re) ?? []).length;

describe('mapeador: extras e local dos itens', () => {
  const m = mapeadorBoaVista(fx('apifull-boavista-volumoso'));
  it('29 protestos com cartório/cidade/UF, espécie e extras', () => {
    const g = m.anotacoes.protestos;
    expect(g.quantidade).toBe(29);
    expect(g.itens).toHaveLength(29);
    expect(g.itens[0]).toMatchObject({
      descricao: 'Protesto — DUPLICATA MERCANTIL', local: '1o TABELIONATO DE PROTESTOS — CUIABA/MT', credor: 'CREDOR FICTICIO 01 LTDA',
    });
    expect(g.itens[0].extras).toMatchObject({ 'Número título': 'TIT-1000', 'Devedor cpf': '***.468.126-**' });
    expect(Object.keys(g.itens[0].extras ?? {}).join('|')).not.toMatch(/imagem/i); // URL de imagem não entra
    expect(g.itens[1].descricao).toBe('Protesto — CHEQUE');
  });
  it('pendência da fixture antiga continua igual', () => {
    const a = mapeadorBoaVista(fx('apifull-boavista'));
    expect(a.anotacoes.pendenciasFinanceiras.itens[0]).toMatchObject({ descricao: 'Contrato CDA 2021/0042', local: 'DIVIDA ATIVA' });
    expect(a.anotacoes.pendenciasFinanceiras.itens[0].extras).toEqual({ 'Data inclusão': '20/04/2021', Modalidade: 'TRIBUTO' });
  });
});

describe('rótulos e máscaras', () => {
  it('humaniza e mascara', () => {
    expect(rotuloBloco('PEND_FINANCEIRAS')).toBe('Pendências financeiras');
    expect(rotuloBloco('CH_SEM_FUNDOS_VAREJO')).toBe('Cheques sem fundos (Varejo)');
    expect(rotuloBloco('scor:score_pj')).toBe('Score pj');
    expect(rotuloBloco('BLOCO_NOVO_XYZ')).toBe('Bloco novo xyz');
    expect(humanizarChave('DATA_INCLUSAO')).toBe('Data inclusão');
    expect(mascararTelefone('(65) 99988-7766')).toBe('*******7766');
    expect(valorSeguro('CPF_CNPJ', '11146812612')).toBe('***.468.126-**');
    expect(valorSeguro('CPF_CNPJ', '00000000000191')).toBe('00000000000191');
    expect(valorSeguro('X', 'ver 111.468.126-12 aqui')).toBe('ver ***.468.126-** aqui');
    expect(valorSeguro('LINK', 'https://x.invalid/a.png')).toBeNull();
    expect(valorSeguro('TELEFONE', '65999887766', true)).toBe('*******7766');
    expect(valorSeguro('TELEFONE', '65999887766', false)).toBe('65999887766');
  });
});

describe('montarAnexo', () => {
  it('ignora ruído, resume blocos entregues, mantém todas as linhas', () => {
    const a = montarAnexo(fx('apifull-boavista-volumoso'), { pessoaFisica: false });
    expect(a).not.toBeNull();
    expect(a?.entregues).toEqual(['Protestos', 'Scores']);
    expect(a?.parametros).toEqual([['Documento', '11222333000181'], ['Tipo consulta', 'COMPLETA']]);
    expect(JSON.stringify(a)).not.toMatch(/DADOS_RETORNADOS|BLOCO_001|ZZZ-123|imagem-protesto/);
    const prot = a?.blocos.find((b) => b.titulo === 'Protestos');
    const tabelas = prot?.partes.filter((p) => p.t === 'tabela') ?? [];
    expect(tabelas.length).toBeGreaterThan(1); // muitas colunas -> fatias
    for (const t of tabelas) {
      if (t.t === 'tabela') { expect(t.linhas).toHaveLength(29); expect(t.colunas.length).toBeLessThanOrEqual(7); }
    }
    expect(a?.linkOriginal).toBe('https://exemplo.invalid/relatorio-volumoso.pdf');
  });
  it('dado estranho nunca lança', () => {
    for (const x of [null, 'texto', 42, [], {}, { dados: 'x' }, { dados: { A: null, B: [[1, [2]], { x: { y: { z: [null] } } }], C: { D: 5 } } }, { dados: { CREDCADASTRAL: { PROTESTOS: 'x' } } }]) {
      expect(() => montarAnexo(x, { pessoaFisica: true })).not.toThrow();
    }
  });
  it('matriz mensal', () => {
    const q = consultasPorMes(fx('apifull-boavista-volumoso'));
    expect(q?.colunas).toHaveLength(13);
    expect(q?.linhas[0].slice(0, 4)).toEqual(['2026', '1', '0', '3']);
  });
});

describe('PDF com anexo', () => {
  beforeAll(() => { process.env.CREDITO_PDF_SEM_COMPRESSAO = '1'; });
  afterAll(() => { delete process.env.CREDITO_PDF_SEM_COMPRESSAO; });

  it('29 protestos, 19 consultas, anexo humanizado, máscaras e link', async () => {
    const { pdf, texto } = await gerar(fx('apifull-boavista-volumoso'));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    // corpo principal + anexo: cada protesto/consulta aparece nas duas partes
    for (let i = 1; i <= 29; i++) expect(contar(compacto(texto), new RegExp(`CREDORFICTICIO${String(i).padStart(2, '0')}LTDA`, 'g'))).toBeGreaterThanOrEqual(2);
    for (let i = 1; i <= 19; i++) expect(contar(compacto(texto), new RegExp(`FORNECEDORFICTICIO${String(i).padStart(2, '0')}LTDA`, 'g'))).toBeGreaterThanOrEqual(2);
    expect(compacto(texto)).toContain(compacto('1o TABELIONATO DE PROTESTOS — CUIABA/MT'));
    expect(compacto(texto)).toContain(compacto('Protesto — DUPLICATA MERCANTIL'));
    expect(texto).toContain('Consultas por mês');
    // anexo
    expect(texto).toContain('Anexo — Dados completos da resposta do provedor');
    for (const t of ['Protestos', 'Histórico de consultas', 'Scores', 'Quadro societário', 'Telefones fixos', 'E-mails', 'Parâmetros da consulta']) expect(texto).toContain(t);
    expect(texto).toContain('Blocos entregues pela fonte: Protestos, Scores');
    expect(texto).toContain('Status: CONSULTA CONCLUIDA COM SUCESSO'.replace('Status: ', '')); // linha Campo|Valor
    expect(texto).not.toMatch(/serasa|boa\s*vista/i);
    expect(texto).toContain('Fonte dos dados: API Full/Consulta simples');
    expect(texto).not.toContain('DADOS_RETORNADOS');
    expect(texto).not.toContain('BLOCO_001');
    expect(texto).not.toContain('ZZZ-123');
    // CPF
    expect(texto).toContain('***.468.126-**');
    expect(texto).not.toContain('111.468.126-12');
    expect(texto).not.toContain('11146812612');
    // contatos: PF mascarado, PJ completo
    expect(texto).not.toContain('999887766');
    expect(texto).toContain('*****7766');
    expect(texto).toContain('33334444');
    expect(texto).not.toContain('joao.silva@');
    expect(texto).toContain('jo***@exemplo.invalid');
    expect(texto).toContain('contato@exemplo.invalid');
    // URLs
    expect(texto).not.toContain('imagem-protesto');
    expect(texto).toContain('PDF original do provedor: https://exemplo.invalid/relatorio-volumoso.pdf');
    expect(texto).toMatch(/Página 1 de \d+/);
  });

  it('sem bruto: igual a antes, sem anexo', async () => {
    const r = relatorioDe(fx('apifull-boavista-volumoso'));
    const { veredito, motivos } = calcularVeredito(r);
    const pdf = await gerarPdfCredito(r, { veredito, motivos, consultadoPor: 'Teste' });
    const texto = extrairTexto(pdf);
    expect(texto).not.toContain('Anexo — Dados completos');
    expect(compacto(texto)).toContain('CREDORFICTICIO29LTDA'); // todas as ocorrências, sem corte
  });

  it('aviso "A fonte listou N de M" quando a lista vem menor que a quantidade', async () => {
    const b = fx('apifull-boavista-volumoso');
    const cred = (b.dados as { CREDCADASTRAL: { PROTESTOS: { QUANTIDADE_OCORRENCIA: string } } }).CREDCADASTRAL;
    cred.PROTESTOS.QUANTIDADE_OCORRENCIA = '40';
    const { texto } = await gerar(b);
    expect(texto).toContain('A fonte listou 29 de 40 ocorrências.');
  });

  it('limite de páginas: corta o anexo com aviso e termina', async () => {
    const b = fx('apifull-boavista-volumoso');
    const cred = (b.dados as { CREDCADASTRAL: { PROTESTOS: { OCORRENCIAS: Array<Record<string, string>> } } }).CREDCADASTRAL;
    const base = cred.PROTESTOS.OCORRENCIAS;
    cred.PROTESTOS.OCORRENCIAS = Array.from({ length: 3000 }, (_, i) => ({ ...base[i % 29], NUMERO_TITULO: `T-${i}` }));
    const { pdf, texto } = await gerar(b);
    expect(texto).toMatch(/Anexo truncado: \d+ registros omitidos/);
    // o corpo principal (3000 itens) não é cortado; o anexo para no teto
    expect(paginas(pdf)).toBeGreaterThan(80);
  }, 120_000);
});
