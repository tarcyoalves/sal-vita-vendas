// Consultas e gravações comuns do Sales AI (ciclo, rotas do Hermes e painel).
//
// Driver neon-http: NÃO há transação interativa. Toda gravação que precisa ser atômica é UM
// comando SQL (UPDATE condicional, ou CTE com UPDATE + INSERT). As queries com FOR UPDATE SKIP
// LOCKED são SQL raw de propósito (HANDOFF-HERMES.md, seção 8) — não reescrever no query builder.
//
// Datas: as colunas são `timestamp` sem fuso, gravadas em UTC (o Drizzle grava `toISOString()`).
// Em SQL raw passamos sempre `toISOString()` com `::timestamp`, e lemos datas pelo query builder.
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { ordersDb } from '../../db/ordersDb';
import { db as crmDb } from '../../db';
import {
  auditLogs, companies, contacts, publicSources, salesJourneys,
} from '../../db/schema';
import { safeErr } from '../logSafe';
import { spMidnight } from '../tz';
import { transicionar, type JourneyEvent } from './estados';
import { estadoDaJornada, fonteDoCanal, lerExcertoRadar, tipoDeAtor, type ContextoJornada } from './operacoesPuro';

export type Supressao = { premium: boolean | null; crm: boolean | null };
export type LinhaJornada = typeof salesJourneys.$inferSelect;
export type SetJornada = Partial<Omit<typeof salesJourneys.$inferInsert, 'id' | 'stateVersion' | 'createdAt'>>;

export const iso = (d: Date): string => d.toISOString();

/** `($1, $2, …)` sem os parênteses, para `IN (...)`. Nunca chame com lista vazia. */
export function listaSql(vals: readonly (string | number)[]): SQL {
  return sql.join(vals.map((v) => sql`${v}`), sql`, `);
}

export function emPedacos<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

const normal = (e: string) => e.trim().toLowerCase();

// ── Supressão (três listas, dois bancos) ──────────────────────────────────────────────────────

/** E-mails suprimidos no banco do PREMIUM: `email_suppressions` + `suppression_list` (e-mail ou domínio). null = falhou. */
export async function suprimidosPremium(emails: readonly string[]): Promise<Set<string> | null> {
  const lista = [...new Set(emails.map(normal))].filter(Boolean);
  const out = new Set<string>();
  try {
    for (const parte of emPedacos(lista, 400)) {
      const r = await ordersDb.execute<{ email: string }>(sql`
        SELECT x.email FROM unnest(ARRAY[${listaSql(parte)}]::text[]) AS x(email)
        WHERE EXISTS (SELECT 1 FROM email_suppressions s WHERE lower(s.email) = x.email)
           OR EXISTS (SELECT 1 FROM suppression_list l
                      WHERE (l.email IS NOT NULL AND lower(l.email) = x.email)
                         OR (l.domain IS NOT NULL AND lower(l.domain) = split_part(x.email, '@', 2)))
      `);
      for (const row of r.rows) out.add(row.email);
    }
    return out;
  } catch (err) {
    console.error('[sales] consulta de supressão (Premium) falhou:', safeErr(err));
    return null;
  }
}

/** E-mails suprimidos no banco do CRM (`email_suppressions`). null = falhou. */
export async function suprimidosCrm(emails: readonly string[]): Promise<Set<string> | null> {
  const lista = [...new Set(emails.map(normal))].filter(Boolean);
  const out = new Set<string>();
  try {
    for (const parte of emPedacos(lista, 400)) {
      const r = await crmDb.execute<{ email: string }>(sql`
        SELECT x.email FROM unnest(ARRAY[${listaSql(parte)}]::text[]) AS x(email)
        WHERE EXISTS (SELECT 1 FROM email_suppressions s WHERE lower(s.email) = x.email)
      `);
      for (const row of r.rows) out.add(row.email);
    }
    return out;
  } catch (err) {
    console.error('[sales] consulta de supressão (CRM) falhou:', safeErr(err));
    return null;
  }
}

