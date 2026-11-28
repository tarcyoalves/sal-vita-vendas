// Rotas REST do Hermes para o Sal Vita Sales AI (contrato: docs/CONTRATO-HERMES-VENDAS.md e shared/sales.ts).
// Cada escopo tem segredo próprio (HERMES_SCOPES); variável ausente = 503 (falha fechado).
// Autentica ANTES de aguardar schema: chamada anônima não acorda o banco.
import type { Express, Request } from 'express';

export interface SalesRoutesDeps {
  aguardarSchemas: (req: Request) => Promise<void>;
}

export function registerSalesRoutes(_app: Express, _deps: SalesRoutesDeps): void {
  // Implementação no lote "API do Hermes".
}
