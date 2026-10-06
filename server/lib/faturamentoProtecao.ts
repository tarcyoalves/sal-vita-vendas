// ── Faturamento: o que a tela (cache do navegador) NÃO pode sobrescrever ─────
// Funções puras (sem `server/db`), testadas em tests/faturamento-protecao.test.ts.
import type { FatOrder } from '../db/schema';

/** Ação humana explícita enviada pelo store: só ela pode mexer no que o espelho do SMBI protege. */
export type AcaoPedido = 'faturar' | 'desfazer';

type Campos = Pick<
  FatOrder,
  'status' | 'faturadoEm' | 'itens' | 'comissaoPct' | 'valorFretePorUnidade' | 'itensEstimadoSnapshot' | 'valorPago'
>;
type Gravado = Campos & Pick<FatOrder, 'smbiEspelhoFiscal' | 'smbiMovsaiId'>;

/**
 * Pedido cujo conteúdo já veio do SMBI (espelho fiscal gravado pelo robô) ou que está faturado e
 * ligado a um movsai. Pedido só ligado (ainda não faturado) NÃO entra: o faturamento manual
 * pelo atendente continua valendo até o robô espelhar.
 */
export function pedidoEspelhadoPeloSmbi(e: Pick<FatOrder, 'smbiEspelhoFiscal' | 'smbiMovsaiId' | 'status'>): boolean {
  return e.smbiEspelhoFiscal != null || (!!e.smbiMovsaiId && e.status === 'faturado');
}

/**
 * O SMBI é a verdade e o CRM é espelho. Um save com cache velho (tela aberta antes de o robô
 * faturar) não pode desfazer o espelho: status, faturadoEm, itens, comissaoPct, valorFretePorUnidade,
 * itensEstimadoSnapshot e valorPago ficam como estão no banco. Observações, previsão, prazos etc.
 * seguem editáveis (não estão aqui).
 *
 * Exceção: "Faturar" (pedido ainda não faturado) e "Desfazer faturamento" (pedido faturado) são
 * decisões humanas e vêm com `acao`. Um cache velho nunca manda `acao`. Mesmo assim comissaoPct e
 * valorFretePorUnidade continuam os do banco.
 */
export function mergeProtegidoPeloEspelho<T extends Campos>(
  existing: Gravado | undefined,
  input: T,
  acao?: AcaoPedido,
): T {
  if (!existing || !pedidoEspelhadoPeloSmbi(existing)) return input;
  const acaoValida =
    (acao === 'faturar' && existing.status !== 'faturado') ||
    (acao === 'desfazer' && existing.status === 'faturado');
  const base = {
    ...input,
    comissaoPct: existing.comissaoPct,
    valorFretePorUnidade: existing.valorFretePorUnidade,
  };
  if (acaoValida) return base;
  return {
    ...base,
    status: existing.status,
    faturadoEm: existing.faturadoEm,
    itens: existing.itens,
    itensEstimadoSnapshot: existing.itensEstimadoSnapshot,
    valorPago: existing.valorPago,
  };
}

/** Atendente (não admin/gerente) não pode remover pedido faturado nem ligado ao SMBI. */
export function atendentePodeRemover(p: Pick<FatOrder, 'status' | 'smbiMovsaiId'>): boolean {
  return p.status !== 'faturado' && !p.smbiMovsaiId;
}
