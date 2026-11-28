// Perfis do importador da Receita (`scripts/radar/import-receita.ts --perfil`).
// Lógica pura — o script só cuida de I/O. Perfis:
//   cargas  (padrão) — comportamento original, CNAEs de RADAR_ALL_CNAES.
//   premium — CNAEs de PREMIUM_ALL_CNAES + regra de nome (shared/radarPremium.ts).
//   ambos   — união dos dois.
import { RADAR_ALL_CNAES } from '../../../shared/radar';
import {
  PREMIUM_DEFAULT_SEGMENT_KEYS,
  PREMIUM_SEGMENTS,
  PREMIUM_SEGMENT_KEYS,
  premiumCnaesAlvo,
  premiumSegmentsFor,
  type PremiumSegmentKey,
} from '../../../shared/radarPremium';
import type { RadarEstablishmentRow } from './receitaParse';

export const RADAR_PERFIS = ['cargas', 'premium', 'ambos'] as const;
export type RadarPerfil = (typeof RADAR_PERFIS)[number];

export function parsePerfil(raw: string | undefined): RadarPerfil {
  if (raw === undefined) return 'cargas';
  if ((RADAR_PERFIS as readonly string[]).includes(raw)) return raw as RadarPerfil;
  throw new Error(`--perfil inválido: "${raw}". Use cargas, premium ou ambos.`);
}

/** `--segmentos-premium a,b,c`: restringe o perfil Premium a esses segmentos. Sem a flag vale
 * PREMIUM_DEFAULT_SEGMENT_KEYS (tudo, menos os de volume alto: minimercado, açougue, peixaria,
 * hortifruti — que são opt-in). Chave desconhecida ou lista vazia falha, para um erro de
 * digitação não virar importação silenciosamente menor (ou maior) do que se queria. */
export function parseSegmentosPremium(raw: string | undefined): PremiumSegmentKey[] {
  if (raw === undefined) return [...PREMIUM_DEFAULT_SEGMENT_KEYS];
  const pedidas = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (pedidas.length === 0) {
    throw new Error(`--segmentos-premium vazio. Use chaves separadas por vírgula: ${PREMIUM_SEGMENT_KEYS.join(', ')}.`);
  }
  const invalidas = pedidas.filter((k) => !(PREMIUM_SEGMENT_KEYS as readonly string[]).includes(k));
  if (invalidas.length > 0) {
    throw new Error(`--segmentos-premium com segmento desconhecido: ${invalidas.join(', ')}. Válidos: ${PREMIUM_SEGMENT_KEYS.join(', ')}.`);
  }
  // Ordem do catálogo, sem repetir: a mesma seleção sempre gera o mesmo resultado.
  return PREMIUM_SEGMENT_KEYS.filter((k) => pedidas.includes(k));
}

/** CNAEs dos segmentos Premium dados, sem repetir. */
export function premiumCnaesDosSegmentos(segmentos: readonly PremiumSegmentKey[]): string[] {
  return [...new Set(PREMIUM_SEGMENTS.filter((s) => segmentos.includes(s.key)).flatMap((s) => [...s.cnaes] as string[]))];
}

/** CNAEs que a limpeza pode apagar: os dos segmentos escolhidos MENOS os que também sustentam
 * algum segmento não escolhido (ex.: 4712100 é de `mercado_natural` e de `minimercado`). Assim
 * rodar o padrão por cima de uma importação com opt-ins não apaga o que ele não regravou. */
export function premiumCnaesProprios(segmentos: readonly PremiumSegmentKey[]): string[] {
  const dosOutros = new Set(premiumCnaesDosSegmentos(PREMIUM_SEGMENT_KEYS.filter((k) => !segmentos.includes(k))));
  return premiumCnaesDosSegmentos(segmentos).filter((c) => !dosOutros.has(c));
}

/** Rótulo do perfil + seleção, gravado no cabeçalho do arquivo `--save-filtered`: seleção
 * diferente da padrão gera outro rótulo, e o arquivo não serve para outra seleção. */
