// Política de proteção embutida: horário, teto diário, intervalo e freio.
// Reduz risco; NÃO garante ausência de banimento (docs/PLANO-CAMPANHAS-WHATSAPP.md, seção 4).

import {
  INTERVALO_MAX_SEG,
  INTERVALO_MIN_SEG,
  PROBLEMAS_SEGUIDOS_PARA_PAUSAR,
  TETO_DIARIO_MAXIMO,
  TETO_DIARIO_PADRAO,
} from './constantes';
import { type Ajustes, type JanelaDia, JANELAS_PADRAO, LIMITES } from './ajustes';
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
export interface PisoIntervalo {
  min: number;
  max: number;
}

/** Piso da política "de fábrica" (0.3.x): 60–120 s. */
export const PISO_LEGADO: PisoIntervalo = { min: INTERVALO_MIN_SEG, max: INTERVALO_MAX_SEG };

/**
 * Piso quando o intervalo vem do painel Ajustes (0.4.0): só o mínimo absoluto de segurança
 * (30 s). Os valores do painel já foram validados; isto é a segunda trava.
 */
export const PISO_AJUSTES: PisoIntervalo = { min: LIMITES.intervaloMinSeg, max: LIMITES.intervaloMinSeg };

export function normalizarConfig(c: Partial<ConfigPolitica> | null | undefined, piso: PisoIntervalo = PISO_LEGADO): ConfigPolitica {
  const teto = Math.min(TETO_DIARIO_MAXIMO, Math.max(1, inteiro(c?.tetoDiario, TETO_DIARIO_PADRAO)));
  const min = Math.max(piso.min, inteiro(c?.intervaloMinSeg, INTERVALO_MIN_SEG));
  const max = Math.max(min, piso.max, inteiro(c?.intervaloMaxSeg, INTERVALO_MAX_SEG));
  return { tetoDiario: teto, intervaloMinSeg: min, intervaloMaxSeg: max, numeroComMaisDe30Dias: c?.numeroComMaisDe30Dias === true };
}

const NOME_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function dentroDoHorario(agora: Date, janelas: ReadonlyArray<JanelaDia> = JANELAS_PADRAO): { ok: boolean; motivo?: string } {
  const p = partesNoFuso(agora);
  const faixa = janelas.find((j) => j.dia === p.diaSemana);
  if (!faixa || !faixa.ligado) return { ok: false, motivo: `${NOME_DIA[p.diaSemana]}: sem campanha` };
  if (p.hora < faixa.inicio || p.hora >= faixa.fim) {
    const dia = p.diaSemana >= 1 && p.diaSemana <= 5 && janelas.filter((j) => j.dia >= 1 && j.dia <= 5).every((j) => j.ligado && j.inicio === faixa.inicio && j.fim === faixa.fim)
      ? 'segunda a sexta'
      : NOME_DIA[p.diaSemana];
    return { ok: false, motivo: `fora do horário (${dia}: ${faixa.inicio}h às ${faixa.fim}h, horário de Fortaleza)` };
  }
  return { ok: true };
}

/** Envios de campanha registrados "hoje" no fuso de Fortaleza (todas as campanhas deste número). */
export function contarEnviosHoje(envios: ReadonlyArray<{ enviadoEm: string }>, agora: Date): number {
  const hoje = hojeNoFuso(agora);
  return envios.filter((e) => hojeNoFuso(new Date(e.enviadoEm)) === hoje).length;
}

export function sortearIntervaloSeg(cfg: ConfigPolitica, aleatorio: () => number = Math.random, piso: PisoIntervalo = PISO_LEGADO): number {
  const c = normalizarConfig(cfg, piso);
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

/**
 * Pode abrir o próximo contato agora? A ordem das checagens é a ordem de gravidade.
 * Sem `ajustes` vale a política de fábrica (0.3.x); com `ajustes` valem os horários, o freio e o
 * piso de intervalo do painel (0.4.0) — sempre dentro dos limites absolutos.
 */
export function podeAbrirProximo(estado: EstadoPolitica, cfgBruta: ConfigPolitica, agora: Date, ajustes?: Ajustes): Veredito {
  const cfg = normalizarConfig(cfgBruta, ajustes ? PISO_AJUSTES : PISO_LEGADO);
  const limiteProblemas = ajustes?.freio.problemasManual ?? PROBLEMAS_SEGUIDOS_PARA_PAUSAR;
  if (!cfg.numeroComMaisDe30Dias) {
    return { pode: false, tipo: 'numero_novo', motivo: 'confirme em Dados que este número tem mais de 30 dias de uso' };
  }
  if (estado.problemasSeguidos >= limiteProblemas) {
    return { pode: false, tipo: 'freio', motivo: `${estado.problemasSeguidos} problemas seguidos — confira o WhatsApp antes de continuar` };
  }
  const horario = dentroDoHorario(agora, ajustes?.horarios ?? JANELAS_PADRAO);
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

/**
 * Estado de intervalo usando o último envio GLOBAL (todas as campanhas deste número), não só o
 * da campanha atual. O intervalo sorteado só vale se o último envio global for o da própria
 * campanha; se foi de outra, vale o mínimo da política (o sorteio daquela não é conhecido).
 */
export function ultimoEnvioParaIntervalo(
  envios: ReadonlyArray<{ enviadoEm: string }>,
  campanha: { ultimoEnvioEm: string | null; intervaloAtualSeg: number | null },
): { ultimoEnvioEm: string | null; intervaloAtualSeg: number | null } {
  let global: string | null = null;
  let globalMs = -Infinity;
  for (const e of envios) {
    const ms = new Date(e.enviadoEm).getTime();
    if (Number.isFinite(ms) && ms > globalMs) {
      globalMs = ms;
      global = e.enviadoEm;
    }
  }
  const propriaMs = campanha.ultimoEnvioEm ? new Date(campanha.ultimoEnvioEm).getTime() : -Infinity;
  if (global && globalMs > propriaMs) return { ultimoEnvioEm: global, intervaloAtualSeg: null };
  return { ultimoEnvioEm: campanha.ultimoEnvioEm, intervaloAtualSeg: campanha.intervaloAtualSeg };
}

/** Conta mais um problema. `pausar` = freio acionado. */
export function registrarProblema(problemasSeguidos: number, limite: number = PROBLEMAS_SEGUIDOS_PARA_PAUSAR): { problemasSeguidos: number; pausar: boolean } {
  const n = problemasSeguidos + 1;
  return { problemasSeguidos: n, pausar: n >= limite };
}
