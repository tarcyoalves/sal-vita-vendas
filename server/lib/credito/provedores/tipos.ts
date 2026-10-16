import type { RelatorioCredito, TipoDocumento } from '../../../../shared/credito';
import type { ItemCatalogoCredito } from '../../../../shared/creditoCatalogo';

export interface ProvedorCredito {
  nome: string; // gravado em credit_reports.provedor
  produto: string;
  custoReais: number;
  /** `produto` é o item do catálogo (endpoint e custo). O simulado o ignora. */
  consultar(documento: string, tipo: TipoDocumento, produto?: ItemCatalogoCredito): Promise<{ relatorio: RelatorioCredito; bruto: unknown }>;
}

/**
 * Erro do provedor. `mensagemSegura` pode ir ao cliente; `detalhe` só ao log e ao razão
 * (credit_queries.erro) — nunca token nem payload.
 */
export class ErroProvedorCredito extends Error {
  /** true = a requisição já tinha sido enviada quando falhou (tempo esgotado/queda de rede): o provedor PODE ter cobrado. */
  constructor(public readonly mensagemSegura: string, public readonly detalhe: string, public readonly cobrancaIncerta: boolean = false) {
    super(mensagemSegura);
    this.name = 'ErroProvedorCredito';
  }
}
