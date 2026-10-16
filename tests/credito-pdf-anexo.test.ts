import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calcularVeredito } from '../shared/credito';
import type { RelatorioCredito } from '../shared/credito';
import { humanizarChave, mascararTelefone, rotuloBloco, valorSeguro } from '../shared/creditoRotulos';
import { mapeadorBoaVista } from '../server/lib/credito/provedores/mapeadores';
import { gerarPdfCredito } from '../server/lib/credito/pdf';
import { comportamentoDe, consultasPorMes, empresaExtrasDe, montarAnexo } from '../server/lib/credito/pdfAnexo';
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
    expect(g.itens[0].extras).toMatchObject({ 'Número título': 'TIT-1000', 'Devedor CPF': '***.468.126-**' });
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


const OK = { CODIGO: '1', DESCRICAO: 'CONSULTA CONCLUIDA COM SUCESSO' };
const cred = (blocos: Record<string, unknown>) => ({ dados: { CREDCADASTRAL: blocos } });
const titulos = (a: ReturnType<typeof montarAnexo>) => a?.blocos.map((b) => b.titulo) ?? [];

describe('montarAnexo: só o que o corpo do PDF não mostrou', () => {
  it('fixture volumoso: tudo já está no corpo, então não sobra bloco; zerados viram nomes; nada de ruído', () => {
    const a = montarAnexo(fx('apifull-boavista-volumoso'), { pessoaFisica: false });
    expect(a).not.toBeNull();
    expect(a?.blocos).toEqual([]);
    expect(a?.avisos).toEqual([]);
    expect(a?.semOcorrencias).toEqual(['Cheques sem fundos (BACEN)', 'Cheques sem fundos (Varejo)']);
    expect(JSON.stringify(a)).not.toMatch(/DADOS_RETORNADOS|BLOCO_001|ZZZ-123|imagem-protesto|33334444|contato@|exemplo\.invalid/);
  });

  it('bloco desconhecido e campo não mapeado da empresa aparecem; telefones, e-mails, vazios e zerados não', () => {
    const a = montarAnexo(cred({
      INFORMACOES_DA_EMPRESA: { RAZAO_SOCIAL: 'X LTDA', CNPJ: '11222333000181', SUBSEGMENTO: 'ATACADO PESADO', TELEFONE: '6533334444' },
      BLOCO_NOVO: { CAMPO_X: 'valor x' },
      CONTUMACIA: { QUANTIDADE_OCORRENCIA: '0' },
      OUTRO_ZERADO: { QUANTIDADE_OCORRENCIA: '0', VALOR_TOTAL: '0,00' },
      VAZIO: { A: '', B: [] },
      TELEFONE_FIXO: { OCORRENCIAS: [{ TELEFONE: '33334444' }] },
      EMAILS: { OCORRENCIAS: [{ EMAIL: 'a@b.invalid' }] },
      HEADER: { PARAMETROS: { CPFCNPJ: '11222333000181' } },
    }), { pessoaFisica: false });
    expect(titulos(a)).toEqual(['Informações da empresa (outros campos)', 'Bloco novo']);
    expect(a?.semOcorrencias).toEqual(['Contumácia', 'Outro zerado']);
    const json = JSON.stringify(a);
    expect(json).toContain('ATACADO PESADO');
    expect(json).not.toMatch(/X LTDA|11222333000181|33334444|a@b\.invalid|Vazio/);
  });

  it('contumácia com conteúdo não é escondida', () => {
    const a = montarAnexo(cred({ CONTUMACIA: { QUANTIDADE_OCORRENCIA: '2', DESCRICAO: 'DEVEDOR CONTUMAZ' } }), { pessoaFisica: false });
    expect(titulos(a)).toEqual(['Contumácia']);
    expect(a?.semOcorrencias).toEqual([]);
  });

  it('só avisa do status quando o código não é 1 (blocos já cobertos também)', () => {
    const a = montarAnexo(cred({
      PROTESTOS: { STATUS_RETORNO: { CODIGO: '3', DESCRICAO: 'FALHA NA FONTE' }, QUANTIDADE_OCORRENCIA: '0' },
      SCORES: { STATUS_RETORNO: OK, OCORRENCIAS: [{ SCORE: '700' }] },
    }), { pessoaFisica: false });
    expect(a?.avisos).toEqual(['Protestos: status 3 — falha na fonte']);
  });

  it('alertas da fonte: "quantidade total: 0" é zerado; com valor vira alerta', () => {
    const zero = montarAnexo(cred({ INFORMACOES_ALERTAS_RESTRICOES: { OCORRENCIAS: [{ TITULO: 'CONSULTAS 30 DIAS', OBSERVACOES: 'QUANTIDADE TOTAL: 0' }] } }), { pessoaFisica: false });
    expect(zero?.alertas).toEqual([]);
    expect(zero?.semOcorrencias).toEqual(['Alertas']);
    const com = montarAnexo(cred({ INFORMACOES_ALERTAS_RESTRICOES: { OCORRENCIAS: [{ TITULO: 'CONSULTAS 30 DIAS', OBSERVACOES: 'QUANTIDADE TOTAL: 7' }] } }), { pessoaFisica: false });
    expect(com?.alertas).toEqual(['Consultas 30 dias — quantidade total: 7']);
    expect(com?.semOcorrencias).toEqual([]);
  });

  it('o mesmo nome com ocorrência em outro bloco não vira "sem ocorrências"', () => {
    const a = montarAnexo(cred({
      PROTESTOS: { QUANTIDADE_OCORRENCIA: '2', OCORRENCIAS: [{ VALOR: '10,00' }] },
      PROTESTO_SINTETICO: { QUANTIDADE_OCORRENCIA: '0' },
    }), { pessoaFisica: false });
    expect(a?.semOcorrencias).toEqual([]);
  });

  it('define risco: score, faturamento e consultas já estão no corpo; sócios sem mapeador aparecem', () => {
    const a = montarAnexo(fx('apifull-define-risco'), { pessoaFisica: false });
    expect(titulos(a)).toEqual(['Sócios']);
  });

  it('serasa premium: nada sobra além do que o corpo já mostra; contatos fora', () => {
    const a = montarAnexo(fx('apifull-serasa-premium'), { pessoaFisica: false });
    expect(a?.blocos).toEqual([]);
    expect(a?.semOcorrencias).toEqual(['Restrições financeiras', 'Protestos', 'Cheques sem fundos (BACEN)', 'Alertas']);
    expect(JSON.stringify(a)).not.toMatch(/6500000000/);
  });

  it('dado estranho nunca lança', () => {
    for (const x of [null, 'texto', 42, [], {}, { dados: 'x' }, { dados: { A: null, B: [[1, [2]], { x: { y: { z: [null] } } }], C: { D: 5 } } }, { dados: { CREDCADASTRAL: { PROTESTOS: 'x' } } }]) {
      expect(() => montarAnexo(x, { pessoaFisica: true })).not.toThrow();
      expect(() => comportamentoDe(x)).not.toThrow();
      expect(() => empresaExtrasDe(x)).not.toThrow();
    }
  });

  it('matriz mensal de consultas', () => {
    const q = consultasPorMes(fx('apifull-boavista-volumoso'));
    expect(q?.colunas).toHaveLength(13);
    expect(q?.linhas[0].slice(0, 4)).toEqual(['2026', '1', '0', '3']);
  });
});

