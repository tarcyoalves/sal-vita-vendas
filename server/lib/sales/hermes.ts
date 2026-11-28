// Operações das rotas do Hermes (server/salesRoutes.ts). Cada função devolve `{ http, corpo }`;
// a rota só autentica, valida e responde. Contrato: docs/CONTRATO-HERMES-VENDAS.md.
//
// Garantias (V3.1, 16.2/16.3):
//  - RESERVAR é um único UPDATE com FOR UPDATE SKIP LOCKED: dois executores nunca pegam a mesma
//    mensagem. Não devolve conteúdo.
//  - AUTORIZAR revalida tudo AGORA (supressão nos dois bancos, árbitro, elegibilidade, modo, canal,
//    jornada) e, num único comando, passa a DISPATCHING com fence conferido E grava a tentativa
//    ANTES de responder. Só uma autorização por fence vence.
//  - RESULTADO é idempotente; UNKNOWN nunca é reenviado sozinho.
import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { ordersDb } from '../../db/ordersDb';
import { salesEvents, salesExceptions, salesHeartbeats, salesJourneys, salesMessageAttempts, salesMessages } from '../../db/schema';
import { safeErr } from '../logSafe';
import type {
  autorizarBodySchema, eventoCaixaBodySchema, heartbeatBodySchema, propostaBodySchema, reservarBodySchema, resultadoBodySchema,
} from '../../../shared/sales';
import { getSalesSettings } from './settings';
import { arbitrar, type DecisaoArbitro } from './arbitro';
import { avaliarElegibilidade } from './elegibilidade';
import { transicionar } from './estados';
import { decidirAutorizacao, decidirResultado, hashToken, novoToken } from './despacho';
import { hashConteudo } from './mensagem';
import { removerDadosPessoais } from './conteudo';
import { registrarExcecao } from './excecoes';
import { cabecalhosDescadastro, linkDescadastroNoCorpo } from './descadastro';
import {
  estadoDaJornada, filtrarReservaveis, montarEntradaElegibilidade, motivoSemReserva, planejarEvento, proximaAcaoAposEnvio,
  resultadoGravadoDe, statusDaMensagem, totalPassos, type AcaoEvento,
} from './operacoesPuro';
import {
  atualizarJornada, aplicarEvento, cancelarPendentes, carregarContextos, compartilhamento, consultarSupressao, contagensDoDia,
  enviadasParaEmpresa, iso, jornadasJaProspectadas, listaSql, pausarJornadaBanco, suprimidosCrm, suprimidosPremium,
  ultimoEnvioMarketing, type LinhaJornada,
} from './consultas';
import { definirModoInterno, suprimirEmail } from './acoes';

export interface RespostaRota { http: number; corpo: unknown }
const ok = (corpo: unknown): RespostaRota => ({ http: 200, corpo });
const erro = (http: number, codigo: string, motivo: string): RespostaRota => ({ http, corpo: { codigo, motivo } });

type LinhaMensagem = typeof salesMessages.$inferSelect;

// ── GET /api/sales/modo ──────────────────────────────────────────────────────────────────────

export async function obterModo(): Promise<RespostaRota> {
  const s = await getSalesSettings();
  return ok({ modo: s.modo, canal: { ativo: s.canal.ativo, politicaAprovada: s.canal.politicaAprovada }, agenteAtivo: s.agente.ativo, limites: s.limites });
}

// ── POST /api/sales/fila/reservar ────────────────────────────────────────────────────────────

