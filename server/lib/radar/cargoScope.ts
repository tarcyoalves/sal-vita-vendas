// Isolamento do Radar de Cargas: a base `radar_establishments` também guarda empresas do
// perfil Premium (shared/radarPremium.ts). Toda consulta que alimenta a tela/roteador de
// CARGAS precisa passar por aqui, para que quem só casa com CNAE Premium nunca apareça —
// nem quando o usuário marca "todos os segmentos".
//
// Sem isso, uma empresa Premium cujo CNAE PRINCIPAL é de cargas (ex.: supermercado 4711301
// com CNAE secundário 4712100 + nome "Empório") entraria pelo filtro de CNAE principal,
// mesmo sem nenhum CNAE de cargas em `cnaes_alvo`.
import { sql, type SQL } from 'drizzle-orm';

import { RADAR_ALL_CNAES } from '../../../shared/radar';
import { radarEstablishments } from '../../db/schema';

/** Condição SQL: `cnaes_alvo` tem ao menos um CNAE de cargas. Parametrizada. */
export function cargoScopeCondition(): SQL {
  return sql`${radarEstablishments.cnaesAlvo} && ARRAY[${sql.join(RADAR_ALL_CNAES.map((c) => sql`${c}`), sql`, `)}]::text[]`;
}

/** Espelho em JS da condição acima (testes e filtros em memória). */
export function isCargoEstablishment(cnaesAlvo: readonly string[]): boolean {
  return cnaesAlvo.some((c) => RADAR_ALL_CNAES.includes(c));
}
