// Apresentação da MATRIZ DE COMPARAÇÃO por fonte (relatório consolidado), usada pela tela e pelo PDF: mesmos textos e mesmas cores
// (verde = nada consta, vermelho = há ocorrências, cinza = a fonte não consulta, âmbar = as fontes divergem).
import type { CelulaMatriz, LinhaMatriz, RelatorioConsolidado } from './credito';

export type TomMatriz = 'verde' | 'vermelho' | 'cinza' | 'ambar' | 'neutro' | 'texto';
export interface VisualMatriz {
  tom: TomMatriz;
  /** false = só o texto colorido, sem retângulo de fundo. */
  fundo: boolean;
  principal: string;
  sub: string | null;
}

const reais = (n: number): string => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** O que UMA fonte disse sobre um grupo de anotações. */
export function visualDaCelula(g: Pick<CelulaMatriz, 'consultado' | 'quantidade' | 'valorTotal'>): VisualMatriz {
  if (!g.consultado) return { tom: 'cinza', fundo: true, principal: 'Não consultado', sub: 'a fonte não cobre este item' };
  if (g.quantidade === 0) return { tom: 'verde', fundo: true, principal: 'Nada consta', sub: null };
  return {
    tom: 'vermelho', fundo: true, principal: `${g.quantidade} ocorrência${g.quantidade === 1 ? '' : 's'}`,
    sub: g.valorTotal !== null && g.valorTotal !== undefined ? `Total ${reais(g.valorTotal)}` : null,
  };
}

/** Coluna "Leitura": "Divergem (1 × 2)" separa o título do detalhe entre parênteses. */
export function visualDaLeitura(l: Pick<LinhaMatriz, 'leitura' | 'textoLeitura'>): VisualMatriz {
  const m = /^(.*?)\s*\((.*)\)$/.exec(l.textoLeitura);
  const principal = m ? m[1] : l.textoLeitura;
  const sub = m ? `(${m[2]})` : null;
  switch (l.leitura) {
    case 'divergem': return { tom: 'ambar', fundo: true, principal, sub };
    case 'coincidem': return { tom: 'texto', fundo: false, principal, sub };
    case 'nada_consta': return { tom: 'verde', fundo: false, principal: 'Nada consta', sub: 'em nenhuma fonte' };
    default: return { tom: 'cinza', fundo: false, principal, sub };
  }
}

/** Linha "Consultas ao documento": 30 dias (contagem oficial) e 12 meses por fonte; a leitura compara só os totais de 12 meses. */
export function visualDeConsultas(c: Pick<RelatorioConsolidado, 'consultasPorFonte' | 'consultas12Divergem' | 'fontes'>): { celulas: VisualMatriz[]; leitura: VisualMatriz } {
  const celulas = c.consultasPorFonte.map((f): VisualMatriz => ({
    tom: f.c30 || f.total12 !== null ? 'neutro' : 'cinza', fundo: true,
    principal: f.c30 ? `${f.c30.janela}: ${f.c30.n}` : '30 dias: não informado',
    sub: `12 meses: ${f.total12 === null ? 'não informado' : f.total12}`,
  }));
  const totais = c.consultasPorFonte.filter((f) => f.total12 !== null);
  let leitura: VisualMatriz;
  if (c.consultas12Divergem) leitura = { tom: 'ambar', fundo: true, principal: 'Divergem', sub: `(12 meses: ${totais.map((f) => f.total12).join(' × ')})` };
  else if (totais.length > 1) leitura = { tom: 'texto', fundo: false, principal: 'Coincidem', sub: '(12 meses)' };
  else if (c.fontes.length > 1) leitura = { tom: 'cinza', fundo: false, principal: 'Janelas diferentes', sub: 'não comparável' };
  else leitura = { tom: 'cinza', fundo: false, principal: 'Só uma fonte', sub: null };
  return { celulas, leitura };
}

export interface LinhaVisual { rotulo: string; celulas: VisualMatriz[]; leitura: VisualMatriz }

/** A matriz inteira, pronta para desenhar: uma linha por grupo de anotações e, por último, as consultas. */
export function linhasDaMatriz(c: Pick<RelatorioConsolidado, 'matriz' | 'consultasPorFonte' | 'consultas12Divergem' | 'fontes'>): LinhaVisual[] {
  const consultas = visualDeConsultas(c);
  return [
    ...c.matriz.map((l) => ({ rotulo: l.rotulo, celulas: l.celulas.map(visualDaCelula), leitura: visualDaLeitura(l) })),
    { rotulo: 'Consultas ao documento', celulas: consultas.celulas, leitura: consultas.leitura },
  ];
}