/** Supressão por e-mail nos dois bancos. Consulta que falhou = null naquele banco (quem usa nega). */
export async function supressaoEmLote(emails: readonly string[]): Promise<Map<string, Supressao>> {
  const lista = [...new Set(emails.map(normal))].filter(Boolean);
  const [premium, crm] = lista.length ? await Promise.all([suprimidosPremium(lista), suprimidosCrm(lista)]) : [new Set<string>(), new Set<string>()];
  const out = new Map<string, Supressao>();
  for (const e of lista) out.set(e, { premium: premium ? premium.has(e) : null, crm: crm ? crm.has(e) : null });
  return out;
}

export async function consultarSupressao(email: string): Promise<Supressao> {
  return (await supressaoEmLote([email])).get(normal(email)) ?? { premium: null, crm: null };
}

// ── Contagens para o árbitro ──────────────────────────────────────────────────────────────────

/**
 * Envios de hoje (fuso de São Paulo). Conservador: conta ACCEPTED, UNKNOWN e DISPATCHING (em voo),
 * para dois executores simultâneos não estourarem o teto por muito.
 */
export async function contagensDoDia(agora: Date): Promise<{ enviosHoje: number; novasHoje: number }> {
  const desde = iso(spMidnight(agora));
  const r = await ordersDb.execute<{ envios: number; novas: number }>(sql`
    SELECT count(*)::int AS envios, count(*) FILTER (WHERE step = 0)::int AS novas
    FROM sales_messages
    WHERE status IN ('ACCEPTED', 'UNKNOWN', 'DISPATCHING')
      AND coalesce(accepted_at, last_attempt_at) >= ${desde}::timestamp
  `);
  return { enviosHoje: r.rows[0]?.envios ?? 0, novasHoje: r.rows[0]?.novas ?? 0 };
}