export async function reservar(body: z.infer<typeof reservarBodySchema>): Promise<RespostaRota> {
  const agora = new Date();
  const s = await getSalesSettings();
  const fechado = motivoSemReserva(s.modo, s.canal);
  if (fechado) return ok({ mensagens: [], motivo: fechado });

  const { enviosHoje } = await contagensDoDia(agora);
  const restante = s.limites.enviosDia - enviosHoje;
  if (restante <= 0) return ok({ mensagens: [], motivo: `teto diário de ${s.limites.enviosDia} envios atingido` });
  const n = Math.min(body.max, restante);

  // Pré-seleção sem trava (o UPDATE abaixo confere tudo de novo com a linha travada). Já filtra
  // jornada e aprovação, para rascunhos antigos não aprovados não ocuparem a janela da fila.
  const validados = JSON.stringify(s.segmentosValidados.segmentos);
  const aprovacaoSql = s.modo === 'REVIEW' ? sql`${salesMessages.approvedAt} IS NOT NULL`
    : s.modo === 'SEMI_AUTONOMOUS'
      ? sql`(${salesMessages.approvedAt} IS NOT NULL OR (jsonb_typeof(${salesJourneys.segments}) = 'array'
             AND jsonb_array_length(${salesJourneys.segments}) > 0 AND ${salesJourneys.segments} <@ ${validados}::jsonb))`
      : sql`TRUE`;
  const cands = await ordersDb.select({
    id: salesMessages.id, status: salesMessages.status, nextRetryAt: salesMessages.nextRetryAt, approvedAt: salesMessages.approvedAt,
    step: salesMessages.step, email: salesMessages.toEmail,
    journeyState: salesJourneys.state, pausedReason: salesJourneys.pausedReason, segments: salesJourneys.segments,
  }).from(salesMessages)
    .innerJoin(salesJourneys, eq(salesJourneys.id, salesMessages.journeyId))
    .where(and(
      or(
        eq(salesMessages.status, 'PENDING'),
        and(eq(salesMessages.status, 'RETRYABLE_FAILURE'), or(isNull(salesMessages.nextRetryAt), lte(salesMessages.nextRetryAt, agora))),
      ),
      isNull(salesJourneys.pausedReason),
      sql`${salesJourneys.state} = CASE WHEN ${salesMessages.step} = 0 THEN 'CONTACT_REVIEW' ELSE 'CONTACTED' END`,
      aprovacaoSql,
    ))
    .orderBy(asc(salesMessages.id))
    .limit(n * 5 + 20);
  if (cands.length === 0) return ok({ mensagens: [] });

  const emails = [...new Set(cands.map((c) => c.email.toLowerCase()))];
  const [crm, premium] = await Promise.all([suprimidosCrm(emails), suprimidosPremium(emails)]);
  const suprimidos = crm && premium ? new Set([...crm, ...premium]) : null;
  const f = filtrarReservaveis(cands.flatMap((c) => {
    const status = statusDaMensagem(c.status);
    if (!status) return [];
    return [{
      id: c.id, status, nextRetryAt: c.nextRetryAt, approvedAt: c.approvedAt, step: c.step, email: c.email,
      journeyState: estadoDaJornada(c.journeyState), journeyPausada: !!c.pausedReason,
      segmentos: Array.isArray(c.segments) ? c.segments : [],
    }];
  }), { modo: s.modo, segmentosValidados: s.segmentosValidados.segmentos, agora, suprimidos });
  // Falha na consulta de supressão = NADA é reservado.
  if (f.motivo) return ok({ mensagens: [], motivo: f.motivo });
  if (f.suprimidas.length) {
    await ordersDb.execute(sql`
      UPDATE sales_messages SET status = 'CANCELLED', cancelled_reason = 'suprimido', fence = fence + 1, updated_at = now()
      WHERE id IN (${listaSql(f.suprimidas)}) AND status IN ('PENDING', 'RETRYABLE_FAILURE')
    `).catch((err) => console.error('[sales] cancelar suprimidas falhou:', safeErr(err)));
  }
  if (f.ids.length === 0) return ok({ mensagens: [] });

  const tokens = Array.from({ length: n }, () => novoToken());
  const porHash = new Map(tokens.map((t) => [hashToken(t), t]));
  const ate = new Date(agora.getTime() + s.limites.reservaMinutos * 60_000);
  const exigeAprovacao = s.modo === 'REVIEW';
  // UM comando: trava (SKIP LOCKED), confere de novo status, jornada, aprovação e supressão do Premium,
  // e grava a reserva com fence+1 e um token novo por mensagem (só o hash fica no banco).
  const r = await ordersDb.execute<{ id: number; fence: number; hash: string }>(sql`
    WITH alvo AS MATERIALIZED (
      SELECT m.id FROM sales_messages m
      JOIN sales_journeys j ON j.id = m.journey_id
      WHERE m.id IN (${listaSql(f.ids)})
        AND (m.status = 'PENDING' OR (m.status = 'RETRYABLE_FAILURE' AND (m.next_retry_at IS NULL OR m.next_retry_at <= ${iso(agora)}::timestamp)))
        AND j.paused_reason IS NULL
        AND j.state = CASE WHEN m.step = 0 THEN 'CONTACT_REVIEW' ELSE 'CONTACTED' END
        ${exigeAprovacao ? sql`AND m.approved_at IS NOT NULL` : sql``}
        AND NOT EXISTS (SELECT 1 FROM email_suppressions s WHERE lower(s.email) = lower(m.to_email))
        AND NOT EXISTS (SELECT 1 FROM suppression_list l
                        WHERE (l.email IS NOT NULL AND lower(l.email) = lower(m.to_email))
                           OR (l.domain IS NOT NULL AND lower(l.domain) = split_part(lower(m.to_email), '@', 2)))
      ORDER BY m.id
      LIMIT ${n}
      FOR UPDATE OF m SKIP LOCKED
    ), numerado AS (
      SELECT id, row_number() OVER (ORDER BY id) AS rn FROM alvo
    ), tok AS (
      SELECT t.hash, t.rn FROM unnest(ARRAY[${listaSql([...porHash.keys()])}]::text[]) WITH ORDINALITY AS t(hash, rn)
    )
    UPDATE sales_messages m SET
      status = 'RESERVED', reserved_by = ${body.executor}, reserved_until = ${iso(ate)}::timestamp,
      reservation_token_hash = tok.hash, fence = m.fence + 1, attempts = m.attempts + 1, updated_at = now()
    FROM numerado JOIN tok ON tok.rn = numerado.rn
    WHERE m.id = numerado.id
    RETURNING m.id, m.fence, m.reservation_token_hash AS hash
  `);
  const mensagens = r.rows.flatMap((row) => {
    const reservaToken = porHash.get(row.hash);
    return reservaToken ? [{ messageId: row.id, fence: row.fence, reservaToken, reservadaAte: ate.toISOString() }] : [];
  });
  return ok({ mensagens });
}

