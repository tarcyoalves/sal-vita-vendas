// Operações do Sales AI usadas pelo painel do admin (server/routers/sales.ts) e pelas rotas do
// Hermes (server/salesRoutes.ts). ESTE ARQUIVO DEFINE O CONTRATO entre os dois lados (nomes e tipos
// exportados não mudam). Implementação: ciclo.ts, ponte.ts, hermes.ts, acoes.ts, relatorioDb.ts e,
// para o que é só do painel, este arquivo.
//
// Erros: operação recusada por regra (ex.: cortar mensagem já despachada) lança `OperacaoRecusada`
// com `codigo` estável; o router do painel pode traduzir para TRPCError BAD_REQUEST/CONFLICT.
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { ordersDb } from '../../db/ordersDb';
import {
  companies, contacts, salesBatches, salesExceptions, salesHeartbeats, salesJourneys, salesMessageAttempts, salesMessages,
} from '../../db/schema';
import { spDateStr, spMidnight } from '../tz';
import type { JourneyState, MessageStatus, SalesMode } from '../../../shared/sales';
import { JOURNEY_STATES, normalizarEmail } from '../../../shared/sales';
import { getSalesSettings } from './settings';
import { executarCicloImpl } from './ciclo';
import { relatorioImpl } from './relatorioDb';
import { definirModoInterno, suprimirEmail } from './acoes';
import { efeitosDoAceite } from './hermes';
import { aplicarEvento, atualizarJornada, iso, registrarAuditoria } from './consultas';
import { estadoDaJornada, executorAtrasado, fonteDoCanal, statusDaMensagem } from './operacoesPuro';

/** Mantida para compatibilidade com quem já importava; nenhuma função lança mais isto. */
export class NaoImplementado extends Error {
  constructor(nome: string) { super(`Sales AI: ${nome} ainda não implementado`); this.name = 'NaoImplementado'; }
}

/** Operação recusada por regra de negócio (não é falha de sistema). `codigo` é estável. */
export class OperacaoRecusada extends Error {
  constructor(public readonly codigo: string, mensagem: string) { super(mensagem); this.name = 'OperacaoRecusada'; }
}

export interface PainelResumo {
  modo: SalesMode;
  canal: { ativo: boolean; politicaAprovada: boolean };
  agenteAtivo: boolean;
  disponibilidade: 'nao_informado' | 'disponivel' | 'em_falta';
  executores: Array<{ executor: string; versao: string | null; ultimoSinalEm: Date; atrasado: boolean }>;
  hoje: {
    dataSp: string;
    empresasNovasContatadas: number;
    mensagensAceitas: number;
    respostasHumanas: number;
    pedidosDeSaida: number;
    devolvidas: number;
    desconhecidas: number;
  };
  excecoesAbertas: number;
  loteDoDia: { id: number; status: string; tamanho: number } | null;
  jornadasPorEstado: Partial<Record<JourneyState, number>>;
}

export interface ResultadoCiclo {
  simulado: boolean;
  empresasSincronizadas: number;
  contatosNovos: number;
  qualificados: number;
  inelegiveisPorMotivo: Record<string, number>;
  loteId: number | null;
  mensagensGeradas: number;
  mensagensNaoGeradas: Record<string, number>;
  reservasLiberadas: number;
  marcadasDesconhecidas: number;
  cadenciasAvancadas: number;
  tarefasCrmProcessadas: number;
  avisos: string[];
}

export interface ItemLote {
  messageId: number;
  journeyId: number;
  companyId: number;
  empresa: string;
  cidadeUf: string | null;
  email: string;
  segmentos: string[];
  score: number | null;
  scoreMotivos: string[];
  passo: number;
  assunto: string;
  corpo: string;
  status: MessageStatus;
  fonteEmail: string | null;
}

export interface JornadaResumo {
  journeyId: number;
  companyId: number;
  contactId: number;
  empresa: string;
  cidadeUf: string | null;
  email: string;
  estado: JourneyState;
  passo: number;
  score: number | null;
  segmentos: string[];
  elegivel: boolean | null;
  motivosInelegivel: string[];
  pausada: string | null;
  ultimoContatoEm: Date | null;
  ultimoEventoEm: Date | null;
}

