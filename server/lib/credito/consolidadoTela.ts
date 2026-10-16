// Dados do relatório consolidado que a TELA mostra e que não cabem no contrato `RelatorioCredito` (vêm da resposta crua da
// fonte): o comportamento comercial (resumo + matriz dos últimos 12 meses). Puro: sem banco, sem rede.
import type { ComportamentoTela, RelatorioCredito, TabelaTela } from '../../../shared/credito';
import { comportamentoDe } from './pdfAnexo';
import { mapeadorDoProduto } from './provedores/mapeadores';

const dataCurta = (iso: string | null | undefined): string => {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};
const prioridade = (k: string) => (/ltima compra/i.test(k) ? 0 : /maior fatura/i.test(k) ? 1 : /maior cr[ée]dito/i.test(k) ? 2 : 3);

/** Primeira fonte (na ordem dada) com comportamento comercial na resposta crua. null se nenhuma tem. */
export function comportamentoParaTela(
  r: RelatorioCredito, brutos: ReadonlyArray<{ produto: string; produtoNome: string; bruto: unknown }>,
): ComportamentoTela | null {
  const pf = r.tipo === 'CPF';
  for (const b of brutos) {
    let comp: ReturnType<typeof comportamentoDe> = null;
    try { comp = comportamentoDe(b.bruto, pf); } catch { comp = null; }
    if (!comp) continue;
    const eventos = [...comp.eventos].sort((a, c) => prioridade(a[0]) - prioridade(c[0]));
    const c = r.comportamento;
    const resumo: Array<[string, string]> = [];
    if (!eventos.some(([k]) => prioridade(k) === 0) && c?.ultimaCompraEm) resumo.push(['Última compra', dataCurta(c.ultimaCompraEm)]);
    resumo.push(...eventos.filter(([k]) => prioridade(k) < 3));
    if (c?.pagamentoPontualPct != null) resumo.push(['Pagamentos em dia', `${c.pagamentoPontualPct.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`]);
    resumo.push(...eventos.filter(([k]) => prioridade(k) === 3));
    const tabelas: TabelaTela[] = [];
    let titulo: string | null = null;
    for (const parte of comp.matriz) {
      if (parte.t === 'sub') titulo = parte.texto;
      else if (parte.t === 'tabela') { tabelas.push({ titulo, colunas: parte.colunas, linhas: parte.linhas }); titulo = null; }
    }
    return { fonte: b.produtoNome, resumo: resumo.filter(([, v]) => v.trim() !== ''), tabelas, relacionamento: comp.relacionamento };
  }
  return null;
}

/**
 * Refaz o conteúdo do relatório a partir da resposta crua JÁ PAGA (payload_bruto) com o mapeador atual: relatórios gravados antes
 * dos campos novos (2º score do Serasa, consultas por janela, ação cível...) passam a mostrá-los SEM nova consulta e sem custo.
 * Falha do mapeador ou bruto ausente: vale o relatório gravado.
 */
export function relatorioAtualizado(gravado: RelatorioCredito, chave: string, bruto: unknown): RelatorioCredito {
  if (bruto == null) return gravado;
  try { return { ...gravado, ...mapeadorDoProduto(chave)(bruto) }; } catch { return gravado; }
}
