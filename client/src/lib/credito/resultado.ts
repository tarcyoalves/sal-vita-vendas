// Lógica PURA do resultado de uma consulta com vários produtos (sem DOM, sem React): o que deu certo, o que foi
// reaproveitado e o que falhou — e se foi cobrado. Alimenta o painel do diálogo de consulta.
import { nomeDoProduto } from '../../../../shared/creditoCatalogo';
import { formatBRL } from '../faturamento/calc';

export interface ResultadoDoProduto {
  produto: string; ok: boolean; reaproveitado: boolean; cobrado: boolean; cobrancaIncerta?: boolean; custoReais: number; erro?: string;
}

export type TomResultado = 'ok' | 'reaproveitado' | 'erro';
export interface LinhaResultado { chave: string; nome: string; tom: TomResultado; titulo: string; detalhe: string }

/** Uma linha por produto. Falha SEMPRE diz a mensagem do provedor e se a consulta foi (ou não) cobrada. */
export function linhasDoResultado(resultados: readonly ResultadoDoProduto[]): LinhaResultado[] {
  return resultados.map((r) => {
    const nome = nomeDoProduto(r.produto);
    if (!r.ok) {
      return {
        chave: r.produto, nome, tom: 'erro' as const, titulo: `${nome}: NÃO foi possível puxar`,
        detalhe: `${r.erro ?? 'Falha ao consultar.'} ${r.cobrado ? `ATENÇÃO: esta consulta FOI cobrada (${formatBRL(r.custoReais)}).` : r.cobrancaIncerta ? 'ATENÇÃO: pode ter sido cobrada. Confira o extrato da API Full antes de repetir.' : 'Não foi cobrado.'}`,
      };
    }
    if (r.reaproveitado) {
      return { chave: r.produto, nome, tom: 'reaproveitado' as const, titulo: `${nome}: relatório recente reaproveitado`, detalhe: 'Sem custo (menos de 30 dias).' };
    }
    return { chave: r.produto, nome, tom: 'ok' as const, titulo: `${nome}: consultado com sucesso`, detalhe: `Cobrado ${formatBRL(r.custoReais)}.` };
  });
}

export const produtosComRelatorio = (resultados: readonly ResultadoDoProduto[]): number => resultados.filter((r) => r.ok).length;
export const produtosComFalha = (resultados: readonly ResultadoDoProduto[]): number => resultados.filter((r) => !r.ok).length;
/** Depois de uma consulta com 2+ produtos (todos com relatório), a tela abre o relatório consolidado do documento. */
export const deveAbrirConsolidado = (resultados: readonly ResultadoDoProduto[]): boolean =>
  produtosComFalha(resultados) === 0 && produtosComRelatorio(resultados) >= 2;
