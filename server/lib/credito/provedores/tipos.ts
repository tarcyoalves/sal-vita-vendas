import type { RelatorioCredito, TipoDocumento } from '../../../../shared/credito';

export interface ProvedorCredito {
  nome: string; // gravado em credit_reports.provedor
  produto: string;
  custoReais: number;
  consultar(documento: string, tipo: TipoDocumento): Promise<{ relatorio: RelatorioCredito; bruto: unknown }>;
}

/**
 * Erro do provedor. `mensagemSegura` pode ir ao cliente; `detalhe` só ao log e ao razão
 * (credit_queries.erro) — nunca token nem payload.
 */
export class ErroProvedorCredito extends Error {
  constructor(public readonly mensagemSegura: string, public readonly detalhe: string) {
    super(mensagemSegura);
    this.name = 'ErroProvedorCredito';
  }
}