// ── POST /api/sales/envio/:id/autorizar ──────────────────────────────────────────────────────

async function arbitroAgora(m: LinhaMensagem, agora: Date, limites: Awaited<ReturnType<typeof getSalesSettings>>['limites']): Promise<DecisaoArbitro> {
  try {
    const [cont, enviadas, ultimo] = await Promise.all([contagensDoDia(agora), enviadasParaEmpresa(m.companyId), ultimoEnvioMarketing(m.toEmail)]);
    if (ultimo === null) return { ok: false, codigo: 'historico_indisponivel', motivo: 'não foi possível consultar o último envio a este endereço' };
    return arbitrar({
      agora, limites, ultimoEnvioMarketingEm: ultimo.em, enviosHoje: cont.enviosHoje, novasHoje: cont.novasHoje,
      ehPrimeiroContato: m.step === 0, enviadasParaEmpresa: enviadas,
    });
  } catch (err) {
    console.error('[sales] árbitro: consulta falhou:', safeErr(err));
    return { ok: false, codigo: 'contagem_indisponivel', motivo: 'não foi possível contar os envios de hoje' };
  }
}

async function elegibilidadeAgora(m: LinhaMensagem, j: LinhaJornada | null, s: Awaited<ReturnType<typeof getSalesSettings>>, supressao: { premium: boolean | null; crm: boolean | null }): Promise<{ ok: boolean; motivos: string[] }> {
  if (m.step !== 0) return { ok: true, motivos: [] }; // só obrigatória no passo 0 (decidirAutorizacao)
  if (!j) return { ok: false, motivos: ['sem_jornada'] };
  const [ctxs, compart, prosp] = await Promise.all([carregarContextos([j]), compartilhamento([j.email]), jornadasJaProspectadas([j.id], m.id)]);
  const c = ctxs.get(j.id);
  if (!c) return { ok: false, motivos: ['contexto_ausente'] };
  const r = avaliarElegibilidade(montarEntradaElegibilidade(c, {
    compartilhadoPor: compart.get(j.email) ?? 1, supressao, passo: 0, jaProspectado: prosp.has(j.id), canal: s.canal, ufsDaOnda: s.ondas.ufs,
  }));
  return { ok: r.ok, motivos: r.motivos };
}

