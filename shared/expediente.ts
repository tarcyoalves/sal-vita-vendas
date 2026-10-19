/**
 * Expediente do CRM (economia de computação do Neon).
 *
 * O banco só dorme após ~5 min sem consulta; telas abertas fazendo polling fora do horário de
 * trabalho o mantêm acordado a noite toda. Fora do expediente o cliente para o polling
 * PERIÓDICO (a primeira carga ao abrir a tela continua normal). Função pura, sem I/O.
 *
 * Reaproveita o parser de janelas e o fuso de `smbiJanela.ts` (America/Fortaleza, sem horário de
 * verão). Fim EXCLUSIVO: 19:00 já está fora.
 *
 * Config (cliente: VITE_EXPEDIENTE): "07:00-19:00" (padrão, vazio = padrão) ou "sempre"
 * (nunca pausa). Config inválida => fail open (trata como "sempre").
 */
import { interpretarJanela, minutoLocal, SMBI_JANELA_FUSO } from './smbiJanela';

export const EXPEDIENTE_PADRAO = '07:00-19:00';
/** Dias da semana (0 = domingo … 6 = sábado). O dono não restringiu: padrão = todos. */
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
  const txt = (config ?? '').trim() || EXPEDIENTE_PADRAO;
  const faixas = interpretarJanela(txt);
  if (!faixas) return true; // "sempre" ou inválida (fail open)
  if (!dias.includes(diaDaSemanaLocal(agora))) return false;
  const min = minutoLocal(agora);
  return faixas.some((f) => min >= f.ini && min < f.fim);
}
