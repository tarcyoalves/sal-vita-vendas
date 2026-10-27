/**
 * Expediente do CRM (economia de computação do Neon).
 *
 * O banco só dorme após ~5 min sem consulta; telas abertas fazendo polling fora do horário de
 * trabalho o mantêm acordado. Fora do expediente o cliente para o polling PERIÓDICO (a primeira
 * carga ao abrir a tela continua normal). Função pura, sem I/O.
 *
 * Padrão (America/Fortaleza, sem horário de verão; fim EXCLUSIVO):
 *   seg–sex 07:30–18:30 · sábado 08:00–12:00 · domingo fechado.
 *
 * Config (cliente: VITE_EXPEDIENTE) sobrescreve o padrão: "07:00-19:00" (faixas, vale para os
 * dias de `dias`, por padrão todos) ou "sempre" (nunca pausa). Vazio = padrão por dia da semana.
 * Config inválida => fail open (trata como "sempre").
 */
import { interpretarJanela, minutoLocal, SMBI_JANELA_FUSO } from './smbiJanela';

/** Descrição do padrão (documentação/testes). */
export const EXPEDIENTE_PADRAO = 'seg-sex 07:30-18:30; sab 08:00-12:00; dom fechado';

/** Padrão por dia da semana (0 = domingo … 6 = sábado): faixas [início, fim) em minutos. */
export const EXPEDIENTE_PADRAO_POR_DIA: Readonly<Record<number, readonly (readonly [number, number])[]>> = {
  0: [],
  1: [[7 * 60 + 30, 18 * 60 + 30]],
  2: [[7 * 60 + 30, 18 * 60 + 30]],
  3: [[7 * 60 + 30, 18 * 60 + 30]],
  4: [[7 * 60 + 30, 18 * 60 + 30]],
  5: [[7 * 60 + 30, 18 * 60 + 30]],
  6: [[8 * 60, 12 * 60]],
};
/** Dias da semana quando há VITE_EXPEDIENTE com faixas: todos. */
export const EXPEDIENTE_DIAS_PADRAO: readonly number[] = [0, 1, 2, 3, 4, 5, 6];

const fmtDia = new Intl.DateTimeFormat('en-US', { timeZone: SMBI_JANELA_FUSO, weekday: 'short' });
const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Dia da semana em Fortaleza (0 = domingo). */
export function diaDaSemanaLocal(agora: Date): number {
  return DIAS[fmtDia.format(agora)] ?? 0;
}

/** true se o expediente está aberto agora (ou se não há portão: "sempre"/config inválida). */
export function expedienteAberto(
  agora: Date,
  config?: string | null,
  dias: readonly number[] = EXPEDIENTE_DIAS_PADRAO,
): boolean {
  const txt = (config ?? '').trim();
  const dia = diaDaSemanaLocal(agora);
  const min = minutoLocal(agora);
  if (!txt) {
    return (EXPEDIENTE_PADRAO_POR_DIA[dia] ?? []).some(([ini, fim]) => min >= ini && min < fim);
  }
  const faixas = interpretarJanela(txt);
  if (!faixas) return true; // "sempre" ou inválida (fail open)
  if (!dias.includes(dia)) return false;
  return faixas.some((f) => min >= f.ini && min < f.fim);
}