export async function autorizar(id: number, body: z.infer<typeof autorizarBodySchema>): Promise<RespostaRota> {
  const agora = new Date();
  const [m] = await ordersDb.select().from(salesMessages).where(eq(salesMessages.id, id)).limit(1);
  if (!m) return erro(404, 'nao_encontrada', 'mensagem não encontrada');
  const status = statusDaMensagem(m.status);
  if (!status) return erro(409, 'status_desconhecido', `status ${m.status}`);
  const [j] = await ordersDb.select().from(salesJourneys).where(eq(salesJourneys.id, m.journeyId)).limit(1);
  const s = await getSalesSettings();
  const supressao = await consultarSupressao(m.toEmail);
  const [arb, eleg] = await Promise.all([arbitroAgora(m, agora, s.limites), elegibilidadeAgora(m, j ?? null, s, supressao)]);
  const estado = j ? estadoDaJornada(j.state) : null;

  const d = decidirAutorizacao({
    agora, modo: s.modo, canal: { ativo: s.canal.ativo, politicaAprovada: s.canal.politicaAprovada },
    mensagem: {
      status, reservedBy: m.reservedBy, reservedUntil: m.reservedUntil, reservationTokenHash: m.reservationTokenHash,
      fence: m.fence, approvedAt: m.approvedAt, step: m.step,
    },
    pedido: { executor: body.executor, reservaToken: body.reservaToken, fence: body.fence },
    jornada: j && estado ? { state: estado, pausedReason: j.pausedReason } : null,
    segmentosEmpresa: Array.isArray(j?.segments) ? j.segments : [],
    segmentosValidados: s.segmentosValidados.segmentos,
    supressao,
    arbitro: arb,
    elegibilidade: eleg,
  });
  if (!d.ok) {
    if (d.cancelar) await cancelarReservada(m, `${d.codigo}: ${d.motivo}`);
    else if (d.liberarReserva) await liberarReservada(m);
    return erro(d.http, d.codigo, d.motivo);
  }

  // Travas finais, de integridade: conteúdo igual ao gravado e descadastro presente.
  if (hashConteudo(m.subject, m.bodyText) !== m.contentHash) {
    await cancelarReservada(m, 'conteudo_alterado');
    return erro(409, 'conteudo_alterado', 'o conteúdo não confere com o hash gravado');
  }
  const cabecalhos = cabecalhosDescadastro(linkDescadastroNoCorpo(m.bodyText), s.canal.remetenteEmail);
  if (!cabecalhos) {
    await liberarReservada(m);
    return erro(423, 'sem_descadastro', 'sem link nem caixa para o descadastro (List-Unsubscribe)');
  }

  const despachoToken = novoToken();
  const expiraEm = new Date(agora.getTime() + s.limites.despachoSegundos * 1000);
  // UM comando: RESERVED → DISPATCHING só com o fence e o token desta reserva, e a tentativa gravada.
  const r = await ordersDb.execute<{ id: number }>(sql`
    WITH m AS (
      UPDATE sales_messages SET status = 'DISPATCHING', dispatch_token_hash = ${hashToken(despachoToken)},
        dispatch_expires_at = ${iso(expiraEm)}::timestamp, last_attempt_at = ${iso(agora)}::timestamp,
        reservation_token_hash = NULL, updated_at = now()
      WHERE id = ${m.id} AND status = 'RESERVED' AND fence = ${body.fence} AND reserved_by = ${body.executor}
        AND reservation_token_hash = ${hashToken(body.reservaToken)} AND reserved_until > ${iso(agora)}::timestamp
      RETURNING id, fence
    )
    INSERT INTO sales_message_attempts (message_id, fence, executor, started_at)
    SELECT id, fence, ${body.executor}, ${iso(agora)}::timestamp FROM m
    RETURNING message_id AS id
  `);
  if (r.rows.length === 0) return erro(409, 'corrida', 'a reserva mudou durante a autorização; não envie');
  return ok({
    despachoToken,
    expiraEm: expiraEm.toISOString(),
    para: m.toEmail,
    assunto: m.subject,
    corpo: m.bodyText,
    messageIdHeader: m.messageIdHeader,
    contentHash: m.contentHash,
    cabecalhos,
  });
}

