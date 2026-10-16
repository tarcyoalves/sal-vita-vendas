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
    const fichas = prot?.partes.filter((p) => p.t === 'ficha') ?? [];
    expect(fichas).toHaveLength(1); // muitas colunas -> uma ficha por registro, nenhum cortado
    for (const f of fichas) if (f.t === 'ficha') expect(f.registros).toHaveLength(29);
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
    expect(compacto(texto)).toContain(compacto('consulta concluída com sucesso')); // status no título do bloco
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

// ---------- legibilidade do anexo ----------
const MESES_API = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
const PERIODOS = ['OUT/2025', 'NOV/2025', 'DEZ/2025', 'JAN/2026', 'FEV/2026', 'MAR/2026', 'ABR/2026', 'MAI/2026', 'JUN/2026', 'JUL/2026', 'AGO/2026', 'SET/2026'];
const itens = (seed: number) => [...PERIODOS].reverse().map((p, i) => ({ PERIODO: p, PONTUACAO_MENSAL: i % 3 === 0 ? '-' : String(seed + i) }));
const OK = { CODIGO: '1', DESCRICAO: 'CONSULTA CONCLUIDA COM SUCESSO' };
const TEXTO_LONGO = 'Probabilidade baixa de inadimplencia no horizonte de doze meses, conforme modelo estatistico do provedor';

function brutoLegivel(): Record<string, unknown> {
  // chaves de meses fora de ordem, de propósito (como a API devolve)
  const embaralhado = (ano: string) => ({ ANO: ano, MAIO: '1', ABRIL: '2', JULHO: '4', JUNHO: '0', MARCO: '3', AGOSTO: '2', JANEIRO: '7', FEVEREIRO: '8', SETEMBRO: '1', OUTUBRO: '2', NOVEMBRO: '3', DEZEMBRO: '4' });
  return {
    dados: {
      CREDCADASTRAL: {
        SCORES: { STATUS_RETORNO: OK, OCORRENCIAS: [{ SCORE: '745', RISCO: TEXTO_LONGO, TEXTO: TEXTO_LONGO, TIPO_SCORE: '12 MESES' }] },
        PROTESTOS: {
          STATUS_RETORNO: OK,
          QUANTIDADE_OCORRENCIA: '1', VALOR_TOTAL: '5500,00',
          OCORRENCIAS: [{ DATA_PROTESTO: '01/01/2020', VALOR: '5500,00', CARTORIO: '2', CIDADE: 'CUIABA', UF: 'MT' }],
        },
        HIST_CONSULTAS: {
          STATUS_RETORNO: { CODIGO: '3', DESCRICAO: 'FALHA NA FONTE' },
          QUANTIDADES: [{ ...embaralhado('2025'), JANEIRO: '' }, embaralhado('2026')],
          DETALHES: [{ DATA: '01/10/2026', RAZAO_SOCIAL: 'FORNECEDOR X LTDA', CNPJ: '00000000000001' }],
        },
        PAGAMENTO_ATRASADO: {
          STATUS_RETORNO: OK,
          OCORRENCIAS: [
            { DESCRICAO: '6 a 15 dias', ITENS: itens(1) },
            { DESCRICAO: 'Mais de 60 dias', ITENS: itens(20) },
          ],
        },
        COMPROMISSOS: { STATUS_RETORNO: OK, PONTUACAO: '88', ITENS: itens(5) },
        CREDITO_OBTIDO: { STATUS_RETORNO: OK, PONTUACAO: '70', ITENS: itens(9) },
        PAGAMENTO_PONTUAL: { STATUS_RETORNO: OK, PONTUACAO: '100', ITENS: itens(2) },
        COMPROMETIMENTO_FUTURO: { STATUS_RETORNO: OK, PONTUACAO: '12', ITENS: itens(3) },
      },
    },
  };
}

