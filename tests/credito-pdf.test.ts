import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularVeredito, ROTULO_VEREDITO } from '../shared/credito';
import type { RelatorioCredito } from '../shared/credito';
import { formatarDocumento, gerarPdfCredito, limparTexto, mascararDocumento, naturezaJuridicaTexto, resumirTexto } from '../server/lib/credito/pdf';
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

  it('relatório limpo: PDF válido, veredito, score, "Sem ocorrências em" e CPF mascarado', async () => {
    const { pdf, texto, veredito } = await gerar(exemploLimpo);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(3_000);
    expect(pdf.length).toBeLessThan(500_000);
    expect(veredito).toBe('APROVADO');
    expect(texto).toContain(ROTULO_VEREDITO.APROVADO);
    expect(texto).toContain('620');
    expect(texto).toContain('Comercial Exemplo Ltda');
    expect(texto).toContain('11.222.333/0001-81');
    expect(texto).toContain('Fonte: Provedor Fictício/Relatório Empresarial (exemplo)');
    expect(texto).toContain('Sem ocorrências em: Protestos, Pendências financeiras, Cheques sem fundo, Ações judiciais, Falência / Recuperação judicial.');
    expect(texto).not.toMatch(/\bConsta\b|Nada consta/);
    // acentos preservados (Helvetica/WinAnsi); o título aparece UMA vez (1ª página), sem cabeçalho por página
    expect(texto.match(/Relatório de Análise de Crédito — Sal Vita/g)).toHaveLength(1);
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
    // sem redundância: razão social e CNPJ UMA vez só (nada no rodapé nem em cabeçalho de página)
    expect(texto.match(/Comercial Exemplo Ltda/g)).toHaveLength(1);
    expect(texto.match(/11\.222\.333\/0001-81/g)).toHaveLength(1);
    // telefone e e-mail não ajudam na decisão de crédito
    expect(texto).not.toContain('(84) 3000-0000');
    expect(texto).not.toMatch(/Telefone/);
  });

  it('relatório com restrição: resumo, valores, itens e "Não informado pela fonte"', async () => {
    const { pdf, texto, veredito } = await gerar(exemploRestricao);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(veredito).toBe('REPROVADO_A_PRAZO');
    expect(texto).toContain(ROTULO_VEREDITO.REPROVADO_A_PRAZO);
    expect(texto).toContain('320');
    expect(texto).toContain('R$ 7.850,40');
    expect(texto).toContain('Duplicata mercantil'); // o "Protesto de" já está no subtítulo do grupo: não repete
    expect(texto).not.toContain('Protesto de duplicata mercantil');
    expect(texto).toContain('12/08/2026');
    expect(texto).toContain('Sem ocorrências em: Cheques sem fundo, Falência / Recuperação judicial.'); // consultados com 0
    expect(texto).toContain('Não informado pela fonte: Ações judiciais.'); // consultado=false
    expect(texto).toContain('***.219.876-**');
    expect(texto).toContain('41,75%');
  });

  it('"Sem ocorrências" só quando consultado=true e quantidade 0', async () => {
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
    expect(texto).not.toContain('Sem ocorrências');
    expect(texto).not.toContain('Nada consta');
    expect(texto.match(/Não informado pela fonte/g)).toHaveLength(1);
    expect(texto).toContain('Não informado pela fonte: Protestos, Pendências financeiras, Cheques sem fundo, Ações judiciais, Falência / Recuperação judicial.');
  });

  it('não usa marca de bureau; o provedor só aparece na linha "Fonte:" do topo', async () => {
    for (const base of [exemploLimpo, exemploRestricao]) {
      const r: RelatorioCredito = { ...base, fonte: { provedor: 'boavista_apifull', produto: 'boavista', custoReais: null } };
      const { texto } = await gerar(r);
      expect(texto).not.toMatch(/serasa|boa\s*vista/i);
      expect(texto).toContain('Fonte: API Full/Consulta simples');
      expect(texto.match(/Fonte:/g)).toHaveLength(1);
      expect(texto.match(/Relatório de Análise de Crédito — Sal Vita/g)).toHaveLength(1); // só na 1ª página
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

  it('campos nulos somem (sem "—") e listas vazias não quebram', async () => {
    const r: RelatorioCredito = {
      ...exemploLimpo,
      tipo: 'CPF',
      documento: '11146812612',
      score: { valor: null, probabilidadeInadimplencia: null, faixa: null, textoInterpretacao: null },
      cadastro: Object.fromEntries(Object.keys(exemploLimpo.cadastro).map((k) => [k, null])) as unknown as RelatorioCredito['cadastro'],
      socios: [],
      consultasRecentes: [],
      comportamento: undefined,
    };
    const { texto } = await gerar(r);
    expect(texto).toContain('Não informado');
    expect(texto).toContain('111.468.126-12'); // documento consultado aparece inteiro; só sócios são mascarados
    // sem dado, sem seção: nada de "Nenhum sócio..." nem de linhas só com "—"
    expect(texto).not.toMatch(/SÓCIOS|DADOS DA EMPRESA|CONSULTAS AO DOCUMENTO|COMPORTAMENTO COMERCIAL/);
    expect(texto).not.toContain('—\n');
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
  it('traduz o código da natureza jurídica; desconhecido fica como veio', () => {
    expect(naturezaJuridicaTexto('2062-')).toBe('Sociedade Empresária Limitada');
    expect(naturezaJuridicaTexto('206-2')).toBe('Sociedade Empresária Limitada');
    expect(naturezaJuridicaTexto('2135')).toBe('Empresário Individual');
    expect(naturezaJuridicaTexto('2305-')).toBe('EIRELI');
    expect(naturezaJuridicaTexto('2240')).toBe('Sociedade Simples Limitada');
    expect(naturezaJuridicaTexto('2054-')).toBe('Sociedade Anônima Fechada');
    expect(naturezaJuridicaTexto('2046-')).toBe('Sociedade Anônima Aberta');
    expect(naturezaJuridicaTexto('9999-')).toBe('999-9');
    expect(naturezaJuridicaTexto('206-2 - Sociedade Empresária Limitada')).toBe('Sociedade Empresária Limitada');
    expect(naturezaJuridicaTexto('SOCIEDADE EMPRESARIA LIMITADA')).toBe('SOCIEDADE EMPRESARIA LIMITADA');
    expect(naturezaJuridicaTexto(null)).toBe('');
  });
  it('resumirTexto: uma linha curta, corte em frase ou palavra', () => {
    expect(resumirTexto('  curto   e simples ')).toBe('curto e simples');
    const longo = 'Primeira frase completa sobre o risco. ' + 'palavra '.repeat(40);
    expect(resumirTexto(longo, 130)).toBe('Primeira frase completa sobre o risco.');
    const sem = 'palavra '.repeat(40);
    const r = resumirTexto(sem, 50);
    expect(r.length).toBeLessThanOrEqual(53);
    expect(r.endsWith('...')).toBe(true);
    expect(resumirTexto(null)).toBe('');
  });
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