async function cancelarReservada(m: LinhaMensagem, motivo: string): Promise<void> {
  await ordersDb.execute(sql`
    UPDATE sales_messages SET status = 'CANCELLED', cancelled_reason = ${motivo.slice(0, 300)}, fence = fence + 1,
      reserved_by = NULL, reserved_until = NULL, reservation_token_hash = NULL, updated_at = now()
    WHERE id = ${m.id} AND status = 'RESERVED' AND fence = ${m.fence}
  `);
}

async function liberarReservada(m: LinhaMensagem): Promise<void> {
  await ordersDb.execute(sql`
    UPDATE sales_messages SET status = 'PENDING', fence = fence + 1, reserved_by = NULL, reserved_until = NULL,
      reservation_token_hash = NULL, updated_at = now()
    WHERE id = ${m.id} AND status = 'RESERVED' AND fence = ${m.fence}
  `);
}

// ── POST /api/sales/envio/:id/resultado ──────────────────────────────────────────────────────

export async function resultado(id: number, body: z.infer<typeof resultadoBodySchema>): Promise<RespostaRota> {
  const agora = new Date();
  const [m] = await ordersDb.select().from(salesMessages).where(eq(salesMessages.id, id)).limit(1);
  if (!m) return erro(404, 'nao_encontrada', 'mensagem não encontrada');
  const status = statusDaMensagem(m.status);
  if (!status) return erro(409, 'status_desconhecido', `status ${m.status}`);
  const [tentativa] = await ordersDb.select().from(salesMessageAttempts)
    .where(eq(salesMessageAttempts.messageId, m.id)).orderBy(desc(salesMessageAttempts.id)).limit(1);
  if (tentativa && tentativa.executor !== body.executor) return erro(403, 'outro_executor', 'a tentativa pertence a outro executor');
  const s = await getSalesSettings();
  const d = decidirResultado({
    status, dispatchTokenHash: m.dispatchTokenHash, dispatchExpiresAt: m.dispatchExpiresAt, despachoToken: body.despachoToken,
    resultado: body.resultado, resultadoGravado: resultadoGravadoDe(tentativa?.outcome), attempts: m.attempts,
    maxTentativas: s.limites.maxTentativas, agora,
  });
  if (d.tipo === 'negado') return erro(d.http, 'token_invalido', d.motivo);
  if (d.tipo === 'repeticao') return ok({ repetido: true });
  if (d.tipo === 'conflito') return erro(d.http, 'conflito', d.motivo);
  if (!tentativa) return erro(409, 'sem_tentativa', 'não há tentativa aberta para esta mensagem');

  const resposta = body.respostaSmtp?.slice(0, 300) ?? null;
  const novo = d.novoStatus;
  const proxTentativa = d.agendarRetentativaEmMs !== null ? new Date(agora.getTime() + d.agendarRetentativaEmMs) : null;
  const falhou = novo === 'PERMANENT_FAILURE' || novo === 'RETRYABLE_FAILURE' || novo === 'UNKNOWN';
  const r = await ordersDb.execute<{ m: number; a: number }>(sql`
    WITH m AS (
      UPDATE sales_messages SET status = ${novo},
        accepted_at = ${novo === 'ACCEPTED' ? iso(agora) : null}::timestamp,
        failed_at = ${novo === 'PERMANENT_FAILURE' ? iso(agora) : null}::timestamp,
        next_retry_at = ${proxTentativa ? iso(proxTentativa) : null}::timestamp,
        last_error = ${falhou ? resposta ?? body.resultado : null}::text,
        updated_at = now()
      WHERE id = ${m.id} AND status IN ('DISPATCHING', 'UNKNOWN') AND dispatch_token_hash = ${hashToken(body.despachoToken)}
      RETURNING id
    ), a AS (
      UPDATE sales_message_attempts SET outcome = ${body.resultado}, smtp_response = ${resposta}::text, finished_at = ${iso(agora)}::timestamp
      WHERE id = ${tentativa.id} AND (outcome IS NULL OR outcome = 'EXPIRED') AND EXISTS (SELECT 1 FROM m)
      RETURNING id
    )
    SELECT (SELECT count(*) FROM m)::int AS m, (SELECT count(*) FROM a)::int AS a
  `);
  if ((r.rows[0]?.m ?? 0) === 0) {
    // Outra chamada gravou antes: repetição idêntica = 200; diferente = 409.
    const [t2] = await ordersDb.select({ outcome: salesMessageAttempts.outcome }).from(salesMessageAttempts).where(eq(salesMessageAttempts.id, tentativa.id)).limit(1);
    return t2?.outcome === body.resultado ? ok({ repetido: true }) : erro(409, 'conflito', `resultado já registrado como ${t2?.outcome ?? '?'}`);
  }
  if (novo === 'UNKNOWN' && status === 'DISPATCHING') {
    // O próprio executor não sabe se saiu: mesma exceção (mesma chave) da conciliação por prazo.
    await registrarExcecao({
      idempotencyKey: `desconhecido:${m.id}:${tentativa.fence}`,
      kind: 'envio_desconhecido',
      severity: 'alta',
      title: `Envio sem confirmação (mensagem #${m.id}, passo ${m.step})`,
      detail: 'O executor informou que não sabe se a mensagem saiu. Ela NUNCA é reenviada sozinha: confira na caixa de envio e concilie no painel.',
      evidence: { messageId: m.id, fence: tentativa.fence, respostaSmtp: resposta },
      companyId: m.companyId,
      contactId: m.contactId,
      createdBy: `hermes:${body.executor}`,
    }).catch((err) => console.error('[sales] exceção de desconhecido falhou:', safeErr(err)));
  }
  if (status === 'UNKNOWN' && novo !== 'UNKNOWN') {
    // O executor voltou e informou um resultado conhecido: a exceção de "envio desconhecido" deixa de valer.
    await ordersDb.update(salesExceptions).set({ status: 'resolved', resolvedBy: `hermes:${body.executor}`, resolvedAt: agora, resolution: `executor informou ${body.resultado}` })
      .where(and(eq(salesExceptions.idempotencyKey, `desconhecido:${m.id}:${tentativa.fence}`), eq(salesExceptions.status, 'open')))
      .catch((err) => console.error('[sales] resolver exceção de desconhecido falhou:', safeErr(err)));
  }
  if (novo === 'ACCEPTED') await efeitosDoAceite(m, agora, s);
  return ok({ ok: true, status: novo, proximaTentativaEm: proxTentativa ? proxTentativa.toISOString() : null });
}

