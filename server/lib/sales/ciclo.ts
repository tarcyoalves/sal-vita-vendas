// Ciclo do Sales AI: idempotente, pode rodar várias vezes por dia. Com `simular`, calcula tudo e
// não grava NADA (nem o lease, nem o cursor da ponte).
//
// Um ciclo por vez: o "lease" é uma linha `_ciclo_lease` em `sales_settings` tomada com um único
// INSERT ... ON CONFLICT DO UPDATE ... WHERE (lease vencido). Quem não pega o lease devolve "outro
// ciclo em andamento" sem fazer nada. Cada passo roda isolado: a falha de um vira aviso e não
// impede os outros.
//
// Nada aqui envia e-mail. O ciclo só PREPARA mensagens (PENDING); quem envia é o executor do Hermes,
// pela fila (reservar → autorizar → resultado), e só se modo, canal e política deixarem.
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { ordersDb } from '../../db/ordersDb';
import { db as crmDb } from '../../db';
import { companies, salesBatches, salesHeartbeats, salesJourneys, salesMessages, salesSyncOps, tasks, users } from '../../db/schema';
import { safeErr } from '../logSafe';
import { spDateStr } from '../tz';
import type { SalesSettings } from '../../../shared/sales';
import type { ResultadoCiclo } from './operacoes';
import { getSalesSettings } from './settings';
import { avaliarElegibilidade } from './elegibilidade';
import { pontuar } from './pontuacao';
import { transicionar } from './estados';
import { chaveLogicaProspeccao, montarMensagem, montarMessageId } from './mensagem';
import { registrarExcecao } from './excecoes';
import { linkDescadastroProspeccao } from './descadastro';
import {
  aprovacaoHerdada, chaveHeartbeatAusente, contarMotivos, decidirCadencia, executorAtrasado, lerPayloadTarefa,
  marcadorSales, montarEntradaElegibilidade, montarTarefaCrm, planejarConciliacao, preRequisitoMensagem, selecionarLote,
  somar, statusDaMensagem, totalPassos, vagasDoLote, HEARTBEAT_LIMITE_MS,
} from './operacoesPuro';
import {
  aplicarEvento, carregarContextos, compartilhamento, empresasJaProspectadas, iso, jornadasJaProspectadas, liberarReservas,
  listaSql, supressaoEmLote, type LinhaJornada,
} from './consultas';
import { executarPonte, novoAcumuladorPonte } from './ponte';

const CHAVE_LEASE = '_ciclo_lease';
const LEASE_MS = 3 * 60_000;
/** Orçamento total do ciclo (a função da Vercel tem 60 s) e o pedaço da ponte. */
const ORCAMENTO_MS = 45_000;
const ORCAMENTO_PONTE_MS = 22_000;
const MAX_TENTATIVAS_SAIDA = 5;

type Lease = { token: string };

async function adquirirLease(por: string, agora: Date): Promise<Lease | null> {
  const token = randomBytes(12).toString('hex');
  const v = JSON.stringify({ token, ate: new Date(agora.getTime() + LEASE_MS).toISOString(), por });
  const r = await ordersDb.execute<{ key: string }>(sql`
    INSERT INTO sales_settings (key, value, updated_at, updated_by) VALUES (${CHAVE_LEASE}, ${v}::jsonb, now(), ${por})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
    WHERE (sales_settings.value->>'ate')::timestamptz < now()
    RETURNING key
  `);
  return r.rows.length ? { token } : null;
}

async function liberarLease(l: Lease): Promise<void> {
  const v = JSON.stringify({ token: null, ate: new Date(0).toISOString(), por: null });
  await ordersDb.execute(sql`UPDATE sales_settings SET value = ${v}::jsonb, updated_at = now() WHERE key = ${CHAVE_LEASE} AND value->>'token' = ${l.token}`)
    .catch((err) => console.error('[sales-ciclo] liberar lease falhou:', safeErr(err)));
}

function novoResultado(simular: boolean): ResultadoCiclo {
  return {
    simulado: simular, empresasSincronizadas: 0, contatosNovos: 0, qualificados: 0, inelegiveisPorMotivo: {}, loteId: null,
    mensagensGeradas: 0, mensagensNaoGeradas: {}, reservasLiberadas: 0, marcadasDesconhecidas: 0, cadenciasAvancadas: 0,
    tarefasCrmProcessadas: 0, avisos: [],
  };
}

