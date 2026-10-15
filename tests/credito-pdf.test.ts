import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularVeredito, ROTULO_VEREDITO } from '../shared/credito';
import type { RelatorioCredito } from '../shared/credito';
import { formatarDocumento, gerarPdfCredito, limparTexto, mascararDocumento } from '../server/lib/credito/pdf';
import { exemploLimpo } from './fixtures/credito/exemplo-limpo';
import { exemploRestricao } from './fixtures/credito/exemplo-restricao';

/** Extrai o texto de um PDF GERADO SEM COMPRESSÃO (strings hex em Tj/TJ; Helvetica/WinAnsi == latin1 para o nosso uso). */
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
        linha += c === 0x97 ? '—' : c === 0x95 ? '•' : String.fromCharCode(c); // WinAnsi: travessão e marcador
      }
    }
    linhas.push(linha);
  }
  return linhas.join('\n');
}

const consultadoPor = 'Usuário de Teste';
async function gerar(r: RelatorioCredito) {
  const { veredito, motivos } = calcularVeredito(r);
  const pdf = await gerarPdfCredito(r, { veredito, motivos, consultadoPor });
  return { pdf, texto: extrairTexto(pdf), veredito, motivos };
}

describe('gerarPdfCredito', () => {
  beforeAll(() => { process.env.CREDITO_PDF_SEM_COMPRESSAO = '1'; });
  afterAll(() => { delete process.env.CREDITO_PDF_SEM_COMPRESSAO; });

  it('relatório limpo: PDF válido, veredito, score, "Nada consta" e CPF mascarado', async () => {
    const { pdf, texto, veredito } = await gerar(exemploLimpo);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(3_000);
    expect(pdf.length).toBeLessThan(500_000);
    expect(veredito).toBe('APROVADO');
    expect(texto).toContain(ROTULO_VEREDITO.APROVADO);
    expect(texto).toContain('620');
    expect(texto).toContain('Comercial Exemplo Ltda');
    expect(texto).toContain('11.222.333/0001-81');
    expect(texto).toContain('Fonte dos dados: Provedor Fictício/Relatório Empresarial (exemplo)');
    expect(texto).toContain('Nada consta');
    expect(texto).not.toMatch(/\bConsta\b/);
    // acentos preservados (Helvetica/WinAnsi)
    expect(texto).toContain('Relatório de Análise de Crédito — Sal Vita');
    expect(texto).toContain('Situação');
    expect(texto).toContain('***.468.126-**'); // 111.468.126-12
    expect(texto).toContain('***.357.914-**');
    expect(texto).not.toContain('11146812612');
    expect(texto).not.toContain('111.468.126-12');
    expect(texto).toContain('Consultado por Usuário de Teste');
    expect(texto).toMatch(/Página 1 de \d+/);
    expect(texto).toContain('Confidencial — uso interno da Sal Vita para decisão de crédito');
    expect(texto).toContain('15/10/2026 11:32'); // 14:32Z em America/Sao_Paulo
    expect(texto).toContain('R$ 250.000,00');
  });

  it('relatório com restrição: Consta, valores, itens e "Não informado pela fonte"', async () => {
    const { pdf, texto, veredito } = await gerar(exemploRestricao);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(veredito).toBe('REPROVADO_A_PRAZO');
    expect(texto).toContain(ROTULO_VEREDITO.REPROVADO_A_PRAZO);
    expect(texto).toContain('320');
    expect(texto).toContain('Consta');
    expect(texto).toContain('R$ 7.850,40');
    expect(texto).toContain('Protesto de duplicata mercantil');
    expect(texto).toContain('12/08/2026');
    expect(texto).toContain('Nada consta'); // cheques / falência consultados com 0
    expect(texto).toContain('Não informado pela fonte'); // ações judiciais: consultado=false
    expect(texto).toContain('***.219.876-**');
    expect(texto).toContain('41,75%');
  });

  it('"Nada consta" só quando consultado=true e quantidade 0', async () => {
    const r: RelatorioCredito = {
      ...exemploLimpo,
      anotacoes: {
        ...exemploLimpo.anotacoes,
        protestos: { consultado: false, quantidade: 0, valorTotal: null, itens: [] },
        chequesSemFundo: { consultado: false, quantidade: 0, valorTotal: null, itens: [] },
        pendenciasFinanceiras: { consultado: false, quantidade: 0, valorTotal: null, itens: [] },
        acoesJudiciais: { consultado: false, quantidade: 0, valorTotal: null, itens: [] },
        falenciaRecuperacao: { consultado: false, quantidade: 0, valorTotal: null, itens: [] },
      },
    };
    const { texto } = await gerar(r);
    expect(texto).not.toContain('Nada consta');
    expect(texto.match(/Não informado pela fonte/g)?.length).toBe(5);
  });

  it('não usa marca de bureau; o provedor só aparece em "Fonte dos dados"', async () => {
    for (const base of [exemploLimpo, exemploRestricao]) {
      const r: RelatorioCredito = { ...base, fonte: { provedor: 'Boa Vista', produto: 'SCPC / Serasa (teste)', custoReais: null } };
      const { texto } = await gerar(r);
      const fora = texto.split('\n').filter((l) => !l.startsWith('Fonte dos dados:'));
      expect(fora.join('\n')).not.toMatch(/serasa|boa\s*vista/i);
      expect(texto).toContain('Fonte dos dados: Boa Vista/SCPC / Serasa (teste)');
      expect(texto).toContain('Relatório de Análise de Crédito — Sal Vita');
    }
  });

  it('muitos itens: quebra de página, cabeçalho de tabela repetido e rodapé "Página X de Y" em todas', async () => {
    const itens = Array.from({ length: 60 }, (_, i) => ({
      data: '2026-05-10', descricao: `Protesto número ${i + 1} ` + 'X'.repeat(120), valor: 100 + i, local: 'Cartório ' + 'Y'.repeat(60),
    }));
    const r: RelatorioCredito = {
      ...exemploRestricao,
      anotacoes: { ...exemploRestricao.anotacoes, protestos: { consultado: true, quantidade: 60, valorTotal: 9000, itens } },
    };
    const { pdf, texto } = await gerar(r);
    const paginas = (pdf.toString('latin1').match(/\/Type \/Page\n/g) ?? []).length;
    expect(paginas).toBeGreaterThan(2);
    expect(texto.match(/Página \d+ de \d+/g)?.length).toBe(paginas);
    expect(texto).toContain(`Página ${paginas} de ${paginas}`);
    expect((texto.match(/^Descrição$/gm) ?? []).length).toBeGreaterThan(1); // cabeçalho repetido
  });

  it('campos nulos viram "—" e listas vazias não quebram', async () => {
    const r: RelatorioCredito = {
      ...exemploLimpo,
      tipo: 'CPF',
      documento: '11146812612',
      score: { valor: null, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null },
      cadastro: Object.fromEntries(Object.keys(exemploLimpo.cadastro).map((k) => [k, null])) as unknown as RelatorioCredito['cadastro'],
      socios: [],
      consultasRecentes: [],
    };
    const { texto } = await gerar(r);
    expect(texto).toContain('Não informado');
    expect(texto).toContain('111.468.126-12'); // documento consultado aparece inteiro; só sócios são mascarados
    expect(texto).toContain('Nenhum sócio ou administrador informado pela fonte.');
    expect(texto).toContain('—');
  });

  it('compressão ligada por padrão (PDF menor e ainda válido)', async () => {
    delete process.env.CREDITO_PDF_SEM_COMPRESSAO;
    const { pdf } = await gerar(exemploRestricao);
    process.env.CREDITO_PDF_SEM_COMPRESSAO = '1';
    const { pdf: semComp } = await gerar(exemploRestricao);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeLessThan(semComp.length);
  });
});

describe('helpers do PDF', () => {
  it('formata e mascara documentos', () => {
    expect(formatarDocumento('11222333000181', 'CNPJ')).toBe('11.222.333/0001-81');
    expect(formatarDocumento('11146812612', 'CPF')).toBe('111.468.126-12');
    expect(mascararDocumento('11146812612')).toBe('***.468.126-**');
    expect(mascararDocumento(null)).toBe('—');
  });
  it('limparTexto troca caracteres fora da Helvetica', () => {
    expect(limparTexto('ção ã é õ — “x”')).toBe('ção ã é õ — "x"');
    expect(limparTexto('a→b')).toBe('a?b');
  });
});