/**
 * Efeitos de um envio aceito na jornada: passo 0 → PRIMEIRO_ENVIO; sempre `last_contacted_at`;
 * se a jornada está CONTACTED, `cadence_step` (nunca regride) e `next_action_at`. Evento fora de
 * ordem (ex.: a resposta chegou antes do resultado) NÃO regride o estado.
 */
export async function efeitosDoAceite(m: Pick<LinhaMensagem, 'journeyId' | 'step'>, aceitaEm: Date, s: Awaited<ReturnType<typeof getSalesSettings>>): Promise<void> {
  const total = totalPassos(s.limites, s.modeloEmail);
  const prox = proximaAcaoAposEnvio(m.step, aceitaEm, s.limites, total);
  const r = await atualizarJornada(m.journeyId, (j) => {
    const atual = estadoDaJornada(j.state);
    if (!atual) return null;
    let estado = atual;
    if (m.step === 0) {
      const t = transicionar(atual, 'PRIMEIRO_ENVIO');
      if (t.ok) estado = t.para;
    }
    if (estado !== 'CONTACTED') return { lastContactedAt: aceitaEm };
    return { state: estado, lastContactedAt: aceitaEm, cadenceStep: Math.max(j.cadenceStep, m.step), nextActionAt: prox.em };
  });
  if (!r.ok) console.warn(`[sales] efeitos do aceite na jornada ${m.journeyId}: ${r.motivo}`);
}

