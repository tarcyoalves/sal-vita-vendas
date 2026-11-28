// Ações com efeito externo usadas pelo painel, pelas rotas do Hermes e pelo ciclo:
// mudar o modo (PAUSED/DRY_RUN revogam reservas; revogarReservas também serve ao canal) e suprimir um contato (propaga pelos dois bancos).
import { eq, sql } from 'drizzle-orm';
import { ordersDb } from '../../db/ordersDb';
import { salesJourneys } from '../../db/schema';
import { suppressEmailGlobal } from '../../routers/unsubscribe';
import { safeErr } from '../logSafe';
import { normalizarEmail, type SalesMode } from '../../../shared/sales';
import { getSalesSetting, setSalesSetting } from './settings';
import { registrarExcecao } from './excecoes';
import { aplicarEvento, atualizarJornada, cancelarPendentes, liberarReservas, registrarAuditoria } from './consultas';

/**
 * Revoga TODAS as reservas (RESERVED → PENDING, fence+1, tokens apagados): uma autorização com a
 * reserva antiga perde (`409`). Chame DEPOIS de gravar a configuração que fecha o envio. Usada na
 * troca de modo para DRY_RUN/PAUSED e — pelo router do painel — quando o canal é desligado ou perde
 * a política aprovada. Mensagens em DISPATCHING não são recolhíveis (só contadas).
 */
export async function revogarReservas(motivo: string, por = 'sistema'): Promise<{ reservasRevogadas: number; despachando: number }> {
  const reservasRevogadas = (await liberarReservas()).length;
  const r = await ordersDb.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM sales_messages WHERE status = 'DISPATCHING'`);
  const despachando = r.rows[0]?.n ?? 0;
  if (despachando > 0) {
    console.warn(`[sales] ${motivo}: ${despachando} mensagem(ns) em DISPATCHING já autorizadas não podem ser recolhidas; o resultado delas ainda será registrado`);
  }
  if (reservasRevogadas > 0 || despachando > 0) {
    await registrarAuditoria('sales_reservas_revogadas', por, { tipo: 'sales_messages' }, { motivo, reservasRevogadas, despachandoNaoRecolhiveis: despachando });
  }
  return { reservasRevogadas, despachando };
}

/** Modos em que nada sai: trocar para eles revoga as reservas. */
export function modoFechaEnvio(modo: SalesMode): boolean {
  return modo === 'PAUSED' || modo === 'DRY_RUN';
}

export async function definirModoInterno(modo: SalesMode, por: string, motivo?: string): Promise<{ modo: SalesMode; reservasRevogadas: number }> {
  const anterior = await getSalesSetting('modo');
  // Grava o modo ANTES de revogar: reservas novas param de sair já a partir daqui.
  await setSalesSetting('modo', modo, por);
  let reservasRevogadas = 0;
  let despachando = 0;
  if (modoFechaEnvio(modo)) {
    ({ reservasRevogadas, despachando } = await revogarReservas(`modo ${modo}`, por));
  }
  await registrarAuditoria('sales_modo_alterado', por, { tipo: 'sales_settings' }, {
    de: anterior, para: modo, motivo: motivo ?? null, reservasRevogadas,
    despachandoNaoRecolhiveis: despachando,
    ...(despachando > 0 ? { nota: 'mensagens em DISPATCHING já foram autorizadas e podem ter sido entregues ao SMTP; não há como recolhê-las' } : {}),
  });
  return { modo, reservasRevogadas };
}

export type RazaoSupressao = 'unsubscribe' | 'bounce' | 'complaint' | 'manual';

/**
 * Supressão de um e-mail: `suppressEmailGlobal` (três listas, dois bancos), cancela as mensagens
 * ainda não despachadas e leva a jornada a SUPPRESSED. Falha na lista principal = a jornada também
 * fica PAUSADA (`supressao_incompleta`) e abre uma exceção crítica.
 */
export async function suprimirEmail(email: string, razao: RazaoSupressao, detalhe: string, por: string): Promise<{ ok: boolean; falhas: string[] }> {
  const e = normalizarEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, falhas: ['email_invalido'] };
  const falhas: string[] = [];
  let principalFalhou = false;
  try {
    const r = await suppressEmailGlobal(e, razao);
    falhas.push(...r.failures);
    principalFalhou = r.primaryFailed;
  } catch (err) {
    console.error('[sales] suppressEmailGlobal lançou:', safeErr(err));
    falhas.push('suppressEmailGlobal');
    principalFalhou = true;
  }

  let canceladas = 0;
  try {
    canceladas = await cancelarPendentes({ email: e }, `suprimido:${razao}`);
  } catch (err) {
    console.error('[sales] cancelar mensagens do suprimido falhou:', safeErr(err));
    falhas.push('sales.cancelar_mensagens');
  }

  let jornadaOk = true;
  const [j] = await ordersDb.select({ id: salesJourneys.id }).from(salesJourneys).where(eq(salesJourneys.email, e)).limit(1);
  if (j) {
    const r = await aplicarEvento(j.id, 'SUPRIMIR', (atual) => ({
      closedReason: `suprimido:${razao}`,
      lastEventAt: new Date(),
      pausedReason: principalFalhou ? 'supressao_incompleta' : atual.pausedReason,
    }));
    if (!r.ok) {
      jornadaOk = false;
      falhas.push(`sales.jornada:${r.motivo}`);
      // Última defesa: pausar (pausa não regride estado nenhum).
      await atualizarJornada(j.id, () => ({ pausedReason: 'supressao_incompleta' })).catch(() => undefined);
    }
  }

  if (principalFalhou) {
    await registrarExcecao({
      idempotencyKey: `supressao_falhou:${e}:${new Date().toISOString().slice(0, 13)}`,
      kind: 'supressao_inconsistente',
      severity: 'critica',
      title: 'Supressão não gravada nas listas principais',
      detail: `A supressão (${razao}) não foi gravada em: ${falhas.join(', ')}. A jornada ficou pausada. Repita a supressão.`,
      evidence: { razao, detalhe, falhas },
      createdBy: por,
    }).catch((err) => console.error('[sales] exceção de supressão falhou:', safeErr(err)));
  }

  await registrarAuditoria('sales_contato_suprimido', por, { tipo: 'sales_journey', id: j?.id ?? null }, {
    razao, detalhe, mensagensCanceladas: canceladas, falhas, principalFalhou,
  });
  return { ok: !principalFalhou && jornadaOk, falhas };
}
