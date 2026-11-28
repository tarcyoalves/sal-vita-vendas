// Perfis do importador da Receita (`scripts/radar/import-receita.ts --perfil`).
// Lógica pura — o script só cuida de I/O. Perfis:
//   cargas  (padrão) — comportamento original, CNAEs de RADAR_ALL_CNAES.
//   premium — CNAEs de PREMIUM_ALL_CNAES + regra de nome (shared/radarPremium.ts).
//   ambos   — união dos dois.
import { RADAR_ALL_CNAES } from '../../../shared/radar';
import { PREMIUM_ALL_CNAES, premiumCnaesAlvo, premiumSegmentsFor, type PremiumSegmentKey } from '../../../shared/radarPremium';
import type { RadarEstablishmentRow } from './receitaParse';

export const RADAR_PERFIS = ['cargas', 'premium', 'ambos'] as const;
export type RadarPerfil = (typeof RADAR_PERFIS)[number];

export function parsePerfil(raw: string | undefined): RadarPerfil {
  if (raw === undefined) return 'cargas';
  if ((RADAR_PERFIS as readonly string[]).includes(raw)) return raw as RadarPerfil;
  throw new Error(`--perfil inválido: "${raw}". Use cargas, premium ou ambos.`);
}

/** CNAEs que o passo 1 deve procurar (pré-filtro generoso; a regra de nome vem depois). */
export function targetCnaesForPerfil(perfil: RadarPerfil): string[] {
  if (perfil === 'cargas') return [...RADAR_ALL_CNAES];
  if (perfil === 'premium') return [...PREMIUM_ALL_CNAES];
  return [...new Set([...RADAR_ALL_CNAES, ...PREMIUM_ALL_CNAES])];
}

/** CNAEs-alvo da linha para o perfil, ou [] se ela não serve ao perfil. Premium exige a regra
 * de nome (nome fantasia / razão social, que só está completa depois do passo 2). */
export function cnaesAlvoDoPerfil(
  row: Pick<RadarEstablishmentRow, 'cnaesAlvo' | 'nomeFantasia' | 'razaoSocial'>,
  perfil: RadarPerfil,
): string[] {
  const cargas = row.cnaesAlvo.filter((c) => RADAR_ALL_CNAES.includes(c));
  const premium = premiumCnaesAlvo(row.cnaesAlvo, row.nomeFantasia, row.razaoSocial);
  if (perfil === 'cargas') return cargas;
  if (perfil === 'premium') return premium;
  const keep = new Set([...cargas, ...premium]);
  return row.cnaesAlvo.filter((c) => keep.has(c));
}

/** Aplica o perfil às linhas já mescladas (passos 1 + 2). `cargas` devolve as linhas intactas. */
export function aplicarPerfil(rows: readonly RadarEstablishmentRow[], perfil: RadarPerfil): RadarEstablishmentRow[] {
  if (perfil === 'cargas') return [...rows];
  const out: RadarEstablishmentRow[] = [];
  for (const row of rows) {
    const cnaesAlvo = cnaesAlvoDoPerfil(row, perfil);
    if (cnaesAlvo.length > 0) out.push({ ...row, cnaesAlvo });
  }
  return out;
}

/** Contagem por segmento Premium (para o resumo do dry-run). */
export function contarPorSegmentoPremium(rows: readonly RadarEstablishmentRow[]): Partial<Record<PremiumSegmentKey, number>> {
  const out: Partial<Record<PremiumSegmentKey, number>> = {};
  for (const row of rows) {
    for (const key of premiumSegmentsFor(row.cnaesAlvo, row.nomeFantasia, row.razaoSocial)) {
      out[key] = (out[key] ?? 0) + 1;
    }
  }
  return out;
}