interface Ctx { settings: SalesSettings; simular: boolean; agora: Date; por: string; r: ResultadoCiclo; motivos: Map<string, string[]>; inicio: number }

export async function executarCicloImpl(opts: { por: string; simular?: boolean }): Promise<ResultadoCiclo> {
  const simular = opts.simular === true;
  const agora = new Date();
  const r = novoResultado(simular);
  const settings = await getSalesSettings();
  const lease = simular ? null : await adquirirLease(opts.por, agora);
  if (!simular && !lease) {
    r.avisos.push('outro ciclo em andamento: nada foi feito');
    return r;
  }
  const ctx: Ctx = { settings, simular, agora, por: opts.por, r, motivos: new Map(), inicio: Date.now() };
  const passo = async (nome: string, fn: () => Promise<void>) => {
    try { await fn(); } catch (err) {
      console.error(`[sales-ciclo] passo "${nome}" falhou:`, safeErr(err));
      r.avisos.push(`${nome}: falhou (${safeErr(err).slice(0, 200)})`);
    }
  };
  const semContato: Record<string, number> = {};
  try {
    await passo('conciliacao', () => conciliar(ctx));
    await passo('ponte', async () => {
      const acc = novoAcumuladorPonte();
      try {
        await executarPonte({ settings, simular, por: opts.por, prazoFinal: ctx.inicio + ORCAMENTO_PONTE_MS, acc });
      } finally {
        r.empresasSincronizadas += acc.empresasSincronizadas;
        r.contatosNovos += acc.contatosNovos;
        r.qualificados += acc.qualificados;
        for (const [e, m] of acc.motivosPorEmail) ctx.motivos.set(e, m);
        Object.assign(semContato, acc.semContato);
        r.avisos.push(...acc.avisos);
      }
    });
    await passo('lotes_vencidos', () => expirarLotesNaoAprovados(ctx));
    await passo('lote', () => loteDoDia(ctx));
    await passo('cadencia', () => cadencia(ctx));
    await passo('saida_crm', () => saidaCrm(ctx));
    await passo('heartbeat', () => verificarExecutores(ctx));
  } finally {
    if (lease) await liberarLease(lease);
  }
  r.inelegiveisPorMotivo = contarMotivos([...ctx.motivos.values()].filter((m) => m.length > 0));
  for (const [k, n] of Object.entries(semContato)) if (n > 0) somar(r.inelegiveisPorMotivo, k, n);
  if (simular) r.avisos.unshift('simulação: nada foi gravado');
  return r;
}

// ── Lotes vencidos ───────────────────────────────────────────────────────────────────────────
// Lote que o dono não aprovou no dia não fica pendurado: se um dia o modo virar AUTONOMOUS, uma
// mensagem antiga e nunca revisada sairia sozinha. Primeiro contato (passo 0) sem aprovação de um
// lote de dia anterior é cancelado e a jornada volta para QUALIFIED (pode entrar num lote novo).
async function expirarLotesNaoAprovados(ctx: Ctx): Promise<void> {
  const hoje = spDateStr(ctx.agora);
  if (ctx.simular) return;
  const r = await ordersDb.execute<{ journey_id: number }>(sql`
    UPDATE sales_messages m SET status = 'CANCELLED', cancelled_reason = 'lote vencido sem aprovação', fence = fence + 1,
      reserved_by = NULL, reserved_until = NULL, reservation_token_hash = NULL, updated_at = now()
    FROM sales_batches b
    WHERE m.batch_id = b.id AND b.batch_date < ${hoje} AND m.step = 0 AND m.approved_at IS NULL
      AND m.status IN ('PENDING', 'RESERVED', 'RETRYABLE_FAILURE')
    RETURNING m.journey_id
  `);
  for (const row of r.rows) await aplicarEvento(row.journey_id, 'SAIR_DO_LOTE');
  if (r.rows.length) ctx.r.avisos.push(`${r.rows.length} mensagem(ns) de lote antigo sem aprovação cancelada(s)`);
}

// ── 5. Conciliação ───────────────────────────────────────────────────────────────────────────

