// Radar de Cargas — textos puros do cartão do lead (sem React, testáveis).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Porte legível a partir do código da Receita ('01' ME, '03' EPP, '05' Demais). */
export function porteLabel(porte: string | null): string | null {
  switch (porte) {
    case '01': return 'ME';
    case '03': return 'EPP';
    case '05': return 'Demais';
    default: return null;
  }
}

/** Anos completos desde a abertura (YYYY-MM-DD); null se a data faltar, for inválida ou futura. */
export function companyAgeYears(dataInicio: string | null, now: Date = new Date()): number | null {
  if (!dataInicio) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataInicio);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  let years = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d)) years -= 1;
  return years < 0 ? null : years;
}

/** "aberta há 7 anos"; menos de 1 ano vira "aberta há menos de 1 ano". */
export function companyAgeLabel(dataInicio: string | null, now: Date = new Date()): string | null {
  const years = companyAgeYears(dataInicio, now);
  if (years === null) return null;
  if (years < 1) return 'aberta há menos de 1 ano';
  return `aberta há ${years} ${years === 1 ? 'ano' : 'anos'}`;
}

/** "hoje", "há 1 dia", "há N dias" a partir de um ISO; null se inválido. */
export function daysAgoLabel(iso: string, now: Date = new Date()): string | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
  if (days === 0) return 'hoje';
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`;
}