// ── POST /api/sales/caixa/eventos ────────────────────────────────────────────────────────────

export async function eventoCaixa(body: z.infer<typeof eventoCaixaBodySchema>): Promise<RespostaRota> {
  const agora = new Date();
  const email = body.email;
  let [j] = await ordersDb.select().from(salesJourneys).where(eq(salesJourneys.email, email)).limit(1);
  let messageId: number | null = null;
  if (body.emRespostaA) {
    const [mm] = await ordersDb.select({ id: salesMessages.id, journeyId: salesMessages.journeyId }).from(salesMessages)
      .where(eq(salesMessages.messageIdHeader, body.emRespostaA)).limit(1);
    messageId = mm?.id ?? null;
    if (!j && mm) [j] = await ordersDb.select().from(salesJourneys).where(eq(salesJourneys.id, mm.journeyId)).limit(1);
  }

  const inserido = await ordersDb.insert(salesEvents).values({
    idempotencyKey: body.idempotencyKey, source: 'hermes', type: body.tipo, email, contactId: j?.contactId ?? null, messageId,
    payload: { classificacao: body.classificacao ?? null, trecho: body.trecho ? removerDadosPessoais(body.trecho) : null, emRespostaA: body.emRespostaA ?? null, recebidoEm: body.recebidoEm ?? null },
    result: 'processando',
  }).onConflictDoNothing({ target: salesEvents.idempotencyKey }).returning({ id: salesEvents.id });

  let eventoId = inserido[0]?.id ?? null;
  if (eventoId === null) {
    // Já existe. Só reprocessa se a tentativa anterior FALHOU (ou travou há mais de 2 min sem terminar).
    const retomado = await ordersDb.execute<{ id: number }>(sql`
      UPDATE sales_events SET result = 'reprocessando'
      WHERE idempotency_key = ${body.idempotencyKey} AND processed_at IS NULL
        AND (result LIKE 'falhou%' OR received_at < ${iso(new Date(agora.getTime() - 120_000))}::timestamp)
      RETURNING id
    `);
    eventoId = retomado.rows[0]?.id ?? null;
    if (eventoId === null) return ok({ duplicado: true });
  }

  const plano = planejarEvento({ tipo: body.tipo, classificacao: body.classificacao ?? null, temJornada: !!j, duplicado: false });
  if (plano.tipo !== 'aplicar' || !j) {
    await marcarEvento(eventoId, 'ignorado:email_sem_jornada');
    return ok({ ok: true, ignorado: true });
  }

  const falhas: string[] = [];
  for (const acao of plano.acoes) {
    try {
      const f = await executarAcao(acao, j, body, eventoId);
      if (f) falhas.push(f);
    } catch (err) {
      console.error(`[sales] evento ${body.tipo}: ação ${acao.tipo} falhou:`, safeErr(err));
      falhas.push(acao.tipo);
    }
  }
  await atualizarJornada(j.id, () => ({ lastEventAt: agora })).catch(() => undefined);
  await marcarEvento(eventoId, falhas.length ? `falhou: ${falhas.join(', ')}` : 'ok', falhas.length === 0);
  return { http: falhas.length ? 500 : 200, corpo: { ok: falhas.length === 0, efeitos: plano.acoes.map((a) => a.tipo), falhas } };
}

async function marcarEvento(id: number, resultadoTexto: string, processado = true): Promise<void> {
  await ordersDb.update(salesEvents).set({ result: resultadoTexto.slice(0, 300), processedAt: processado ? new Date() : null }).where(eq(salesEvents.id, id));
}