async function conciliar(ctx: Ctx): Promise<void> {
  const { agora } = ctx;
  const rows = await ordersDb.select({
    id: salesMessages.id, status: salesMessages.status, fence: salesMessages.fence, reservedUntil: salesMessages.reservedUntil,
    dispatchExpiresAt: salesMessages.dispatchExpiresAt, companyId: salesMessages.companyId, contactId: salesMessages.contactId,
    step: salesMessages.step,
  }).from(salesMessages).where(or(
    and(eq(salesMessages.status, 'RESERVED'), lte(salesMessages.reservedUntil, agora)),
    and(eq(salesMessages.status, 'DISPATCHING'), lte(salesMessages.dispatchExpiresAt, agora)),
  )).limit(500);
  const plano = planejarConciliacao(rows.flatMap((x) => {
    const status = statusDaMensagem(x.status);
    return status ? [{ ...x, status }] : [];
  }), agora);
  if (ctx.simular) {
    ctx.r.reservasLiberadas += plano.liberar.length;
    ctx.r.marcadasDesconhecidas += plano.desconhecer.length;
    return;
  }
  // RESERVED vencida → PENDING, fence+1, tokens apagados (o UPDATE confere de novo status e prazo).
  ctx.r.reservasLiberadas += (await liberarReservas(plano.liberar.map((x) => x.id), agora)).length;

  // DISPATCHING vencido → UNKNOWN (NUNCA reenviado sozinho) + tentativa EXPIRED, num só comando.
  if (plano.desconhecer.length) {
    const ids = plano.desconhecer.map((x) => x.id);
    const marcadas = await ordersDb.execute<{ id: number; fence: number }>(sql`
      WITH m AS (
        UPDATE sales_messages SET status = 'UNKNOWN', updated_at = now()
        WHERE id IN (${listaSql(ids)}) AND status = 'DISPATCHING' AND dispatch_expires_at <= ${iso(agora)}::timestamp
        RETURNING id, fence
      ), a AS (
        UPDATE sales_message_attempts t SET outcome = 'EXPIRED', finished_at = now()
        FROM m WHERE t.message_id = m.id AND t.fence = m.fence AND t.outcome IS NULL
        RETURNING t.id
      )
      SELECT m.id, m.fence FROM m
    `);
    ctx.r.marcadasDesconhecidas += marcadas.rows.length;
    const porId = new Map(plano.desconhecer.map((x) => [x.id, x]));
    for (const row of marcadas.rows) {
      const m = porId.get(row.id);
      await registrarExcecao({
        idempotencyKey: `desconhecido:${row.id}:${row.fence}`,
        kind: 'envio_desconhecido',
        severity: 'alta',
        title: `Envio sem confirmação (mensagem #${row.id}, passo ${m?.step ?? '?'})`,
        detail: 'O executor recebeu autorização e não informou o resultado no prazo. A mensagem pode ter saído. '
          + 'Ela NUNCA é reenviada sozinha: confira na caixa de envio e concilie no painel (foi enviada / não foi enviada).',
        evidence: { messageId: row.id, fence: row.fence },
        companyId: m?.companyId ?? null,
        contactId: m?.contactId ?? null,
        createdBy: 'sistema',
      });
    }
  }
}

// ── 2 e 3. Atualização da elegibilidade e lote do dia ────────────────────────────────────────

