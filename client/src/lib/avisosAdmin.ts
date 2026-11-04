/**
 * Avisos INFORMATIVOS fixos do dashboard do admin. Não são lembretes do sistema:
 * sem banco, sem API. Para adicionar/editar, mexa só na lista AVISOS_ADMIN abaixo.
 * `data` é string pura YYYY-MM-DD (nunca passa por fuso). O aviso aparece desde já e some
 * sozinho DIAS_VISIVEIS_APOS dias depois da data.
 */
import { SMBI_JANELA_FUSO } from '../../../shared/smbiJanela';

export type AvisoAdmin = {
  id: string;
  data: string;
  titulo: string;
  texto: string;
  tom: 'info';
};

export const DIAS_VISIVEIS_APOS = 7;

export const AVISOS_ADMIN: readonly AvisoAdmin[] = [];

const fmtDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: SMBI_JANELA_FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
});

/** Data de hoje (YYYY-MM-DD) em America/Fortaleza para o instante dado. */
export function hojeFortaleza(agora: Date = new Date()): string {
  const p = fmtDia.formatToParts(agora);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function diaNumero(ymd: string): number {
  const [a, m, d] = ymd.split('-').map(Number);
  return Date.UTC(a, m - 1, d) / 86_400_000;
}

/** Dias de hoje até o aviso: positivo = faltam, 0 = hoje, negativo = venceu. */
export function diasAte(dataAviso: string, hoje: string): number {
  return diaNumero(dataAviso) - diaNumero(hoje);
}

export type Urgencia = 'ambar' | 'neutro' | 'vencido';

export function urgenciaAviso(dataAviso: string, hoje: string): { dias: number; urgencia: Urgencia; rotulo: string } {
  const dias = diasAte(dataAviso, hoje);
  if (dias < 0) {
    const n = -dias;
    return { dias, urgencia: 'vencido', rotulo: `venceu há ${n} ${n === 1 ? 'dia' : 'dias'}` };
  }
  if (dias === 0) return { dias, urgencia: 'ambar', rotulo: 'hoje' };
  return { dias, urgencia: dias <= 2 ? 'ambar' : 'neutro', rotulo: `faltam ${dias} ${dias === 1 ? 'dia' : 'dias'}` };
}

/** Avisos ainda visíveis (até DIAS_VISIVEIS_APOS dias depois da data), por data crescente. */
export function avisosVisiveis(avisos: readonly AvisoAdmin[], hoje: string): AvisoAdmin[] {
  return avisos
    .filter((a) => diasAte(a.data, hoje) >= -DIAS_VISIVEIS_APOS)
    .sort((a, b) => a.data.localeCompare(b.data));
}
