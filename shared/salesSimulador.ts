// Simulador de revenda da caixa de 10 kg (página /atacado e vendedor virtual).
// Tudo em centavos inteiros: nenhuma conta com ponto flutuante sobre dinheiro.
// Cliente e servidor usam esta mesma função, então a tela e a API nunca divergem.

export const SIMULADOR_AVISO =
  'Simulação. Não é promessa de lucro: depende de impostos, custos e venda efetiva das unidades.';

export const SIMULADOR_MAX_CAIXAS = 50;
export const PACOTES_POR_CAIXA = 10;

export interface SimulacaoEntrada {
  quantidadeCaixas: number;
  precoRevendaPorPacoteCentavos: number;
  freteCentavos: number;
  despesasCentavos: number;
}

export interface SimulacaoResultado {
  quantidadeCaixas: number;
  pacotes: number;
  custoTotalCentavos: number;
  custoPorPacoteCentavos: number;
  receitaPotencialCentavos: number;
  resultadoCentavos: number;
  /** Resultado / receita, em %, com uma casa. null quando a receita é zero. */
  margemPercentual: number | null;
  aviso: string;
}

/**
 * @param precoCaixaCentavos preço da caixa no site (vem do servidor).
 * Arredondamento: só o custo por pacote é arredondado (ao centavo mais próximo); o custo total,
 * a receita e o resultado são somas exatas de inteiros.
 */
export function simularRevenda(entrada: SimulacaoEntrada, precoCaixaCentavos: number): SimulacaoResultado {
  const { quantidadeCaixas, precoRevendaPorPacoteCentavos, freteCentavos, despesasCentavos } = entrada;
  const pacotes = PACOTES_POR_CAIXA * quantidadeCaixas;
  const custoTotalCentavos = precoCaixaCentavos * quantidadeCaixas + freteCentavos + despesasCentavos;
  const custoPorPacoteCentavos = pacotes > 0 ? Math.round(custoTotalCentavos / pacotes) : 0;
  const receitaPotencialCentavos = precoRevendaPorPacoteCentavos * pacotes;
  const resultadoCentavos = receitaPotencialCentavos - custoTotalCentavos;
  const margemPercentual = receitaPotencialCentavos > 0
    ? Math.round((resultadoCentavos / receitaPotencialCentavos) * 1000) / 10
    : null;
  return {
    quantidadeCaixas, pacotes, custoTotalCentavos, custoPorPacoteCentavos,
    receitaPotencialCentavos, resultadoCentavos, margemPercentual, aviso: SIMULADOR_AVISO,
  };
}

/** "12,50" / "12.5" / "1.250,00" → centavos. Vazio ou inválido → null. */
export function reaisParaCentavos(texto: string): number | null {
  const t = texto.trim().replace(/^R\$\s*/i, '');
  if (!t) return null;
  const semMilhar = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  if (!/^\d+(\.\d{1,2})?$/.test(semMilhar)) return null;
  return Math.round(parseFloat(semMilhar) * 100);
}
