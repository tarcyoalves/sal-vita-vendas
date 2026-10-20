// Modo automático (0.3.0): estado persistido, ritmo e token de autorização de cada envio.
// Funções puras; o painel grava no IndexedDB e o content script só valida o token.
//
// ⚠️ Envio automático viola os Termos do WhatsApp e pode bloquear o número de forma permanente
// (decisão escrita do dono). O padrão da extensão continua sendo o modo manual (uma tecla).

import { AUTO, PALAVRA_ACEITE_AUTOMATICO } from './constantes';
import { type ConfigPolitica, normalizarConfig } from './politica';

export interface EstadoAutomatico {
  id: 'estado';
  ligado: boolean;
  /** Quando o dono aceitou o risco (ISO). Mantido ao desligar. */
  aceitoEm: string | null;
  desligadoEm: string | null;
  /** Por que o automático voltou ao manual (freio, aviso do WhatsApp…). null = desligado pelo dono. */
  motivoDesligado: string | null;
  /** Envios seguidos desde a última pausa longa. */
  enviosSeguidos: number;
}

export const ESTADO_AUTOMATICO_PADRAO: EstadoAutomatico = {
  id: 'estado',
  ligado: false,
  aceitoEm: null,
  desligadoEm: null,
  motivoDesligado: null,
  enviosSeguidos: 0,
};

export const AVISO_RISCO_AUTOMATICO =
  'Entendo que o envio automático viola os Termos do WhatsApp e pode bloquear meu número de forma permanente';

/** Só liga com a caixa marcada E a palavra exata digitada. */
export function aceiteValido(caixaMarcada: boolean, palavra: string): boolean {
  return caixaMarcada && palavra.trim() === PALAVRA_ACEITE_AUTOMATICO;
}

export function ligarAutomatico(e: EstadoAutomatico, agora: Date): EstadoAutomatico {
  return { ...e, ligado: true, aceitoEm: agora.toISOString(), desligadoEm: null, motivoDesligado: null, enviosSeguidos: 0 };
}

export function desligarAutomatico(e: EstadoAutomatico, agora: Date, motivo: string | null): EstadoAutomatico {
  return { ...e, ligado: false, desligadoEm: agora.toISOString(), motivoDesligado: motivo, enviosSeguidos: 0 };
}

/** Política efetiva no automático: teto nunca acima de 30 e intervalo nunca abaixo de 90 s. */
export function configAuto(cfg: ConfigPolitica): ConfigPolitica {
  const n = normalizarConfig(cfg);
  return {
    ...n,
    tetoDiario: Math.min(n.tetoDiario, AUTO.tetoDiario),
    intervaloMinSeg: Math.max(n.intervaloMinSeg, AUTO.intervaloMinSeg),
    intervaloMaxSeg: Math.max(n.intervaloMaxSeg, AUTO.intervaloMaxSeg),
  };
}

/**
 * Espera depois de um envio no automático. A cada `enviosAtePausaLonga` envios seguidos vem a
 * pausa longa (10–20 min) e a contagem recomeça.
 */
export function sortearEspera(
  enviosSeguidosAntes: number,
  aleatorio: () => number = Math.random,
): { segundos: number; pausaLonga: boolean; enviosSeguidos: number } {
  const n = enviosSeguidosAntes + 1;
  const entre = (min: number, max: number): number => min + Math.floor(aleatorio() * (max - min + 1));
  if (n >= AUTO.enviosAtePausaLonga) {
    return { segundos: entre(AUTO.pausaLongaMinSeg, AUTO.pausaLongaMaxSeg), pausaLonga: true, enviosSeguidos: 0 };
  }
  return { segundos: entre(AUTO.intervaloMinSeg, AUTO.intervaloMaxSeg), pausaLonga: false, enviosSeguidos: n };
}

// ── Token de autorização de envio ────────────────────────────────────────────

/** Emitido pelo painel para UM envio: amarrado a campanha + contato + texto, uso único, 30 s. */
export interface TokenEnvio {
  id: string;
  campanhaId: string;
  nome: string;
  texto: string;
  emitidoEm: number;
  expiraEm: number;
}

export interface AlvoEnvio {
  campanhaId: string;
  nome: string;
  texto: string;
}

export function emitirToken(alvo: AlvoEnvio, agoraMs: number, id: string): TokenEnvio {
  return { id, ...alvo, emitidoEm: agoraMs, expiraEm: agoraMs + AUTO.tokenValidadeMs };
}

export function ehTokenEnvio(v: unknown): v is TokenEnvio {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    t.id !== '' &&
    typeof t.campanhaId === 'string' &&
    typeof t.nome === 'string' &&
    typeof t.texto === 'string' &&
    typeof t.emitidoEm === 'number' &&
    typeof t.expiraEm === 'number'
  );
}

/** Motivo da recusa (em português) ou null se o token vale para este envio agora. */
export function recusaDoToken(token: unknown, alvo: AlvoEnvio, agoraMs: number, usados: ReadonlySet<string>): string | null {
  if (!ehTokenEnvio(token)) return 'sem token de autorização do painel';
  if (usados.has(token.id)) return 'o token de autorização já foi usado';
  if (token.expiraEm - token.emitidoEm > AUTO.tokenValidadeMs) return 'token com validade acima do permitido';
  if (agoraMs > token.expiraEm || agoraMs < token.emitidoEm - 2000) return 'o token de autorização expirou';
  if (token.campanhaId !== alvo.campanhaId || token.nome !== alvo.nome || token.texto !== alvo.texto) {
    return 'o token não é deste contato/texto/campanha';
  }
  return null;
}
