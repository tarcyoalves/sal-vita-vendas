// Decisões do despacho de mensagens (reserva → autorização → resultado). V3.1, 16.2 e 16.3.
// Puras: o código de banco consulta, chama estas funções e só então grava (UPDATE condicional).
//
// Garantias que estas regras dão — e as que NÃO dão:
//  - Nada sai sem autorização de despacho válida, curta e com o número de ordem (fence) atual.
//  - Revalida tudo na autorização: estado, aprovação, validade da reserva, supressão nos dois
//    bancos, limites, modo, canal. Falha de consulta = negar.
//  - NÃO dá "exatamente uma vez": se o SMTP aceitou e o executor caiu antes de informar, a
//    mensagem fica UNKNOWN e NUNCA é reenviada sozinha (vai para conciliação humana).
//  - Mensagem já aceita pelo servidor de e-mail não pode ser recuperada.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DispatchOutcome, JourneyState, MessageStatus, SalesMode } from '../../../shared/sales';
import { estadoPermiteProspeccao } from './estados';

export function novoToken(): string {
  return randomBytes(24).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenConfere(token: string, hashGravado: string | null): boolean {
  if (!hashGravado) return false;
  const a = Buffer.from(hashToken(token), 'hex');
  const b = Buffer.from(hashGravado, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Modo ──────────────────────────────────────────────────────────────────────────────────────

/**
 * O modo permite despachar esta mensagem?
 *  - DRY_RUN e PAUSED: nunca.
 *  - REVIEW: só mensagem com lote aprovado.
 *  - SEMI_AUTONOMOUS: lote aprovado OU todos os segmentos da empresa já validados.
 *  - AUTONOMOUS: sim (as demais travas continuam valendo).
 */
export function modoPermiteDespacho(modo: SalesMode, aprovada: boolean, segmentosEmpresa: string[], segmentosValidados: string[]): boolean {
  switch (modo) {
    case 'DRY_RUN':
    case 'PAUSED':
      return false;
    case 'REVIEW':
      return aprovada;
    case 'SEMI_AUTONOMOUS':
      return aprovada || (segmentosEmpresa.length > 0 && segmentosEmpresa.every((s) => segmentosValidados.includes(s)));
    case 'AUTONOMOUS':
      return true;
  }
}

/** O modo permite RESERVAR (preparar)? Reservar não envia nada, mas não faz sentido em DRY_RUN/PAUSED. */
export function modoPermiteReserva(modo: SalesMode): boolean {
  return modo !== 'DRY_RUN' && modo !== 'PAUSED';
}

// ── Autorização de despacho ───────────────────────────────────────────────────────────────────

export interface EntradaAutorizacao {
  agora: Date;
  modo: SalesMode;
  canal: { ativo: boolean; politicaAprovada: boolean };
  mensagem: {
    status: MessageStatus;
    reservedBy: string | null;
    reservedUntil: Date | null;
    reservationTokenHash: string | null;
    fence: number;
    approvedAt: Date | null;
    step: number;
  };
  pedido: { executor: string; reservaToken: string; fence: number };
  jornada: { state: JourneyState; pausedReason: string | null } | null;
  segmentosEmpresa: string[];
  segmentosValidados: string[];
  /** Supressão consultada AGORA nos dois bancos. null = consulta falhou. */
  supressao: { premium: boolean | null; crm: boolean | null };
  /** Resultado do árbitro consultado AGORA. */
  arbitro: { ok: true } | { ok: false; codigo: string; motivo: string };
  /** Elegibilidade recalculada AGORA (só obrigatória no passo 0). */
  elegibilidade: { ok: boolean; motivos: string[] };
}

export type DecisaoAutorizacao =
  | { ok: true }
  | { ok: false; http: 403 | 409 | 423 | 503; codigo: string; motivo: string; cancelar: boolean; liberarReserva: boolean };

const negar = (http: 403 | 409 | 423 | 503, codigo: string, motivo: string, cancelar = false, liberarReserva = false): DecisaoAutorizacao =>
  ({ ok: false, http, codigo, motivo, cancelar, liberarReserva });

export function decidirAutorizacao(e: EntradaAutorizacao): DecisaoAutorizacao {
  const m = e.mensagem;
  // 1. Posse da reserva: executor, token, número de ordem e validade.
  if (m.status !== 'RESERVED') return negar(409, 'nao_reservada', `mensagem em ${m.status}, não RESERVED`);
  if (m.reservedBy !== e.pedido.executor) return negar(409, 'outro_executor', 'reserva pertence a outro executor');
  if (m.fence !== e.pedido.fence) return negar(409, 'fence_antigo', 'número de ordem da reserva está desatualizado');
  if (!tokenConfere(e.pedido.reservaToken, m.reservationTokenHash)) return negar(409, 'token_invalido', 'token de reserva não confere');
  if (!m.reservedUntil || m.reservedUntil.getTime() <= e.agora.getTime()) {
    return negar(409, 'reserva_vencida', 'reserva vencida; peça outra', false, true);
  }
  // 2. Modo e canal (o dono pode ter pausado depois da reserva).
  if (e.modo === 'PAUSED') return negar(423, 'pausado', 'operação pausada', false, true);
  if (!e.canal.ativo || !e.canal.politicaAprovada) return negar(423, 'canal_fechado', 'canal de prospecção desligado ou sem política aprovada', false, true);
  if (!modoPermiteDespacho(e.modo, m.approvedAt !== null, e.segmentosEmpresa, e.segmentosValidados)) {
    return negar(423, 'modo_nao_permite', `modo ${e.modo} não permite este despacho`, false, true);
  }
  // 3. Supressão nos dois bancos, consultada agora. Falha de consulta = negar.
  if (e.supressao.premium === null || e.supressao.crm === null) {
    return negar(503, 'supressao_indisponivel', 'não foi possível confirmar a supressão nos dois bancos', false, true);
  }
  if (e.supressao.premium || e.supressao.crm) return negar(403, 'suprimido', 'endereço suprimido', true);
  // 4. Jornada: resposta, compra ou pausa depois da reserva invalidam o envio.
  if (!e.jornada) return negar(409, 'sem_jornada', 'jornada não encontrada', true);
  if (e.jornada.pausedReason) return negar(423, 'jornada_pausada', `jornada pausada: ${e.jornada.pausedReason}`, false, true);
  if (!estadoPermiteProspeccao(e.jornada.state, m.step)) {
    return negar(409, 'estado_mudou', `jornada em ${e.jornada.state} não permite o passo ${m.step}`, true);
  }
  // 5. Limites e elegibilidade, recalculados agora.
  if (!e.arbitro.ok) return negar(423, e.arbitro.codigo, e.arbitro.motivo, false, true);
  if (m.step === 0 && !e.elegibilidade.ok) {
    return negar(403, 'inelegivel', `não elegível: ${e.elegibilidade.motivos.join(', ')}`, true);
  }
  return { ok: true };
}

// ── Resultado do despacho ─────────────────────────────────────────────────────────────────────

export interface EntradaResultado {
  status: MessageStatus;
  dispatchTokenHash: string | null;
  dispatchExpiresAt: Date | null;
  despachoToken: string;
  resultado: DispatchOutcome;
  /** Resultado já gravado para esta tentativa (repetição idempotente). */
  resultadoGravado: DispatchOutcome | null;
  attempts: number;
  maxTentativas: number;
  agora: Date;
}

export type DecisaoResultado =
  | { tipo: 'aplicar'; novoStatus: MessageStatus; agendarRetentativaEmMs: number | null }
  | { tipo: 'repeticao' }
  | { tipo: 'conflito'; http: 409; motivo: string }
  | { tipo: 'negado'; http: 403; motivo: string };

/** Espera antes de nova tentativa: 5 min, 30 min, 2 h. */
export const BACKOFF_RETENTATIVA_MS = [5 * 60_000, 30 * 60_000, 120 * 60_000];

/**
 * Aplica o resultado informado pelo executor.
 *  - Mesmo resultado repetido = idempotente (200, nada muda).
 *  - Resultado diferente para tentativa já encerrada = 409.
 *  - ACCEPTED vale mesmo depois do prazo do despacho: o SMTP aceitou, o fato é esse.
 *  - RETRYABLE_FAILURE agenda nova tentativa com espera crescente; esgotou = PERMANENT_FAILURE.
 */
export function decidirResultado(e: EntradaResultado): DecisaoResultado {
  if (!tokenConfere(e.despachoToken, e.dispatchTokenHash)) return { tipo: 'negado', http: 403, motivo: 'token de despacho não confere' };
  if (e.resultadoGravado) {
    return e.resultadoGravado === e.resultado
      ? { tipo: 'repeticao' }
      : { tipo: 'conflito', http: 409, motivo: `resultado já registrado como ${e.resultadoGravado}` };
  }
  // Tentativa ainda aberta: DISPATCHING, ou UNKNOWN por prazo vencido (o executor voltou e informou).
  if (e.status !== 'DISPATCHING' && e.status !== 'UNKNOWN') {
    return { tipo: 'conflito', http: 409, motivo: `mensagem em ${e.status}` };
  }
  switch (e.resultado) {
    case 'ACCEPTED':
      return { tipo: 'aplicar', novoStatus: 'ACCEPTED', agendarRetentativaEmMs: null };
    case 'PERMANENT_FAILURE':
      return { tipo: 'aplicar', novoStatus: 'PERMANENT_FAILURE', agendarRetentativaEmMs: null };
    case 'UNKNOWN':
      return { tipo: 'aplicar', novoStatus: 'UNKNOWN', agendarRetentativaEmMs: null };
    case 'RETRYABLE_FAILURE': {
      if (e.attempts >= e.maxTentativas) return { tipo: 'aplicar', novoStatus: 'PERMANENT_FAILURE', agendarRetentativaEmMs: null };
      const idx = Math.min(Math.max(e.attempts - 1, 0), BACKOFF_RETENTATIVA_MS.length - 1);
      return { tipo: 'aplicar', novoStatus: 'RETRYABLE_FAILURE', agendarRetentativaEmMs: BACKOFF_RETENTATIVA_MS[idx] };
    }
  }
}

// ── Conciliação periódica ────────────────────────────────────────────────────────────────────

export type DecisaoConciliacao =
  | { tipo: 'nada' }
  | { tipo: 'liberar_reserva' }      // RESERVED vencida sem tentativa → volta a PENDING (fence sobe)
  | { tipo: 'marcar_desconhecido' }; // DISPATCHING vencido sem resultado → UNKNOWN + exceção

export function decidirConciliacao(status: MessageStatus, reservedUntil: Date | null, dispatchExpiresAt: Date | null, agora: Date): DecisaoConciliacao {
  if (status === 'RESERVED' && reservedUntil && reservedUntil.getTime() <= agora.getTime()) return { tipo: 'liberar_reserva' };
  if (status === 'DISPATCHING' && dispatchExpiresAt && dispatchExpiresAt.getTime() <= agora.getTime()) return { tipo: 'marcar_desconhecido' };
  return { tipo: 'nada' };
}

/** Status de onde uma mensagem pode ser reservada (RETRYABLE só depois do backoff). */
export function podeSerReservada(status: MessageStatus, nextRetryAt: Date | null, agora: Date): boolean {
  if (status === 'PENDING') return true;
  if (status === 'RETRYABLE_FAILURE') return !nextRetryAt || nextRetryAt.getTime() <= agora.getTime();
  return false;
}