/** Executa uma ação do plano. Devolve o nome da falha, ou null. Todas são idempotentes (reprocessar não duplica). */
async function executarAcao(acao: AcaoEvento, j: LinhaJornada, body: z.infer<typeof eventoCaixaBodySchema>, eventoId: number): Promise<string | null> {
  switch (acao.tipo) {
    case 'transicao': {
      const r = await aplicarEvento(j.id, acao.evento, () => (acao.evento === 'RESPOSTA_NEGATIVA' ? { closedReason: `resposta:${body.classificacao ?? 'negativa'}`, nextActionAt: null } : { nextActionAt: null }));
      if (!r.ok && r.motivo === 'recusada' && acao.aoRecusar === 'pausar') await pausarJornadaBanco(j.id, 'resposta_humana');
      if (!r.ok && r.motivo === 'corrida') return 'transicao:corrida';
      return null;
    }
    case 'cancelar_pendentes':
      await cancelarPendentes({ journeyId: j.id }, acao.motivo);
      return null;
    case 'pausar': {
      const r = await pausarJornadaBanco(j.id, acao.motivo);
      return !r.ok && r.motivo === 'corrida' ? 'pausar:corrida' : null;
    }
    case 'excecao': {
      const trecho = body.trecho ? removerDadosPessoais(body.trecho) : '';
      const classe = body.classificacao ?? 'sem classificação';
      const titulo = acao.kind === 'reclamacao' ? `Reclamação de ${body.email}`
        : acao.kind === 'resposta_humana' ? `Resposta de ${body.email} (${classe})`
          : `Resposta automática de ${body.email}`;
      await registrarExcecao({
        idempotencyKey: `${acao.kind}:${body.idempotencyKey}`,
        kind: acao.kind,
        severity: acao.severity,
        title: titulo,
        detail: trecho || undefined,
        evidence: { eventoId, tipo: body.tipo, classificacao: body.classificacao ?? null, emRespostaA: body.emRespostaA ?? null },
        companyId: j.companyId,
        contactId: j.contactId,
        createdBy: 'hermes:caixa',
        criarTarefaCrm: acao.criarTarefaCrm ? {
          titulo,
          descricao: [`E-mail: ${body.email}`, `Tipo: ${body.tipo}`, `Classificação: ${classe}`, trecho ? `Trecho: ${trecho}` : ''].filter(Boolean).join('\n'),
          prioridade: acao.severity === 'critica' || acao.severity === 'alta' ? 'high' : 'medium',
        } : null,
      });
      return null;
    }
    case 'suprimir': {
      const r = await suprimirEmail(body.email, acao.reason, `evento:${body.tipo}`, 'hermes:caixa');
      return r.ok ? null : `suprimir:${r.falhas.join('|')}`;
    }
    case 'pausar_operacao':
      await definirModoInterno('PAUSED', 'hermes:caixa', acao.motivo);
      return null;
  }
}

// ── POST /api/sales/propostas ────────────────────────────────────────────────────────────────

export async function proposta(body: z.infer<typeof propostaBodySchema>): Promise<RespostaRota> {
  const r = await registrarExcecao({
    idempotencyKey: `proposta:${body.idempotencyKey}`,
    kind: 'proposta_hermes',
    severity: body.severidade,
    title: body.titulo,
    detail: body.detalhe,
    evidence: body.evidencia,
    proposedAction: { decisaoSugerida: body.decisaoSugerida, skill: body.skill },
    createdBy: `hermes:${body.skill}`,
  });
  return ok({ ok: true, id: r.id, duplicada: !r.nova });
}

// ── POST /api/sales/heartbeat ────────────────────────────────────────────────────────────────

export async function heartbeat(body: z.infer<typeof heartbeatBodySchema>): Promise<RespostaRota> {
  const agora = new Date();
  const payload = { ciclo: body.ciclo ?? null, contagens: body.contagens ?? null };
  await ordersDb.insert(salesHeartbeats).values({ executor: body.executor, version: body.versao, lastSeenAt: agora, payload })
    .onConflictDoUpdate({ target: salesHeartbeats.executor, set: { version: body.versao, lastSeenAt: agora, payload } });
  const s = await getSalesSettings();
  return ok({ ok: true, modo: s.modo, canalAtivo: s.canal.ativo && s.canal.politicaAprovada });
}