describe('anexo legível', () => {
  const a = montarAnexo(brutoLegivel(), { pessoaFisica: false });
  const bloco = (t: string) => a?.blocos.find((b) => b.titulo === t);

  it('meses sempre Jan→Dez e ano mais recente primeiro', () => {
    const t = bloco('Histórico de consultas')?.partes.find((p) => p.t === 'tabela' && p.colunas[0] === 'Ano');
    expect(t?.t === 'tabela' && t.colunas).toEqual(['Ano', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']);
    expect(t?.t === 'tabela' && t.linhas.map((l) => l[0])).toEqual(['2026', '2025']);
    expect(t?.t === 'tabela' && t.linhas[0].slice(1)).toEqual(['7', '8', '3', '2', '1', '0', '4', '2', '1', '2', '3', '4']); // MARCO sem acento = Mar
    expect(t?.t === 'tabela' && t.linhas[1][1]).toBe('-');
    const c = consultasPorMes(brutoLegivel());
    expect(c?.linhas.map((l) => l[0])).toEqual(['2026', '2025']);
    expect(MESES_API).toHaveLength(12);
  });

  it('colunas idênticas fundidas; texto longo vira ficha', () => {
    const partes = bloco('Scores')?.partes ?? [];
    expect(partes.some((p) => p.t === 'tabela')).toBe(false);
    const f = partes.find((p) => p.t === 'ficha');
    expect(f?.t === 'ficha' && f.registros[0].map(([k]) => k)).toEqual(['Score', 'Risco', 'Tipo score']);
    expect(JSON.stringify(f).split(TEXTO_LONGO).length - 1).toBe(1);
  });

  it('mais de 6 colunas vira ficha', () => {
    const b = { dados: { CREDCADASTRAL: { X: { OCORRENCIAS: [{ A: '1', B: '2', C: '3', D: '4', E: '5', F: '6', G: '7' }] } } } };
    const p = (montarAnexo(b, { pessoaFisica: false })?.blocos[0].partes ?? []).filter((x) => x.t !== 'sub');
    expect(p.map((x) => x.t)).toEqual(['ficha']);
    const c6 = { dados: { CREDCADASTRAL: { X: { OCORRENCIAS: [{ A: '1', B: '2', C: '3', D: '4', E: '5', F: '6' }] } } } };
    expect(montarAnexo(c6, { pessoaFisica: false })?.blocos[0].partes.filter((x) => x.t !== 'sub').map((x) => x.t)).toEqual(['tabela']);
  });

  it('pagamento atrasado: matriz faixa × período cronológico', () => {
    const t = bloco('Pagamento atrasado')?.partes.find((x) => x.t === 'tabela');
    expect(t?.t).toBe('tabela');
    if (t?.t !== 'tabela') return;
    expect(t.colunas).toEqual(['Descrição', 'Out/25', 'Nov/25', 'Dez/25', 'Jan/26', 'Fev/26', 'Mar/26', 'Abr/26', 'Mai/26', 'Jun/26', 'Jul/26', 'Ago/26', 'Set/26']);
    expect(t.linhas.map((l) => l[0])).toEqual(['6 a 15 dias', 'Mais de 60 dias']);
    expect(t.linhas[0]).toHaveLength(13);
    expect(t.linhas[0].slice(1, 3)).toEqual(['12', '11']); // itens vinham invertidos: a série sai OUT→SET
    expect(t.linhas[0][12]).toBe('-'); // "-" mantido
  });

  it('indicadores de comportamento numa matriz só, com Pontuação', () => {
    const ind = a?.blocos.filter((b) => b.titulo.startsWith('Indicadores de comportamento')) ?? [];
    expect(ind).toHaveLength(1);
    expect(a?.blocos.map((b) => b.titulo)).not.toContain('Compromissos');
    const t = ind[0].partes[0];
    expect(t.t === 'tabela' && t.colunas.slice(0, 3)).toEqual(['Indicador', 'Pontuação', 'Out/25']);
    expect(t.t === 'tabela' && t.linhas.map((l) => [l[0], l[1]])).toEqual([
      ['Compromissos', '88'], ['Crédito obtido', '70'], ['Pagamento pontual', '100'], ['Comprometimento futuro', '12'],
    ]);
    expect(t.t === 'tabela' && t.colunas).toHaveLength(14);
  });

  it('status vai para o título; destaque só se código != 1', () => {
    expect(bloco('Protestos')?.status).toEqual({ texto: 'consulta concluída com sucesso', destaque: false });
    expect(bloco('Histórico de consultas')?.status).toEqual({ texto: 'status 3 — falha na fonte', destaque: true });
    for (const b of a?.blocos ?? []) expect(JSON.stringify(b.partes)).not.toMatch(/Status|CONSULTA CONCLUIDA/);
  });

  it('rótulos novos e R$', () => {
    const prot = JSON.stringify(bloco('Protestos')?.partes);
    expect(prot).toContain('Nº do cartório');
    expect(prot).toContain('Quantidade de ocorrências');
    expect(prot).toContain('R$ 5.500,00');
    expect(prot).not.toContain('5500,00"');
    expect(JSON.stringify(bloco('Histórico de consultas')?.partes)).toContain('CNPJ do consultante');
    const h = montarAnexo({ dados: { HEADER: { PARAMETROS: { CPFCNPJ: '11222333000181' } } } }, { pessoaFisica: false });
    expect(h?.parametros).toEqual([['CPF/CNPJ consultado', '11222333000181']]);
    // cartório com nome por extenso continua "Cartório"
    const n = montarAnexo({ dados: { CREDCADASTRAL: { P: { OCORRENCIAS: [{ CARTORIO: '1o TABELIONATO', UF: 'MT' }] } } } }, { pessoaFisica: false });
    expect(JSON.stringify(n?.blocos[0].partes)).toContain('Cartório');
  });

  it('PDF: sem bureau, com título de status e R$', async () => {
    process.env.CREDITO_PDF_SEM_COMPRESSAO = '1';
    try {
      const { texto } = await gerar(brutoLegivel());
      expect(texto).toContain('Indicadores de comportamento (12 meses)');
      expect(compacto(texto)).toContain(compacto('consulta concluída com sucesso'));
      expect(texto).toContain('R$ 5.500,00');
      expect(texto).not.toMatch(/serasa|boa\s*vista/i);
    } finally { delete process.env.CREDITO_PDF_SEM_COMPRESSAO; }
  });
});
