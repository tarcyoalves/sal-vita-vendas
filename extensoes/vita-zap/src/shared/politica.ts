// Política de proteção embutida: horário, teto diário, intervalo e freio.
// Reduz risco; NÃO garante ausência de banimento (docs/PLANO-CAMPANHAS-WHATSAPP.md, seção 4).

import {
  HORARIO_PERMITIDO,
  INTERVALO_MAX_SEG,
  INTERVALO_MIN_SEG,
  PROBLEMAS_SEGUIDOS_PARA_PAUSAR,
  TETO_DIARIO_MAXIMO,
  TETO_DIARIO_PADRAO,
} from './constantes';
import { hojeNoFuso, partesNoFuso } from './datas';

export interface ConfigPolitica {
  tetoDiario: number;
  intervaloMinSeg: number;
  intervaloMaxSeg: number;
  /** O usuário confirmou que o número tem mais de ~30 dias de uso (número novo não roda campanha). */
  numeroComMaisDe30Dias: boolean;
}

export const CONFIG_PADRAO: ConfigPolitica = {
  tetoDiario: TETO_DIARIO_PADRAO,
  intervaloMinSeg: INTERVALO_MIN_SEG,
  intervaloMaxSeg: INTERVALO_MAX_SEG,
  numeroComMaisDe30Dias: false,
};

function inteiro(v: unknown, padrao: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : padrao;
}

/**
 * A configuração só pode ser MAIS conservadora que a política:
 * teto entre 1 e TETO_DIARIO_MAXIMO; intervalo mínimo nunca abaixo de INTERVALO_MIN_SEG;
 * intervalo máximo nunca abaixo do mínimo nem abaixo de INTERVALO_MAX_SEG.
 */
export function normalizarConfig(c: Partial<ConfigPolitica> | null | undefined): ConfigPolitica {
  const teto = Math.min(TETO_DIARIO_MAXIMO, Math.max(1, inteiro(c?.tetoDiario, TETO_DIARIO_PADRAO)));
  const min = Math.max(INTERVALO_MIN_SEG, inteiro(c?.intervaloMinSeg, INTERVALO_MIN_SEG));
  const max = Math.max(min, INTERVALO_MAX_SEG, inteiro(c?.intervaloMaxSeg, INTERVALO_MAX_SEG));
  return { tetoDiario: teto, intervaloMinSeg: min, intervaloMaxSeg: max, numeroComMaisDe30Dias: c?.numeroComMaisDe30Dias === true };
}

export function dentroDoHorario(agora: Date): { ok: boolean; motivo?: string } {
  const p = partesNoFuso(agora);
  const faixa = HORARIO_PERMITIDO[p.diaSemana];
  if (!faixa) return { ok: false, motivo: 'domingo: sem campanha' };
  if (p.hora < faixa.inicio || p.hora >= faixa.fim) {
    const dia = p.diaSemana === 6 ? 'sábado' : 'segunda a sexta';
    return { ok: false, motivo: `fora do horário (${dia}: ${faixa.inicio}h às ${faixa.fim}h, horário de Fortaleza)` };
  }
  return { ok: true };
}

/** Envios de campanha registrados "hoje" no fuso de Fortaleza (todas as campanhas deste número). */
export function contarEnviosHoje(envios: ReadonlyArray<{ enviadoEm: string }>, agora: Date): number {
  const hoje = hojeNoFuso(agora);
  return envios.filter((e) => hojeNoFuso(new Date(e.enviadoEm)) === hoje).length;
}

export function sortearIntervaloSeg(cfg: ConfigPolitica, aleatorio: () => number = Math.random): number {
  const c = normalizarConfig(cfg);
  return c.intervaloMinSeg + Math.floor(aleatorio() * (c.intervaloMaxSeg - c.intervaloMinSeg + 1));
}

export interface EstadoPolitica {
  enviosHoje: number;
  /** Data-hora ISO do último envio desta execução (null = ainda nenhum). */
  ultimoEnvioEm: string | null;
  /** Intervalo sorteado depois do último envio. */
  intervaloAtualSeg: number | null;
  problemasSeguidos: number;
}

export type Veredito =
  | { pode: true }
  | { pode: false; tipo: 'numero_novo' | 'horario' | 'teto' | 'freio'; motivo: string }
  | { pode: false; tipo: 'intervalo'; motivo: string; esperarMs: number };

/** Pode abrir o próximo contato agora? A ordem das checagens é a ordem de gravidade. */
export function podeAbrirProximo(estado: EstadoPolitica, cfgBruta: ConfigPolitica, agora: Date): Veredito {
  const cfg = normalizarConfig(cfgBruta);
  if (!cfg.numeroComMaisDe30Dias) {
    return { pode: false, tipo: 'numero_novo', motivo: 'confirme em Dados que este número tem mais de 30 dias de uso' };
  }
  if (estado.problemasSeguidos >= PROBLEMAS_SEGUIDOS_PARA_PAUSAR) {
    return { pode: false, tipo: 'freio', motivo: `${estado.problemasSeguidos} problemas seguidos — confira o WhatsApp antes de continuar` };
  }
  const horario = dentroDoHorario(agora);
  if (!horario.ok) return { pode: false, tipo: 'horario', motivo: horario.motivo ?? 'fora do horário' };
  if (estado.enviosHoje >= cfg.tetoDiario) {
    return { pode: false, tipo: 'teto', motivo: `teto diário atingido (${estado.enviosHoje}/${cfg.tetoDiario}) — continue amanhã` };
  }
  if (estado.ultimoEnvioEm) {
    const intervalo = Math.max(cfg.intervaloMinSeg, estado.intervaloAtualSeg ?? cfg.intervaloMinSeg);
    const liberaEm = new Date(estado.ultimoEnvioEm).getTime() + intervalo * 1000;
    const falta = liberaEm - agora.getTime();
    if (falta > 0) return { pode: false, tipo: 'intervalo', motivo: `aguardando intervalo (${Math.ceil(falta / 1000)} s)`, esperarMs: falta };
  }
  return { pode: true };
}

/** Conta mais um problema. `pausar` = freio acionado. */
export function registrarProblema(problemasSeguidos: number): { problemasSeguidos: number; pausar: boolean } {
  const n = problemasSeguidos + 1;
  return { problemasSeguidos: n, pausar: n >= PROBLEMAS_SEGUIDOS_PARA_PAUSAR };
}