export function perfilTag(perfil: RadarPerfil, segmentos: readonly PremiumSegmentKey[] = PREMIUM_DEFAULT_SEGMENT_KEYS): string {
  if (perfil === 'cargas') return perfil;
  const padrao = PREMIUM_DEFAULT_SEGMENT_KEYS.length === segmentos.length && PREMIUM_DEFAULT_SEGMENT_KEYS.every((k) => segmentos.includes(k));
  return padrao ? perfil : `${perfil}[${segmentos.join(',')}]`;
}

/** CNAEs que o passo 1 deve procurar (pré-filtro generoso; a regra de nome vem depois). */
export function targetCnaesForPerfil(perfil: RadarPerfil, segmentos: readonly PremiumSegmentKey[] = PREMIUM_DEFAULT_SEGMENT_KEYS): string[] {
  if (perfil === 'cargas') return [...RADAR_ALL_CNAES];
  const premium = premiumCnaesDosSegmentos(segmentos);
  if (perfil === 'premium') return premium;
  return [...new Set([...RADAR_ALL_CNAES, ...premium])];
}

/** CNAEs-alvo da linha para o perfil, ou [] se ela não serve ao perfil. Premium exige a regra
 * de nome (nome fantasia / razão social, que só está completa depois do passo 2). */
export function cnaesAlvoDoPerfil(
  row: Pick<RadarEstablishmentRow, 'cnaesAlvo' | 'nomeFantasia' | 'razaoSocial'>,
  perfil: RadarPerfil,
  segmentos: readonly PremiumSegmentKey[] = PREMIUM_DEFAULT_SEGMENT_KEYS,
): string[] {
  const cargas = row.cnaesAlvo.filter((c) => RADAR_ALL_CNAES.includes(c));
  const premium = premiumCnaesAlvo(row.cnaesAlvo, row.nomeFantasia, row.razaoSocial, segmentos);
  if (perfil === 'cargas') return cargas;
  if (perfil === 'premium') return premium;
  const keep = new Set([...cargas, ...premium]);
  return row.cnaesAlvo.filter((c) => keep.has(c));
}

/** Aplica o perfil às linhas já mescladas (passos 1 + 2). `cargas` devolve as linhas intactas. */
export function aplicarPerfil(
  rows: readonly RadarEstablishmentRow[],
  perfil: RadarPerfil,
  segmentos: readonly PremiumSegmentKey[] = PREMIUM_DEFAULT_SEGMENT_KEYS,
): RadarEstablishmentRow[] {
  if (perfil === 'cargas') return [...rows];
  const out: RadarEstablishmentRow[] = [];
  for (const row of rows) {
    const cnaesAlvo = cnaesAlvoDoPerfil(row, perfil, segmentos);
    if (cnaesAlvo.length > 0) out.push({ ...row, cnaesAlvo });
  }
  return out;
}

/** Contagem por segmento Premium (para o resumo do dry-run). */
export function contarPorSegmentoPremium(
  rows: readonly RadarEstablishmentRow[],
  segmentos: readonly PremiumSegmentKey[] = PREMIUM_DEFAULT_SEGMENT_KEYS,
): Partial<Record<PremiumSegmentKey, number>> {
  const out: Partial<Record<PremiumSegmentKey, number>> = {};
  for (const row of rows) {
    for (const key of premiumSegmentsFor(row.cnaesAlvo, row.nomeFantasia, row.razaoSocial, segmentos)) {
      out[key] = (out[key] ?? 0) + 1;
    }
  }
  return out;
}

/** Igual a `contarPorSegmentoPremium`, mas lista TODOS os segmentos escolhidos (0 inclusive),
 * na ordem do catálogo: no dry-run, segmento que não achou ninguém aparece com 0. */
export function resumoPorSegmentoPremium(
  rows: readonly RadarEstablishmentRow[],
  segmentos: readonly PremiumSegmentKey[] = PREMIUM_DEFAULT_SEGMENT_KEYS,
): Record<string, number> {
  const contagem = contarPorSegmentoPremium(rows, segmentos);
  return Object.fromEntries(PREMIUM_SEGMENT_KEYS.filter((k) => segmentos.includes(k)).map((k) => [k, contagem[k] ?? 0]));
}
