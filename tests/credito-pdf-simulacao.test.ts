import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { calcularVeredito } from '../shared/credito';
import type { RelatorioCredito } from '../shared/credito';
import { FAIXA_SIMULACAO, gerarPdfCredito } from '../server/lib/credito/pdf';
import { exemploLimpo } from './fixtures/credito/exemplo-limpo';

/** Mesma extração dos outros testes de PDF: PDF sem compressão, strings hex em Tj/TJ (WinAnsi). */
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

const comProvedor = (provedor: string, socios = 0): RelatorioCredito => ({
  ...exemploLimpo,
  fonte: { ...exemploLimpo.fonte, provedor },
  socios: Array.from({ length: socios }, (_, i) => ({
    documento: null, nome: `Sócio de teste número ${i + 1}`, entrada: '2020-01-01', participacao: 1, cargo: 'Sócio',
  })),
});

async function gerar(r: RelatorioCredito) {
  const { veredito, motivos } = calcularVeredito(r);
  return extrairTexto(await gerarPdfCredito(r, { veredito, motivos, consultadoPor: 'Teste' }));
}
const ocorrencias = (texto: string, trecho: string) => texto.split(trecho).length - 1;

describe('faixa de simulação no PDF', () => {
  beforeAll(() => { process.env.CREDITO_PDF_SEM_COMPRESSAO = '1'; });
  afterAll(() => { delete process.env.CREDITO_PDF_SEM_COMPRESSAO; });

  it('texto da faixa', () => {
    expect(FAIXA_SIMULACAO).toBe('SIMULAÇÃO — DADOS FICTÍCIOS, NÃO USAR PARA DECISÃO');
  });

  it('provedor simulado: a faixa aparece em TODAS as páginas', async () => {
    const texto = await gerar(comProvedor('simulado', 120));
    const paginas = Number(/Página 1 de (\d+)/.exec(texto)?.[1]);
    expect(paginas).toBeGreaterThanOrEqual(2);
    expect(ocorrencias(texto, FAIXA_SIMULACAO)).toBe(paginas);
  });

  it('provedor real: nenhuma faixa', async () => {
    const texto = await gerar(comProvedor('boavista_apifull'));
    expect(texto).not.toContain('SIMULAÇÃO');
    expect(texto).not.toContain('DADOS FICTÍCIOS');
  });
});