/** Mensagens de prospecção já aceitas (ou de resultado desconhecido) para a empresa. */
export async function enviadasParaEmpresa(companyId: number): Promise<number> {
  const r = await ordersDb.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM sales_messages WHERE company_id = ${companyId} AND status IN ('ACCEPTED', 'UNKNOWN')
  `);
  return r.rows[0]?.n ?? 0;
}

/**
 * Último envio de marketing/prospecção para o endereço, somando:
 *  - Premium: `sales_messages` (ACCEPTED/UNKNOWN), `email_campaign_recipients` (sent), `email_sequence_sends` (sent);
 *  - CRM: `email_campaign_recipients` (sent), `email_sequence_sends` (sent).
 * NÃO cobre: disparos do carrinho abandonado / pós-compra (`automation_runs`, transacionais) e o
 * envio avulso de broadcast fora de `email_campaign_recipients`. Falha em qualquer banco = null (nega).
 */
export async function ultimoEnvioMarketing(email: string): Promise<{ em: Date | null } | null> {
  const e = normal(email);
  try {
    const [p, c] = await Promise.all([
      ordersDb.execute<{ ms: number | null }>(sql`
        SELECT (extract(epoch FROM max(t)) * 1000)::float8 AS ms FROM (
          SELECT max(coalesce(accepted_at, last_attempt_at)) AS t FROM sales_messages
            WHERE lower(to_email) = ${e} AND status IN ('ACCEPTED', 'UNKNOWN')
          UNION ALL
          SELECT max(sent_at) FROM email_campaign_recipients WHERE lower(email) = ${e} AND status = 'sent'
          UNION ALL
          SELECT max(s.sent_at) FROM email_sequence_sends s JOIN email_sequence_enrollments en ON en.id = s.enrollment_id
            WHERE lower(en.email) = ${e} AND s.status = 'sent'
        ) u
      `),
      crmDb.execute<{ ms: number | null }>(sql`
        SELECT (extract(epoch FROM max(t)) * 1000)::float8 AS ms FROM (
          SELECT max(sent_at) AS t FROM email_campaign_recipients WHERE lower(email) = ${e} AND status = 'sent'
          UNION ALL
          SELECT max(s.sent_at) FROM email_sequence_sends s JOIN email_sequence_enrollments en ON en.id = s.enrollment_id
            WHERE lower(en.email) = ${e} AND s.status = 'sent'
        ) u
      `),
    ]);
    const ms = Math.max(Number(p.rows[0]?.ms ?? 0) || 0, Number(c.rows[0]?.ms ?? 0) || 0);
    return { em: ms > 0 ? new Date(ms) : null };
  } catch (err) {
    console.error('[sales] histórico de envios falhou:', safeErr(err));
    return null;
  }
}

// ── Jornada: atualização otimista por state_version ───────────────────────────────────────────

export type ResultadoAtualizacao =
  | { ok: true; antes: LinhaJornada; estado: string }
  | { ok: false; motivo: 'nao_encontrada' | 'recusada' | 'corrida'; detalhe?: string };

/**
 * Lê a jornada, decide o `set` e grava com `WHERE id = ? AND state_version = ?`. Corrida perdida =
 * lê de novo e decide de novo (nunca sobrescreve). `decidir` devolvendo null = nada a fazer.
 */
export async function atualizarJornada(
  journeyId: number,
  decidir: (j: LinhaJornada) => SetJornada | null,
  tentativas = 3,
): Promise<ResultadoAtualizacao> {
  for (let i = 0; i < tentativas; i++) {
    const [j] = await ordersDb.select().from(salesJourneys).where(eq(salesJourneys.id, journeyId)).limit(1);
    if (!j) return { ok: false, motivo: 'nao_encontrada' };
    const set = decidir(j);
    if (!set) return { ok: false, motivo: 'recusada' };
    const gravada = await ordersDb.update(salesJourneys)
      .set({ ...set, stateVersion: j.stateVersion + 1, updatedAt: new Date() })
      .where(and(eq(salesJourneys.id, journeyId), eq(salesJourneys.stateVersion, j.stateVersion)))
      .returning({ id: salesJourneys.id, state: salesJourneys.state });
    if (gravada.length) return { ok: true, antes: j, estado: gravada[0].state };
  }
  return { ok: false, motivo: 'corrida' };
}

/** Aplica um evento da máquina de estados (recusa = não grava). `extra` acrescenta campos ao mesmo UPDATE. */
export async function aplicarEvento(
  journeyId: number,
  evento: JourneyEvent,
  extra?: (j: LinhaJornada) => SetJornada,
): Promise<ResultadoAtualizacao> {
  let recusa = '';
  const r = await atualizarJornada(journeyId, (j) => {
    const atual = estadoDaJornada(j.state);
    if (!atual) { recusa = `estado desconhecido: ${j.state}`; return null; }
    const t = transicionar(atual, evento);
    if (!t.ok) { recusa = t.motivo; return null; }
    return { ...(extra ? extra(j) : {}), state: t.para };
  });
  return !r.ok && r.motivo === 'recusada' ? { ...r, detalhe: recusa } : r;
}

/** Pausa a jornada (sem mudar o estado). Já pausada: mantém o motivo que estava. */
export async function pausarJornadaBanco(journeyId: number, motivo: string): Promise<ResultadoAtualizacao> {
  return atualizarJornada(journeyId, (j) => (j.pausedReason ? null : { pausedReason: motivo.slice(0, 200), lastEventAt: new Date() }));
}

// ── Mensagens: cancelar e liberar (UPDATE condicional) ────────────────────────────────────────

/** Cancela as mensagens ainda não despachadas (PENDING/RESERVED/RETRYABLE_FAILURE). DISPATCHING não é recolhível. */
export async function cancelarPendentes(filtro: { journeyId: number } | { email: string }, motivo: string): Promise<number> {
  const onde = 'journeyId' in filtro ? sql`journey_id = ${filtro.journeyId}` : sql`lower(to_email) = ${normal(filtro.email)}`;
  const r = await ordersDb.execute<{ id: number }>(sql`
    UPDATE sales_messages
    SET status = 'CANCELLED', cancelled_reason = ${motivo.slice(0, 300)}, fence = fence + 1,
        reserved_by = NULL, reserved_until = NULL, reservation_token_hash = NULL, updated_at = now()
    WHERE ${onde} AND status IN ('PENDING', 'RESERVED', 'RETRYABLE_FAILURE')
    RETURNING id
  `);
  return r.rows.length;
}

/** Libera reservas (RESERVED → PENDING, fence+1, tokens apagados). Sem `ids`: todas. */
export async function liberarReservas(ids?: readonly number[], somenteVencidasEm?: Date): Promise<number[]> {
  if (ids && ids.length === 0) return [];
  const filtroIds = ids ? sql`AND id IN (${listaSql(ids)})` : sql``;
  const filtroPrazo = somenteVencidasEm ? sql`AND reserved_until <= ${iso(somenteVencidasEm)}::timestamp` : sql``;
  const r = await ordersDb.execute<{ id: number }>(sql`
    UPDATE sales_messages
    SET status = 'PENDING', fence = fence + 1, reserved_by = NULL, reserved_until = NULL,
        reservation_token_hash = NULL, updated_at = now()
    WHERE status = 'RESERVED' ${filtroIds} ${filtroPrazo}
    RETURNING id
  `);
  return r.rows.map((x) => x.id);
}

// ── Auditoria (audit_logs, banco do Premium) ──────────────────────────────────────────────────

/** Nunca lança: falha de auditoria é logada e não desfaz a operação. */
export async function registrarAuditoria(acao: string, por: string, entidade: { tipo: string; id?: number | null }, metadata: Record<string, unknown>): Promise<void> {
  try {
    await ordersDb.insert(auditLogs).values({
      entityType: entidade.tipo,
      entityId: entidade.id ?? null,
      action: acao,
      actorType: tipoDeAtor(por),
      actorId: por.slice(0, 200),
      metadataJson: metadata,
    });
  } catch (err) {
    console.error(`[sales] auditoria "${acao}" falhou:`, safeErr(err));
  }
}

// ── Contexto para a elegibilidade ─────────────────────────────────────────────────────────────

/** Lê contato, empresa e evidências (public_sources `radar_receita`) de cada jornada. */
export async function carregarContextos(js: readonly LinhaJornada[]): Promise<Map<number, ContextoJornada>> {
  const out = new Map<number, ContextoJornada>();
  if (js.length === 0) return out;
  const contactIds = [...new Set(js.map((j) => j.contactId))];
  const companyIds = [...new Set(js.map((j) => j.companyId))];
  const [cs, cos, fontes] = await Promise.all([
    ordersDb.select({ id: contacts.id, channelType: contacts.channelType, sourceUrl: contacts.sourceUrl }).from(contacts).where(inArray(contacts.id, contactIds)),
    ordersDb.select({
      id: companies.id, name: companies.name, tradeName: companies.tradeName, state: companies.state, city: companies.city,
      status: companies.status, validation: companies.companyValidationStatus, website: companies.website,
    }).from(companies).where(inArray(companies.id, companyIds)),
    ordersDb.select({ companyId: publicSources.companyId, rawExcerpt: publicSources.rawExcerpt }).from(publicSources)
      .where(and(inArray(publicSources.companyId, companyIds), eq(publicSources.sourceType, 'radar_receita'))),
  ]);
  const contato = new Map(cs.map((c) => [c.id, c]));
  const empresa = new Map(cos.map((c) => [c.id, c]));
  const sinais = new Map<number, string[]>();
  for (const f of fontes) {
    const x = lerExcertoRadar(f.rawExcerpt);
    if (x) sinais.set(f.companyId, x.sinais);
  }
  for (const j of js) {
    const c = contato.get(j.contactId);
    const co = empresa.get(j.companyId);
    out.set(j.id, {
      journeyId: j.id,
      companyId: j.companyId,
      contactId: j.contactId,
      email: j.email,
      fonte: fonteDoCanal(c?.channelType),
      urlFonte: c?.sourceUrl ?? null,
      uf: co?.state ?? null,
      cidade: co?.city ?? null,
      empresa: (co?.tradeName?.trim() || co?.name || '').trim(),
      empresaAtiva: !!co && co.status === 'active' && co.validation !== 'cnpj_inactive' && co.validation !== 'invalid',
      segmentos: Array.isArray(j.segments) ? j.segments : [],
      evidencias: sinais.get(j.companyId) ?? [],
      temSite: !!co?.website,
    });
  }
  return out;
}

/** Quantas empresas distintas (não duplicadas) usam cada e-mail. */
export async function compartilhamento(emails: readonly string[]): Promise<Map<string, number>> {
  const lista = [...new Set(emails.map(normal))].filter(Boolean);
  const out = new Map<string, number>();
  for (const parte of emPedacos(lista, 400)) {
    const r = await ordersDb.execute<{ email: string; n: number }>(sql`
      SELECT lower(c.email) AS email, count(DISTINCT c.company_id)::int AS n
      FROM contacts c JOIN companies co ON co.id = c.company_id AND co.company_validation_status <> 'duplicate'
      WHERE c.email IS NOT NULL AND lower(c.email) IN (${listaSql(parte)})
      GROUP BY 1
    `);
    for (const row of r.rows) out.set(row.email, row.n);
  }
  return out;
}

/** Jornadas que já tiveram mensagem aceita (ou de resultado desconhecido): no passo 0 contam como "já prospectado". */
export async function jornadasJaProspectadas(journeyIds: readonly number[], excetoMensagem?: number): Promise<Set<number>> {
  const out = new Set<number>();
  for (const parte of emPedacos(journeyIds, 400)) {
    const r = await ordersDb.execute<{ id: number }>(sql`
      SELECT DISTINCT journey_id AS id FROM sales_messages
      WHERE journey_id IN (${listaSql(parte)}) AND status IN ('ACCEPTED', 'UNKNOWN')
      ${excetoMensagem ? sql`AND id <> ${excetoMensagem}` : sql``}
    `);
    for (const row of r.rows) out.add(row.id);
  }
  return out;
}

/**
 * Empresas que não podem entrar no lote agora:
 *  - "prospectada" = alguma mensagem ACEITA ou de resultado DESCONHECIDO (nunca reenviar), ou ainda viva
 *    na fila (PENDING, RESERVED, DISPATCHING, RETRYABLE_FAILURE);
 *  - jornada da empresa além de QUALIFIED (no lote, contatada, encerrada, suprimida…);
 *  - mensagem no lote de HOJE (`loteHojeId`), mesmo cancelada: o corte do dono não volta no mesmo dia.
 * Mensagem CANCELLED de lote antigo (cortada ou vencida sem aprovação) NÃO conta: a empresa volta.
 */
export async function empresasJaProspectadas(companyIds: readonly number[], loteHojeId: number | null = null): Promise<Set<number>> {
  const out = new Set<number>();
  for (const parte of emPedacos(companyIds, 400)) {
    const r = await ordersDb.execute<{ id: number }>(sql`
      SELECT company_id AS id FROM sales_messages WHERE company_id IN (${listaSql(parte)})
        AND (status IN ('ACCEPTED', 'UNKNOWN', 'PENDING', 'RESERVED', 'DISPATCHING', 'RETRYABLE_FAILURE')
             ${loteHojeId !== null ? sql`OR batch_id = ${loteHojeId}` : sql``})
      UNION
      SELECT a.company_id FROM sales_message_attempts t JOIN sales_messages a ON a.id = t.message_id
        WHERE a.company_id IN (${listaSql(parte)}) AND t.outcome IN ('ACCEPTED', 'UNKNOWN')
      UNION
      SELECT company_id FROM sales_journeys WHERE company_id IN (${listaSql(parte)}) AND state NOT IN ('IDENTIFIED', 'QUALIFIED')
    `);
    for (const row of r.rows) out.add(row.id);
  }
  return out;
}