// ---------- legibilidade da matriz genérica (blocos que o corpo do PDF não conhece) ----------
const PERIODOS = ['OUT/2025', 'NOV/2025', 'DEZ/2025', 'JAN/2026', 'FEV/2026', 'MAR/2026', 'ABR/2026', 'MAI/2026', 'JUN/2026', 'JUL/2026', 'AGO/2026', 'SET/2026'];
const itens = (seed: number) => [...PERIODOS].reverse().map((p, i) => ({ PERIODO: p, PONTUACAO_MENSAL: i % 3 === 0 ? '-' : String(seed + i) }));
const TEXTO_LONGO = 'Probabilidade baixa de inadimplencia no horizonte de doze meses, conforme modelo estatistico do provedor';
const embaralhado = (ano: string) => ({ ANO: ano, MAIO: '1', ABRIL: '2', JULHO: '4', JUNHO: '0', MARCO: '3', AGOSTO: '2', JANEIRO: '7', FEVEREIRO: '8', SETEMBRO: '1', OUTUBRO: '2', NOVEMBRO: '3', DEZEMBRO: '4' });

describe('anexo legível (blocos desconhecidos)', () => {
  const a = montarAnexo(cred({
    ANALISE_X: { STATUS_RETORNO: OK, OCORRENCIAS: [{ SCORE: '745', RISCO: TEXTO_LONGO, TEXTO: TEXTO_LONGO, TIPO_SCORE: '12 MESES' }] },
    OCORR_Y: { QUANTIDADE_OCORRENCIA: '1', VALOR_TOTAL: '5500,00', OCORRENCIAS: [{ DATA_PROTESTO: '01/01/2020', VALOR: '5500,00', CARTORIO: '2', CIDADE: 'CUIABA', UF: 'MT' }] },
    SERIE_Z: { QUANTIDADES: [{ ...embaralhado('2025'), JANEIRO: '' }, embaralhado('2026')] },
    ATRASO_W: { OCORRENCIAS: [{ DESCRICAO: '6 a 15 dias', ITENS: itens(1) }, { DESCRICAO: 'Mais de 60 dias', ITENS: itens(20) }] },
    IND_A: { PONTUACAO: '88', ITENS: itens(5) },
    IND_B: { PONTUACAO: '70', ITENS: itens(9) },
  }), { pessoaFisica: false });
  const bloco = (t: string) => a?.blocos.find((b) => b.titulo === t);

  it('meses sempre Jan→Dez e ano mais recente primeiro', () => {
    const t = bloco('Serie z')?.partes.find((p) => p.t === 'tabela' && p.colunas[0] === 'Ano');
    expect(t?.t === 'tabela' && t.colunas).toEqual(['Ano', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']);
    expect(t?.t === 'tabela' && t.linhas.map((l) => l[0])).toEqual(['2026', '2025']);
    expect(t?.t === 'tabela' && t.linhas[0].slice(1)).toEqual(['7', '8', '3', '2', '1', '0', '4', '2', '1', '2', '3', '4']); // MARCO sem acento = Mar
    expect(t?.t === 'tabela' && t.linhas[1][1]).toBe('-');
  });

  it('colunas idênticas fundidas; texto longo vira ficha', () => {
    const partes = bloco('Análise x')?.partes ?? [];
    expect(partes.some((p) => p.t === 'tabela')).toBe(false);
    const f = partes.find((p) => p.t === 'ficha');
    expect(f?.t === 'ficha' && f.registros[0].map(([k]) => k)).toEqual(['Score', 'Risco', 'Tipo score']);
    expect(JSON.stringify(f).split(TEXTO_LONGO).length - 1).toBe(1);
  });

  it('mais de 6 colunas vira ficha', () => {
    const b = cred({ X: { OCORRENCIAS: [{ A: '1', B: '2', C: '3', D: '4', E: '5', F: '6', G: '7' }] } });
    const p = (montarAnexo(b, { pessoaFisica: false })?.blocos[0].partes ?? []).filter((x) => x.t !== 'sub');
    expect(p.map((x) => x.t)).toEqual(['ficha']);
    const c6 = cred({ X: { OCORRENCIAS: [{ A: '1', B: '2', C: '3', D: '4', E: '5', F: '6' }] } });
    expect(montarAnexo(c6, { pessoaFisica: false })?.blocos[0].partes.filter((x) => x.t !== 'sub').map((x) => x.t)).toEqual(['tabela']);
  });

  it('faixas de atraso: matriz faixa × período cronológico', () => {
    const t = bloco('Atraso w')?.partes.find((x) => x.t === 'tabela');
    expect(t?.t).toBe('tabela');
    if (t?.t !== 'tabela') return;
    expect(t.colunas).toEqual(['Descrição', 'Out/25', 'Nov/25', 'Dez/25', 'Jan/26', 'Fev/26', 'Mar/26', 'Abr/26', 'Mai/26', 'Jun/26', 'Jul/26', 'Ago/26', 'Set/26']);
    expect(t.linhas.map((l) => l[0])).toEqual(['6 a 15 dias', 'Mais de 60 dias']);
    expect(t.linhas[0].slice(1, 3)).toEqual(['12', '11']); // itens vinham invertidos: a série sai OUT→SET
    expect(t.linhas[0][12]).toBe('-'); // "-" mantido
  });

  it('indicadores desconhecidos numa matriz só, com Pontuação', () => {
    const ind = a?.blocos.filter((b) => b.titulo.startsWith('Indicadores de comportamento')) ?? [];
    expect(ind).toHaveLength(1);
    const t = ind[0].partes[0];
    expect(t.t === 'tabela' && t.colunas.slice(0, 3)).toEqual(['Indicador', 'Pontuação', 'Out/25']);
    expect(t.t === 'tabela' && t.linhas.map((l) => [l[0], l[1]])).toEqual([['Ind a', '88'], ['Ind b', '70']]);
  });

  it('rótulos novos e R$', () => {
    const prot = JSON.stringify(bloco('Ocorr y')?.partes);
    expect(prot).toContain('Nº do cartório');
    expect(prot).toContain('Quantidade de ocorrências');
    expect(prot).toContain('R$ 5.500,00');
    expect(prot).not.toContain('5500,00"');
    const n = montarAnexo(cred({ P: { OCORRENCIAS: [{ CARTORIO: '1o TABELIONATO', UF: 'MT' }] } }), { pessoaFisica: false });
    expect(JSON.stringify(n?.blocos[0].partes)).toContain('Cartório'); // cartório com nome por extenso continua "Cartório"
  });
});

// ---------- comportamento comercial: uma matriz só ----------
function brutoComportamento(): Record<string, unknown> {
  return cred({
    EVENTOS_PESSOA_JURIDICA: { OCORRENCIAS: [{ INDICADOR: 'MAIOR FATURA', PERIODO: 'MAR/2026', VALOR: '1500,00' }, { INDICADOR: 'ULTIMA COMPRA', PERIODO: 'SET/2026', PONTUACAO: '' }, { INDICADOR: 'SEM DADO', PERIODO: '', PONTUACAO: '' }] },
    PAGAMENTO_PONTUAL: { STATUS_RETORNO: OK, PONTUACAO: '100', ITENS: itens(2) },
    PAGAMENTO_ATRASADO: { STATUS_RETORNO: OK, OCORRENCIAS: [{ DESCRICAO: '6 a 15 dias', ITENS: itens(1) }, { DESCRICAO: 'Mais de 60 dias', ITENS: itens(20) }, { DESCRICAO: '16 a 30 dias', ITENS: PERIODOS.map((p) => ({ PERIODO: p, PONTUACAO_MENSAL: '-' })) }] },
    COMPROMISSOS: { STATUS_RETORNO: OK, PONTUACAO: '88', ITENS: itens(5) },
    CREDITO_OBTIDO: { STATUS_RETORNO: OK, PONTUACAO: '70', ITENS: PERIODOS.map((p) => ({ PERIODO: p, PONTUACAO_MENSAL: '-' })) },
    COMPROMETIMENTO_FUTURO: { STATUS_RETORNO: OK, PONTUACAO: '12', ITENS: itens(3) },
    PERIODO_RELACIONAMENTO_FORNECEDORES: { OCORRENCIAS: [{ PERIODO: 'ATE 1 ANO', VALOR: '0,00' }, { PERIODO: 'ACIMA DE 5 ANOS', VALOR: '12000,00' }] },
  });
}

describe('comportamentoDe', () => {
  const c = comportamentoDe(brutoComportamento());
  it('eventos formatados; evento sem dado fica de fora', () => {
    expect(c?.eventos).toEqual([['Maior fatura', 'Mar/2026 — R$ 1.500,00'], ['Última compra', 'Set/2026']]);
  });
  it('UMA matriz de 12 meses sem linhas vazias, mais o comprometimento futuro à parte', () => {
    const t = c?.matriz.find((x) => x.t === 'tabela');
    expect(t?.t === 'tabela' && t.colunas).toEqual(['Indicador', 'Out/25', 'Nov/25', 'Dez/25', 'Jan/26', 'Fev/26', 'Mar/26', 'Abr/26', 'Mai/26', 'Jun/26', 'Jul/26', 'Ago/26', 'Set/26']);
    expect(t?.t === 'tabela' && t.linhas.map((l) => l[0])).toEqual(['Pagamento pontual', 'Atraso 6 a 15 dias', 'Atraso mais de 60 dias']); // Compromissos/Crédito obtido saíram: pontuações opacas do bureau
    expect(c?.matriz.filter((x) => x.t === 'tabela')).toHaveLength(2); // histórico + futuro
    expect(c?.matriz.some((x) => x.t === 'sub' && x.texto === 'Comprometimento futuro')).toBe(true);
    expect(JSON.stringify(c?.matriz)).not.toMatch(/Cr[ée]dito obtido|16 a 30/); // linhas só com "-" são omitidas
  });
  it('relacionamento com fornecedores: só as faixas com valor; tudo zero = null', () => {
    expect(c?.relacionamento).toBe('Acima de 5 anos: R$ 12.000,00');
    const zero = comportamentoDe(cred({ PERIODO_RELACIONAMENTO_FORNECEDORES: { OCORRENCIAS: [{ PERIODO: 'ATE 1 ANO', VALOR: '0,00' }, { PERIODO: 'ACIMA DE 5 ANOS', VALOR: '0' }] } }));
    expect(zero).toBeNull();
  });
  it('empresa: faixa de funcionários, porte e filiais vêm do bruto', () => {
    const e = empresaExtrasDe(cred({ INFORMACOES_DA_EMPRESA: { FAIXA_FUNCIONARIOS: '10 A 19', PORTE: 'EPP', NUMERO_FILIAIS: '3' } }));
    expect(e).toEqual({ funcionarios: '10 A 19', porte: 'EPP', filiais: '3' });
  });
});

// ---------- PDF: zero redundância ----------
describe('PDF sem redundância', () => {
  beforeAll(() => { process.env.CREDITO_PDF_SEM_COMPRESSAO = '1'; });
  afterAll(() => { delete process.env.CREDITO_PDF_SEM_COMPRESSAO; });

  it('fixture volumoso: razão social, CNPJ e cada protesto/consulta UMA vez; sem ruído, sem anexo', async () => {
    const { pdf, texto } = await gerar(fx('apifull-boavista-volumoso'));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const c = compacto(texto);
    expect(contar(c, /COMERCIALEXEMPLOFICTICIALTDA/g)).toBe(1);
    expect(contar(texto, /11\.222\.333\/0001-81/g)).toBe(1);
    expect(contar(c, /EXEMPLOATACADO/g)).toBe(1);
    expect(contar(texto, /Relatório de Análise de Crédito — Sal Vita/g)).toBe(1);
    for (let i = 1; i <= 29; i++) expect(contar(c, new RegExp(`CREDORFICTICIO${String(i).padStart(2, '0')}LTDA`, 'g'))).toBe(1);
    for (let i = 1; i <= 19; i++) expect(contar(c, new RegExp(`FORNECEDORFICTICIO${String(i).padStart(2, '0')}LTDA`, 'g'))).toBe(1);
    expect(c).toContain(compacto('1o TABELIONATO DE PROTESTOS — CUIABA/MT'));
    expect(c).toContain(compacto('Total em 12 meses: 19'));
    expect(texto).toContain('Consultas por mês');
    // nada do anexo antigo
    for (const t of ['DADOS_RETORNADOS', 'BLOCO_001', 'ZZZ-123', 'Parâmetros da consulta', 'Blocos entregues', 'Outras informações da fonte', 'Anexo', 'Moeda',
      'Telefone', 'E-mail', 'exemplo.invalid', '33334444', 'imagem-protesto', 'PDF original']) expect(texto).not.toContain(t);
    expect(compacto(texto)).not.toContain(compacto('concluída com sucesso'));
    expect(texto).not.toMatch(/serasa|boa\s*vista/i);
    expect(texto).toContain('Fonte: API Full/Consulta simples');
    // zerados e não informados: uma linha
    expect(c).toContain(compacto('Sem ocorrências em: Cheques sem fundos (BACEN), Cheques sem fundos (Varejo).'));
    expect(c).toContain(compacto('Não informado pela fonte: Ações judiciais, Falência / Recuperação judicial.'));
    // CPF mascarado
    expect(texto).toContain('***.468.126-**');
    expect(texto).not.toContain('111.468.126-12');
    expect(texto).not.toContain('11146812612');
    expect(texto).toMatch(/Página 1 de \d+/);
    expect(paginas(pdf)).toBeLessThanOrEqual(4); // eram 17 com o anexo repetido
  });

  it('seções na ordem do dono', async () => {
    const { texto } = await gerar(fx('apifull-boavista-volumoso'));
    const ordem = ['VEREDITO DE CRÉDITO', 'PONTOS DE ATENÇÃO', 'ANOTAÇÕES NEGATIVAS', 'DADOS DA EMPRESA', 'SÓCIOS E ADMINISTRADORES', 'CONSULTAS AO DOCUMENTO', 'COMPORTAMENTO COMERCIAL'];
    const pos = ordem.map((t) => texto.indexOf(t));
    expect(pos.every((x) => x >= 0)).toBe(true);
    expect([...pos].sort((x, y) => x - y)).toEqual(pos);
  });

  it('empresa: natureza traduzida, idade na fundação e nada de "—" nem telefone', async () => {
    const b = fx('apifull-serasa-premium');
    (b.dados as { CREDCADASTRAL: { INFORMACOES_DA_EMPRESA: Record<string, string> } }).CREDCADASTRAL.INFORMACOES_DA_EMPRESA.NATUREZA_JURIDICA = '2062-';
    const m = mapeadorBoaVista(b);
    expect(m.cadastro.naturezaJuridica).toBe('2062-');
    const r: RelatorioCredito = { ...exemploLimpo, ...m, fonte: { provedor: 'boavista_apifull', produto: 'boavista', custoReais: null }, comportamento: undefined };
    const { veredito, motivos } = calcularVeredito(r);
    const texto = extrairTexto(await gerarPdfCredito(r, { veredito, motivos, consultadoPor: 'Teste' }, b));
    expect(texto).toContain('Sociedade Empresária Limitada');
    expect(texto).toContain('03/11/2005 (20 anos)');
    expect(texto).toContain('10 A 19 funcionários');
    expect(texto).not.toContain('2062-');
    expect(texto).not.toMatch(/Telefone|6500000000/);
    expect(texto).not.toContain('—\n');
  });

  it('comportamento: UMA matriz, UMA linha-resumo, relacionamento numa linha, sem "Indicadores de comportamento"', async () => {
    const { texto, pdf } = await gerar(brutoComportamento());
    expect(contar(texto, /COMPORTAMENTO COMERCIAL/g)).toBe(1);
    expect(contar(texto, /Últimos 12 meses/g)).toBe(1);
    expect(contar(texto, /^Pagamento pontual$/gm)).toBe(1);
    expect(contar(texto, /^Compromissos$/gm)).toBe(0); // índice opaco do bureau: fora do PDF
    expect(texto).toContain('Maior fatura: Mar/2026 — R$ 1.500,00');
    expect(texto).toContain('Tempo de relacionamento com fornecedores — Acima de 5 anos: R$ 12.000,00');
    expect(texto).not.toContain('Indicadores de comportamento');
    expect(texto).not.toContain('Outras informações da fonte'); // tudo foi coberto: sem anexo
    expect(paginas(pdf)).toBeLessThanOrEqual(2);
  });

  it('só imprime anexo quando sobra algo; status diferente de 1 vira aviso no corpo', async () => {
    const b = cred({
      PROTESTOS: { STATUS_RETORNO: { CODIGO: '3', DESCRICAO: 'FALHA NA FONTE' }, QUANTIDADE_OCORRENCIA: '0' },
      BLOCO_NOVO: { CAMPO_QUE_NAO_CONHECEMOS: 'abc 123', OUTRO: 'def' },
    });
    const { texto } = await gerar(b);
    expect(texto).toContain('Outras informações da fonte');
    expect(texto).toContain('Bloco novo');
    expect(texto).toContain('abc 123');
    expect(compacto(texto)).toContain(compacto('Protestos: status 3 — falha na fonte'));
    const sem = await gerar(cred({ PROTESTOS: { QUANTIDADE_OCORRENCIA: '0' } }));
    expect(sem.texto).not.toContain('Outras informações da fonte');
  });

  it('sem bruto: sem anexo e todas as ocorrências do corpo', async () => {
    const r = relatorioDe(fx('apifull-boavista-volumoso'));
    const { veredito, motivos } = calcularVeredito(r);
    const pdf = await gerarPdfCredito(r, { veredito, motivos, consultadoPor: 'Teste' });
    const texto = extrairTexto(pdf);
    expect(texto).not.toContain('Outras informações da fonte');
    expect(compacto(texto)).toContain('CREDORFICTICIO29LTDA'); // todas as ocorrências, sem corte
  });

  it('aviso "A fonte listou N de M" quando a lista vem menor que a quantidade', async () => {
    const b = fx('apifull-boavista-volumoso');
    const c = (b.dados as { CREDCADASTRAL: { PROTESTOS: { QUANTIDADE_OCORRENCIA: string } } }).CREDCADASTRAL;
    c.PROTESTOS.QUANTIDADE_OCORRENCIA = '40';
    const { texto } = await gerar(b);
    expect(texto).toContain('A fonte listou 29 de 40 ocorrências.');
  });

  it('limite de páginas: anexo gigante é cortado com aviso e o PDF termina em 80 páginas', async () => {
    const linhas = Array.from({ length: 6000 }, (_, i) => ({ CODIGO_X: `C-${i}`, DETALHE_Y: `valor ${i}` }));
    const { pdf, texto } = await gerar(cred({ BLOCO_GIGANTE: { OCORRENCIAS: linhas } }));
    expect(texto).toMatch(/Anexo truncado: \d+ registros omitidos/);
    expect(paginas(pdf)).toBe(80);
  }, 120_000);
});