export interface RelatorioVendas {
  de: string;
  ate: string;
  empresas: { pesquisadas: number; elegiveis: number; contatadas: number };
  mensagens: { tentadas: number; aceitas: number; devolvidas: number; desconhecidas: number; falhas: number };
  respostas: { humanas: number; positivas: number; pedidosDeSaida: number; reclamacoes: number };
  agente: { conversas: number; linksDePedido: number; encaminhadas: number; respostasBarradas: number };
  vendas: { pedidosSiteComCupomCampanha: number; caixasSite: number; receitaSiteCentavos: number };
  /** Indício, não prova: o Mercado Livre não informa a origem do comprador. */
  indicios: string[];
  porSegmento: Array<{ segmento: string; contatadas: number; respostas: number; positivas: number }>;
  porUf: Array<{ uf: string; contatadas: number; respostas: number; positivas: number }>;
  /** Sem custo industrial informado, margem e lucro não são calculáveis. */
  rentabilidade: 'nao_calculavel';
}

export async function obterPainel(): Promise<PainelResumo> {
  const agora = new Date();
  const s = await getSalesSettings();
  const desde = sql`${iso(spMidnight(agora))}::timestamp`;
  const dataSp = spDateStr(agora);
  const [hbs, msgs, evs, exc, lote, estados] = await Promise.all([
    ordersDb.select().from(salesHeartbeats).orderBy(desc(salesHeartbeats.lastSeenAt)),
    ordersDb.execute<{ novas: number; aceitas: number; desconhecidas: number }>(sql`
      SELECT
        count(*) FILTER (WHERE status = 'ACCEPTED' AND step = 0 AND accepted_at >= ${desde})::int AS novas,
        count(*) FILTER (WHERE status = 'ACCEPTED' AND accepted_at >= ${desde})::int AS aceitas,
        count(*) FILTER (WHERE status = 'UNKNOWN')::int AS desconhecidas
      FROM sales_messages
    `),
    ordersDb.execute<{ respostas: number; saida: number; devolvidas: number }>(sql`
      SELECT
        count(*) FILTER (WHERE type = 'RESPOSTA')::int AS respostas,
        count(*) FILTER (WHERE type = 'PEDIU_PARA_SAIR')::int AS saida,
        count(*) FILTER (WHERE type = 'DEVOLVIDO')::int AS devolvidas
      FROM sales_events WHERE received_at >= ${desde} AND coalesce(result, '') NOT LIKE 'ignorado%'
    `),
    ordersDb.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM sales_exceptions WHERE status = 'open'`),
    ordersDb.select().from(salesBatches).where(eq(salesBatches.batchDate, dataSp)).limit(1),
    ordersDb.execute<{ state: string; n: number }>(sql`SELECT state, count(*)::int AS n FROM sales_journeys GROUP BY state`),
  ]);
  const jornadasPorEstado: Partial<Record<JourneyState, number>> = {};
  for (const row of estados.rows) {
    const e = estadoDaJornada(row.state);
    if (e) jornadasPorEstado[e] = row.n;
  }
  return {
    modo: s.modo,
    canal: { ativo: s.canal.ativo, politicaAprovada: s.canal.politicaAprovada },
    agenteAtivo: s.agente.ativo,
    disponibilidade: s.disponibilidade.status,
    executores: hbs.map((h) => ({ executor: h.executor, versao: h.version, ultimoSinalEm: h.lastSeenAt, atrasado: executorAtrasado(h.lastSeenAt, agora) })),
    hoje: {
      dataSp,
      empresasNovasContatadas: msgs.rows[0]?.novas ?? 0,
      mensagensAceitas: msgs.rows[0]?.aceitas ?? 0,
      respostasHumanas: evs.rows[0]?.respostas ?? 0,
      pedidosDeSaida: evs.rows[0]?.saida ?? 0,
      devolvidas: evs.rows[0]?.devolvidas ?? 0,
      // Todas as UNKNOWN em aberto (não só as de hoje): cada uma espera conciliação humana.
      desconhecidas: msgs.rows[0]?.desconhecidas ?? 0,
    },
    excecoesAbertas: exc.rows[0]?.n ?? 0,
    loteDoDia: lote[0] ? { id: lote[0].id, status: lote[0].status, tamanho: lote[0].size } : null,
    jornadasPorEstado,
  };
}

/** Muda o modo. Para PAUSED: revoga reservas (RESERVED → PENDING, fence sobe). DISPATCHING não é recolhível (fica no log e na auditoria). */
export async function definirModo(modo: SalesMode, por: string, motivo?: string): Promise<{ modo: SalesMode; reservasRevogadas: number }> {
  return definirModoInterno(modo, por, motivo);
}

/** Ciclo diário/idempotente: ponte Radar → prospecção, pontuação, elegibilidade, lote, cadência, conciliação, saída CRM. */
export async function executarCiclo(opts: { por: string; simular?: boolean }): Promise<ResultadoCiclo> {
  return executarCicloImpl(opts);
}

export async function listarLote(loteId?: number): Promise<{ lote: { id: number; data: string; status: string; tamanho: number } | null; itens: ItemLote[] }> {
  const [lote] = loteId !== undefined
    ? await ordersDb.select().from(salesBatches).where(eq(salesBatches.id, loteId)).limit(1)
    : await ordersDb.select().from(salesBatches).where(eq(salesBatches.batchDate, spDateStr(new Date()))).limit(1);
  if (!lote) return { lote: null, itens: [] };
  const rows = await ordersDb.select({
    m: salesMessages,
    score: salesJourneys.score, scoreReasons: salesJourneys.scoreReasons, segments: salesJourneys.segments,
    name: companies.name, tradeName: companies.tradeName, city: companies.city, state: companies.state,
    channelType: contacts.channelType,
  }).from(salesMessages)
    .leftJoin(salesJourneys, eq(salesJourneys.id, salesMessages.journeyId))
    .leftJoin(companies, eq(companies.id, salesMessages.companyId))
    .leftJoin(contacts, eq(contacts.id, salesMessages.contactId))
    .where(eq(salesMessages.batchId, lote.id))
    .orderBy(desc(salesJourneys.score), asc(salesMessages.id));
  return {
    lote: { id: lote.id, data: lote.batchDate, status: lote.status, tamanho: lote.size },
    itens: rows.map((r) => ({
      messageId: r.m.id,
      journeyId: r.m.journeyId,
      companyId: r.m.companyId,
      empresa: (r.tradeName?.trim() || r.name || '').trim(),
      cidadeUf: cidadeUf(r.city, r.state),
      email: r.m.toEmail,
      segmentos: Array.isArray(r.segments) ? r.segments : [],
      score: r.score ?? null,
      scoreMotivos: Array.isArray(r.scoreReasons) ? r.scoreReasons : [],
      passo: r.m.step,
      assunto: r.m.subject,
      corpo: r.m.bodyText,
      status: statusDaMensagem(r.m.status) ?? 'CANCELLED',
      fonteEmail: fonteDoCanal(r.channelType),
    })),
  };
}

function cidadeUf(cidade: string | null | undefined, uf: string | null | undefined): string | null {
  if (cidade && uf) return `${cidade} - ${uf}`;
  return uf ?? cidade ?? null;
}

/** Aprova as mensagens PENDING ainda não aprovadas do lote (approved_at/approved_by) e marca o lote. */
export async function aprovarLote(loteId: number, por: string): Promise<{ aprovadas: number }> {
  const [lote] = await ordersDb.select().from(salesBatches).where(eq(salesBatches.id, loteId)).limit(1);
  if (!lote) throw new OperacaoRecusada('lote_inexistente', 'lote não encontrado');
  if (lote.status === 'cancelled') throw new OperacaoRecusada('lote_cancelado', 'lote cancelado não pode ser aprovado');
  const agora = new Date();
  const r = await ordersDb.execute<{ id: number }>(sql`
    UPDATE sales_messages SET approved_at = ${iso(agora)}::timestamp, approved_by = ${por.slice(0, 200)}, updated_at = now()
    WHERE batch_id = ${loteId} AND status = 'PENDING' AND approved_at IS NULL
    RETURNING id
  `);
  await ordersDb.update(salesBatches).set({ status: 'approved', approvedAt: agora, approvedBy: por.slice(0, 200) }).where(eq(salesBatches.id, loteId));
  await registrarAuditoria('sales_lote_aprovado', por, { tipo: 'sales_batch', id: loteId }, { aprovadas: r.rows.length, data: lote.batchDate });
  return { aprovadas: r.rows.length };
}

/** Corta uma mensagem do lote: CANCELLED (fence+1, reserva revogada) e a jornada volta a QUALIFIED (SAIR_DO_LOTE). */
export async function cortarDoLote(messageId: number, por: string, motivo: string): Promise<void> {
  const r = await ordersDb.execute<{ journey_id: number; batch_id: number | null }>(sql`
    UPDATE sales_messages SET status = 'CANCELLED', cancelled_reason = ${`cortada: ${motivo}`.slice(0, 300)}, fence = fence + 1,
      reserved_by = NULL, reserved_until = NULL, reservation_token_hash = NULL, updated_at = now()
    WHERE id = ${messageId} AND batch_id IS NOT NULL AND status IN ('PENDING', 'RESERVED', 'RETRYABLE_FAILURE')
    RETURNING journey_id, batch_id
  `);
  const row = r.rows[0];
  if (!row) throw new OperacaoRecusada('nao_cortavel', 'mensagem fora de lote, já despachada ou encerrada (DISPATCHING/ACCEPTED não podem ser recolhidas)');
  const t = await aplicarEvento(row.journey_id, 'SAIR_DO_LOTE');
  if (row.batch_id !== null) {
    await ordersDb.execute(sql`
      UPDATE sales_batches SET size = (SELECT count(*)::int FROM sales_messages WHERE batch_id = ${row.batch_id} AND status <> 'CANCELLED')
      WHERE id = ${row.batch_id}
    `);
  }
  await registrarAuditoria('sales_cortada_do_lote', por, { tipo: 'sales_message', id: messageId }, {
    motivo, jornada: row.journey_id, transicao: t.ok ? 'SAIR_DO_LOTE' : `recusada:${t.motivo}`,
  });
}

export async function listarJornadas(f: { estado?: JourneyState; busca?: string; pagina: number; porPagina: number }): Promise<{ itens: JornadaResumo[]; total: number }> {
  const porPagina = Math.max(1, Math.min(200, Math.floor(f.porPagina)));
  const pagina = Math.max(1, Math.floor(f.pagina));
  const filtros: SQL[] = [];
  if (f.estado && (JOURNEY_STATES as readonly string[]).includes(f.estado)) filtros.push(eq(salesJourneys.state, f.estado));
  const busca = f.busca?.trim();
  if (busca) {
    const padrao = `%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const alguma = or(ilike(salesJourneys.email, padrao), ilike(companies.name, padrao), ilike(companies.tradeName, padrao));
    if (alguma) filtros.push(alguma);
  }
  const onde = filtros.length ? and(...filtros) : undefined;
  const [rows, total] = await Promise.all([
    ordersDb.select({ j: salesJourneys, name: companies.name, tradeName: companies.tradeName, city: companies.city, state: companies.state })
      .from(salesJourneys).leftJoin(companies, eq(companies.id, salesJourneys.companyId))
      .where(onde)
      .orderBy(desc(salesJourneys.updatedAt), desc(salesJourneys.id))
      .limit(porPagina).offset((pagina - 1) * porPagina),
    ordersDb.select({ n: sql<number>`count(*)::int` }).from(salesJourneys).leftJoin(companies, eq(companies.id, salesJourneys.companyId)).where(onde),
  ]);
  return {
    total: total[0]?.n ?? 0,
    itens: rows.map(({ j, name, tradeName, city, state }) => ({
      journeyId: j.id,
      companyId: j.companyId,
      contactId: j.contactId,
      empresa: (tradeName?.trim() || name || '').trim(),
      cidadeUf: cidadeUf(city, state),
      email: j.email,
      estado: estadoDaJornada(j.state) ?? 'IDENTIFIED',
      passo: j.cadenceStep,
      score: j.score ?? null,
      segmentos: Array.isArray(j.segments) ? j.segments : [],
      elegivel: j.eligibility ? j.eligibility.ok : null,
      motivosInelegivel: j.eligibility?.motivos ?? [],
      pausada: j.pausedReason,
      ultimoContatoEm: j.lastContactedAt,
      ultimoEventoEm: j.lastEventAt,
    })),
  };
}

/** Pausa a jornada (sem mudar o estado). Reservas dela deixam de ser autorizadas (jornada_pausada). */
export async function pausarJornada(journeyId: number, motivo: string, por: string): Promise<void> {
  const r = await atualizarJornada(journeyId, () => ({ pausedReason: `manual: ${motivo}`.slice(0, 200) }));
  if (!r.ok) throw new OperacaoRecusada(`jornada_${r.motivo}`, `não foi possível pausar a jornada (${r.motivo})`);
  await registrarAuditoria('sales_jornada_pausada', por, { tipo: 'sales_journey', id: journeyId }, { motivo, antes: r.antes.pausedReason });
}

/** Retoma (só ação humana; auto-resposta nunca retoma sozinha). Jornada não pausada: nada muda. */
export async function retomarJornada(journeyId: number, por: string): Promise<void> {
  const r = await atualizarJornada(journeyId, (j) => (j.pausedReason ? { pausedReason: null } : null));
  if (!r.ok && r.motivo !== 'recusada') throw new OperacaoRecusada(`jornada_${r.motivo}`, `não foi possível retomar a jornada (${r.motivo})`);
  await registrarAuditoria('sales_jornada_retomada', por, { tipo: 'sales_journey', id: journeyId }, { motivoAnterior: r.ok ? r.antes.pausedReason : null });
}

/** Supressão manual: propaga pelos dois bancos (suppressEmailGlobal), cancela mensagens e põe a jornada em SUPPRESSED. */
export async function suprimirContato(email: string, motivo: string, por: string): Promise<{ ok: boolean; falhas: string[] }> {
  return suprimirEmail(normalizarEmail(email), 'manual', motivo, por);
}

export async function listarExcecoes(f: { status: 'open' | 'resolved' | 'dismissed'; pagina: number; porPagina: number }): Promise<{
  itens: Array<{ id: number; kind: string; severity: string; title: string; detail: string | null; evidence: unknown; proposedAction: unknown; createdBy: string; createdAt: Date; companyId: number | null; contactId: number | null; conversationId: string | null }>;
  total: number;
}> {
  const porPagina = Math.max(1, Math.min(200, Math.floor(f.porPagina)));
  const pagina = Math.max(1, Math.floor(f.pagina));
  const ordemSeveridade = sql`CASE ${salesExceptions.severity} WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`;
  const [rows, total] = await Promise.all([
    ordersDb.select().from(salesExceptions).where(eq(salesExceptions.status, f.status))
      .orderBy(f.status === 'open' ? ordemSeveridade : desc(salesExceptions.createdAt), desc(salesExceptions.createdAt))
      .limit(porPagina).offset((pagina - 1) * porPagina),
    ordersDb.select({ n: sql<number>`count(*)::int` }).from(salesExceptions).where(eq(salesExceptions.status, f.status)),
  ]);
  return {
    total: total[0]?.n ?? 0,
    itens: rows.map((x) => ({
      id: x.id, kind: x.kind, severity: x.severity, title: x.title, detail: x.detail, evidence: x.evidence, proposedAction: x.proposedAction,
      createdBy: x.createdBy, createdAt: x.createdAt, companyId: x.companyId, contactId: x.contactId, conversationId: x.conversationId,
    })),
  };
}

export async function resolverExcecao(id: number, r: { status: 'resolved' | 'dismissed'; resolucao: string }, por: string): Promise<void> {
  const feito = await ordersDb.update(salesExceptions)
    .set({ status: r.status, resolution: r.resolucao.slice(0, 2000), resolvedBy: por.slice(0, 200), resolvedAt: new Date() })
    .where(and(eq(salesExceptions.id, id), eq(salesExceptions.status, 'open')))
    .returning({ id: salesExceptions.id });
  if (!feito.length) throw new OperacaoRecusada('excecao_fechada', 'exceção não encontrada ou já resolvida');
  await registrarAuditoria('sales_excecao_resolvida', por, { tipo: 'sales_exception', id }, { status: r.status });
}

/** Mensagens UNKNOWN para conciliação humana. Nunca reenviadas sozinhas. */
export async function listarDesconhecidas(): Promise<Array<{ messageId: number; email: string; empresa: string; passo: number; ultimaTentativaEm: Date | null; executor: string | null; respostaSmtp: string | null }>> {
  const msgs = await ordersDb.select({ m: salesMessages, name: companies.name, tradeName: companies.tradeName })
    .from(salesMessages).leftJoin(companies, eq(companies.id, salesMessages.companyId))
    .where(eq(salesMessages.status, 'UNKNOWN')).orderBy(asc(salesMessages.lastAttemptAt)).limit(500);
  if (msgs.length === 0) return [];
  const tentativas = await ordersDb.select().from(salesMessageAttempts)
    .where(inArray(salesMessageAttempts.messageId, msgs.map((x) => x.m.id))).orderBy(desc(salesMessageAttempts.id));
  const ultima = new Map<number, typeof tentativas[number]>();
  for (const t of tentativas) if (!ultima.has(t.messageId)) ultima.set(t.messageId, t);
  return msgs.map(({ m, name, tradeName }) => {
    const t = ultima.get(m.id);
    return {
      messageId: m.id, email: m.toEmail, empresa: (tradeName?.trim() || name || '').trim(), passo: m.step,
      ultimaTentativaEm: m.lastAttemptAt, executor: t?.executor ?? null, respostaSmtp: t?.smtpResponse ?? null,
    };
  });
}

/** 'foi_enviada' → ACCEPTED (avança a cadência); 'nao_foi_enviada' → PENDING com fence novo (pode sair de novo). */
export async function resolverDesconhecida(messageId: number, decisao: 'foi_enviada' | 'nao_foi_enviada', por: string): Promise<void> {
  const [m] = await ordersDb.select().from(salesMessages).where(eq(salesMessages.id, messageId)).limit(1);
  if (!m || m.status !== 'UNKNOWN') throw new OperacaoRecusada('nao_desconhecida', 'mensagem não está em UNKNOWN');
  const [t] = await ordersDb.select().from(salesMessageAttempts).where(eq(salesMessageAttempts.messageId, m.id)).orderBy(desc(salesMessageAttempts.id)).limit(1);
  const agora = new Date();
  const aceitaEm = m.lastAttemptAt ?? agora;
  const foi = decisao === 'foi_enviada';
  const nota = `conciliação manual por ${por}`.slice(0, 300);
  // Um comando: muda a mensagem só se continua UNKNOWN com o mesmo fence, e fecha a tentativa.
  // 'nao_foi_enviada' apaga o token de despacho: um resultado atrasado do executor vira 403.
  const r = await ordersDb.execute<{ id: number }>(sql`
    WITH m AS (
      UPDATE sales_messages SET
        status = ${foi ? 'ACCEPTED' : 'PENDING'},
        accepted_at = ${foi ? iso(aceitaEm) : null}::timestamp,
        fence = fence + ${foi ? 0 : 1},
        dispatch_token_hash = ${foi ? sql`dispatch_token_hash` : sql`NULL`},
        dispatch_expires_at = ${foi ? sql`dispatch_expires_at` : sql`NULL`},
        reserved_by = NULL, reserved_until = NULL, reservation_token_hash = NULL, updated_at = now()
      WHERE id = ${m.id} AND status = 'UNKNOWN' AND fence = ${m.fence}
      RETURNING id
    ), a AS (
      UPDATE sales_message_attempts SET
        outcome = ${foi ? 'ACCEPTED' : 'EXPIRED'}, smtp_response = coalesce(smtp_response, ${nota}::text),
        finished_at = coalesce(finished_at, now())
      WHERE id = ${t?.id ?? 0} AND (outcome IS NULL OR outcome = 'EXPIRED') AND EXISTS (SELECT 1 FROM m)
      RETURNING id
    )
    SELECT id FROM m
  `);
  if (!r.rows.length) throw new OperacaoRecusada('corrida', 'a mensagem mudou enquanto era conciliada; recarregue');
  await ordersDb.update(salesExceptions)
    .set({ status: 'resolved', resolvedBy: por.slice(0, 200), resolvedAt: agora, resolution: decisao })
    .where(and(eq(salesExceptions.idempotencyKey, `desconhecido:${m.id}:${m.fence}`), eq(salesExceptions.status, 'open')));
  if (foi) await efeitosDoAceite(m, aceitaEm, await getSalesSettings());
  await registrarAuditoria('sales_desconhecida_conciliada', por, { tipo: 'sales_message', id: m.id }, { decisao });
}

export async function relatorio(p: { de: string; ate: string }): Promise<RelatorioVendas> {
  return relatorioImpl(p);
}
