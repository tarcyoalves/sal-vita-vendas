import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analisarSinais, calcularVeredito, type RelatorioCredito } from '../shared/credito';
import { ordenarSinais } from '../shared/creditoSinais';
import { gerarPdfCredito } from '../server/lib/credito/pdf';
import { relatorioSimulado } from '../server/lib/credito/provedores/simulado';
import { exemploLimpo } from './fixtures/credito/exemplo-limpo';
import { exemploRestricao } from './fixtures/credito/exemplo-restricao';

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
async function gerar(r: RelatorioCredito) {
  const { veredito, motivos } = calcularVeredito(r, new Date(r.consultadoEm));
  return extrairTexto(await gerarPdfCredito(r, { veredito, motivos, consultadoPor: 'Teste' })).replace(/\s+/g, ' ');
}

describe('PDF: pontos de atenção, observação, credor e movimentação', () => {
  beforeAll(() => { process.env.CREDITO_PDF_SEM_COMPRESSAO = '1'; });
  afterAll(() => { delete process.env.CREDITO_PDF_SEM_COMPRESSAO; });

  it('restrição: seção logo após o resumo (antes das anotações), ALERTA antes de ATENÇÃO', async () => {
    const texto = await gerar(exemploRestricao);
    const iPontos = texto.indexOf('PONTOS DE ATENÇÃO');
    expect(iPontos).toBeGreaterThan(0);
    expect(iPontos).toBeLessThan(texto.indexOf('ANOTAÇÕES NEGATIVAS'));
    expect(iPontos).toBeGreaterThan(texto.indexOf('VEREDITO DE CRÉDITO'));
    const secao = texto.slice(iPontos, texto.indexOf('ANOTAÇÕES NEGATIVAS'));
    expect(secao).toContain('ALERTA');
    expect(secao).toContain('Muitas consultas recentes');
    expect(secao).toContain('Entrada ou troca recente de');
    expect(secao).toContain('Protestos: estudar com calma');
    expect(secao.indexOf('ALERTA')).toBeLessThan(secao.lastIndexOf('ATENÇÃO'));
  });

  it('restrição: credor e observação do protesto da ANTT (órgão público e antigo)', async () => {
    const texto = await gerar(exemploRestricao);
    expect(texto).toContain('Credor');
    expect(texto).toContain('ANTT - Ag');
    expect(texto).toContain('Estudar com calma'); // título da coluna (não repete o prefixo em cada linha)
    expect(texto).toContain('órgão público');
    expect(texto).toContain('R$ 7.850,40'); // total inalterado (item da ANTT sem valor)
  });

  it('limpo: empresa consolidada e compra recente (POSITIVO) + Comportamento comercial', async () => {
    const texto = await gerar(exemploLimpo);
    expect(texto).toContain('Empresa consolidada');
    expect(texto).toContain('Comprando normalmente no mercado');
    expect(texto).toContain('POSITIVO');
    expect(texto).not.toContain('ALERTA');
    expect(texto).toContain('COMPORTAMENTO COMERCIAL');
    expect(texto).toContain('Última compra: 28/09/2026');
    expect(texto).toContain('Pagamentos em dia: 96,5%');
    expect(texto).toContain('Relacionamento mais antigo: 12/05/2003');
    expect(texto).not.toContain('Estudar com calma'); // sem atenuação, sem coluna
  });

  it('sem comportamento: não há a seção', async () => {
    const { comportamento: _c, ...semComportamento } = exemploLimpo;
    const texto = await gerar(semComportamento);
    expect(texto).not.toContain('COMPORTAMENTO COMERCIAL');
  });
});

describe('ordenarSinais', () => {
  it('ALERTA, ATENCAO, POSITIVO; estável dentro do nível', () => {
    const s = (codigo: string, nivel: 'ALERTA' | 'ATENCAO' | 'POSITIVO') => ({ codigo, nivel, titulo: codigo, detalhe: '' });
    expect(ordenarSinais([s('p1', 'POSITIVO'), s('a1', 'ATENCAO'), s('l1', 'ALERTA'), s('a2', 'ATENCAO'), s('l2', 'ALERTA')]).map((x) => x.codigo))
      .toEqual(['l1', 'l2', 'a1', 'a2', 'p1']);
  });
});

describe('provedor simulado: sinais determinísticos pelo penúltimo dígito', () => {
  const AGORA = '2026-10-15T12:00:00.000Z';
  const doc = (fim: string) => `1122233300${fim}`;
  const codigos = (fim: string) => {
    const r = relatorioSimulado(doc(fim), 'CNPJ', AGORA);
    return analisarSinais(r, new Date(AGORA)).map((s) => s.codigo);
  };
  it('0: empresa nova', () => expect(codigos('0005')).toContain('EMPRESA_NOVA'));
  it('1: muitas consultas', () => expect(codigos('0015')).toContain('MUITAS_CONSULTAS'));
  it('2: sócio recente', () => expect(codigos('0025')).toContain('SOCIO_RECENTE'));
  it('3: empresa jovem e sem compras recentes', () => {
    expect(codigos('0035')).toEqual(expect.arrayContaining(['EMPRESA_JOVEM', 'SEM_COMPRAS_RECENTES']));
  });
  it('8: consolidada e comprando, sem alerta; veredito limpo continua APROVADO', () => {
    expect(codigos('0185')).toEqual(expect.arrayContaining(['EMPRESA_CONSOLIDADA', 'COMPRANDO_NORMALMENTE']));
    const r = relatorioSimulado(doc('0185'), 'CNPJ', AGORA);
    expect(analisarSinais(r, new Date(AGORA)).some((s) => s.nivel === 'ALERTA')).toBe(false);
    expect(calcularVeredito(r, new Date(AGORA)).veredito).toBe('APROVADO');
  });
  it('é determinístico', () => {
    expect(relatorioSimulado(doc('0015'), 'CNPJ', AGORA)).toEqual(relatorioSimulado(doc('0015'), 'CNPJ', AGORA));
  });
});
