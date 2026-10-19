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

export const AVISOS_ADMIN: readonly AvisoAdmin[] = [
  {
    id: 'neon-revisar-consumo-2026-10-26',
    data: '2026-10-26',
    titulo: 'Neon: revisar consumo',
    texto:
      'Abra Neon → projeto LEMBRETES VITA → Usage e veja o Compute (CU-h) desde o upgrade para o plano Launch. Se estiver abaixo de ~2,5 CU-h por dia, o plano Free (100 CU-h/mês) comporta.',
    tom: 'info',
  },
  {
    id: 'neon-decidir-plano-2026-10-29',
    data: '2026-10-29',
    titulo: 'Neon: decidir Free ou Launch antes de virar o ciclo',
    texto:
      'Confira em Billing a data de renovação do ciclo. Se o consumo cabe no Free, volte ao plano Free antes da virada; se não cabe, mantenha o Launch (autoscaling 0,25–1 CU, suspensão em 5 min). Só o Tarcyo ou a Allyne fazem isso no Neon (conta allyne.rep@gmail.com).',
    tom: 'info',
  },
];

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