async function loteDoDia(ctx: Ctx): Promise<void> {
  const { settings, agora, simular, r } = ctx;
  const N = settings.limites.novasEmpresasDia;
  const pool = await ordersDb.select().from(salesJourneys)
    .where(and(eq(salesJourneys.state, 'QUALIFIED'), isNull(salesJourneys.pausedReason)))
    .orderBy(sql`${salesJourneys.score} DESC NULLS LAST`, asc(salesJourneys.id))
    .limit(Math.max(N * 10, 200));
  if (pool.length === 0) return;

  const [contextos, compart, supr, jaProsp, empresasProsp] = await Promise.all([
    carregarContextos(pool),
    compartilhamento(pool.map((j) => j.email)),
    supressaoEmLote(pool.map((j) => j.email)),
    jornadasJaProspectadas(pool.map((j) => j.id)),
    empresasJaProspectadas([...new Set(pool.map((j) => j.companyId))]),
  ]);

  const avaliados = pool.map((j) => {
    const c = contextos.get(j.id);
    if (!c) return { j, ok: false, motivos: ['contexto_ausente'], score: j.score, motivosScore: j.scoreReasons ?? [] };
    const eleg = avaliarElegibilidade(montarEntradaElegibilidade(c, {
      compartilhadoPor: compart.get(j.email) ?? 1, supressao: supr.get(j.email) ?? { premium: null, crm: null },
      passo: 0, jaProspectado: jaProsp.has(j.id), canal: settings.canal, ufsDaOnda: settings.ondas.ufs,
    }));
    const sc = pontuar({ segmentos: c.segmentos, evidencias: c.evidencias, email: c.email, fonteEmail: c.fonte, temSite: c.temSite, uf: c.uf, ufsDaOnda: settings.ondas.ufs });
    ctx.motivos.set(j.email, eleg.motivos);
    return { j, ok: eleg.ok, motivos: eleg.motivos, versao: eleg.versao, score: sc.score, motivosScore: sc.motivos };
  });

  // 2. Grava a elegibilidade e a pontuação recalculadas (só jornadas que continuam QUALIFIED).
  if (!simular) {
    const agoraIso = agora.toISOString();
    const valores = sql.join(avaliados.map((a) => sql`(${a.j.id}::int, ${a.score ?? null}::int, ${JSON.stringify(a.motivosScore)}::jsonb,
      ${JSON.stringify({ ok: a.ok, motivos: a.motivos, versao: a.versao ?? null, em: agoraIso })}::jsonb)`), sql`, `);
    await ordersDb.execute(sql`
      UPDATE sales_journeys j SET score = v.score, score_reasons = v.reasons, eligibility = v.elig, updated_at = now()
      FROM (VALUES ${valores}) AS v(id, score, reasons, elig)
      WHERE j.id = v.id AND j.state = 'QUALIFIED'
    `);
  }

  // 3. Lote do dia (um por data de São Paulo).
  const dataSp = spDateStr(agora);
  if (!simular) {
    await ordersDb.insert(salesBatches).values({ batchDate: dataSp, status: 'draft', size: 0 }).onConflictDoNothing({ target: salesBatches.batchDate });
  }
  const [lote] = await ordersDb.select().from(salesBatches).where(eq(salesBatches.batchDate, dataSp)).limit(1);
  if (lote) r.loteId = lote.id;
  if (lote?.status === 'cancelled') { r.avisos.push(`lote de ${dataSp} cancelado: nada novo entra`); return; }
  const jaNoLote = lote
    ? ((await ordersDb.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM sales_messages WHERE batch_id = ${lote.id}`)).rows[0]?.n ?? 0)
    : 0;
  const vagas = vagasDoLote(N, jaNoLote);
  const escolhidos = selecionarLote(
    avaliados.map((a) => ({ journeyId: a.j.id, companyId: a.j.companyId, score: a.score, elegivel: a.ok, pausada: !!a.j.pausedReason })),
    vagas,
    empresasProsp,
  );
  if (escolhidos.length === 0) return;

  const pre = preRequisitoMensagem(settings.modeloEmail, settings.remetente, settings.canal, 0);
  if (pre) { somar(r.mensagensNaoGeradas, pre, escolhidos.length); return; }
  const porId = new Map(pool.map((j) => [j.id, j]));
  let novas = 0;
  for (const e of escolhidos) {
    const j = porId.get(e.journeyId);
    const c = contextos.get(e.journeyId);
    if (!j || !c) continue;
    const gerado = await gerarMensagem(ctx, j, c.empresa, 0, lote?.id ?? null, { approvedAt: null, approvedBy: null });
    if (gerado) novas += 1;
  }
  if (!simular && lote && novas > 0) {
    await ordersDb.execute(sql`
      UPDATE sales_batches SET
        size = (SELECT count(*)::int FROM sales_messages WHERE batch_id = ${lote.id} AND status <> 'CANCELLED'),
        status = CASE WHEN status = 'approved' THEN 'draft' ELSE status END
      WHERE id = ${lote.id}
    `);
  }
}

/** Jornada criada antes da coluna existir: grava um token agora (só se ainda não houver). */
async function garantirTokenDescadastro(journeyId: number): Promise<string | null> {
  const r = await ordersDb.execute<{ unsub_token: string }>(sql`
    UPDATE sales_journeys SET unsub_token = COALESCE(unsub_token, gen_random_uuid()::text)
    WHERE id = ${journeyId} RETURNING unsub_token
  `);
  return r.rows[0]?.unsub_token ?? null;
}

/**
 * Gera a mensagem de um passo. Passo 0: entra no lote (ENTRAR_NO_LOTE) no MESMO comando que insere
 * a mensagem — ou os dois, ou nenhum. Passo ≥1: insere com ON CONFLICT (chave lógica) DO NOTHING,
 * só se a jornada continua CONTACTED e não pausada.
 */
async function gerarMensagem(
  ctx: Ctx, j: LinhaJornada, empresa: string, passo: number, batchId: number | null,
  aprovacao: { approvedAt: Date | null; approvedBy: string | null },
): Promise<boolean> {
  const { settings, r, simular } = ctx;
  const token = j.unsubToken ?? (simular ? '00000000-0000-4000-8000-000000000000' : await garantirTokenDescadastro(j.id));
  const link = linkDescadastroProspeccao({ token, baseUrl: origemDoSite(settings.remetente.linkSite) });
  if (!link.ok) {
    somar(r.mensagensNaoGeradas, link.motivo);
    if (!r.avisos.some((a) => a.startsWith('descadastro:'))) r.avisos.push(`descadastro: ${link.detalhe}`);
    return false;
  }
  // TODO(aberturaPorIa): linha de abertura por IA não implementada neste lote — sempre ''. Quando
  // existir: executarNaCadeia (server/lib/aiChain.ts) só com nome público + segmento, e a saída
  // passa por verificarTextoComercial + contemValorCritico; falhou = ''.
  const montada = montarMensagem(settings.modeloEmail, passo, settings.remetente, { empresa, abertura: '', linkDescadastro: link.url });
  if (!montada.ok) { somar(r.mensagensNaoGeradas, montada.motivo); return false; }
  const logicalKey = chaveLogicaProspeccao(j.id, passo);
  const messageIdHeader = montarMessageId(logicalKey, montada.contentHash, settings.canal);
  if (!messageIdHeader) { somar(r.mensagensNaoGeradas, 'dominio_do_canal_ausente'); return false; }
  if (simular) { r.mensagensGeradas += 1; return true; }

  // Parâmetros com tipo explícito: num INSERT ... SELECT o Postgres não infere o tipo pela coluna.
  const campos = sql`${logicalKey}::text, ${j.contactId}::int, ${j.companyId}::int, ${batchId}::int, ${passo}::int, ${j.email}::text,
    ${montada.assunto}::text, ${montada.corpo}::text, ${montada.contentHash}::text, ${messageIdHeader}::text,
    ${settings.modeloEmail.versao}::text, 'PENDING', ${aprovacao.approvedAt ? iso(aprovacao.approvedAt) : null}::timestamp,
    ${aprovacao.approvedBy}::text`;
  if (passo === 0) {
    const para = transicionar('QUALIFIED', 'ENTRAR_NO_LOTE');
    if (!para.ok) return false;
    const res = await ordersDb.execute<{ id: number }>(sql`
      WITH jj AS (
        UPDATE sales_journeys SET state = ${para.para}, state_version = state_version + 1, updated_at = now()
        WHERE id = ${j.id} AND state_version = ${j.stateVersion} AND state = 'QUALIFIED' AND paused_reason IS NULL
        RETURNING id
      )
      INSERT INTO sales_messages (journey_id, logical_key, contact_id, company_id, batch_id, step, to_email, subject, body_text,
                                  content_hash, message_id_header, template_version, status, approved_at, approved_by)
      SELECT jj.id, ${campos} FROM jj
      RETURNING id
    `);
    if (res.rows.length === 0) { somar(r.mensagensNaoGeradas, 'jornada_mudou'); return false; }
  } else {
    const res = await ordersDb.execute<{ id: number }>(sql`
      INSERT INTO sales_messages (journey_id, logical_key, contact_id, company_id, batch_id, step, to_email, subject, body_text,
                                  content_hash, message_id_header, template_version, status, approved_at, approved_by)
      SELECT j.id, ${campos} FROM sales_journeys j
      WHERE j.id = ${j.id} AND j.state = 'CONTACTED' AND j.paused_reason IS NULL
      ON CONFLICT DO NOTHING
      RETURNING id
    `);
    if (res.rows.length === 0) return false;
  }
  r.mensagensGeradas += 1;
  return true;
}

function origemDoSite(link: string): string | null {
  try { const u = new URL(link); return u.protocol === 'https:' ? u.origin : null; } catch { return null; }
}

// ── 4. Cadência ──────────────────────────────────────────────────────────────────────────────

async function cadencia(ctx: Ctx): Promise<void> {
  const { settings, agora, simular, r } = ctx;
  const devidas = await ordersDb.select().from(salesJourneys)
    .where(and(
      eq(salesJourneys.state, 'CONTACTED'), isNull(salesJourneys.pausedReason), lte(salesJourneys.nextActionAt, agora),
      // Já tem a mensagem do próximo passo na fila (ou em voo, ou aceita): nada a fazer — não ocupa a janela.
      sql`NOT EXISTS (SELECT 1 FROM sales_messages m WHERE m.journey_id = ${salesJourneys.id} AND m.step = ${salesJourneys.cadenceStep} + 1
                      AND m.status IN ('PENDING', 'RESERVED', 'DISPATCHING', 'RETRYABLE_FAILURE', 'UNKNOWN', 'ACCEPTED'))`,
    ))
    .orderBy(asc(salesJourneys.nextActionAt)).limit(200);
  if (devidas.length === 0) return;
  const total = totalPassos(settings.limites, settings.modeloEmail);
  const chaves = devidas.flatMap((j) => [chaveLogicaProspeccao(j.id, 0), chaveLogicaProspeccao(j.id, j.cadenceStep + 1)]);
  const msgs = await ordersDb.select({
    id: salesMessages.id, logicalKey: salesMessages.logicalKey, status: salesMessages.status,
    approvedAt: salesMessages.approvedAt, batchId: salesMessages.batchId,
  }).from(salesMessages).where(inArray(salesMessages.logicalKey, chaves));
  const porChave = new Map(msgs.map((m) => [m.logicalKey, m]));
  const empresas = await ordersDb.select({ id: companies.id, name: companies.name, tradeName: companies.tradeName })
    .from(companies).where(inArray(companies.id, [...new Set(devidas.map((j) => j.companyId))]));
  const nomeEmpresa = new Map(empresas.map((c) => [c.id, (c.tradeName?.trim() || c.name).trim()]));

  for (const j of devidas) {
    if (Date.now() - ctx.inicio > ORCAMENTO_MS) { r.avisos.push('cadência: prazo do ciclo esgotado'); break; }
    const prox = porChave.get(chaveLogicaProspeccao(j.id, j.cadenceStep + 1));
    const d = decidirCadencia({
      estado: 'CONTACTED', cadenceStep: j.cadenceStep, total, pausada: !!j.pausedReason, nextActionAt: j.nextActionAt, agora,
      statusDoProximo: prox ? (statusDaMensagem(prox.status) ?? 'UNKNOWN') : null,
    });
    if (d.tipo === 'nada') continue;
    if (d.tipo === 'encerrar') {
      if (simular) { r.cadenciasAvancadas += 1; continue; }
      const t = await aplicarEvento(j.id, 'FIM_CADENCIA', () => ({ closedReason: d.motivo, nextActionAt: null }));
      if (t.ok) r.cadenciasAvancadas += 1;
      continue;
    }
    const pre = preRequisitoMensagem(settings.modeloEmail, settings.remetente, settings.canal, d.passo);
    if (pre) { somar(r.mensagensNaoGeradas, pre); continue; }
    const p0 = porChave.get(chaveLogicaProspeccao(j.id, 0));
    const heranca = aprovacaoHerdada(p0 ? { id: p0.id, approvedAt: p0.approvedAt, batchId: p0.batchId } : null, agora);
    if (await gerarMensagem(ctx, j, nomeEmpresa.get(j.companyId) ?? '', d.passo, null, heranca)) r.cadenciasAvancadas += 1;
  }
}

// ── 6. Saída para o CRM (tarefa do atendente) ────────────────────────────────────────────────

async function saidaCrm(ctx: Ctx): Promise<void> {
  const { settings, simular, r, agora } = ctx;
  const pendentesR = await ordersDb.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM sales_sync_ops WHERE kind = 'criar_tarefa_crm' AND status IN ('pending', 'processing')
  `);
  const pendentes = pendentesR.rows[0]?.n ?? 0;
  if (pendentes === 0) return;
  const crmUserId = settings.atendente.crmUserId;
  if (crmUserId === null) {
    r.avisos.push(`${pendentes} tarefa(s) para o CRM aguardando: atendente do CRM não configurado (atendente.crmUserId)`);
    return;
  }
  const [atendente] = await crmDb.select({ name: users.name }).from(users).where(eq(users.id, crmUserId)).limit(1);
  if (!atendente) { r.avisos.push(`${pendentes} tarefa(s) para o CRM aguardando: usuário ${crmUserId} não existe no CRM`); return; }
  if (simular) { r.avisos.push(`${pendentes} tarefa(s) para o CRM seriam processadas`); return; }

  const ate = new Date(agora.getTime() + 5 * 60_000);
  // Claim atômico: FOR UPDATE SKIP LOCKED de propósito (não reescrever no query builder).
  const claim = await ordersDb.execute<{ id: number; idempotency_key: string; payload: unknown; attempts: number }>(sql`
    UPDATE sales_sync_ops SET status = 'processing', claimed_until = ${iso(ate)}::timestamp, attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM sales_sync_ops
      WHERE kind = 'criar_tarefa_crm'
        AND (status = 'pending' OR (status = 'processing' AND claimed_until < now()))
      ORDER BY id LIMIT 20
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, idempotency_key, payload, attempts
  `);
  for (const op of claim.rows) {
    try {
      const payload = lerPayloadTarefa(op.payload);
      if (!payload) {
        await ordersDb.update(salesSyncOps).set({ status: 'failed', lastError: 'payload inválido', claimedUntil: null, updatedAt: new Date() }).where(eq(salesSyncOps.id, op.id));
        continue;
      }
      const marcador = marcadorSales(op.idempotency_key);
      // Idempotência no destino: o marcador vai em `notes` e é procurado antes de inserir.
      const [existente] = await crmDb.select({ id: tasks.id }).from(tasks).where(sql`position(${marcador} in coalesce(${tasks.notes}, '')) > 0`).limit(1);
      const taskId = existente?.id ?? (await crmDb.insert(tasks).values(montarTarefaCrm(payload, {
        crmUserId, nomeAtendente: atendente.name, idempotencyKey: op.idempotency_key, agora: new Date(),
      })).returning({ id: tasks.id }))[0]?.id;
      await ordersDb.update(salesSyncOps).set({
        status: 'done', result: { taskId: taskId ?? null, jaExistia: !!existente }, doneAt: new Date(), claimedUntil: null, lastError: null, updatedAt: new Date(),
      }).where(and(eq(salesSyncOps.id, op.id), eq(salesSyncOps.status, 'processing')));
      r.tarefasCrmProcessadas += 1;
    } catch (err) {
      const msg = safeErr(err).slice(0, 300);
      console.error('[sales-ciclo] tarefa do CRM falhou:', msg);
      await ordersDb.update(salesSyncOps).set({
        status: op.attempts >= MAX_TENTATIVAS_SAIDA ? 'failed' : 'pending', lastError: msg, claimedUntil: null, updatedAt: new Date(),
      }).where(eq(salesSyncOps.id, op.id)).catch(() => undefined);
    }
  }
}

// ── 7. Executores sem sinal ──────────────────────────────────────────────────────────────────

async function verificarExecutores(ctx: Ctx): Promise<void> {
  const { agora, simular, r } = ctx;
  const hbs = await ordersDb.select().from(salesHeartbeats).orderBy(desc(salesHeartbeats.lastSeenAt));
  for (const h of hbs) {
    if (!executorAtrasado(h.lastSeenAt, agora)) continue;
    const minutos = Math.round((agora.getTime() - h.lastSeenAt.getTime()) / 60_000);
    if (simular) { r.avisos.push(`executor ${h.executor} sem sinal há ${minutos} min`); continue; }
    // Uma exceção aberta por executor basta; a chave por hora evita duplicar entre ciclos.
    const aberta = await ordersDb.execute<{ id: number }>(sql`
      SELECT id FROM sales_exceptions WHERE kind = 'heartbeat_ausente' AND status = 'open'
        AND starts_with(idempotency_key, ${`heartbeat:${h.executor}:`}) LIMIT 1
    `);
    if (aberta.rows.length) continue;
    await registrarExcecao({
      idempotencyKey: chaveHeartbeatAusente(h.executor, agora),
      kind: 'heartbeat_ausente',
      severity: 'alta',
      title: `Executor ${h.executor} sem sinal há ${minutos} min`,
      detail: `Nenhum heartbeat há mais de ${HEARTBEAT_LIMITE_MS / 60_000} minutos. Confira o serviço do Hermes na VPS.`,
      evidence: { executor: h.executor, versao: h.version, ultimoSinalEm: h.lastSeenAt.toISOString() },
      createdBy: 'sistema',
    });
  }
}
